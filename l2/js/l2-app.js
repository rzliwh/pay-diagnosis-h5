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
function esc(s) { return String(s == null ? '' : s); }

function planOfId(id) { return PLANS[id] || null; }
function causeByCode(code) { return CAUSES.filter(function (c) { return c.code === code; })[0]; }
function causesFromParams() {
  var raw = params().get('causes') || '';
  return raw.split(',').filter(Boolean).map(causeByCode).filter(Boolean);
}

/** 诊断摘要：把带过来的病因拼成一句人话 */
function diagnosisSummary() {
  var list = causesFromParams();
  if (!list.length) return '（没有收到诊断结果）';
  return list.slice(0, 2).map(function (c) { return c.plain; }).join('；');
}

function confNote() {
  var conf = params().get('conf');
  if (conf === 'mid') return '你这次的诊断里，前两条的差别不大——所以下面会给两个方向对照着看。';
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
          '</div>';

  /* 前提条件 */
  if (plan.preconditions && plan.preconditions.length) {
    html += '<div class="l2-block"><div class="l2-block-label">动手之前先确认</div><ul class="l2-pre">';
    plan.preconditions.forEach(function (t) { html += '<li>' + esc(t) + '</li>'; });
    html += '</ul><div class="l2-block-foot">前提不成立的时候，方案就是空头支票。</div></div>';
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

  /* 边界 */
  html += '<div class="l2-boundary"><div class="l2-boundary-title">这一层不做什么</div><ul>' +
          L2_BOUNDARY.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') +
          '</ul></div>';

  html += '<p class="l2-foot">方案是待验证的，不是结论。上了之后对照信号看变化。</p>';
  el.innerHTML = html;
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
