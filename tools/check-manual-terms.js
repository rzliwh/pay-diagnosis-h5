/**
 * check-manual-terms.js —— 扫「用户看不懂的内部痕迹」
 *
 * 用法：node tools/check-manual-terms.js
 *
 * 规矩来自一个决定：**术语全改，不分给谁看。**
 *
 * 为什么不按「哪些地方是用户可见的」来分——那张清单是结构性的，
 * 加了新页面它不会自己更新，漏一处术语就漏一處。而「一个概念只有一个说法」
 * 不需要维护：不是靠记得住，是靠根本不存在第二套。
 *
 * 两类检查：
 *   一、禁用术语——扫两个规则文件里的**所有文案**（注释不算，它到不了用户）
 *   二、独立成立——扫手册六段（内部编号 / 材料引用 / 跨篇引用）
 */

const fs = require('fs');
const path = require('path');

const payPath = path.join(__dirname, '..', 'js', 'pay-data.js');
const l2Path  = path.join(__dirname, '..', 'l2', 'js', 'l2-data.js');

eval(
  fs.readFileSync(payPath, 'utf8') + '\n' +
  fs.readFileSync(l2Path, 'utf8') + `
;global.__D__ = {
  MANUALS, SECTION_OUTLINE, PLANS, PLAN_OF, CAUSES, KNOBS, BOSS_LINES,
  PRINCIPLES, TRADEOFFS, BOUNDARY, VERIFY_FAMILIES, VERIFY_NOTE_OVERRIDE,
  TEAMS, SYMPTOMS, PRE_QUESTION, PRE_QUESTION_2, L2_QUESTIONS,
  ORDER_RULES, L2_BOUNDARY
};
`);
const D = global.__D__;

/* ==================== 一、禁用术语 ====================
 * 这些词要么是经济学术语、要么是我们自己造的、要么是机械词。
 * 判据：**直接念给老板听，他会不会先问「这是什么意思」。**
 *
 * 不在表里的（口径 / 保底 / 封顶 / 提成 / 回款 / 毛利 / 递延 / 存量 / 增量
 * / 套利 / 倒挂）：是行业词，读者是 HR 和老板，换掉反而显外行。
 * 「保养」也在表外——机制那个比喻已经删了，剩下的「设备该保养」是字面意思。
 */
const BANNED = [
  ['棘轮',     '目标只上不下'],
  ['锚点',     '按固定基准定 / 重新说清楚'],
  ['归因单位', '功劳算到谁头上'],
  ['分配形状', '差距大小'],
  ['可归因',   '算得到人头'],
  ['激励窗口', '钱到手太晚（劲早凉了）'],
  ['过载',     '差距太大'],
  ['区分度',   '差距'],
  ['透支型',   '提前花底子'],
  ['外部锚',   '外部的验收依据'],
  ['多期锚定', '按固定基准定']
];

/* ==================== 二、独立成立 ==================== */
const RULES = [
  { re: /案例\s*\d+/g,  what: '案例引用',   fix: '把案例写成一句话的故事；写不出细节就把引用删掉——不要编' },
  { re: /号文档/g,      what: '内部文档',   fix: '这句话通常已经完整，直接删掉引用' },
  { re: /跟「[^」]{2,10}」是同一回事|参见「[^」]+」|详见「[^」]+」/g,
    what: '跨篇概念引用', fix: '改写成自足的描述，别引用别篇才定义的概念' }
];

/* 同一篇里的段落名——引用它们不算跨篇 */
const SAME_DOC_SECTIONS = ['不该动', '具体怎么改', '坑', '什么条件算成功', '怎么退回来', '这一条在说什么'];

const SELF_TITLES = {
  'pre-resource': ['资源和地盘'], 'pre-split': ['不同业务分开'],
  'k1-unit': ['按谁算'], 'k1-metric': ['算什么数'], 'k1-diff': ['政策差异'],
  'k1-cycle': ['什么时候兑现'], 'k2-base': ['按什么基数算'],
  'k2-reach': ['目标定到够得着'], 'k2-raise': ['常规调薪'],
  'k3-floor': ['保底'], 'k3-cap': ['封顶'], 'k3-pool': ['池子'],
  'k4-basis': ['分配依据'], 'k4-rules': ['事前定规则'], 'k4-spread': ['差距'],
  'k5-anchor': ['机制用旧了', '定期查'], 'k5-form': ['换激励形式']
};

/* 把对象里所有字符串递归收出来，附带一个「路径」用来报告位置 */
function walk(v, pathStr, out) {
  if (typeof v === 'string') { out.push([pathStr, v]); return; }
  if (!v || typeof v !== 'object') return;
  if (Array.isArray(v)) { v.forEach((x, i) => walk(x, pathStr + '[' + i + ']', out)); return; }
  Object.keys(v).forEach(k => walk(v[k], pathStr + '.' + k, out));
}

let problems = 0;
const rows = [];

/* ---- 一、禁用术语：扫两个文件里所有文案 ---- */
const strings = [];
walk(D.CAUSES, 'CAUSES', strings);
walk(D.KNOBS, 'KNOBS', strings);
walk(D.BOSS_LINES, 'BOSS_LINES', strings);
walk(D.PRINCIPLES, 'PRINCIPLES', strings);
walk(D.TRADEOFFS, 'TRADEOFFS', strings);
walk(D.PLANS, 'PLANS', strings);
walk(D.VERIFY_FAMILIES, 'VERIFY_FAMILIES', strings);
walk(D.VERIFY_NOTE_OVERRIDE, 'VERIFY_NOTE_OVERRIDE', strings);
walk(D.TEAMS, 'TEAMS', strings);
walk(D.SYMPTOMS, 'SYMPTOMS', strings);
walk(D.PRE_QUESTION, 'PRE_QUESTION', strings);
walk(D.PRE_QUESTION_2, 'PRE_QUESTION_2', strings);
walk(D.MANUALS, 'MANUALS', strings);
walk(D.L2_QUESTIONS, 'L2_QUESTIONS', strings);
walk(D.ORDER_RULES, 'ORDER_RULES', strings);
walk(D.L2_BOUNDARY, 'L2_BOUNDARY', strings);

strings.forEach(([where, text]) => {
  BANNED.forEach(([bad, good]) => {
    if (text.indexOf(bad) >= 0) {
      rows.push([where.slice(0, 30), '禁用术语', bad, '换成：' + good]);
      problems++;
    }
  });
});

/* ---- 二、独立成立：只扫手册六段 ---- */
Object.keys(D.MANUALS).forEach(key => {
  const secs = D.MANUALS[key].sections || {};
  Object.keys(secs).forEach(sec => {
    const text = secs[sec];
    const at = key + '.' + sec;

    RULES.forEach(rule => {
      let m;
      const re = new RegExp(rule.re.source, 'g');
      while ((m = re.exec(text)) !== null) {
        rows.push([at, rule.what, m[0], rule.fix]);
        problems++;
      }
    });

    let m2;
    const reRef = /「([^」]{2,12})」那一[篇类块条]/g;
    while ((m2 = reRef.exec(text)) !== null) {
      const mine = SELF_TITLES[key] || [];
      const isSelf = mine.some(t => m2[1].indexOf(t) >= 0) || SAME_DOC_SECTIONS.indexOf(m2[1]) >= 0;
      if (!isSelf) {
        rows.push([at, '跨手册引用', m2[0], '改写成自足的句子——用户手上只有这一篇']);
        problems++;
      }
    }
  });
});

if (!problems) {
  console.log('');
  console.log('用词检查：通过。');
  console.log('  没有禁用术语、没有内部编号、没有跨篇引用。');
  console.log('');
  process.exit(0);
}

console.log('');
console.log('用词检查 · 发现 ' + problems + ' 处');
console.log('─'.repeat(96));
rows.forEach(r => {
  console.log('  ' + r[0] + '  ' + r[1] + '  「' + r[2] + '」  ' + r[3]);
});
console.log('');
console.log('禁用术语表在 BANNED 里。新增一个词就加一条——漏一个只少查一个，不会漏一片。');
console.log('');
process.exit(1);
