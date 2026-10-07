/**
 * export-manuals.js —— 把 L2 的 18 篇手册导成一份能直接读的 Markdown
 *
 * 用法：node tools/export-manuals.js
 * 产出：仓库根目录的「手册.md」（在 .gitignore 里，属本地工作稿）
 *
 * 为什么要有它：手册只在「走完 L1 诊断 → L2 支付 → 补问卷 → 方案页」之后才渲染，
 * 每改一句都去走一遍流程没法迭代。这份导出把 18 篇摊平，改完重跑一次就能读。
 */

const fs = require('fs');
const path = require('path');

const payPath = path.join(__dirname, '..', 'js', 'pay-data.js');
const l2Path  = path.join(__dirname, '..', 'l2', 'js', 'l2-data.js');
const outPath = path.join(__dirname, '..', '手册.md');

eval(
  fs.readFileSync(payPath, 'utf8') + '\n' +
  fs.readFileSync(l2Path, 'utf8') + `
;global.__D__ = { MANUALS, SECTION_OUTLINE, PLANS, PLAN_OF, CAUSES };
`);

const { MANUALS, SECTION_OUTLINE, PLANS, PLAN_OF, CAUSES } = global.__D__;

const L = [];
const today = new Date().toISOString().slice(0, 10);

const keys = Object.keys(MANUALS);
const done = keys.filter(k => Object.keys(MANUALS[k].sections || {}).length === SECTION_OUTLINE.length);
const partial = keys.filter(k => {
  const n = Object.keys(MANUALS[k].sections || {}).length;
  return n > 0 && n < SECTION_OUTLINE.length;
});

L.push('# L2 手册 · 草稿');
L.push('');
L.push(`> 导出时间：${today}　·　共 ${keys.length} 篇`);
L.push(`> 写完 ${done.length} 篇　·　写了一半 ${partial.length} 篇　·　全空 ${keys.length - done.length - partial.length} 篇`);
L.push('>');
L.push('> 来源：`l2/js/l2-data.js`。**改完重跑 `node tools/export-manuals.js` 就同步。**');
L.push('');
L.push('**六段的顺序是设计过的**：先讲清是什么，再讲要不要动，再讲怎么动，最后讲怎么知道做对了、怎么退回来。');
L.push('');
L.push('---');
L.push('');

keys.forEach((key, i) => {
  const m = MANUALS[key];
  const plan = PLANS[key] || {};
  const causes = CAUSES.filter(c => PLAN_OF[c.code] === key).map(c => `${c.code} ${c.name}`);
  const knob = plan.knob === null || plan.knob === undefined
    ? '前置条件'
    : '旋钮' + '一二三四五'[plan.knob - 1];
  const filled = Object.keys(m.sections || {}).length;

  L.push(`# ${i + 1}. ${key} · ${plan.title || '（标题缺失）'}`);
  L.push('');
  L.push(`**旋钮**：${knob}　·　**谁能改**：${plan.decider || '—'}　·　**进度**：${filled}/${SECTION_OUTLINE.length} 段`);
  if (causes.length) L.push(`**包含病因**：${causes.join('、')}`);
  if (plan.brief) L.push(`**一句话**：${plan.brief}`);
  L.push('');

  SECTION_OUTLINE.forEach(sec => {
    L.push(`## ${sec.title}`);
    L.push('');
    const body = (m.sections || {})[sec.key];
    if (body) {
      L.push(body);
    } else {
      L.push('*（这一段待填）*');
    }
    L.push('');
  });

  L.push('---');
  L.push('');
});

fs.writeFileSync(outPath, L.join('\n'), 'utf8');

console.log('');
console.log('已导出：' + outPath);
console.log(`  共 ${keys.length} 篇　写完 ${done.length}　写一半 ${partial.length}　全空 ${keys.length - done.length - partial.length}`);
if (partial.length) console.log('  写了一半的：' + partial.join('、'));
console.log('');
