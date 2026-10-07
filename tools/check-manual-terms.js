/**
 * check-manual-terms.js —— 扫 L2 手册里「用户看不懂的内部痕迹」
 *
 * 用法：node tools/check-manual-terms.js
 *
 * 为什么要有它：手册六段是**直接渲染给用户看的**，所以正文里每个字都是用户视角。
 * 用户没见过 R15，没见过 13 号文档，也没见过完整案例库。
 * 任何依赖外部引用的句子，用户都读不懂。
 *
 * 两条纪律：
 *   1. 每篇手册必须能独立成立——不依赖外部材料、不依赖别篇手册
 *   2. 编号不是内容——要展开成内容，或者删掉；删了不能丢信息
 *
 * 下面判「用户能不能看懂」，不判「这句话对不对」。
 */

const fs = require('fs');
const path = require('path');

const l2Path = path.join(__dirname, '..', 'l2', 'js', 'l2-data.js');
eval(fs.readFileSync(l2Path, 'utf8') + ';global.__M = MANUALS;');
const MANUALS = global.__M;

/* 每篇手册自己的标题，用来判断「那一篇」是不是指向自己 */
const SELF_TITLES = {
  'pre-resource': ['资源和地盘'],
  'pre-split': ['不同业务分开'],
  'k1-unit': ['按谁算'],
  'k1-metric': ['算什么数'],
  'k1-diff': ['政策差异'],
  'k1-cycle': ['什么时候兑现'],
  'k2-base': ['按什么基数算'],
  'k2-reach': ['目标定到够得着'],
  'k2-raise': ['常规调薪'],
  'k3-floor': ['保底'],
  'k3-cap': ['封顶'],
  'k3-pool': ['池子'],
  'k4-basis': ['分配依据'],
  'k4-rules': ['事前定规则'],
  'k4-spread': ['差距'],
  'k5-anchor': ['重置锚点'],
  'k5-form': ['换激励形式']
};

const RULES = [
  { re: /\bR\d+\b/g,          what: '病因编号',     fix: '展开成病因名字，或删掉（名字往往上一句已经写了）' },
  { re: /\bD\d+\b/g,          what: '衍生病因编号', fix: '同上' },
  { re: /\bG\d+\b/g,          what: '通用判断编号', fix: '这句话本身通常就是那条判断，删掉编号即可' },
  { re: /案例\s*\d+/g,        what: '案例引用',     fix: '把案例写成一句话的故事；写不出细节就把引用删掉——不要编' },
  { re: /号文档/g,            what: '内部文档',     fix: '这句话通常已经完整，直接删掉引用' },
  { re: /外部锚/g,            what: '没有解释的造词', fix: '换成「外部的验收依据」' },
  /* 跨篇的概念引用：用户手上没有别篇手册，所以「跟『X』是同一回事」里的 X 他没见过。
   * 这跟「见『X』那一篇」是同一类毛病，只是没写「那一篇」，所以下面的规则查不到。 */
  { re: /跟「[^」]{2,10}」是同一回事|参见「[^」]+」|详见「[^」]+」/g,
    what: '跨篇概念引用', fix: '改写成自足的描述，别引用别篇才定义的概念' }
];

/* 跨手册引用：用户每次只拿到一篇，指向别篇就是死引用。
 * 「见『具体怎么改』」这种同篇章节引用是合法的，不算。 */
const SAME_DOC_SECTIONS = ['不该动', '具体怎么改', '坑', '什么条件算成功', '怎么退回来'];

let problems = 0;
const rows = [];

Object.keys(MANUALS).forEach(key => {
  const secs = MANUALS[key].sections || {};
  Object.keys(secs).forEach(sec => {
    const text = secs[sec];

    RULES.forEach(rule => {
      let m;
      const re = new RegExp(rule.re.source, 'g');
      while ((m = re.exec(text)) !== null) {
        rows.push([key + '.' + sec, rule.what, m[0], rule.fix]);
        problems++;
      }
    });

    /* 跨手册引用 */
    let m2;
    const reRef = /「([^」]{2,12})」那一篇/g;
    while ((m2 = reRef.exec(text)) !== null) {
      const target = m2[1];
      const mine = SELF_TITLES[key] || [];
      const isSelf = mine.some(t => target.indexOf(t) >= 0);
      if (!isSelf) {
        rows.push([key + '.' + sec, '跨手册引用（死引用）', m2[0], '改写成自足的句子——用户手上只有这一篇']);
        problems++;
      }
    }
  });
});

if (!problems) {
  console.log('');
  console.log('手册用词检查：通过。');
  console.log('  没有内部编号、没有外部材料引用、没有跨手册引用。');
  console.log('');
  process.exit(0);
}

const w = [10, 22, 24, 46];
console.log('');
console.log('手册用词检查 · 发现 ' + problems + ' 处用户读不懂的地方');
console.log('─'.repeat(100));
rows.forEach(r => {
  console.log('  ' + r[0].padEnd(w[0]) + r[1].padEnd(w[1]) + ('「' + r[2] + '」').padEnd(w[2]) + r[3]);
});
console.log('');
console.log('每一处要么展开成内容，要么删掉。删了不能丢信息。');
console.log('');
process.exit(1);
