/**
 * pay-app.js —— 分钱机制诊断 · 应用逻辑
 *
 * 流程：欢迎 → 资源分配前置问 → 选团队 → 逐团队过症状(三态) → 跨团队轮 → 结果
 *
 * 核心算法在 buildChains()：按「特异性 × 严重度」累积证据，按病因排序，
 * 拼成「根因 → 衍生结果 → 你勾中的现象」的因果链。
 */

/* ==================== 状态 ==================== */
const STORAGE_KEY = 'pay-diag-v1';

let state = {
  pre: null,          // 资源分配答案
  prePool: null,      // 奖金池来源答案（v4 新增；旧存档没有这个字段，按 null 处理）
  teams: [],          // 选中的团队 id
  answers: {},        // symptomId -> { sev: 0|1|2, dur: 'new'|'months'|'year'|null, team }
  teamIdx: 0,
  step: 0
};

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
}

/* ==================== 规则库运行时检查 ====================
 * 为什么要有这个：改 pay-data.js 是直接刷新页面的，不会每次都去跑 node tools/selfcheck.js。
 * 而下面这些错全是「静默失败」——不报错，只是答案慢慢变得不对。
 *
 * 所以浏览器里也要检一遍，有问题就在 console 里喊。
 * 这个函数只报错，不改行为：页面上线时照常跑，不会因为一条规则写错就白屏。
 */
function validateRulebook() {
  var errs = [];
  var codes = {};
  CAUSES.forEach(function (c) { codes[c.code] = c; });
  var knobSet = {};
  Object.keys(KNOBS).forEach(function (k) { knobSet[k] = 1; });

  CAUSES.forEach(function (c) {
    // 1. knob 值必须存在（写错的话「调整的思路」整块不渲染，页面看不出来）
    if (c.knob !== null && c.knob !== undefined && !knobSet[c.knob]) {
      errs.push(c.code + ' 的 knob=' + c.knob + ' 不在 KNOBS 里');
    }
    // 2. 改法键必须存在
    var plan = PLAN_OF[c.code];
    if (!plan) errs.push(c.code + ' 没有登记改法（PLAN_OF）');
    else if (!PLANS[plan]) errs.push(c.code + ' 的改法 ' + plan + ' 不在 PLANS 里');
    // 3. 话术卡必须有
    if (!BOSS_LINES[c.code]) errs.push(c.code + ' 缺话术卡文案');
    // 4. 衍生层的 from 必须指向真实根因
    (c.from || []).forEach(function (rc) {
      if (!codes[rc]) errs.push(c.code + ' 的 from 指向不存在的病因 ' + rc);
      else if (codes[rc].layer !== 'root') errs.push(c.code + ' 的 from 指向的不是根因：' + rc);
    });
  });

  // 5. 每条症状的病因和团队必须存在
  var teamSet = {};
  TEAMS.forEach(function (t) { teamSet[t.id] = 1; });
  teamSet.cross = 1; teamSet.external = 1;
  var seen = {};
  var hit = {};
  SYMPTOMS.forEach(function (s) {
    if (!codes[s.cause]) errs.push('症状 ' + s.id + ' 指向不存在的病因 ' + s.cause);
    else hit[s.cause] = 1;
    if (!teamSet[s.team]) errs.push('症状 ' + s.id + ' 的团队不存在：' + s.team);
    if (!SPEC_WEIGHT[s.specificity]) errs.push('症状 ' + s.id + ' 的特异性非法：' + s.specificity);
    if (seen[s.id]) errs.push('症状 id 重复：' + s.id);
    seen[s.id] = 1;
  });

  // 6. 孤儿病因：没有任何症状指向它 = 永远诊断不出来
  CAUSES.forEach(function (c) {
    if (!hit[c.code]) errs.push('孤儿病因：' + c.code + '（' + c.name + '）没有任何症状指向它，永远诊断不出来');
  });

  // 7. 两个前置问：每个选项都要登记影响，否则选了等于没选
  [[PRE_QUESTION, PRE_EFFECTS], [PRE_QUESTION_2, PRE_EFFECTS_2]].forEach(function (pair) {
    var q = pair[0], eff = pair[1];
    q.options.forEach(function (o) {
      var e = eff[o.value];
      if (!e || !Object.keys(e).length) {
        errs.push('前置问「' + q.id + '」的选项 ' + o.value + '（' + o.label + '）没有登记影响，选了等于没选');
        return;
      }
      Object.keys(e).forEach(function (code) {
        if (!codes[code]) errs.push('前置问「' + q.id + '」的 ' + o.value + ' 指向不存在的病因 ' + code);
      });
    });
  });

  if (errs.length) {
    console.error('[分钱工具] 规则库有 ' + errs.length + ' 处问题，会导致静默失败：');
    errs.forEach(function (e) { console.error('  · ' + e); });
  }
  return errs;
}

/* ==================== 埋点 ====================
 * 完诊率是唯一值得先看的指标：它当天可测，而且是「行动率」的上限——
 * 没走完的人不可能去验证任何事。
 *
 * 包一层是为了防 analytics.js 没加载时把主流程带崩。
 */
function track(step) {
  if (typeof trackStep === 'function') trackStep(step);
}

/* ==================== 页面切换 ==================== */
function showPage(id) {
  document.querySelectorAll('.page-section').forEach(function (el) {
    el.classList.remove('active');
    el.style.display = 'none';
  });
  var target = document.getElementById(id);
  target.style.display = 'block';
  requestAnimationFrame(function () { target.classList.add('active'); });
  window.scrollTo(0, 0);
  updateProgress(id);
}

function totalSteps() {
  // 两问 + 选团队 + N 个团队 + 跨团队 + 结果
  return 5 + Math.max(state.teams.length, 1);
}

// 必须由 showPage 把 id 传进来——不能回头去查 .active，
// 因为 active 是下一帧才加上的，这里查会查不到。
function updateProgress(id) {
  var labeled = {
    'page-pre': 1,
    'page-pre2': 2,
    'page-teams': 3,
    'page-survey': 4 + state.teamIdx,
    'page-cross': 4 + state.teams.length,
    'page-report': 5 + state.teams.length
  };
  var cur = labeled[id];
  var bar = document.getElementById('progress-container');
  if (!cur) { bar.style.display = 'none'; return; }
  bar.style.display = 'block';
  document.getElementById('progress-bar').style.width = Math.round(cur / totalSteps() * 100) + '%';
  document.getElementById('progress-label').textContent = cur + ' / ' + totalSteps();
}


/* ==================== 前置问（两问共用一套渲染） ==================== */
function renderPreQuestion(q, key, ids) {
  document.getElementById(ids.title).textContent = q.title;
  document.getElementById(ids.desc).textContent = q.desc;
  var box = document.getElementById(ids.options);
  box.innerHTML = q.options.map(function (o) {
    return '<div class="option-card" data-val="' + o.value + '" ' +
           'onclick="pickPre(this, \'' + key + '\', \'' + ids.options + '\', \'' + ids.next + '\')">' +
             '<div class="opt-main">' +
               '<div class="opt-title">' + o.label + '</div>' +
               '<div class="opt-hint">' + o.hint + '</div>' +
             '</div>' +
             '<div class="opt-check">✓</div>' +
           '</div>';
  }).join('');
  if (state[key]) {
    var el = box.querySelector('[data-val="' + state[key] + '"]');
    if (el) el.classList.add('selected');
    document.getElementById(ids.next).disabled = false;
  }
}

function goToPre() {
  if (window.observeStart) window.observeStart();   // 实测计时清零（observe.js 没加载时空操作）
  track('start');
  renderPreQuestion(PRE_QUESTION, 'pre',
    { title: 'pre-title', desc: 'pre-desc', options: 'pre-options', next: 'btn-pre-next' });
  showPage('page-pre');
}

function goToPre2() {
  renderPreQuestion(PRE_QUESTION_2, 'prePool',
    { title: 'pre2-title', desc: 'pre2-desc', options: 'pre2-options', next: 'btn-pre2-next' });
  showPage('page-pre2');
}

function pickPre(el, key, optBoxId, nextBtnId) {
  document.querySelectorAll('#' + optBoxId + ' .option-card').forEach(function (x) {
    x.classList.remove('selected');
  });
  el.classList.add('selected');
  state[key] = el.getAttribute('data-val');
  document.getElementById(nextBtnId).disabled = false;
  saveState();
}

/* ==================== 选团队 ==================== */
function goToTeams() {
  track('pre-done');
  var grid = document.getElementById('team-grid');
  grid.innerHTML = TEAMS.map(function (t) {
    return '<div class="team-card' + (state.teams.indexOf(t.id) >= 0 ? ' selected' : '') + '" ' +
           'data-team="' + t.id + '" onclick="toggleTeam(this)">' +
             '<span class="t-icon">' + t.icon + '</span>' +
             '<span class="t-name">' + t.name + '</span>' +
             '<span class="t-desc">' + (t.desc || '') + '</span>' +
           '</div>';
  }).join('');
  document.getElementById('btn-team-next').disabled = state.teams.length === 0;
  showPage('page-teams');
}

function toggleTeam(el) {
  var id = el.getAttribute('data-team');
  var i = state.teams.indexOf(id);
  if (i >= 0) { state.teams.splice(i, 1); el.classList.remove('selected'); }
  else { state.teams.push(id); el.classList.add('selected'); }
  document.getElementById('btn-team-next').disabled = state.teams.length === 0;
  saveState();
}

/* ==================== 症状问卷 ==================== */
function startSurvey() {
  state.teamIdx = 0;
  renderSurvey();
}

function renderSurvey() {
  if (state.teamIdx >= state.teams.length) { renderCross(); return; }
  var teamId = state.teams[state.teamIdx];
  var team = TEAMS.filter(function (t) { return t.id === teamId; })[0];
  var list = SYMPTOMS.filter(function (s) { return s.team === teamId; });

  document.getElementById('survey-title').textContent = team.name;
  document.getElementById('survey-desc').textContent =
    '这些现象，哪些在这个团队里出现过？没出现就不用管。';
  document.getElementById('symptom-list').innerHTML = list.map(function (s) {
    return renderSymptomCard(s, teamId);
  }).join('');
  document.getElementById('btn-survey-next').textContent =
    state.teamIdx === state.teams.length - 1 ? '最后一组' : '下一组';
  updateOverNote();
  showPage('page-survey');
}

function renderSymptomCard(s, teamId) {
  var a = state.answers[s.id] || { sev: 0, dur: null, team: teamId };
  var html = '<div class="symptom-card' + (a.sev > 0 ? ' on' : '') + '" id="card-' + s.id + '">' +
    '<div class="symptom-text">' + s.text + '</div>' +
    '<div class="sev-row">';
  [0, 1, 2].forEach(function (v) {
    html += '<button class="sev-btn' + (a.sev === v ? ' on' : '') + '" data-sev="' + v + '" ' +
            'onclick="setSev(\'' + s.id + '\', ' + v + ', \'' + teamId + '\')">' +
            STATES[v].label + '</button>';
  });
  html += '</div>';
  html += '<div class="sym-sub' + (a.sev === 2 ? ' show' : '') + '" id="sub-' + s.id + '">' +
    '<div class="sub-label">大概多久了？</div>' +
    '<div class="dur-row">' +
      ['new', 'months', 'year'].map(function (d) {
        var labels = { new: '刚出现', months: '几个月', year: '一年以上' };
        return '<button class="dur-btn' + (a.dur === d ? ' on' : '') + '" ' +
               'onclick="setDur(this, \'' + s.id + '\', \'' + d + '\')">' + labels[d] + '</button>';
      }).join('') +
    '</div>' +
  '</div>';
  html += '</div>';
  return html;
}

function setSev(sid, sev, teamId) {
  var prev = state.answers[sid] || {};
  state.answers[sid] = {
    sev: sev,
    dur: sev === 2 ? (prev.dur || null) : null,
    team: teamId
  };
  var s = SYMPTOMS.filter(function (x) { return x.id === sid; })[0];
  var card = document.getElementById('card-' + sid);
  var fresh = document.createElement('div');
  fresh.innerHTML = renderSymptomCard(s, teamId);
  card.replaceWith(fresh.firstChild);
  saveState();
  updateOverNote();
}

/* 「勾太多了」的提醒——**在勾选的时候就出现，不等报告页**。
 * 到了报告页才说，他只能推倒重来；在这儿说，他抬抬手就能改。
 *
 * 判据：命中的病因超过全部的一半。
 * 为什么是这个数：勾 10 条时第一名占 79%（那时候它在诊断）；
 * 勾 110 条时 30 个病因全被激活、第一名只占 7%——
 * 那时候的第一名不是"你的问题最可能是哪个"，是"规则库里哪条病因的症状写得最广"。
 */
function updateOverNote() {
  var els = document.querySelectorAll('.over-note');
  if (!els.length) return;

  var scores = scoreCauses();
  var n = Object.keys(scores).filter(function (c) { return scores[c].score > 0; }).length;
  var half = Math.ceil(CAUSES.length / 2);

  var msg = '';
  if (n >= half) {
    msg = '<b>你勾的现象，已经指向 ' + n + ' 个病因了——超过一半。</b><br>' +
          '这不是说你有 ' + n + ' 个问题，是说<b>勾得越多，越分不出主次</b>：' +
          '一条病因可能靠「沾边」就进了榜。<br>' +
          '往回改改：<b>只留你一想起就头疼的那几条</b>，把「好像也有一点」的去掉。';
  }
  Array.prototype.forEach.call(els, function (el) {
    el.innerHTML = msg;
    el.style.display = msg ? 'block' : 'none';
  });
}

function setDur(el, sid, dur) {
  state.answers[sid].dur = dur;
  saveState();
  el.parentNode.querySelectorAll('.dur-btn').forEach(function (b) { b.classList.remove('on'); });
  el.classList.add('on');
}

function nextTeam() {
  /* 实测计时：记下这个团队花了多久（observe.js 没加载时是空操作） */
  if (window.observeTeam) {
    var cur = TEAMS.filter(function (t) { return t.id === state.teams[state.teamIdx]; })[0];
    window.observeTeam(cur ? cur.name : '团队 ' + (state.teamIdx + 1));
  }
  state.teamIdx++;
  if (state.teamIdx >= state.teams.length) { renderCross(); }
  else { renderSurvey(); }
}

function skipTeam() { nextTeam(); }

/* ==================== 跨团队轮 ==================== */
function renderCross() {
  track('survey-done');
  var list = SYMPTOMS.filter(function (s) { return s.team === 'cross' || s.team === 'external'; });
  document.getElementById('cross-list').innerHTML = list.map(function (s) {
    return renderSymptomCard(s, 'cross');
  }).join('');
  updateOverNote();
  showPage('page-cross');
}

/* ==================== 时间：聚合层的「多久了」 ====================
 * 注意：dur 只在 sev=2 时才存在（只有「反复发生」才会被问「多久了」）。
 * 所以它不能逐条参与加权——那等于把「反复发生」这个信号算两遍。
 *
 * 唯一不冗余的用法是聚合：一套机制是不是「老了」，是这套机制的属性，
 * 不是某一条症状的属性。
 */
function durProfile() {
  var keys = Object.keys(state.answers).filter(function (k) {
    return state.answers[k] && state.answers[k].sev === 2 && state.answers[k].dur;
  });
  if (!keys.length) return null;
  var year = keys.filter(function (k) { return state.answers[k].dur === 'year'; }).length;
  var fresh = keys.filter(function (k) { return state.answers[k].dur === 'new'; }).length;
  return {
    total: keys.length,
    year: year,
    fresh: fresh,
    yearRatio: year / keys.length,
    freshRatio: fresh / keys.length
  };
}

/**
 * 把一个前置问的答案折进得分。
 * 加分的同时要留一句证据，否则这张卡会以「其次」的身份显示一个空证据列表。
 * 减分只在病因已被勾中时才减，不凭空建条目。
 */
function applyPreEffects(scores, question, effects, answer) {
  var eff = effects[answer] || {};
  var label = '';
  question.options.forEach(function (o) { if (o.value === answer) label = o.label; });
  Object.keys(eff).forEach(function (code) {
    if (!scores[code]) {
      if (eff[code] < 0) return;
      scores[code] = { score: 0, evidence: [] };
    }
    scores[code].score += eff[code];
    if (eff[code] > 0) scores[code].preEvidence = label;
  });
}

/* ==================== 计算：证据累积 → 因果链 ==================== */
function scoreCauses() {
  var raw = {};   // code -> [ {symptom, sev, team, base} ]

  Object.keys(state.answers).forEach(function (sid) {
    var a = state.answers[sid];
    if (!a || a.sev === 0) return;
    var s = SYMPTOMS.filter(function (x) { return x.id === sid; })[0];
    if (!s) return;
    if (!raw[s.cause]) raw[s.cause] = [];
    raw[s.cause].push({
      symptom: s, sev: a.sev, team: a.team,
      base: SPEC_WEIGHT[s.specificity] * SEVERITY[a.sev],
      weight: 0
    });
  });

  var scores = {};

  /* 边际递减：同一病因按证据强度降序，第 3 条及以后减半。
   * 不能让「可观察面大」的病因靠症状多取胜。 */
  Object.keys(raw).forEach(function (code) {
    var list = raw[code].sort(function (a, b) { return b.base - a.base; });
    var total = 0;
    list.forEach(function (e, i) {
      e.weight = i < DIMINISH_AFTER ? e.base : e.base * DIMINISH_FACTOR;
      total += e.weight;
    });
    scores[code] = { score: total, evidence: list };
  });

  // 两个前置问的影响：每个答案都要有作用，正负都算
  applyPreEffects(scores, PRE_QUESTION, PRE_EFFECTS, state.pre);
  applyPreEffects(scores, PRE_QUESTION_2, PRE_EFFECTS_2, state.prePool);

  /* 退化加成：勾中的现象里超过一半持续一年以上 → 这不是新问题，
   * 而是这套机制用久了。此时衍生层（D 组）加权。 */
  var dp = durProfile();
  if (dp && dp.yearRatio >= DEGRADE_RATIO) {
    Object.keys(scores).forEach(function (code) {
      var c = causeByCode(code);
      if (c && c.layer === 'derived') scores[code].score *= DEGRADE_BOOST;
    });
  }

  return scores;
}

function causeByCode(code) {
  return CAUSES.filter(function (c) { return c.code === code; })[0];
}

/**
 * 把打分的病因拼成链。
 *
 * 必须分两遍：先让衍生结果去认领根因，剩下的才单独成链。
 * 反过来的话，根因会先把自己占掉，衍生结果就永远挂不上去了。
 */
function buildChains(scores) {
  var list = Object.keys(scores).map(function (code) {
    return Object.assign({ code: code }, scores[code]);
  }).sort(function (a, b) { return b.score - a.score; });

  var scored = {};
  list.forEach(function (i) { scored[i.code] = i; });

  var used = {};
  var chains = [];

  /* ---- 第一遍：衍生结果优先，能和根因合并的先合并 ---- */
  list.forEach(function (item) {
    if (used[item.code]) return;
    var c = causeByCode(item.code);
    if (!c || c.layer !== 'derived' || !c.from || !c.from.length) return;

    var parent = c.from
      .filter(function (rc) { return scored[rc] && !used[rc]; })
      .sort(function (a, b) { return scored[b].score - scored[a].score; })[0];
    if (!parent) return;

    used[item.code] = true;
    used[parent] = true;

    /* 双节点链的分数：取两节点的较大值 + 一个显式定额。
     * 不能用相加——相加会让任何能合并的链必然排在前面，
     * 那是公式的副产品，不是「这条链解释力更强」的判断。 */
    chains.push({
      nodes: [causeByCode(parent), c],
      code: item.code,
      score: Math.max(scored[parent].score, item.score) + 2,
      evidence: scored[parent].evidence.concat(item.evidence),
      preEvidence: scored[parent].preEvidence || item.preEvidence || null
    });
  });

  /* ---- 第二遍：剩下的单独成链 ---- */
  list.forEach(function (item) {
    if (used[item.code]) return;
    var c = causeByCode(item.code);
    if (!c) return;
    used[item.code] = true;
    chains.push({
      nodes: [c],
      code: item.code,
      score: item.score,
      evidence: item.evidence,
      preEvidence: item.preEvidence || null
    });
  });

  chains.sort(function (a, b) { return b.score - a.score; });

  // 安全网：没有证据也没有前置问证据的链不输出（否则用户会看到一张空的证据卡）
  return chains.filter(function (ch) {
    return ch.evidence.length > 0 || ch.preEvidence;
  });
}

/* ==================== 诊断档案 ====================
 * L1 必须产出一份结构化的东西交给 L2，而不是一屏 HTML。
 * 否则 L1 和 L2 之间是靠用户的记忆耦合的——他得自己记得三个月前勾了什么。
 *
 * 档案里带三样 L2 要用的东西：
 *   1. 改法键（plan）——L2 用它取手册。不是病因代码。
 *   2. 置信度（confidence）——决定 L2 给一篇还是两篇对照。
 *   3. 时间画像（age）——决定 L2 是「重设」还是「重置」。
 */
const ARCHIVE_KEY = 'pay-diag-archive-v1';

function planOf(code) {
  var plan = PLAN_OF[code];
  return plan && PLANS[plan] ? plan : null;
}

/**
 * 置信度决定 L2 给几篇方案：
 *   high —— 第一名明显领先，且有多条强证据 → 给一篇
 *   mid  —— 前两名分差小 → 给两篇对照，让用户自己认
 *   low  —— 证据太弱或太散 → 不给方案，回到「先去确认」
 */
function judgeConfidence(chains) {
  if (!chains.length) return 'none';
  var top = chains[0];
  if (top.score < 3) return 'low';
  var strong = top.evidence.filter(function (e) {
    return e.symptom.specificity === 'strong';
  }).length;
  var gap = chains[1] ? (top.score - chains[1].score) : 999;
  if (gap >= 4 && strong >= 2) return 'high';
  return 'mid';
}

function ageLabel(dp) {
  if (!dp) return 'unknown';
  if (dp.yearRatio >= DEGRADE_RATIO) return 'old';
  if (dp.freshRatio >= 0.5) return 'new';
  return 'mixed';
}

function buildArchive() {
  var scores = scoreCauses();
  var chains = buildChains(scores);
  var dp = durProfile();
  var top = chains.slice(0, 3);
  var conf = judgeConfidence(chains);

  return {
    v: 1,
    at: new Date().toISOString(),
    pre: state.pre,
    prePool: state.prePool || null,   // 旧存档可能没有这个字段
    teams: state.teams.slice(),
    age: ageLabel(dp),
    confidence: conf,
    // 主改法：L2 用它取手册
    plan: top.length ? planOf(top[0].code) : null,
    causes: top.map(function (ch, i) {
      return {
        rank: i + 1,
        code: ch.code,
        score: Math.round(ch.score * 10) / 10,
        plan: planOf(ch.code),
        chain: ch.nodes.map(function (n) { return n.code; }),
        // 只存症状 id，正文留在规则库里
        evidence: ch.evidence.map(function (e) { return e.symptom.id; })
      };
    }),
    answers: state.answers
  };
}

/** 把档案压成可以带进 URL 的几个字段（L2 的四段页面链靠它传递）。 */
function archiveToParams(archive) {
  if (!archive) archive = buildArchive();
  var p = new URLSearchParams();
  if (archive.plan) p.set('plan', archive.plan);
  p.set('causes', archive.causes.map(function (c) { return c.code; }).join(','));
  p.set('conf', archive.confidence);
  p.set('age', archive.age);
  if (archive.pre) p.set('pre', archive.pre);
  if (archive.prePool) p.set('pool', archive.prePool);
  if (archive.teams.length) p.set('teams', archive.teams.join(','));
  /* 他勾中的现象——L2 拿它当「你自己的证据」，「带走那一页」上要显示。
   * 只传 id 和严重度，正文留在规则库里。 */
  var syms = Object.keys(archive.answers || {})
    .filter(function (id) { return archive.answers[id] && archive.answers[id].sev > 0; });
  if (syms.length) {
    p.set('sym', syms.map(function (id) {
      return id + ':' + archive.answers[id].sev;
    }).join(','));
  }
  return p.toString();
}

function saveArchive() {
  var a = buildArchive();
  try { localStorage.setItem(ARCHIVE_KEY, JSON.stringify(a)); } catch (e) {}
  return a;
}

/* ==================== 结果页 ==================== */
function goToLoading() {
  showPage('page-loading');
  saveState();
  var steps = ['正在把现象对应到机制上…', '正在排除别的可能…', '正在排序…'];
  var i = 0;
  var t = setInterval(function () {
    i++;
    if (i < steps.length) { document.getElementById('loading-text').textContent = steps[i]; }
  }, 420);
  setTimeout(function () { clearInterval(t); renderReport(); }, 1300);
}

function renderReport() {
  track('report');
  // 档案要存下来：L2 的输入、以及以后再回来对照时的基线
  saveArchive();

  var scores = scoreCauses();
  var answered = Object.keys(state.answers).filter(function (k) { return state.answers[k].sev > 0; });

  var body = document.getElementById('report-body');

  /* ---- 分支一：一条都没勾 → 预测模式 ---- */
  // 这一支不出现「保存结果」和 L2 入口：没有诊断结果可存，也没有可带过去的东西
  if (answered.length === 0) {
    body.innerHTML = renderPredictMode();
    showPage('page-report');
    return;
  }

  var chains = buildChains(scores);
  var top = chains.slice(0, 3);

  /* ---- 分支二：证据不足 ---- */
  if (!top.length || top[0].score < 3) {
    body.innerHTML = renderNotEnough();
    showPage('page-report');
    return;
  }

  /* ---- 正常输出 ---- */
  var html = '';
  html += '<h2 class="h-sec">你勾了 ' + answered.length + ' 个现象</h2>';
  html += '<p class="p-sec">下面按可能性排序。这是待确认的假设，不是结论。</p>';

  /* 时间读出来的东西：这套机制是不是「老了」 */
  var dp = durProfile();
  if (dp && dp.yearRatio >= DEGRADE_RATIO) {
    html += '<div class="note-box warn">你勾的现象里，有 ' + dp.year +
            ' 条已经持续一年以上。<br>' +
            '<b>这不是新问题，是这套机制用了很久了。</b>' +
            '老机制坏起来的方式和新机制不一样——它通常不是设计错了，是被套利了、被适应了、被当成应得的了。</div>';
  } else if (dp && dp.freshRatio >= 0.5) {
    html += '<div class="note-box warn">大部分现象是最近才出现的。<br>' +
            '<b>先想清楚最近改过什么</b>——换了人、调了目标、改了提成比例，往往比机制本身更值得查。</div>';
  }

  /* 置信度：分差小的时候，最可能和其次其实是并列的，要说出来 */
  var conf = judgeConfidence(chains);
  if (conf === 'mid' && top.length > 1) {
    html += '<div class="note-box">前两个的<b>差别不大</b>，先别急着认定是哪一个——' +
            '先用下面「需要排除的」排一遍，排不掉再回来。</div>';
  }

  /* 一张主诊断（完整卡），其余降级成「需要排除的」一行。
   * 三条并列会让用户以为有三个答案——而这是一份诊断书：
   * 一个主诊断，附一份鉴别。 */
  html += renderChainCard(top[0], '最可能', 0);
  for (var ei = 1; ei < top.length; ei++) {
    html += renderExcludeCard(top[ei]);
  }

  html += renderPrinciples(top);
  html += renderScriptCard(top[0]);
  html += renderCaptureCard();
  html += renderL2Entry();

  /* 实测模式：把每个团队的用时列出来。
   * 这一块只有带 ?observe=1 的时候才出现，真实用户看不到。 */
  if (/[?&]observe=1/.test(location.search)) {
    var obsRounds = [];
    try { obsRounds = JSON.parse(localStorage.getItem('obs-rounds') || '[]'); } catch (e) {}
    if (obsRounds.length) {
      html += '<div class="note-box"><b>实测数据</b>（这一块只有你看得到）<br>' +
              obsRounds.map(function (r) { return esc(r.team) + '　' + r.sec + ' 秒'; }).join('　·　') +
              '<br>第一个和第二个差得越多，说明他越早开始不看内容了。</div>';
    }
  }

  html += renderBoundary();
  body.innerHTML = html;
  fillResultLink();

  showPage('page-report');
}

function renderChainCard(ch, rankLabel, idx) {
  var c = ch.nodes[ch.nodes.length - 1];
  var html = '<div class="chain-card rank-' + (idx + 1) + '">';
  html += '<span class="chain-rank">' + rankLabel + '</span>';

  /* 因果链 */
  html += '<div class="chain-flow">';
  ch.nodes.forEach(function (n, i) {
    var kind = n.layer === 'root' ? 'root' : 'derived';
    var kindLabel = n.layer === 'root' ? '根本原因' : '它带来的后果';
    html += '<div class="chain-node ' + kind + '">' +
              '<div class="dot"></div>' +
              '<div>' +
                '<span class="n-label">' + kindLabel + '</span>' +
                '<div class="n-name">' + n.plain + '</div>' +
              '</div>' +
            '</div>';
    if (i < ch.nodes.length - 1) html += '<div class="chain-arrow">↓</div>';
  });
  html += '</div>';

  /* 证据 */
  html += '<div class="chain-evidence">' +
            '<div class="ev-label">你勾中的现象</div><ul>';
  ch.evidence.slice(0, 6).forEach(function (e) {
    var teamName = e.team === 'cross' ? '跨团队' :
      (TEAMS.filter(function (t) { return t.id === e.team; })[0] || {}).name || '';
    html += '<li>' + e.symptom.text +
            '<span style="color:#94A3B8;font-size:11.5px">（' + teamName + '）</span>';
    // 症状级的排除条件：挂在症状下面，不塞进病因层——
    // 塞进病因层的话，所有命中这个病因的人都会看到一条跟自己无关的排除条件
    if (e.symptom.exclude) {
      html += '<div class="sym-exclude">' + e.symptom.exclude + '</div>';
    }
    html += '</li>';
  });
  if (ch.preEvidence) {
    html += '<li>你开头选的「' + ch.preEvidence + '」也指向这条</li>';
  }
  html += '</ul></div>';

  /* 调整的思路（往哪边调，比调哪个更重要） */
  var knob = c.knob ? KNOBS[c.knob] : null;
  if (knob) {
    html += '<div class="chain-block">' +
              '<div class="b-label">调整的思路</div>' +
              '<div class="knob-pill">' + knob.name + ' · ' + knob.plain + '</div>' +
              '<div class="b-body">' + (c.knobDir || knob.dir) + '</div>' +
            '</div>';
  } else if (c.isPre) {
    html += '<div class="chain-block">' +
              '<div class="b-label">调整的思路</div>' +
              '<div class="b-body">这一步不是调薪酬，是先把「好客户、好区域怎么分」的规则说清楚——它比奖金怎么算更早决定结果。</div>' +
            '</div>';
  }

  /* 两说卡：有些事没有唯一解，把两边的代价摆出来，不替你选。
   * 按病因匹配，不按旋钮——旋钮一底下装着四种不同的毛病，按旋钮会误报。 */
  var tcs = TRADEOFFS.filter(function (t) { return t.causes.indexOf(c.code) >= 0; });
  tcs.forEach(function (t) {
    html += '<div class="chain-block tradeoff">' +
              '<div class="b-label">两说 · ' + t.title + '　没有标准答案，看你取舍</div>' +
              '<div class="to-row"><span class="to-tag">一边</span><span class="to-text">' + t.a + '</span></div>' +
              '<div class="to-row"><span class="to-tag">另一边</span><span class="to-text">' + t.b + '</span></div>' +
              '<div class="to-row to-mid"><span class="to-tag">中间</span><span class="to-text">' + t.mid + '</span></div>' +
            '</div>';
  });

  /* 怎么确认 */
  html += '<div class="chain-block">' +
            '<div class="b-label">怎么确认（10分钟、一个人、不用求人）</div>' +
            '<div class="b-body">' + c.confirm + '</div>' +
          '</div>';

  /* 大概什么时候能验证（不是「什么时候会坏」） */
  var fam = CAUSE_FAMILY[c.code] ? VERIFY_FAMILIES[CAUSE_FAMILY[c.code]] : null;
  if (fam) {
    html += '<div class="chain-block">' +
              '<div class="b-label">大概什么时候能验证</div>' +
              '<div class="b-body"><b>' + fam.label + '</b>　' + (VERIFY_NOTE_OVERRIDE[c.code] || fam.note) + '</div>' +
            '</div>';
  }

  /* 鉴别诊断：不是免责声明，是「怎么把别的原因排除掉」 */
  if (c.exclude && c.exclude.length) {
    html += '<div class="chain-block">' +
              '<div class="b-label">如果不是这个原因，还可能是什么</div>';
    c.exclude.forEach(function (e) {
      html += '<div class="excl-item">' +
                '<div class="excl-alt">' + e.alt + '</div>' +
                '<div class="excl-how">' + e.how + '</div>' +
              '</div>';
    });
    html += '</div>';
  }

  html += '</div>';
  return html;
}

/* 需要排除的：不给完整卡片，只给「这是什么」+「一句话怎么排除」。
 * 主诊断只有一张，这一块是附件，不是第二个答案。 */
function renderExcludeCard(ch) {
  var c = ch.nodes[ch.nodes.length - 1];
  return '<div class="chain-card compact">' +
           '<span class="chain-rank excl">需要排除的</span>' +
           '<div class="cmp-name">' + c.plain + '</div>' +
           '<div class="cmp-how"><b>怎么排除：</b>' + c.confirm + '</div>' +
         '</div>';
}

/* ==================== 通用判断（命中才展示） ====================
 * 六条都对，但对具体某个人来说可能有五条跟他没关系。
 * 全量展示会把报告花力气做出来的精准感冲掉——所以只挑相关的。
 */
function matchedPrinciples(chains) {
  var codes = {};
  chains.forEach(function (ch) {
    ch.nodes.forEach(function (n) { codes[n.code] = 1; });
  });
  // 只按病因精确匹配，不按旋钮——旋钮太宽，会误报
  return PRINCIPLES.filter(function (p) {
    return p.causes.some(function (x) { return codes[x]; });
  });
}

function renderPrinciples(chains) {
  var list = matchedPrinciples(chains);
  if (!list.length) return '';
  var html = '<h2 class="h-sec" style="font-size:17px;margin-top:28px">几条跟这次诊断相关的判断</h2>' +
             '<p class="p-sec">从真实案例里反复验证过、又被反例修正过的。' +
             '不是通用大道理——只挑跟你这次勾的现象相关的。</p>';
  html += '<div class="principle-card"><ul>';
  list.forEach(function (p) {
    html += '<li>' + p.text + '</li>';
  });
  html += '</ul></div>';
  return html;
}

/* ==================== 话术卡 ==================== */
function renderScriptCard(topChain) {
  var ev = topChain.evidence.slice(0, 3).map(function (e) { return '「' + e.symptom.text + '」'; });
  var bossLine = BOSS_LINES[topChain.code] || '';
  var text = '我观察到几个现象：' + ev.join('、') + '。' +
             '它们都指向同一个可能——' + bossLine + '。' +
             '我想先确认一下，再决定要不要动。';
  // 复制出去的是纯文本，所以高亮只加在页面上，不加进 text
  var shown = '我观察到几个现象：' + ev.join('、') + '。<br>' +
              '它们都指向同一个可能——<b>' + bossLine + '</b>。<br>' +
              '我想先确认一下，再决定要不要动。';

  return '<div class="script-card">' +
           '<div class="sc-label">初步结论 · 可直接复制</div>' +
           '<div class="sc-body" id="script-text">' + shown + '</div>' +
           '<button class="sc-copy" onclick="copyScript()">复制这段话</button>' +
         '</div>';
}

function copyScript() {
  var txt = document.getElementById('script-text').innerText;
  var done = function () {
    var btn = document.querySelector('.sc-copy');
    var old = btn.textContent;
    btn.textContent = '已复制 ✓';
    setTimeout(function () { btn.textContent = old; }, 1600);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(done).catch(function () { fallbackCopy(txt, done); });
  } else {
    fallbackCopy(txt, done);
  }
}

function fallbackCopy(txt, cb) {
  var ta = document.createElement('textarea');
  ta.value = txt;
  ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); cb(); } catch (e) {}
  document.body.removeChild(ta);
}

/* ==================== 保存结果（不发链接、不收信息） ====================
 * 定位是纯工具，所以这里不收集任何联系方式。
 * 改成把这次的答案编进一个链接——用户自己存下来，随时能打开看同一份结果。
 * 这样 L1 从头到尾跟「你是谁」无关。
 */
function buildResultLink() {
  var payload = {
    p: state.pre,
    o: state.prePool,
    t: state.teams,
    k: Object.keys(state.answers)
      .filter(function (id) { return state.answers[id] && state.answers[id].sev > 0; })
      .map(function (id) {
        return [id, state.answers[id].sev, state.answers[id].dur || ''];
      })
  };
  var b64;
  try {
    b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  } catch (e) { return ''; }
  var base = location.href.split('?')[0].split('#')[0];
  return base + '?r=' + b64;
}

/** 从结果链接还原现场。成功返回 true。 */
function restoreFromLink() {
  var m = location.search.match(/[?&]r=([^&]+)/);
  if (!m) return false;
  try {
    var payload = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1])))));
    state.pre = payload.p || null;
    state.prePool = payload.o || null;
    state.teams = payload.t || [];
    state.answers = {};
    (payload.k || []).forEach(function (row) {
      var s = SYMPTOMS.filter(function (x) { return x.id === row[0]; })[0];
      if (!s) return;
      state.answers[row[0]] = {
        sev: row[1],
        dur: row[1] === 2 ? (row[2] || null) : null,
        team: s.team
      };
    });
    return state.teams.length > 0;
  } catch (e) {
    return false;
  }
}

function renderCaptureCard() {
  return '<div class="capture-card">' +
           '<div class="cap-title">保存这份结果</div>' +
           '<div class="cap-desc">复制下面的链接存起来。以后想回来看、或者换台设备打开，都是这份结果。</div>' +
           '<div class="cap-link" id="result-link"></div>' +
           '<button class="btn-primary" onclick="copyResultLink()">复制链接</button>' +
           '<div class="cap-note">不收集任何个人信息——链接里只有你勾过的现象。</div>' +
         '</div>';
}

function fillResultLink() {
  var el = document.getElementById('result-link');
  if (!el) return;
  var link = buildResultLink();
  el.textContent = link ? link.replace(/^https?:\/\//, '').slice(0, 90) + (link.length > 100 ? '…' : '') : '（这个环境没法生成链接）';
}

function copyResultLink() {
  var link = buildResultLink();
  if (!link) return;
  var done = function () {
    var btn = document.querySelector('.capture-card .btn-primary');
    if (!btn) return;
    var old = btn.textContent;
    btn.textContent = '已复制 ✓';
    setTimeout(function () { btn.textContent = old; }, 1600);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(link).then(done).catch(function () { fallbackCopy(link, done); });
  } else {
    fallbackCopy(link, done);
  }
}

/* ==================== L2 入口 ====================
 * 放在「保存结果」之后：用户手里已经有东西了，再告诉他下一步能拿到什么。
 */
function renderL2Entry() {
  var params = '';
  try { params = archiveToParams(); } catch (e) { params = ''; }
  return '<div class="l2-card">' +
           '<div class="l2-hint">知道问题在哪之后——</div>' +
           '<div class="l2-title">接下来改什么、按什么顺序</div>' +
           '<div class="l2-feats">' +
             '<span>每个改法的完整手册</span><span>·</span>' +
             '<span>先动哪个后动哪个</span><span>·</span>' +
             '<span>什么条件算成功</span><span>·</span>' +
             '<span>前提条件与回退</span>' +
           '</div>' +
           '<button class="l2-btn" onclick="goToL2()">看看该怎么改 →</button>' +
           '<p class="l2-price">¥199</p>' +
           '<div class="l2-note">不用重填，你的诊断结果会带过去</div>' +
         '</div>';
}

function goToL2() {
  window.location.href = 'l2/index.html?' + archiveToParams();
}

/* ==================== 边界说明 ==================== */
function renderBoundary() {
  return '<div class="boundary-card">' +
           '<div class="bd-title">这个工具不做什么</div>' +
           '<ul>' + BOUNDARY.map(function (b) { return '<li>' + b + '</li>'; }).join('') + '</ul>' +
         '</div>' +
         '<p class="footer-note">结论是待确认的假设，不是判决。<br>动手之前，先确认。</p>';
}

/* ==================== 预测模式（一条都没勾） ==================== */
function renderPredictMode() {
  var teams = state.teams.length ? state.teams : ['sales'];
  var picks = SYMPTOMS.filter(function (s) {
    return teams.indexOf(s.team) >= 0 && s.specificity === 'strong';
  }).slice(0, 6);

  var html = '<div class="empty-state">' +
               '<div class="e-icon">🩺</div>' +
               '<div class="e-title">你现在没勾任何现象</div>' +
               '<div class="e-desc">这可能是好事，也可能是还没显影。<br>机制不是设下去当天就坏的，是几个月之后坏的。</div>' +
             '</div>';

  if (picks.length) {
    // 注意措辞：工具并不知道你「打算怎么分」，它只知道你看的是哪个团队。
    // 说成「预测」是吹牛，说成「对照清单」才是真的。
    html += '<h2 class="h-sec" style="font-size:16px;margin-top:8px">这个团队最常见、也最先出现的几个信号</h2>' +
            '<p class="p-sec">这不是针对你的诊断——你没勾任何现象，可能是真没问题，也可能是还没显影。' +
            '把这几条记下来，过几个月回头对一遍。<b>机制不是设下去当天就坏的，是几个月之后坏的。</b></p>' +
            '<ul class="warn-list">' +
              picks.map(function (s) { return '<li>' + s.text + '</li>'; }).join('') +
            '</ul>';
  }
  html += renderBoundary();
  return html;
}

/* ==================== 证据不足 ==================== */
function renderNotEnough() {
  return '<div class="empty-state">' +
           '<div class="e-icon">🔍</div>' +
           '<div class="e-title">信息还不够，先别下判断</div>' +
           '<div class="e-desc">你勾的现象太少或太模糊，还不足以指向某一种机制问题。<br>' +
           '硬给一个结论，不如先去看几件事。</div>' +
         '</div>' +
         '<div class="note-box">' +
           '建议先做三件事：<br>' +
           '1. 拉出去年的奖金或调薪表，看第一名和第五名差几倍<br>' +
           '2. 找两个不同团队的人各聊 10 分钟，问他们「奖金是怎么算出来的」<br>' +
           '3. 把现在这套机制是什么时候定的、当时是按谁的情况定的，写下来' +
         '</div>' +
         renderBoundary();
}

/* ==================== 启动 ==================== */
(function init() {
  validateRulebook();

  // 从「保存结果」的链接打开 → 直接还原到报告页，不用重填
  if (restoreFromLink()) {
    showPage('page-loading');
    setTimeout(renderReport, 600);
    return;
  }

  try {
    var saved = localStorage.getItem(STORAGE_KEY);
    if (saved) { state = Object.assign(state, JSON.parse(saved)); }
  } catch (e) {}
  showPage('page-welcome');
})();
