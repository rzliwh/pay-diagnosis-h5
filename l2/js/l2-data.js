/**
 * l2-data.js —— L2 层的内容
 *
 * 这一层交付的是「接下来改什么、按什么顺序」。
 * 结构按改法组织（不是按病因）——因为用户要的是「我该做什么」，
 * 而且多个病因往往指向同一个动作。
 *
 * ============================================================
 * 你要填的只有一处：MANUALS。
 *
 * 每个改法一篇。sections 现在是空的，页面上会显示成「待填」，
 * 并列出这一篇该写哪几段。填的时候照 SECTION_OUTLINE 的顺序写就行。
 *
 * 改完刷新页面就生效。
 * ============================================================
 */

/* ========== 方案偏好（补问卷） ==========
 * 同一个诊断，在不同约束下方案完全不同。这四问答的就是约束。
 */
const L2_QUESTIONS = [
  {
    id: 'cash',
    title: '今年的现金流，紧不紧？',
    desc: '这决定「要花钱的方案」能不能上',
    options: [
      { value: 'tight',  label: '很紧',     hint: '每一笔支出都要算' },
      { value: 'normal', label: '正常',     hint: '该花的能花' },
      { value: 'loose',  label: '比较宽松', hint: '可以承担一次性的投入' }
    ]
  },
  {
    id: 'scope',
    title: '存量的人，能动吗？',
    desc: '调薪、重定职级、改老人收入——这类动作的空间有多大',
    options: [
      { value: 'none',   label: '基本动不了', hint: '一动就会出事' },
      { value: 'some',   label: '能小范围动', hint: '个别人、个别岗位可以' },
      { value: 'full',   label: '能大范围动', hint: '只要理由说得清' }
    ]
  },
  {
    id: 'power',
    title: '这次改动的力度，老板能接受到哪一步？',
    desc: '这决定是「重设」还是「调一个参数」',
    options: [
      { value: 'tune',   label: '先调一个地方', hint: '不要动框架' },
      { value: 'adjust', label: '可以动几个参数', hint: '框架不动' },
      { value: 'reset',  label: '可以重设',     hint: '推倒重来也行' }
    ]
  },
  {
    id: 'window',
    title: '你希望多久看到变化？',
    desc: '这决定先动见效快的，还是先动根子上的',
    options: [
      { value: 'fast',   label: '一两个月',   hint: '先要看得见的' },
      { value: 'season', label: '一个考核周期', hint: '半年到一年' },
      { value: 'long',   label: '不急，要做对', hint: '一年以上也行' }
    ]
  }
];

/* ========== 手册该写哪几段 ==========
 * 顺序是设计过的：先讲清是什么，再讲要不要动，再讲怎么动，
 * 最后讲怎么知道做对了、以及怎么退回来。
 */
const SECTION_OUTLINE = [
  { key: 'what',    title: '这一条在说什么' },
  { key: 'whether', title: '怎么判断你该不该动它' },
  { key: 'how',     title: '具体怎么改（分几步）' },
  { key: 'success', title: '什么条件算成功' },
  { key: 'backout', title: '什么条件下算改错了、怎么退回来' },
  { key: 'trap',    title: '最容易踩的坑' }
];

/* ========== 顺序建议 ==========
 * 「先动哪个」是 L2 的核心价值之一——一次只拧一个旋钮，
 * 那先拧哪个本身就是判断。
 * 这里给的是通用原则，具体顺序要结合诊断结果和偏好答案。
 */
const ORDER_RULES = [
  { if: 'conf-low',  text: '你这次诊断的置信度不高——先别动机制，先去做那件 10 分钟能验证的事。验证完再回来。' },
  { if: 'cash-tight',text: '现金流紧的时候，先动「不花钱的」：口径、规则透明、分配依据。要花钱的方案（补保底、建调薪机制）往后排。' },
  { if: 'scope-none',text: '存量动不了的时候，先动增量：新业务、新人的机制先建起来，老的先不动。' },
  { if: 'window-fast', text: '想一两个月看到变化，先动「显影快」的那条（抢客户、规则不透明这类），别先动要两年才见效的。' },
  { if: 'always',    text: '一次只拧一个。同时动两个以上，过几个月你分不清是哪个起了作用。' }
];

/* ========== 手册正文 ==========
 * 【待填】——这是 L2 唯一需要你写的内容。
 *
 * 每个改法一篇，按 SECTION_OUTLINE 的六段写。
 * 写不出来的段就空着，页面上会显示「这段待填」——空着比编一个好。
 *
 * 建议的写法：
 *   - 用你自己的话，不要写成制度文本
 *   - 每段配一个你见过的真实例子（脱敏）
 *   - "什么是成功"和"怎么退回来"这两段最容易漏，但最值钱
 */
const MANUALS = {
  'pre-resource': { sections: {} },
  'pre-split':    { sections: {} },

  'k1-unit':      { sections: {} },
  'k1-metric':    { sections: {} },
  'k1-diff':      { sections: {} },
  'k1-cycle':     { sections: {} },
  'k1-target':    { sections: {} },

  'k2-base':      { sections: {} },
  'k2-reach':     { sections: {} },
  'k2-raise':     { sections: {} },

  'k3-floor':     { sections: {} },
  'k3-cap':       { sections: {} },
  'k3-pool':      { sections: {} },

  'k4-basis':     { sections: {} },
  'k4-rules':     { sections: {} },
  'k4-spread':    { sections: {} },

  'k5-anchor':    { sections: {} },
  'k5-form':      { sections: {} }
};

/* ========== L2 层的边界 ========== */
const L2_BOUNDARY = [
  '这一层只做现金激励的方案设计；股权、期权的具体条款涉及法律和财税，不碰。',
  '不给具体比例和数字。比例由你用自己的业务数据推出来——给了标准答案反而是害你。',
  '方案是待验证的，不是结论。上了之后要对照信号看变化。',
  '一次只拧一个旋钮。'
];
