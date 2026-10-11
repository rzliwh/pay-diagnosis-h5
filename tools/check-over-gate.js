/**
 * check-over-gate.js —— 「勾太多」出口确认的回归测试
 *
 * 用法：node tools/check-over-gate.js
 *
 * 为什么需要它：出口确认的判据、放行、重新武装全在 js/pay-app.js 里，
 * 改动 overLimit() / goToLoading() / 几个弹层函数时很容易手滑，
 * 而这些行为在页面上要点几十下才能碰到一次。
 * 这个脚本搭一个最小 DOM 桩，把 pay-app.js 真跑起来，直接验行为，不用开浏览器。
 *
 * 每次改 js/pay-app.js 里那一段，或者改 index.html 里的弹层结构，都跑一次。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/* ---------- 最小 DOM 桩：只够 pay-app.js 的 init 和这几个函数用 ---------- */
function fakeEl(id) {
  return {
    id,
    style: {},
    innerHTML: '',
    textContent: '',
    offsetWidth: 0,
    parentNode: null,
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); }
    },
    focus() {}, addEventListener() {}, removeEventListener() {},
    replaceWith() {}, querySelectorAll() { return []; }
  };
}

const els = {};
const getEl = id => (els[id] || (els[id] = fakeEl(id)));
const notes = [fakeEl('note-survey'), fakeEl('note-cross')];
const crossNote = fakeEl('cross-note');

global.location = { search: '', href: '' };
global.requestAnimationFrame = fn => fn();
global.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] || null; },
  setItem(k, v) { this._d[k] = v; },
  removeItem(k) { delete this._d[k]; }
};
global.document = {
  getElementById: getEl,
  querySelector(sel) { return sel === '#page-cross .over-note' ? crossNote : null; },
  querySelectorAll(sel) { return sel === '.over-note' ? notes.slice() : []; },
  createElement: () => fakeEl('new'),
  body: fakeEl('body'),
  documentElement: fakeEl('html')
};
global.window = { scrollTo() {}, observeTeam: null };

/* pay-data.js 和 pay-app.js 必须在同一个 eval 里跑：
 * app 里用到的 CAUSES / SYMPTOMS 是 const，跨 eval 不会漏到外层作用域。 */
eval(
  fs.readFileSync(path.join(ROOT, 'js', 'pay-data.js'), 'utf8') + '\n' +
  fs.readFileSync(path.join(ROOT, 'js', 'pay-app.js'), 'utf8') + '\n' +
  `;global.__GATE__ = {
     overLimit, updateOverNote, goToLoading, gateBack, gateProceed,
     setAnswers(a) { state.answers = a; },
     causeCount: CAUSES.length, symptomCount: SYMPTOMS.length, symptoms: SYMPTOMS
   };`
);
const G = global.__GATE__;

/* ---------- 断言 ---------- */
let pass = 0;
const fails = [];
function ok(label, cond, extra) {
  if (cond) { pass++; console.log('  ✔ ' + label); }
  else { fails.push(label); console.log('  ✘ ' + label + (extra ? '  → ' + extra : '')); }
}

/* 每个病因取一条症状，填 k 个病因 → overLimit().n 正好等于 k */
const codes = [];
G.symptoms.forEach(s => { if (codes.indexOf(s.cause) < 0) codes.push(s.cause); });
function fill(k) {
  const a = {};
  codes.slice(0, k).forEach(c => {
    const s = G.symptoms.filter(x => x.cause === c)[0];
    a[s.id] = { sev: 1, dur: null, team: s.team };
  });
  G.setAnswers(a);
  return G.overLimit();
}

console.log('\n出口确认回归 · js/pay-app.js + js/pay-data.js');
console.log('─'.repeat(52));

console.log('\n1. 判据本身');
const r0 = G.overLimit();
ok('空答案 → n=0, half=15, over=false',
  r0.n === 0 && r0.half === 15 && r0.over === false, JSON.stringify(r0));
ok('规则库规模仍是 30 病因 / 111 症状',
  G.causeCount === 30 && G.symptomCount === 111, G.causeCount + '/' + G.symptomCount);

console.log('\n2. 边界 14 / 15（判据含等号）');
const r14 = fill(14);
ok('fill(14) → n=14, over=false', r14.n === 14 && r14.over === false, JSON.stringify(r14));
const r15 = fill(15);
ok('fill(15) → n=15, over=true', r15.n === 15 && r15.over === true, JSON.stringify(r15));

console.log('\n3. 答题卡上方的实时提示（回归，文案不该变）');
fill(15); G.updateOverNote();
ok('超线时显示，且写着 15', notes[0].style.display === 'block' && /已经指向 15 个病因/.test(notes[0].innerHTML));
ok('文案里没有破折号 ——', notes[0].innerHTML.indexOf('——') < 0);
fill(14); G.updateOverNote();
ok('未超线时隐藏', notes[0].style.display === 'none', notes[0].style.display);

console.log('\n4. 出口闸门');
fill(15); G.goToLoading();
ok('超线点「看结果」→ 弹层出现', getEl('over-gate').style.display === 'flex', getEl('over-gate').style.display);
ok('弹层上的数字 = 15', String(getEl('over-gate-n').textContent) === '15');
ok('不导航（没进 loading 页）', !els['page-loading'] || els['page-loading'].style.display !== 'block');
ok('背景锁滚动（html 和 body 都写）',
  global.document.documentElement.style.overflow === 'hidden' &&
  global.document.body.style.overflow === 'hidden');

console.log('\n5. 「回去删几条」');
fill(15); G.goToLoading(); G.gateBack();
ok('弹层关闭', getEl('over-gate').style.display === 'none');
ok('滚动锁恢复成空串（不留 inline 残渣）',
  global.document.documentElement.style.overflow === '' && global.document.body.style.overflow === '');
ok('跨团队屏那条提示被标记闪烁', crossNote.classList.contains('over-flash'));
G.gateBack();
ok('连着再点一次仍能闪（reflow 重触发对）', crossNote.classList.contains('over-flash'));

console.log('\n6. 「就这样看」放行');
fill(15); G.goToLoading(); G.gateProceed();
ok('弹层关闭', getEl('over-gate').style.display === 'none');
ok('进入 loading 页', getEl('page-loading').style.display === 'block');
ok('滚动锁恢复', global.document.body.style.overflow === '');

console.log('\n7. 重新武装（防止留 sticky ack）');
fill(15); G.goToLoading();
ok('放行后再次点「看结果」，仍被拦', getEl('over-gate').style.display === 'flex');
G.gateBack();

console.log('\n8. 未超线时不拦（回归）');
els['page-loading'] = undefined;
fill(9); G.goToLoading();
ok('n=9 → 无弹层，直接进 loading',
  getEl('over-gate').style.display !== 'flex' && getEl('page-loading').style.display === 'block');

console.log('\n' + '─'.repeat(52));
if (fails.length) {
  console.log(pass + ' 项通过，' + fails.length + ' 项失败：');
  fails.forEach(f => console.log('  · ' + f));
  process.exit(1);
}
console.log(pass + ' 项通过，0 项失败。');
