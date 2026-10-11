/**
 * l2-app.js —— L2 层逻辑（四段页面链）
 *
 * 页面链：index.html（介绍）→ pay.html（支付）→ survey.html（补问卷）→ report.html（方案）
 * 靠 URLSearchParams 一路透传，不依赖后端。
 *
 * 依赖：../js/pay-data.js（PLANS / CAUSES / KNOBS / PLAN_OF）
 *       js/l2-data.js（L2_QUESTIONS / MANUALS / SECTION_OUTLINE / ORDER_RULES）
 */

/* ==================== 公共 ==================== */
function params() { return new URLSearchParams(window.location.search); }
function passthrough(extra) {
  var p = params();
  if (extra) Object.keys(extra).forEach(function (k) { p.set(k, extra[k]); });
  return p.toString();
}
function go(page, extra) { window.location.href = page + '?' + passthrough(extra); }
/* 把文本安全地放进 HTML：先转义，再把 **…** 变成加粗。
 *
 * 这个名字一直叫 esc，但它以前什么都不做 —— 于是手册里 1641 处的 **
 * 全部裸露在页面上（写手册时用的是 markdown 的加粗）。
 * 转义要在加粗之前做，否则 ** 里的 * 会被一起转掉。
 */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
}

function planOfId(id) { return PLANS[id] || null; }
function causeByCode(code) { return CAUSES.filter(function (c) { return c.code === code; })[0]; }
function causesFromParams() {
  var raw = params().get('causes') || '';
  return raw.split(',').filter(Boolean).map(causeByCode).filter(Boolean);
}

/* 这个改法挂了哪几张两说卡。
 * 按病因匹配，不按旋钮——旋钮一底下装着四种完全不同的毛病，按旋钮会误报。 */
function tradeoffsOfPlan(planId) {
  return TRADEOFFS.filter(function (t) {
    return t.causes.some(function (c) { return PLAN_OF[c] === planId; });
  });
}

/* 他从 L1 一路带过来的现象（勾中 + 严重度）。
 * 这是「他自己的证据」——比任何通用清单都有说服力。 */
function symptomsFromParams() {
  var raw = params().get('sym') || '';
  return raw.split(',').filter(Boolean).map(function (pair) {
    var parts = pair.split(':');
    var s = SYMPTOMS.filter(function (x) { return x.id === parts[0]; })[0];
    return s ? { text: s.text, sev: parseInt(parts[1], 10) || 1 } : null;
  }).filter(Boolean);
}

/* 他把某个问题答成了什么——按他选的选项原话取。
 * 冲突提醒里必须用这个，不能写死。
 * （踩过一次：提醒里写死「你想一两个月看到变化」，而他答的是「半年到一年」——
 *  工具在说一件他根本没说过的话，比逻辑错还难看。） */
function answerLabel(p, qid) {
  var q = L2_QUESTIONS.filter(function (x) { return x.id === qid; })[0];
  if (!q) return '';
  var v = p.get('a_' + qid);
  var opt = q.options.filter(function (o) { return o.value === v; })[0];
  return opt ? opt.label.replace(/（.*?）/, '') : '';
}

/* 四个约束答案，整理成一句人话（一页纸上要用） */
function constraintsLine(p) {
  return L2_QUESTIONS.map(function (q) {
    var v = p.get('a_' + q.id);
    var opt = q.options.filter(function (o) { return o.value === v; })[0];
    return opt ? (q.short || q.title.replace(/[，,。？?]/g, '')) + '：' + opt.label : '';
  }).filter(Boolean).join('；');
}

/* 在他自己的诊断结果里，找一个跟他约束不冲突的改法。
 * 通用的「先动那个不花钱的」是废话——他还得自己回去找；
 * 说「你这次还命中了 X，那一步不冲突」，他直接能走。 */
function nextStep(planId, p) {
  var cs = causesFromParams();
  var want = { fast: 1, season: 2, long: 3 }[p.get('a_window')] || 3;
  var see = function (id) { return { fast: 1, cycle: 2, year: 3 }[id] || 2; };
  for (var i = 1; i < cs.length; i++) {
    var code = cs[i].code, pid = PLAN_OF[code];
    if (!pid || pid === planId) continue;
    var cc = CAUSE_CONSTRAINTS[code] || {};
    if (p.get('a_cash') === 'tight' && cc.costsMoney) continue;
    if (p.get('a_scope') === 'none' && cc.touchesExisting) continue;
    if (p.get('a_power') === 'tune' && cc.needsReset) continue;
    var alt = PLANS[pid];
    if (want < see(alt.seeSpeed)) continue;
    return '你这次还命中了「' + alt.title + '」，那一步不冲突，可以先从它开始';
  }
  return '先把它放到最后，或者先去做那件十分钟能验证的事';
}

/* 他的方案跟他自己答的约束，打不打架。
 * 这是这个工具最该做的一件事——给一个他做不了的方案，还一声不吭。 */
function conflictWarnings(planId, plan, p) {
  var cs = causesFromParams();
  if (!plan || !cs.length) return [];
  var cc = CAUSE_CONSTRAINTS[cs[0].code] || {};
  var out = [];
  var then = nextStep(planId, p);

  if (p.get('a_cash') === 'tight' && cc.costsMoney) {
    out.push('**这一步要花钱。** 你说过今年现金流「' + answerLabel(p, 'cash') + '」——' + then + '。');
  }
  if (p.get('a_scope') === 'none' && cc.touchesExisting) {
    out.push('**这一步会动到现有人的收入。** 你说过存量「' + answerLabel(p, 'scope') + '」——先动增量的：新业务、新人的机制先建起来，老的先不动。');
  }
  if (p.get('a_power') === 'tune' && cc.needsReset) {
    out.push('**这一步是重设，不是调一个参数。** 你说的是「' + answerLabel(p, 'power') + '」——那这一步现在做不了，' + then + '。');
  }
  var want = { fast: 1, season: 2, long: 3 }[p.get('a_window')] || 3;
  var got = { fast: 1, cycle: 2, year: 3 }[plan.seeSpeed] || 2;
  if (want < got) {
    out.push('**你希望在「' + answerLabel(p, 'window') + '」内看到变化，但这一步最快也要' +
             (plan.seeSpeed === 'year' ? '跨年' : '一个完整结算周期') + '才显形。** ' + then + '。');
  }
  return out;
}

/* 手册某一段的第一句（一页纸只用得上第一句） */
function firstSentence(manual, key) {
  var t = (manual && manual.sections && manual.sections[key]) || '';
  if (!t) return '';
  var line = t.split('\n').filter(function (l) { return l && l.indexOf('·') !== 0 && l.indexOf('**') !== 0; })[0] || '';
  line = line.replace(/^\d+\.\s*/, '');   // 手册里是「1. xxx」，一页纸上不要那个序号
  return line.split('。')[0] ? line.split('。')[0] + '。' : '';
}

/* 「什么算成功」那一段里的第一条判据。
 * 要跳过两样：开头那句总纲，和「挑判据有两个门槛」下面那两条——
 * 门槛是审查标准，不是判据本身。 */
function firstCriterion(manual, key) {
  var t = (manual && manual.sections && manual.sections[key]) || '';
  if (!t) return '';
  var bullets = t.split('\n').filter(function (l) { return l.indexOf('·') === 0; });
  var core = bullets.filter(function (l) {
    return l.indexOf('旧机制下得是做不出来') < 0 && l.indexOf('取在被激励的人身上') < 0;
  });
  var line = (core[0] || bullets[0] || '').replace(/^·\s*/, '').replace(/\*\*/g, '');
  var cut = line.split('。')[0];
  return cut ? cut + '。' : line;
}

/* 带走的那一页：七行，全部来自已经有的数据，一个字都不用新写。
 * 这一页是给 HR 拿去说服别人的——L1 给的是一句话，L2 给的是一页。 */
function onePagerRows(plan, manual, p) {
  var out = [];
  var cs = causesFromParams();
  if (cs.length) out.push(['问题的方向', cs[0].plain]);
  var syms = symptomsFromParams();
  if (syms.length) {
    out.push(['我勾中的现象',
      syms.slice(0, 4).map(function (s) { return s.text; }).join('；') +
      (syms.length > 4 ? '…（共 ' + syms.length + ' 条）' : '')]);
  }
  var cons = constraintsLine(p);
  if (cons) out.push(['我现在的约束', cons]);

  var adv = orderAdvice(p).filter(function (t) { return t.indexOf('一次只拧一个') !== 0; });
  var firstDo = adv.length ? adv[0] : firstSentence(manual, 'how');
  if (firstDo) out.push(['先做什么', firstDo]);

  var ok = firstCriterion(manual, 'success');
  if (ok) out.push(['什么算做成', ok]);
  /* 「多久回来看」要填一个**时间点**，别把上面那条判据重说一遍。
   * （踩过：直接放 effectWindow 的时候，k1-metric 那篇的「什么算做成」
   *   和这一行说的是同一件事——「他开始算这个数」出现了两次。） */
  var SPEED_CN = { fast: '一两个月后就看得出', cycle: '一个结算周期之后', year: '要跨年才看得出来' };
  if (plan.seeSpeed && SPEED_CN[plan.seeSpeed]) out.push(['多久回来看', SPEED_CN[plan.seeSpeed]]);
  if (plan.decider) out.push(['这一步谁拍板', plan.decider]);

  return out;
}

/** 诊断摘要：把带过来的病因拼成一句人话 */
function diagnosisSummary() {
  var list = causesFromParams();
  if (!list.length) return '（没有收到诊断结果）';
  return list.slice(0, 2).map(function (c) { return c.plain; }).join('；');
}

function confNote() {
  var conf = params().get('conf');
  if (conf === 'mid') return '你这次的诊断里，前两条的差别不大——所以下面这份方案，先按可能性最高的那条来。';
  if (conf === 'low') return '你这次的诊断证据偏弱。建议先别动机制，回去把那条确认动作做了。';
  return '';
}

/* ==================== 一、介绍页 ==================== */
function renderIndex() {
  var planId = params().get('plan');
  var plan = planOfId(planId);
  var el = document.getElementById('l2-body');
  if (!el) return;

  var html = '';
  html += '<h1 class="l2-h1">知道问题在哪之后</h1>';
  html += '<p class="l2-sub">接下来是「改什么、按什么顺序、什么算改对了」</p>';

  html += '<div class="l2-diag">' +
            '<div class="l2-diag-label">你的诊断结果</div>' +
            '<div class="l2-diag-body">' + esc(diagnosisSummary()) + '</div>' +
          '</div>';

  if (plan) {
    html += '<div class="l2-plan-preview">' +
              '<div class="l2-plan-label">最可能需要动的地方</div>' +
              '<div class="l2-plan-title">' + esc(plan.title) + '</div>' +
              '<div class="l2-plan-brief">' + esc(plan.brief) + '</div>' +
              '<div class="l2-plan-who">需要谁拍板：<b>' + esc(plan.decider || '—') + '</b></div>' +
            '</div>';
  }

  var note = confNote();
  if (note) html += '<div class="l2-note-box">' + note + '</div>';

  html += '<div class="l2-value">' +
            '<div class="l2-value-title">你会拿到</div>' +
            '<ul>' +
              '<li><b>这一条改法的完整手册</b>——从「要不要动」到「怎么退回来」</li>' +
              '<li><b>先动哪个、后动哪个</b>——一次只拧一个，那先拧哪个就是判断</li>' +
              '<li><b>什么条件算成功</b>——不是感觉好了，是可检查的判据</li>' +
              '<li><b>前提条件</b>——不满足的话，方案就是空头支票</li>' +
            '</ul>' +
          '</div>';

  html += '<button class="l2-btn-primary" onclick="go(\'pay.html\')">继续 →</button>';
  html += '<p class="l2-price">¥199</p>';
  el.innerHTML = html;
}

/* ==================== 二、支付页 ==================== */
function renderPay() {
  var el = document.getElementById('l2-body');
  if (!el) return;
  var plan = planOfId(params().get('plan'));
  el.innerHTML =
    '<h1 class="l2-h1">订单</h1>' +
    '<div class="l2-order">' +
      '<div class="l2-order-row"><span>分钱机制 · 方案手册</span><b>¥199</b></div>' +
      (plan ? '<div class="l2-order-sub">' + esc(plan.title) + '</div>' : '') +
      '<div class="l2-order-sub">按你的诊断结果和约束条件生成</div>' +
    '</div>' +
    '<div class="l2-qr-wrap">' +
      '<img src="../images/wechat-pay-199.jpg" alt="微信收款码" class="l2-qr" ' +
        'onerror="this.style.display=\'none\';document.getElementById(\'qr-fallback\').style.display=\'block\';">' +
      '<div id="qr-fallback" class="l2-qr-fallback" style="display:none">收款码暂时打不开，请联系获取</div>' +
    '</div>' +
    '<p class="l2-qr-hint">扫码支付 ¥199，付完点下面的按钮</p>' +
    '<button class="l2-btn-primary" onclick="go(\'survey.html\')">我已付款，继续 →</button>' +
    '<p class="l2-foot">付款这一步不收集任何个人信息</p>';
}

/* ==================== 三、补问卷 ==================== */
var l2Answers = {};

function renderSurvey() {
  var el = document.getElementById('l2-body');
  if (!el) return;
  var html = '<h1 class="l2-h1">最后四个问题</h1>' +
             '<p class="l2-sub">同一个诊断，在不同条件下方案完全不同。这四个问题决定给你哪一版。</p>';
  L2_QUESTIONS.forEach(function (q) {
    html += '<div class="l2-q" data-q="' + q.id + '">' +
              '<div class="l2-q-title">' + q.title + '</div>' +
              '<div class="l2-q-desc">' + q.desc + '</div>' +
              '<div class="l2-q-opts">';
    q.options.forEach(function (o) {
      html += '<div class="l2-opt" data-val="' + o.value + '" ' +
              'onclick="pickL2(this, \'' + q.id + '\')">' +
                '<div class="l2-opt-label">' + o.label + '</div>' +
                '<div class="l2-opt-hint">' + o.hint + '</div>' +
              '</div>';
    });
    html += '</div></div>';
  });
  html += '<button class="l2-btn-primary" id="l2-submit" onclick="submitL2()" disabled>看方案 →</button>';
  el.innerHTML = html;
}

function pickL2(el, qid) {
  var box = el.closest('.l2-q');
  box.querySelectorAll('.l2-opt').forEach(function (x) { x.classList.remove('on'); });
  el.classList.add('on');
  l2Answers[qid] = el.getAttribute('data-val');
  document.getElementById('l2-submit').disabled =
    L2_QUESTIONS.some(function (q) { return !l2Answers[q.id]; });
}

function submitL2() {
  var extra = {};
  L2_QUESTIONS.forEach(function (q) { extra['a_' + q.id] = l2Answers[q.id]; });
  go('report.html', extra);
}

/* ==================== 四、方案页 ==================== */
function renderReport() {
  var el = document.getElementById('l2-body');
  if (!el) return;
  var p = params();
  var planId = p.get('plan');
  var plan = planOfId(planId);
  var manual = (typeof MANUALS !== 'undefined' && planId) ? MANUALS[planId] : null;

  var html = '';
  html += '<h1 class="l2-h1">你的方案</h1>';

  /* 诊断摘要 */
  html += '<div class="l2-diag">' +
            '<div class="l2-diag-label">诊断结果</div>' +
            '<div class="l2-diag-body">' + esc(diagnosisSummary()) + '</div>' +
          '</div>';
  var note = confNote();
  if (note) html += '<div class="l2-note-box">' + note + '</div>';

  /* 你勾中的现象——他自己的证据，不是通用清单 */
  var syms = symptomsFromParams();
  if (syms.length) {
    html += '<div class="l2-block"><div class="l2-block-label">你勾中的现象（' + syms.length + ' 条）</div>' +
            '<ul class="l2-sym">';
    syms.forEach(function (s) {
      html += '<li>' + esc(s.text) +
              (s.sev >= 2 ? '<span class="l2-sym-sev">反复发生</span>' : '') + '</li>';
    });
    html += '</ul><div class="l2-block-foot">这些是你自己勾的，不是排行榜上的通用毛病。</div></div>';
  }

  /* 你的约束 */
  html += '<div class="l2-answers"><div class="l2-answers-title">你的约束条件</div>';
  L2_QUESTIONS.forEach(function (q) {
    var v = p.get('a_' + q.id);
    var opt = q.options.filter(function (o) { return o.value === v; })[0];
    html += '<div class="l2-answer-row"><span>' + q.title + '</span><b>' +
            (opt ? opt.label : '未答') + '</b></div>';
  });
  html += '</div>';

  /* 改法 */
  if (!plan) {
    html += '<div class="l2-note-box">没有收到改法信息——请从诊断结果页的入口重新进来。</div>';
    el.innerHTML = html;
    return;
  }

  html += '<div class="l2-plan-head">' +
            '<div class="l2-plan-label">该动的地方</div>' +
            '<h2 class="l2-plan-h2">' + esc(plan.title) + '</h2>' +
            '<p class="l2-plan-brief">' + esc(plan.brief) + '</p>' +
            '<div class="l2-plan-meta">' +
              '<span class="l2-tag">' + (plan.knob ? '旋钮' + '一二三四五'[plan.knob - 1] : '前置条件') + '</span>' +
              '<span class="l2-tag">需要 ' + esc(plan.decider || '—') + ' 拍板</span>' +
            '</div>' +
            '<div class="l2-who-note">这一步是<b>' + esc(plan.decider || '公司层') + '</b>拍板的。' +
              '很多 HR 卡在这里——想在公司层的问题上做团队层的动作，推不动不是能力问题，是找错了人。</div>' +
          '</div>';

  /* 约束冲突——放在手册之前。读完了手册才看到警告，等于白读。 */
  var warns = conflictWarnings(planId, plan, p);
  if (warns.length) {
    html += '<div class="l2-conflict">' +
              '<div class="l2-cf-title">这一步跟你现在的处境有 ' + warns.length + ' 处打架</div>';
    warns.forEach(function (t) {
      html += '<div class="l2-cf-row">' + t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>') + '</div>';
    });
    html += '</div>';
  }

  /* 前提条件 */
  if (plan.preconditions && plan.preconditions.length) {
    html += '<div class="l2-block"><div class="l2-block-label">动手之前先确认</div><ul class="l2-pre">';
    plan.preconditions.forEach(function (t) { html += '<li>' + esc(t) + '</li>'; });
    html += '</ul><div class="l2-block-foot">前提不成立的时候，方案就是空头支票。</div></div>';
  }

  /* 多久能看出效果——这是「药的钟」。
   * 跟病因卡上那个「大概什么时候能验证」（病的钟）是两回事：
   * 病多久显形，跟药多久见效，不是一回事，别混着用。 */
  if (plan.effectWindow) {
    html += '<div class="l2-block">' +
              '<div class="l2-block-label">多久能看出效果</div>' +
              '<div class="l2-effect">' + esc(plan.effectWindow) + '</div>' +
              '<div class="l2-block-foot">这是「改完多久能知道有没有用」。跟病因卡上那个「大概什么时候能验证」是两个钟——病多久显形，跟药多久见效，不是一回事。</div>' +
            '</div>';
  }

  /* 顺序建议 */
  var advice = orderAdvice(p);
  if (advice.length) {
    html += '<div class="l2-block"><div class="l2-block-label">先动哪个</div><ul class="l2-pre">';
    advice.forEach(function (t) { html += '<li>' + esc(t) + '</li>'; });
    html += '</ul></div>';
  }

  /* 手册正文 */
  var secs = (manual && manual.sections) || {};
  var filled = SECTION_OUTLINE.filter(function (s) { return secs[s.key]; });
  html += '<div class="l2-block"><div class="l2-block-label">手册</div>';
  if (!filled.length) {
    html += '<div class="l2-todo">' +
              '<div class="l2-todo-title">这一篇还没写</div>' +
              '<div class="l2-todo-desc">骨架已经搭好了，按下面积累的六段填即可。' +
              '写不出来的段就空着——空着比编一个好。</div>' +
              '<ol class="l2-todo-list">' +
                SECTION_OUTLINE.map(function (s) { return '<li>' + s.title + '</li>'; }).join('') +
              '</ol>' +
            '</div>';
  } else {
    SECTION_OUTLINE.forEach(function (s) {
      if (!secs[s.key]) return;
      html += '<div class="l2-sec"><div class="l2-sec-title">' + s.title + '</div>' +
              '<div class="l2-sec-body">' + esc(secs[s.key]) + '</div></div>';
    });
  }
  html += '</div>';

  /* 两说卡：这件事没有唯一正确的答案，把两边的代价摆出来，不替你选。
   * 放在手册后面——手册的「怎么改」里会写「见下面那张卡」。 */
  var cards = tradeoffsOfPlan(planId);
  if (cards.length) {
    html += '<div class="l2-block"><div class="l2-block-label">这件事没有标准答案，看你取舍</div>';
    cards.forEach(function (t) {
      html += '<div class="l2-tradeoff">' +
                '<div class="l2-to-title">' + esc(t.title) + '</div>' +
                '<div class="l2-to-row"><span class="l2-to-tag">一边</span><span class="l2-to-text">' + esc(t.a) + '</span></div>' +
                '<div class="l2-to-row"><span class="l2-to-tag">另一边</span><span class="l2-to-text">' + esc(t.b) + '</span></div>' +
                '<div class="l2-to-row l2-to-mid"><span class="l2-to-tag">中间</span><span class="l2-to-text">' + esc(t.mid) + '</span></div>' +
              '</div>';
    });
    html += '</div>';
  }

  /* 带走的那一页：给 HR 拿去说服别人的。
   * L1 给的是一句话（能在会上念），L2 给的是一页（能打印、能贴 PPT）。
   * 七行全是拼装，没有一个是新写的内容。 */
  var rows = onePagerRows(plan, manual, p);
  if (rows.length) {
    html += '<div class="l2-block"><div class="l2-block-label">带走这一页</div>' +
            '<div class="l2-onepager" id="l2-onepager">';
    rows.forEach(function (r) {
      html += '<div class="l2-op-row"><span class="l2-op-k">' + esc(r[0]) + '</span>' +
              '<span class="l2-op-v">' + esc(r[1]) + '</span></div>';
    });
    html += '</div>' +
            '<button class="l2-btn-primary" style="margin-top:12px" onclick="copyOnePager()">复制这一页</button>' +
            '<div class="l2-block-foot">给老板、给合伙人、贴进你的汇报里——这一页是拿得出手的。</div>' +
            '</div>';
  }

  /* 边界 */
  html += '<div class="l2-boundary"><div class="l2-boundary-title">这一层不做什么</div><ul>' +
          L2_BOUNDARY.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') +
          '</ul></div>';

  html += '<p class="l2-foot">方案是待验证的，不是结论。上了之后对照信号看变化。</p>';
  el.innerHTML = html;
}

/* 把「带走这一页」复制成纯文本——要能直接贴进微信、邮件、PPT */
function copyOnePager() {
  var box = document.getElementById('l2-onepager');
  if (!box) return;
  var txt = Array.prototype.map.call(box.querySelectorAll('.l2-op-row'), function (r) {
    return r.querySelector('.l2-op-k').textContent + '：' + r.querySelector('.l2-op-v').textContent;
  }).join('\n');
  var btn = box.parentNode.querySelector('button');
  var done = function () {
    if (!btn) return;
    var old = btn.textContent;
    btn.textContent = '已复制 ✓';
    setTimeout(function () { btn.textContent = old; }, 1600);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(done).catch(done);
  } else {
    done();
  }
}

/** 按「诊断置信度 + 四个偏好答案」挑出适用的顺序建议 */
function orderAdvice(p) {
  var out = [];
  var conf = p.get('conf');
  if (conf === 'low') out.push(ORDER_RULES[0].text);
  var cash = p.get('a_cash'), scope = p.get('a_scope'), win = p.get('a_window');
  if (cash === 'tight') out.push(ORDER_RULES[1].text);
  if (scope === 'none') out.push(ORDER_RULES[2].text);
  if (win === 'fast') out.push(ORDER_RULES[3].text);
  out.push(ORDER_RULES[4].text);
  return out;
}

/* ==================== 启动 ==================== */
(function init() {
  var page = document.body.getAttribute('data-l2page');
  if (page === 'index') renderIndex();
  else if (page === 'pay') renderPay();
  else if (page === 'survey') renderSurvey();
  else if (page === 'report') renderReport();
})();
