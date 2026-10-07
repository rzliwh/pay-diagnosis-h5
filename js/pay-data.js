/**
 * pay-data.js —— 分钱机制诊断 · 规则库
 *
 * ============================================================
 * 这是整个产品的心脏，也是你要动手改的唯一一个文件。
 *
 * 要改的三处（按重要性）：
 *   1. CAUSES[].exclude    —— 排除条件。现在每条都要带 alt(别的解释) 和 how(怎么分辨)。
 *                             这一栏不是免责声明，是鉴别诊断——它才是「诊断」和「症状匹配器」的分界线。
 *   2. SYMPTOMS[].specificity —— 特异性。strong=3 / mid=2 / weak=1，它同时是权重。
 *   3. CAUSES[].confirm    —— 确认动作，必须满足：10分钟、一个人、不用求人。
 *
 * 改完刷新页面就生效。改完请跑一次 node tools/selfcheck.js。
 * ============================================================
 */

/* ========== 五个旋钮 ========== */
const KNOBS = {
  1: { name: '考核口径', plain: '拿什么数字发钱', dir: '能定目标 → 按目标（并考虑多期锚定）；不能 → 相对指标或里程碑' },
  2: { name: '计提基数', plain: '按绝对值、增量、还是利润率', dir: '存量 → 增量或利润率；增量 → 绝对值 + 保障期' },
  3: {
    name: '保底与封顶', plain: '风险谁来担',
    dir: '该给保底的没给 → 补保底、提固薪、分批投入；该设封顶的没设 → 加封顶和追索；保底给多了 → 收回来，让收入重新跟结果挂钩'
  },
  4: { name: '分配形状', plain: '差距拉开还是收敛', dir: '趋中 → 拉开；过载 → 收敛' },
  5: { name: '退化', plain: '这套机制用了几年了', dir: '棘轮 → 多期锚定；固化 → 重置锚点或换激励形式' }
};

/* ========== 前置条件：资源分配 ========== */
const PRE_QUESTION = {
  id: 'resource',
  title: '先问一个不在薪酬方案里的问题',
  desc: '好客户、好订单、好设备、好项目——这些「好资源」是怎么分的？',
  options: [
    { value: 'even',    label: '基本平均分',     hint: '按人头或按团队均分' },
    { value: 'rotate',  label: '谁有能力谁拿',   hint: '做得好的自然拿到更好的' },
    { value: 'assign',  label: '老板或主管直接定', hint: '每年年初拍一次' },
    { value: 'unclear', label: '没有明确规则',   hint: '谁先碰到算谁的' }
  ],
  trigger: ['assign', 'unclear']
};

/* 前置问对病因得分的影响。
 * 四个答案都要有作用——包括「减分」的作用，否则这一问就是个装饰。
 * 正负都允许，最终只有排名有用（score > 0 的才输出）。
 */
const PRE_EFFECTS = {
  // 资源平均分 → 平均的文化往往也扩散到分配上，R4 更可能；资源本身不是问题，R1 下调
  even:    { R1: -2, R4: +2 },
  // 资源跟着能力走 → 这是合理的做法，R1 下调；能者多得，R4 也更不可能
  rotate:  { R1: -1, R4: -1 },
  // 老板或主管直接定 → 人治，R1 上调；人治的环境里事后分配也更常见
  assign:  { R1: +3, R6: +1 },
  // 完全没有规则 → R1 上调最多
  unclear: { R1: +4 }
};

/* ========== 前置问二：奖金池从哪来 ==========
 * 这一问决定的是「处方空间」——池子能不能动，直接决定药方完全不同。
 * 预算制企业动不了池子大小，只能动分配形状（案例 3）。
 */
const PRE_QUESTION_2 = {
  id: 'pool',
  title: '再问一个决定处方空间的问题',
  desc: '今年的奖金池，是从哪来的？',
  options: [
    { value: 'budget',  label: '工资总额 / 预算里切的', hint: '池子大小和当年赚多少没关系' },
    { value: 'profit',  label: '跟当年利润挂钩的',      hint: '赚多池大、赚少池小' },
    { value: 'mixed',   label: '一部分预算、一部分浮动', hint: '底薪走预算、奖金挂利润' },
    { value: 'unclear', label: '说不清',                hint: '没人说得清池子是怎么定的' }
  ]
};

const PRE_EFFECTS_2 = {
  // 预算制 = 结构性零和，池子动不了 → R17（池子脱钩）和 R21（差距不足）都更容易
  budget:  { R17: +3, R21: +1 },
  // 跟利润挂钩 → 池子本身没问题，R17 下调
  profit:  { R17: -2 },
  mixed:   { R17: +1 },
  // 说不清 → 规则不透明
  unclear: { R16: +1 }
};

/* ========== 团队（第一轮 · 人群内） ==========
 * 称谓按中小企业 / 传统企业的习惯来，避免大厂黑话。
 * 「中后台」「前端业务」这类说法老板看不懂，换成「职能」「销售」。
 */
const TEAMS = [
  { id: 'sales',      name: '销售 / 业务',     desc: '跑客户、拿订单',      icon: '📈' },
  { id: 'production', name: '生产 / 车间',     desc: '做产品、出产量',      icon: '🏭' },
  { id: 'delivery',   name: '交付 / 售后',     desc: '安装、施工、上门服务', icon: '🛠' },
  { id: 'rd',         name: '技术 / 研发',     desc: '开发、设计、工艺',    icon: '🧪' },
  { id: 'ops',        name: '运营 / 供应链',   desc: '电商、门店、采购、物流', icon: '🔄' },
  { id: 'back',       name: '职能 / 行政',     desc: '财务、人事、后勤',    icon: '🏛' },
  { id: 'manager',    name: '管理者 / 主管',   desc: '部门负责人、班组长',  icon: '🧭' }
];

/* ========== 病因表（30 条，分两层） ==========
 * layer: 'root' 设计时的选择错了 / 'derived' 机制跑了一段时间之后的产物
 * from:  衍生结果由哪些根因推出来（用于拼因果链）
 * knob:  对应哪个旋钮（null = 前置条件或纯时间驱动）
 * knobDir: 可选。个别病因需要比旋钮默认方向更具体时用它覆盖。
 * confirm: 确认动作 —— 10分钟、一个人、不用求人
 * exclude: 鉴别诊断 —— [{ alt: 别的解释, how: 怎么分辨 }]
 */
const CAUSES = [
  /* ==================== 根因层 ==================== */
  {
    code: 'R1', layer: 'root', name: '资源分配失衡',
    plain: '好客户、好区域、好项目集中在少数人手里',
    knob: null, isPre: true,
    confirm: '把今年新分的客户/区域列一张表，看拿得最多的 3 个人和最少 3 个人差多少。',
    exclude: [
      { alt: '能力强的人自然拿到更好的资源', how: '看这批资源是年初一次性分的，还是他一个个自己打下来的。后者是结果，不是原因。' },
      { alt: '历史遗留的客户归属', how: '问一句：这批好客户里，有几个是三年前就跟着他的。' }
    ]
  },
  {
    code: 'R2', layer: 'root', name: '用一套归因假设覆盖多种业务',
    plain: '所有团队用同一套考核逻辑，不管他们的活是不是一回事',
    knob: null,
    confirm: '把三个不同团队的考核表并排放在一起，看是不是同一张。',
    exclude: [
      { alt: '业务本身确实同质', how: '看这三块业务的周期和可预测性差多少。差得远就是硬套。' },
      { alt: '公司规模太小，分不开', how: '看人数。二十人以下确实分不开，那是阶段问题不是设计问题。' }
    ]
  },
  {
    code: 'R3', layer: 'root', name: '归因单位错配',
    plain: '明明是一群人一起干出来的结果，却按个人发钱',
    knob: 1,
    confirm: '找一名一线销售聊 10 分钟，问他：这单成了，你觉得主要是你的功劳，还是团队和产品的功劳？',
    exclude: [
      { alt: 'CRM 纪律问题', how: '看系统里客户录入率。如果普遍不录、不分业绩好坏，问题在流程不在分钱。' },
      { alt: '就是那个人不愿意分享', how: '看是不是只有一两个人这样。普遍现象才指向机制。' }
    ]
  },
  {
    code: 'R4', layer: 'root', name: '平均分配用在个人可归因的高贡献岗位上',
    plain: '明明是个人干出来的，钱却摊给了所有人',
    knob: 1,
    confirm: '拉出去年的奖金表，看第一名和第 5 名的差距是几倍。',
    exclude: [
      { alt: '岗位本身产出就难区分', how: '看这个岗位的结果是不是能算到人头。能算到，就是机制问题。' },
      { alt: '公司刻意选择稳定优先', how: '看这是不是老板明确说过的取向。是的话，代价本来就在预期内。' }
    ]
  },
  {
    code: 'R5', layer: 'root', name: '分配依据与贡献脱钩',
    plain: '拿钱靠的是职级、工龄和可见度，不是结果',
    knob: 4,
    confirm: '拉出去年调薪和奖金表，按职级排序，看和业绩排序是否一致。',
    exclude: [
      { alt: '职级本身是能力的合理代理', how: '看有没有高职级低产出、低职级高产出的反例。有就是脱钩。' },
      { alt: '保密制度导致的错觉', how: '问一句：你自己知道你的奖金是怎么定的吗。他说不出，就不是错觉。' }
    ]
  },
  {
    code: 'R6', layer: 'root', name: '事后分配',
    plain: '事前没规则，年底现谈，谁闹谁多拿',
    knob: 4,
    confirm: '问一句：今年的奖金规则，现在能完整说出来吗？',
    exclude: [
      { alt: '公司规模小、人数少，确实只能一年一议', how: '看人数和人员流动。十人以下可以议，二十人以上议不动。' },
      { alt: '老板故意保留弹性', how: '看这是不是明确的管理取向。是的话，问题在预期管理不在规则。' }
    ]
  },
  {
    code: 'R7', layer: 'root', name: '长期业务按当期兑现',
    plain: '要一年才见结果的事，按季度考核',
    knob: 1,
    confirm: '列出今年收入最高的三个人，看他们做的是长期活还是短期活。',
    exclude: [
      { alt: '能力不够不敢接大单', how: '看有没有能力够的人也不接。有，就是机制问题。' },
      { alt: '大客户门槛本来就高', how: '看历史上有没有人做成过。做成过，说明是能做而不愿做。' },
      { alt: '公司自己选了短期打法（本来就不打算做长期投入）', how: '看这是不是老板明确说过的取向。是的话，代价本来就在预期内——这是战略选择，不是机制病。' }
    ]
  },
  {
    code: 'R8', layer: 'root', name: '兑现延迟超过激励窗口',
    plain: '钱到手的时候，那股劲早凉了',
    knob: 1,
    confirm: '拉出去年几笔奖金的发放记录，看发放日离对应的结算月隔了多久。',
    exclude: [
      { alt: '公司现金流确实只能延后', how: '看去年的回款周期和奖金发放时间差多少。差三个月内是流程，半年以上是机制。' },
      { alt: '财务结算周期客观限制', how: '看这个周期是不是每年都一样。固定就不是意外。' }
    ]
  },
  {
    code: 'R9', layer: 'root', name: '不可预测业务硬按目标考核',
    plain: '年初定不出靠谱目标的业务，硬要定目标',
    knob: 1,
    confirm: '翻出年初定的目标，看现在的完成率和当时的判断差多少。',
    exclude: [
      { alt: '目标定得没问题，是执行不力', how: '看同类业务的其他人完成率。大家都偏，就是目标本身的问题。' },
      { alt: '中层护短', how: '看是不是只有某一个团队在讨价还价。普遍现象不是护短。' }
    ]
  },
  {
    code: 'R10', layer: 'root', name: '可预测业务用了不确定的相对指标',
    plain: '明明能算清楚的活，用排名来发钱',
    knob: 1,
    confirm: '让一个人复述一遍：他的奖金是怎么算出来的。',
    exclude: [
      { alt: '口径确实复杂但员工没仔细看', how: '把规则原文给一个新人看，问他要多久能自己算出来。算不出，就是规则本身的问题。' }
    ]
  },
  {
    code: 'R11', layer: 'root', name: '存量业务按绝对值考核',
    plain: '靠惯性也能完成的目标，等于白送钱',
    knob: 2,
    confirm: '拉出去年收入构成，看有多少来自三年前就存在的客户。',
    exclude: [
      { alt: '存量客户也需要维护成本', how: '看负责存量的人花多少精力。如果主要精力在别处，那就是躺赢。' },
      { alt: '行业本身增长停滞', how: '看这个人的收入是不是连续几年都刚好达标。刚好达标就是设计出来的。' }
    ]
  },
  {
    code: 'R12', layer: 'root', name: '增量业务按结果考核',
    plain: '从零开始的人（新业务、新人），前半年必然难看',
    knob: 2,
    confirm: '找出今年新业务或新入职的人，问他们前三个月收入比熟手低多少、有没有保护期。',
    exclude: [
      { alt: '确实是资源不足', how: '看这块新业务给了多少人和预算。给够了还做不动，才是机制问题。' },
      { alt: '公司根本没有可迁移的基础', how: '看它和老业务有没有客户或技术上的重叠。有重叠还推不动，是激励问题。' }
    ]
  },
  {
    code: 'R13', layer: 'root', name: '基数或目标定得够不着',
    plain: '怎么努力都够不到，干脆不做',
    knob: 2,
    confirm: '看年中时有多少人主动提过目标不合理。',
    exclude: [
      { alt: '目标其实可达，是执行问题', how: '看历史上有没人达到过。没有，就是不可达。' },
      { alt: '行业整体下行', how: '看竞争对手的情况。大家都下行，目标本来就该重定。' }
    ]
  },
  {
    code: 'R14', layer: 'root', name: '保底不足',
    plain: '做砸了风险全在自己身上，固薪又低',
    knob: 3,
    knobDir: '补保底、提高固薪比例、把投入分批——让承担风险的人先有个底',
    confirm: '问一句：这件事做砸了，谁承担？',
    exclude: [
      { alt: '公司文化就是不敢担责', how: '看有没有人真的因为担责被罚过。有实际案例，才是机制问题。' },
      { alt: '管理者本身推卸责任', how: '看是不是换了主管就好转。换了还一样，是机制。' }
    ]
  },
  {
    code: 'R15', layer: 'root', name: '口径只挂收入',
    plain: '只奖收入，不奖利润、回款、续约、质量',
    knob: 1,
    confirm: '拉出去年毛利和收入两条线，看是不是一起涨。',
    exclude: [
      { alt: '公司本来就不考核毛利（战略选择）', how: '看老板是不是明确说过「先要规模」。说过，代价就在预期内。' },
      { alt: '定价权不在销售手上', how: '问销售：这个价格你自己能定多少。定不了，就别怪他降价。' }
    ]
  },
  {
    code: 'R16', layer: 'root', name: '规则不可见或中途变更',
    plain: '员工看不见规则，或者规则中途改了',
    knob: 4,
    confirm: '找出今年的奖金方案文件，看有没有真的发到员工手上。',
    exclude: [
      { alt: '团队整体信任度低', how: '看是不是只有奖金这件事被质疑。全都质疑，问题在文化不在规则。' },
      { alt: '确实有保密要求', how: '看规则本身能不能公开。「池子怎么分」可以公开，「个人拿多少」可以不公开。' }
    ]
  },
  {
    code: 'R17', layer: 'root', name: '池子与当年盈利脱钩',
    plain: '奖金池跟当年赚了多少没关系',
    knob: 3,
    knobDir: '把池子和当年利润挂钩，同时设上限——公司好的时候多发，差的时候自动收紧，不用老板临时改口',
    confirm: '对比一下奖金总额和当年利润两个数。',
    exclude: [
      { alt: '公司刻意用奖金保稳定', how: '看这是不是老板明确的取向。是的话，要接受它在差年份会变成成本。' },
      { alt: '预算制企业（工资总额包干）：池子与利润脱钩是体制性的', how: '看奖金池是预算里切出来的，还是跟当年利润挂钩的。预算制动不了池子大小，只能动分配形状——而且区分度不能超过真实差距，否则会被轮流坐庄顶回来。' }
    ]
  },
  {
    code: 'R18', layer: 'root', name: '管理者既拿个人提成又管团队',
    plain: '主管自己还背着个人业绩，怎么肯把客户分给组员',
    knob: 1,
    confirm: '数一下有多少个主管自己还背着个人业绩指标。',
    exclude: [
      { alt: '团队太小，主管必须自己上', how: '看团队人数。三人以下自己上是合理的，八人以上就不合理。' },
      { alt: '岗位设计就是「王牌销售 + 带人」', how: '看这个岗位招人的时候有没有明说是双重角色。明说了就不算错配。' }
    ]
  },
  {
    code: 'R19', layer: 'root', name: '新老倒挂 / 缺常规调薪机制',
    plain: '只靠入职谈薪，三年没调过',
    knob: 2,
    confirm: '拉出司龄 3 年以上的人，看有多少被新人倒挂。',
    exclude: [
      { alt: '行业普遍倒挂，公司无力改变', how: '看同行的做法。普遍倒挂时，至少要有「只调老员工」的例外通道。' },
      { alt: '老员工本身能力停滞', how: '看被倒挂的人里有没有产出还很不错的。有，就不是能力问题。' }
    ]
  },
  {
    code: 'R20', layer: 'root', name: '封顶缺失 / 没有追索',
    plain: '做到多少没有上限，做砸了也没有追回',
    knob: 3,
    knobDir: '加封顶、加追索条款，且追索要带原因甄别——有意赌的严惩、无心被骗的走风控流程不连坐、一刀切的条款改成按情节分档',
    confirm: '问一句：做到多少封顶、出了问题要不要追回，现在有没有明确说法？',
    exclude: [
      { alt: '业务本身就需要搏一把', how: '看这个业务失败的代价是不是公司能承受。承受不了，就不是「搏一把」是「赌命」。' },
      { alt: '当事人不是有意赌，是无心被骗（涉世不深、对手伪装）', how: '三看：是不是同一个人反复出现；交易对手资质是不是明显有问题；当事人事前有没有提示过风险。无心被骗走风控流程和带教，不动薪酬旋钮。' }
    ]
  },
  {
    code: 'R21', layer: 'root', name: '保底过高 / 差距不足',
    plain: '做多做少拿到的一样，浮动部分形同虚设',
    knob: 3,
    knobDir: '收回过度保底，把浮动的部分还回去；如果保底本身合理，那就去动分配形状（旋钮四），把差距拉开',
    confirm: '拉出奖金表，看做得最好和最差的人差多少。',
    exclude: [
      { alt: '岗位产出本身难区分', how: '看这个岗位有没有可比的产出指标。有指标还拉不开，就是机制在抹平。' },
      { alt: '行业惯例就是高固薪', how: '看同行同岗位的浮动比例。明显低于同行，就是设计问题。' }
    ]
  },
  {
    code: 'R22', layer: 'root', name: '政策差异套利',
    plain: '政策里人为造了价差，就会有人去钻',
    knob: 1,
    knobDir: '看差异为什么存在：说不清理由的直接取消；理由是利润不同，就把差异从"区域身份"挪到"利润率"上；理由是难度不同，就把差异挪到底薪或区域系数里、提成率统一。都不行才保留差异加稽查——而那条只对"有长期关系资产"的套利方管用',
    confirm: '先问一句：套利的是自己的员工，还是外部的合作方？再问：为什么这几个区域（或产品）的提成率、返点不一样？答不上来，就是历史遗留。',
    exclude: [
      { alt: '套利的是外部合作方（供应商、经销商），不是员工', how: '看有没有长期合作关系。有的话稽查加罚则就够用——套利被发现的代价比赚的多；换成新员工或者一次性客户，罚是罚不住的，必须从政策上把套利空间消灭掉。' },
      { alt: '差异的理由是真实的（利润率确实差很多）', how: '看这个差异当初是怎么定的。能说出利润依据，就走"把差异从身份挪到结果"；说不出依据，就是历史遗留，直接取消。' },
      { alt: '差异是监管或行业规定要求的', how: '看是不是外部强制的。是的话不能取消，只能在斜坡上装监控。' }
    ]
  },
  {
    code: 'R23', layer: 'root', name: '行情钱算成了能力钱',
    plain: '基数里混着外部行情的涨落，努力和时运分不开',
    knob: 2,
    knobDir: '把行情从基数里剥出去——设行情基准线只奖线上部分、按区域/产品分开核算（一厂一策）、或丰年计提风险准备金跨期平滑。剥到什么程度是两说，见下面的两说卡',
    confirm: '拉出去年提成最高的人，看他们卖的量是不是也最高——量没涨、钱却多了，多出来的就是行情。',
    exclude: [
      { alt: '行情确实反映了能力（他择时囤货、锁价、判断了走势）', how: '看有没有人能提前判断行情并据此动作。靠判断赚到的那部分，该奖。' },
      { alt: '这个行业就是价格驱动，剥完没剩什么可奖', how: '看价差占收入的比例。占大头的话，剥完员工会没有抓手——那时该换基数（改按量、改按毛利），不是硬剥。' }
    ]
  },

  /* ==================== 衍生层 ==================== */
  {
    code: 'D1', layer: 'derived', name: '多套机制互相拆台',
    plain: '同一件事，一套机制奖励、另一套惩罚',
    knob: 1, from: ['R2', 'R3'],
    confirm: '找销售和交付各一个人，问同一个问题：上个月哪件事让你们互相为难？',
    exclude: [
      { alt: '部门关系本身有问题', how: '看这两个部门是不是换过人还一样。换了还吵，是机制不是人。' },
      { alt: '职责边界不清', how: '看有没有成文的交接标准。没有，先补流程；有还吵，才是机制。' }
    ]
  },
  {
    code: 'D2', layer: 'derived', name: '棘轮效应',
    plain: '目标随业绩往上涨，做得好反而更难拿钱',
    knob: 5, from: ['R9'],
    confirm: '对比今年和去年的目标，看上调幅度和业绩增长幅度差多少。',
    exclude: [
      { alt: '市场确实在增长，目标本该上调', how: '看目标和市场增速是不是同步。目标涨得比市场快，就是棘轮。' }
    ]
  },
  {
    code: 'D3', layer: 'derived', name: '激励固化',
    plain: '奖金发了几年，已经变成工资的一部分',
    knob: 5, from: [],
    confirm: '问一句：如果今年不发奖金，会有多少人觉得是公司出了问题？',
    exclude: [
      { alt: '奖金本来就在劳动合同里', how: '翻合同。合同里写的是「奖金」还是「固定薪资」——写后者就不算错。' }
    ]
  },
  {
    code: 'D4', layer: 'derived', name: '透支型激励',
    plain: '数字好看了，客户信任、产品质量、团队精力被提前花掉',
    knob: 5, from: ['R7', 'R15'],
    confirm: '拉出客户投诉数和销售额两条曲线，看方向是不是相反。',
    exclude: [
      { alt: '行业整体强度高', how: '看同行的员工流动率。明显高于同行，才是机制在烧人。' },
      { alt: '招聘筛选问题', how: '看进来的人是不是本来就撑不住。换一批人还一样，是机制。' }
    ]
  },
  {
    code: 'D5', layer: 'derived', name: '区分度缺失',
    plain: '考核已经分不出好坏了，大部分人都是 B+；强制拉开时，又被轮流坐庄顶回来',
    knob: 4, from: ['R5'],
    confirm: '拉出去年的绩效分布，看最低档有几个人。',
    exclude: [
      { alt: '团队本来就水平接近', how: '看招聘标准有没有在放水。标准没降还高度平均，就是主管不敢打低分。' },
      { alt: '主管不敢打低分是文化问题', how: '看有没有主管打过低分并且没被报复。有先例还不敢，才是制度问题。' }
    ]
  },
  {
    code: 'D6', layer: 'derived', name: '强度过载',
    plain: '差距大到中位那一半人直接放弃',
    knob: 4, from: [],
    confirm: '拉出奖金表，看第 3 名到第 10 名之间的差距。',
    exclude: [
      { alt: '头部确实贡献巨大', how: '看头部是不是拿走了大部分客户资源。是的话，问题在资源分配不在差距。' },
      { alt: '岗位本身产出就是幂律分布', how: '看这个岗位的历史数据。一直是幂律，那就该按幂律设计，而不是平均分。' }
    ]
  },
  {
    code: 'D7', layer: 'derived', name: '职能间分配失衡',
    plain: '前台盆满钵满，中后台觉得自己是后娘养的',
    knob: 4, from: ['R2', 'R6'],
    confirm: '对比前台和中后台同级别的奖金。',
    exclude: [
      { alt: '这条业务线本身没前途，人走是对的', how: '看走的人有没有转去公司其他岗位。全往外走，是分配问题；转岗，可能是业务问题。' },
      { alt: '中后台被当成本中心压缩', how: '看这是不是明确的战略选择。是的话，代价就是招不到人。' },
      { alt: '只有反映，职能没有任何行为变化', how: '看职能有没有出现行为变化：消极配合、走人、招不到人。只有嘴上的反映、行为没变，那是抱怨不是病——抱怨音量与问题严重程度无关（G3）。案例 1 的确认动作就是这个。' },
      { alt: '这份岗位本身就开放，谁都能去挣', how: '问一句：职能的人真能转过去吗（技能、年龄、公司是否允许）。转得过去，"你行你上"成立，是正常岗位价差不是不公；转不过去，这句话就是空的。' }
    ]
  }
];

/* ========== 改法（L1 → L2 的接口键） ==========
 *
 * 这是整个产品里最重要的一处设计，值得单独说清楚。
 *
 * L2 交付的是「你该做什么」，不是「你得了什么病」。而多个病因往往指向同一个动作
 * （R7 和 R8 都要动兑现时间，R14 和 R21 都在保底上、方向正好相反）。
 * 所以 L1 交给 L2 的键必须是「改法」，不是病因代码。
 *
 * 改法按「旋钮 × 方向」组织。方向相反的病因（R14 补保底 / R21 收保底）
 * 共用同一篇手册，手册里写清楚往哪边拧。
 */
const PLANS = {
  'pre-resource': { knob: null, title: '先定好资源和地盘怎么分', brief: '这一步不在薪酬方案里，但比奖金怎么算更早决定结果',
                    decider: '公司层', preconditions: ['要能说清今年的好客户/好区域是按什么规则分的'],
                    effectWindow: '下一次分资源的时候（一般年初）' },
  'pre-split':    { knob: null, title: '不同业务分开设计机制',   brief: '先把几块业务的考核逻辑拆开，再谈各自的参数',
                    decider: '公司层', preconditions: ['几块业务的周期和可预测性确实差得够远，值得分开设计'],
                    effectWindow: '各块业务的下一个考核周期' },

  'k1-unit':      { knob: 1, title: '按谁算：个人还是团队',   brief: '归因单位——功劳能算到人头就按个人，要靠一群人配合就按团队',
                    decider: '公司层', preconditions: ['改归因单位会让一部分人的收入立刻变化，要先想好过渡'],
                    effectWindow: '下一个发钱周期——这个改法是当月就变钱的' },
  'k1-metric':    { knob: 1, title: '算什么数：只挂收入还是也挂利润回款', brief: '口径——只奖收入会挤出利润、回款、续约和质量',
                    decider: '公司层', preconditions: ['加进来的指标要能从现有系统里取到数，取不到的指标等于没加'],
                    effectWindow: '几周内就开始有反应——他开始算这个数了' },
  'k1-diff':      { knob: 1, title: '政策差异怎么设',           brief: '差异即套利斜坡——要么把差异挪到没法包装的地方，要么在斜坡上装监控',
                    decider: '公司层', preconditions: ['要能按区域/产品分开核算，算不清就什么都动不了', '套利方有长期关系资产时，稽查比改政策更省事'],
                    effectWindow: '一个完整结算周期——要看套利还发不发生' },
  'k1-cycle':     { knob: 1, title: '什么时候兑现',           brief: '长期的事按长期结，钱到手离做事太远激励就失效',
                    decider: '公司层', preconditions: ['拉长周期本身不费钱，费钱的是接住员工在等待期的收入——提固薪或预付掏不出来，周期就拉不长'],
                    effectWindow: '拉长之后的第一个完整周期' },
  'k1-target':    { knob: 1, title: '目标怎么定：目标还是里程碑', brief: '定得出靠谱目标的按目标，定不出的改用里程碑或相对指标',
                    decider: '公司层 + 团队层', preconditions: ['中间节点验收要有外部锚（客户确认/第三方/可核查数据），否则节点奖权重不能过高'],
                    effectWindow: '一个完整项目周期——看中间节点还有没有人扯皮' },

  'k2-base':      { knob: 2, title: '按什么基数算：绝对值还是增量', brief: '存量按增量算，增量给保障期',
                    decider: '公司层', preconditions: ['要能按业务单元分开核算基数（一厂一策、一项目一基准）'],
                    effectWindow: '一个完整结算周期' },
  'k2-reach':     { knob: 2, title: '目标定到够得着',           brief: '够不着的目标等于没有目标',
                    decider: '公司层 + 团队层', preconditions: ['要有历史数据能判断什么叫"够得着"，没有就只能靠谈'],
                    effectWindow: '一个完整结算周期——看有多少人够得着' },
  'k2-raise':     { knob: 2, title: '建常规调薪机制',           brief: '只靠入职谈薪，老员工一定被倒挂',
                    decider: '公司层', preconditions: ['要先有一次调薪预算，否则机制建了也跑不动'],
                    effectWindow: '第一次调薪落地之后' },

  'k3-floor':     { knob: 3, title: '保底：补还是收',           brief: '做砸了风险全在自己身上就补保底；做多做少一样就收保底',
                    decider: '公司层', preconditions: ['补保底是要花钱的——先算清楚最坏情况下公司要兜多少'],
                    effectWindow: '一个完整结算周期——看难活有没有人接' },
  'k3-cap':       { knob: 3, title: '封顶与追索',               brief: '不设上限又不追回，等于让一部分人拿公司的存续去赌',
                    decider: '公司层', preconditions: ['追索条款要带原因甄别——有意赌的严惩，无心被骗的走风控流程不连坐，一刀切会误伤'],
                    effectWindow: '要等出现一次「做砸了要不要追回」的事' },
  'k3-pool':      { knob: 3, title: '池子和当年利润挂钩',       brief: '不挂钩的话，业务下滑时公司只能赔本兑现或者临时改口',
                    decider: '公司层', preconditions: ['预算制企业动不了池子大小，只能动分配形状'],
                    effectWindow: '下一个年度结算——看池子跟没跟利润走' },

  'k4-basis':     { knob: 4, title: '分配依据：职级还是结果',   brief: '拿钱靠职级、工龄和可见度，人就会去经营这些，不经营业务',
                    decider: '公司层', preconditions: ['要有一套能说清"什么叫贡献"的口径，否则改完还是靠印象'],
                    effectWindow: '一个完整考核周期' },
  'k4-rules':     { knob: 4, title: '事前定规则、规则要看得见', brief: '事后分配会把「谈判能力」变成实际的计价标准',
                    decider: '公司层', preconditions: ['规则要员工自己能算出来——算不出来的规则等于没有规则'],
                    effectWindow: '规则一公布就能看出来——员工算不算得出来' },
  'k4-spread':    { knob: 4, title: '差距：拉开还是收敛',       brief: '趋中等于没考核，过大等于让中位那一半人放弃',
                    decider: '公司层', preconditions: ['区分度不能超过可验证的真实贡献差，否则会被轮流坐庄顶回来', '预算制企业：池子动不了，只能动分配形状'],
                    effectWindow: '一个完整考核周期——看分布形状变没变' },

  'k5-anchor':    { knob: 5, title: '机制用旧了：定期查一遍', brief: '目标只上不下、奖金发三年变成工资——机制用久了会自己变味',
                    decider: '公司层', preconditions: ['要改规则，就得让员工事前知道；事后通知等于单方面改规则'],
                    effectWindow: '跨年——要看下一个周期的目标怎么定' },
  'k5-form':      { knob: 5, title: '换激励形式：防透支',       brief: '当机制开始花客户信任和团队精力，换形式比调参数有用',
                    decider: '公司层', preconditions: ['换形式之前先确认：是机制在透支，还是业务本身就该这么拼'],
                    effectWindow: '换形式之后的第一个完整周期' }
};

/* 病因 → 改法。改法才是 L1 交给 L2 的键，病因只用于展示和解释。 */
const PLAN_OF = {
  R1: 'pre-resource', R2: 'pre-split',
  R3: 'k1-unit',  R4: 'k1-unit',  R18: 'k1-unit',
  R15: 'k1-metric', D1: 'k1-metric',
  R7: 'k1-cycle', R8: 'k1-cycle',
  R9: 'k1-target', R10: 'k1-target',
  R11: 'k2-base', R12: 'k2-base',
  R13: 'k2-reach', R19: 'k2-raise',
  R14: 'k3-floor', R21: 'k3-floor',
  R20: 'k3-cap',   R17: 'k3-pool',
  R22: 'k1-diff', R23: 'k2-base',
  R5: 'k4-basis',
  R6: 'k4-rules',  R16: 'k4-rules',
  D5: 'k4-spread', D6: 'k4-spread', D7: 'k4-spread',
  D2: 'k5-anchor', D3: 'k5-anchor',
  D4: 'k5-form'
};

/* ========== 症状表（按人群分组） ==========
 * specificity: strong=3 / mid=2 / weak=1 —— 它同时是权重
 * cause: 主指向的病因代码
 */
const SYMPTOMS = [
  /* ---------- 销售 / 前端业务 ---------- */
  { id: 's1',  team: 'sales', cause: 'R3',  specificity: 'strong', text: '销售之间撞单，两个人为同一个客户报了两次价，客户发现后投诉到公司' },
  { id: 's2',  team: 'sales', cause: 'R3',  specificity: 'weak',   text: '客户信息只在个人手里，不进系统；交接时查不到记录' },
  { id: 's3',  team: 'sales', cause: 'R3',  specificity: 'mid',    text: '老销售不愿意带新人，新人三个月还在自己摸索' },
  { id: 's4',  team: 'sales', cause: 'R3',  specificity: 'strong', text: '内部抢客户、抢资源、互相拆台' },
  { id: 's5',  team: 'sales', cause: 'R15', specificity: 'mid',    text: '为了签单乱降价，毛利被砍掉一半' },
  { id: 's6',  team: 'sales', cause: 'R15', specificity: 'strong', text: '单签了、回款半年没到，销售的提成已经发了' },
  { id: 's7',  team: 'sales', cause: 'R15', specificity: 'mid',    text: '只签新客户，老客户没人管，续约率往下掉' },
  { id: 's8',  team: 'sales', cause: 'R15', specificity: 'mid',    text: '为成单什么都敢承诺，交付端接不住' },
  { id: 's9',  team: 'sales', cause: 'D2',  specificity: 'strong', text: '年底最后两周集体放缓签约，把单子推到下季度初' },
  { id: 's10', team: 'sales', cause: 'D2',  specificity: 'strong', text: '员工主动压低业绩，不愿意超额完成' },
  { id: 's11', team: 'sales', cause: 'R7',  specificity: 'mid',    text: '只做小单、不碰大单' },
  { id: 's12', team: 'sales', cause: 'R7',  specificity: 'strong', text: '大客户没人愿意接' },
  { id: 's13', team: 'sales', cause: 'R9',  specificity: 'strong', text: '明明能签的单，压到下个季度再签' },
  { id: 's14', team: 'sales', cause: 'R9',  specificity: 'strong', text: '年初定目标要谈三轮，年中还要再谈一次' },
  { id: 's15', team: 'sales', cause: 'R11', specificity: 'strong', text: '老业务的负责人躺赢：客户是几年前的，照做就完成' },
  { id: 's16', team: 'sales', cause: 'R15', specificity: 'strong', text: '没人在乎利润率，只看收入数字到了没有' },
  { id: 's17', team: 'sales', cause: 'R22', specificity: 'strong', text: '不同区域或不同产品的提成比例不一样，出现压单、跨区窜货' },

  /* ---------- 生产 / 车间 ---------- */
  { id: 'p1', team: 'production', cause: 'R15', specificity: 'strong', text: '计件算钱，产量上去了，返工和客诉也跟着上去' },
  { id: 'p2', team: 'production', cause: 'D4',  specificity: 'strong', text: '为了赶产量，设备该保养不保养，该换的件拖着不换' },
  { id: 'p3', team: 'production', cause: 'D2',  specificity: 'strong', text: '月底拼命冲产量，月初明显滑坡' },
  { id: 'p4', team: 'production', cause: 'D1',  specificity: 'mid',    text: '急单、难单、小批量单没人愿意接，几个班组互相推' },
  { id: 'p5', team: 'production', cause: 'R3',  specificity: 'mid',    text: '老师傅不愿意带学徒，学徒半年留不下来',
    exclude: '带教有价（有带教报酬）或者老人有安全感（工龄薪资兜底）的时候，这条不出现。案例证明：带教被计价，带教就会发生。' },
  { id: 'p6', team: 'production', cause: 'R3',  specificity: 'strong', text: '班组之间抢活、抢设备、抢料，要车间主任出面摆平' },
  { id: 'p7', team: 'production', cause: 'D2',  specificity: 'strong', text: '车间主任替班组藏产能，不报真实的能力上限' },
  { id: 'p8', team: 'production', cause: 'R21', specificity: 'strong', text: '多干的人和少干的人，到手差不多' },
  { id: 'p9', team: 'production', cause: 'R15', specificity: 'mid',    text: '出了质量问题，责任总落在最后一道工序' },
  { id: 'p10', team: 'production', cause: 'R11', specificity: 'mid',   text: '排产永远优先老产品——老产品最省事，又能出数' },
  { id: 'p11', team: 'production', cause: 'R13', specificity: 'mid',   text: '产量目标下到班组，班组直接说做不到，也不讨论怎么做到' },
  { id: 'p12', team: 'production', cause: 'R8',  specificity: 'mid',   text: '计件工资要压两三个月才结，工人早就不看那个数了' },

  /* ---------- 交付 / 服务 ---------- */
  { id: 'd1',  team: 'delivery', cause: 'R15', specificity: 'strong', text: '项目一交付就没人管后续；出了 bug 没人修，因为修 bug 不算新项目' },
  { id: 'd2',  team: 'delivery', cause: 'D1',  specificity: 'strong', text: '交付端拒绝接销售签回来的单子' },
  { id: 'd3',  team: 'delivery', cause: 'D1',  specificity: 'mid',    text: '售前承诺与交付能力脱节，两边在会上互相指责' },
  { id: 'd4',  team: 'delivery', cause: 'D4',  specificity: 'strong', text: '客户投诉变多，但销售侧的业绩还在涨' },
  { id: 'd5',  team: 'delivery', cause: 'D4',  specificity: 'mid',    text: '上线后 bug 明显变多，追溯原因都说"当时时间不够"' },
  { id: 'd6',  team: 'delivery', cause: 'R14', specificity: 'strong', text: '没人愿意当项目负责人，被点名后先问"出问题谁担"' },
  { id: 'd7',  team: 'delivery', cause: 'R14', specificity: 'strong', text: '风险性任务要老板点名才有人接' },
  { id: 'd8',  team: 'delivery', cause: 'R20', specificity: 'strong', text: '为了达标开始走捷径：先签下来再说，坏账留给明年' },
  { id: 'd9',  team: 'delivery', cause: 'R20', specificity: 'strong', text: '出了问题没人主动上报，都拖到瞒不住' },
  { id: 'd10', team: 'delivery', cause: 'D4',  specificity: 'weak',   text: '老员工陆续走，走的时候说累' },
  { id: 'd11', team: 'delivery', cause: 'R15', specificity: 'mid',    text: '客户续约率下降，但新签还在涨' },

  /* ---------- 研发 / 产品 / 创新 ---------- */
  { id: 'r1',  team: 'rd', cause: 'R7',  specificity: 'strong', text: '明年的产品规划全是三个月能上线的小功能，没有一个底层改造' },
  { id: 'r2',  team: 'rd', cause: 'R7',  specificity: 'strong', text: '没人碰底层、没人做基础建设' },
  { id: 'r3',  team: 'rd', cause: 'R9',  specificity: 'strong', text: '创新项目不到半年就被要成绩' },
  { id: 'r4',  team: 'rd', cause: 'R12', specificity: 'strong', text: '新业务、新区域没人报名去，要动员' },
  { id: 'r5',  team: 'rd', cause: 'R12', specificity: 'mid',    text: '老员工说"这块没有基础，做不出来"' },
  { id: 'r6',  team: 'rd', cause: 'R2',  specificity: 'strong', text: '研发被要求"像销售一样有数字"' },
  { id: 'r7',  team: 'rd', cause: 'R2',  specificity: 'strong', text: '用同一套考核表考销售、研发和客服' },
  { id: 'r8',  team: 'rd', cause: 'R7',  specificity: 'strong', text: '项目组一交付就解散，没人对长期结果负责' },
  { id: 'r9',  team: 'rd', cause: 'R13', specificity: 'strong', text: '上半年就有人放弃：反正做多少都拿不到奖金' },
  { id: 'r10', team: 'rd', cause: 'D1',  specificity: 'mid',    text: '研发不愿意接销售提的难需求' },

  /* ---------- 运营 / 供应链 ---------- */
  { id: 'op1', team: 'ops', cause: 'R15', specificity: 'strong', text: '只看当月数据，复购和口碑没人管' },
  { id: 'op2', team: 'ops', cause: 'D2',  specificity: 'strong', text: '为了完成当月数字，提前把下个月的活动和资源用掉' },
  { id: 'op3', team: 'ops', cause: 'D1',  specificity: 'mid',    text: '运营和市场互相甩锅：数据好是运营的，差是市场的' },
  { id: 'op4', team: 'ops', cause: 'R7',  specificity: 'mid',    text: '被临时调去救火的人，当月收入反而下降，后来没人愿意接临时任务' },
  { id: 'op5', team: 'ops', cause: 'R12', specificity: 'strong', text: '新渠道、新平台没人愿意试，都说先把现有的做好' },
  { id: 'op6', team: 'ops', cause: 'R16', specificity: 'mid',    text: '考核指标半年换一次，没人说得清现在的口径是什么' },
  { id: 'op7', team: 'ops', cause: 'D1',  specificity: 'mid',    text: '缺货的时候，运营和采购互相指责' },
  { id: 'op8', team: 'ops', cause: 'R3',  specificity: 'mid',    text: '门店之间、站点之间抢客户、抢资源' },
  { id: 'op9', team: 'ops', cause: 'R17', specificity: 'mid',    text: '奖金只看自己那一摊数据，和公司实际赚不赚钱没关系' },
  { id: 'op10', team: 'ops', cause: 'R10', specificity: 'mid',   text: '同样多的活，两个月奖金差一截，没人解释得清' },

  /* ---------- 中后台 / 职能 ---------- */
  { id: 'b1', team: 'back', cause: 'D7',  specificity: 'mid',    text: '中后台的人一个接一个走' },
  { id: 'b2', team: 'back', cause: 'D7',  specificity: 'mid',    text: '中后台招不到人，因为都知道这边奖金少' },
  { id: 'b3', team: 'back', cause: 'D7',  specificity: 'weak',   text: '中后台配合前台时消极，"我就这么多事"' },
  { id: 'b4', team: 'back', cause: 'R5',  specificity: 'strong', text: '加薪和奖金基本跟着职级走' },
  { id: 'b5', team: 'back', cause: 'R5',  specificity: 'strong', text: '会汇报的人拿得多，闷头干活的没人记得' },
  { id: 'b6', team: 'back', cause: 'R5',  specificity: 'strong', text: '员工开始花时间做汇报材料，而不是做业务' },
  { id: 'b7', team: 'back', cause: 'R19', specificity: 'strong', text: '新来的比干了三年的拿得多' },
  { id: 'b8', team: 'back', cause: 'R19', specificity: 'strong', text: '三年没调过薪，只有入职那一次谈的价' },

  /* ---------- 管理者 ---------- */
  { id: 'm1', team: 'manager', cause: 'R18', specificity: 'strong', text: '主管既拿个人提成又管团队，不愿意把自己的客户分给组员' },
  { id: 'm2', team: 'manager', cause: 'R18', specificity: 'strong', text: '主管不愿意把人让给别的组' },
  { id: 'm3', team: 'manager', cause: 'D2',  specificity: 'strong', text: '主管替团队藏产能，不报真实能力' },
  { id: 'm4', team: 'manager', cause: 'R9',  specificity: 'mid',    text: '中层替下属讨价还价' },
  { id: 'm5', team: 'manager', cause: 'D1',  specificity: 'mid',    text: '部门之间为资源吵架，要老板拍板才能推进' },

  /* ---------- 第二轮 · 跨人群 ---------- */
  { id: 'x1',  team: 'cross', cause: 'D1',  specificity: 'strong', text: '销售签得越多，交付越抵触，两边在会上互相指责' },
  { id: 'x2',  team: 'cross', cause: 'D1',  specificity: 'strong', text: '需要配合的时候，对方说"这不算我的指标"' },
  { id: 'x3',  team: 'cross', cause: 'D7',  specificity: 'mid',    text: '中后台觉得自己是后娘养的' },
  { id: 'x4',  team: 'cross', cause: 'R6',  specificity: 'strong', text: '年底分钱时嗓门大的先谈，谈得越多拿得越多' },
  { id: 'x5',  team: 'cross', cause: 'R6',  specificity: 'mid',    text: '老实干活的人反而拿得少，第二年就不那么老实了' },
  { id: 'x6',  team: 'cross', cause: 'R6',  specificity: 'strong', text: '年底前有人专门找老板单独沟通' },
  { id: 'x7',  team: 'cross', cause: 'R16', specificity: 'mid',    text: '员工私下打听别人拿了多少' },
  { id: 'x8',  team: 'cross', cause: 'R16', specificity: 'strong', text: '员工反复问"这个还算不算数"' },
  { id: 'x9',  team: 'cross', cause: 'R16', specificity: 'strong', text: '有人在奖金方案公布后找 HR 要原始文件对照' },
  { id: 'x10', team: 'cross', cause: 'R17', specificity: 'strong', text: '公司业务已经下滑，奖金照发，财务在挤现金' },
  { id: 'x11', team: 'cross', cause: 'R17', specificity: 'strong', text: '老板年底临时说"今年奖金少发点"，但规则里没写这条' },
  { id: 'x12', team: 'cross', cause: 'D3',  specificity: 'strong', text: '奖金发少了，员工第一反应不是问"为什么"，是问"是不是算错了"' },
  { id: 'x13', team: 'cross', cause: 'D3',  specificity: 'strong', text: '员工年初就按含奖金的收入做房贷、车贷预算' },
  { id: 'x14', team: 'cross', cause: 'D3',  specificity: 'mid',    text: '招聘谈薪时，候选人把奖金算进固定预期' },
  { id: 'x15', team: 'cross', cause: 'D5',  specificity: 'strong', text: '部门 12 个人，11 个 B 及以上，一个 C 都没有' },
  { id: 'x16', team: 'cross', cause: 'D5',  specificity: 'strong', text: '主管打分前先问"去年大家拿的什么档"' },
  { id: 'x17', team: 'cross', cause: 'D6',  specificity: 'strong', text: '团队里除了头部两个人，其他人都只做最低要求，不主动揽活' },
  { id: 'x18', team: 'cross', cause: 'D6',  specificity: 'mid',    text: '中位员工的回答是"反正轮不到我"' },
  { id: 'x19', team: 'cross', cause: 'R21', specificity: 'strong', text: '干好干坏，收入差别不到 5%' },
  { id: 'x20', team: 'cross', cause: 'R21', specificity: 'mid',    text: '团队里没人反对加人——多一个人少一个人，自己的收入不受影响' },
  { id: 'x21', team: 'cross', cause: 'R4',  specificity: 'strong', text: '业绩第一的那个人，连续两个季度准时下班，不再接新客户' },
  { id: 'x22', team: 'cross', cause: 'R4',  specificity: 'strong', text: '产能最高的那个人，季度目标精准停在 100%，一点都不多' },
  { id: 'x23', team: 'cross', cause: 'R4',  specificity: 'mid',    text: '离职面谈里出现"干多干少一个样"这句话' },
  { id: 'x24', team: 'cross', cause: 'R1',  specificity: 'mid',    text: '好区域、好客户集中在少数人手里' },
  { id: 'x25', team: 'cross', cause: 'R1',  specificity: 'mid',    text: '新人拿到的都是别人挑剩的客户' },
  { id: 'x26', team: 'cross', cause: 'R8',  specificity: 'mid',    text: '奖金到账那天，群里跟发工资一样，没什么反应' },
  { id: 'x27', team: 'cross', cause: 'R8',  specificity: 'strong', text: '有人在奖金到账之前就已经离职了' },
  { id: 'x28', team: 'cross', cause: 'R10', specificity: 'strong', text: '干一样的活，两个月奖金差一大截，没人说得清为什么' },
  { id: 'x29', team: 'cross', cause: 'R10', specificity: 'mid',    text: '员工反复问同一个问题："这个奖金到底怎么算出来的"' },
  { id: 'x30', team: 'cross', cause: 'D5',  specificity: 'strong', text: '绩效评优轮流坐庄——大家心里清楚今年该谁、明年该谁' },
  { id: 'x31', team: 'cross', cause: 'D7',  specificity: 'mid',    text: '某个岗位的收入明显高于同级别其他岗位，并且成了公开话题' },
  { id: 'x32', team: 'cross', cause: 'R12', specificity: 'strong', text: '新员工入职一个月内流失，培训期或保底期一结束就走' },
  // x33 空缺：任务书原计划是「员工公开质疑考核逻辑」，已决定不加——
  // 它是抱怨型信号，和 G3（抱怨音量与严重程度无关）直接冲突。
  { id: 'x34', team: 'cross', cause: 'R7',  specificity: 'mid',    text: '中间节点验收时项目团队的操作空间很大——节点标准不如最终成果直观' },
  { id: 'x35', team: 'cross', cause: 'D4',  specificity: 'mid',    text: '市场化考核之后外包占比明显上升，自己独立承接的能力在退化' },
  { id: 'x36', team: 'cross', cause: 'R22', specificity: 'mid',    text: '不同区域给供应商（或经销商）的返点不一样，要靠市场稽查才能发现跨区套利' },
  { id: 'x37', team: 'cross', cause: 'R23', specificity: 'strong', text: '同样是那几个人、差不多的销量，奖金一年差一倍——差的是价格，不是努力' },
  { id: 'x38', team: 'cross', cause: 'R23', specificity: 'mid',    text: '行情差的时候，一线收入断崖下跌，有人开始走' },

  /* ---------- 对外（机制往外的反作用力） ---------- */
  { id: 'o1', team: 'external', cause: 'R5', specificity: 'strong', text: '招人的时候，候选人听到分钱方式之后不来了' }
];

/* ========== 三态 ========== */
const STATES = {
  0: { label: '没发生' },
  1: { label: '发生过' },
  2: { label: '反复发生', hint: '持续存在，大约每月至少一次' }
};
const SEVERITY = { 0: 0, 1: 1, 2: 2 };
const SPEC_WEIGHT = { strong: 3, mid: 2, weak: 1 };

/* 同一个病因的第 3 条及以后，权重减半。
 * 原因：症状数不均会让「可观察面大」的病因天然占优（R15 有 7 条，R11 只有 1 条）。
 * 不能按症状数归一——那会惩罚可观察面大的病因；正确的是边际递减。 */
const DIMINISH_AFTER = 2;
const DIMINISH_FACTOR = 0.5;

/* 退化加成：勾中的现象里超过一半已经持续一年以上，说明这不是新问题，
 * 而是这套机制用久了。此时衍生层（D 组）加权。 */
const DEGRADE_RATIO = 0.5;
const DEGRADE_BOOST = 1.4;

/* ========== 话术卡：病因 → 一句能对老板说出口的话 ==========
 * 纪律：不能出现「你/你们怎么怎么样」。
 * 只能是「我观察到 X」+「我想确认 Y」。判断让老板自己得出。
 */
const BOSS_LINES = {
  R1:  '今年客户和区域是怎么分的，我想先弄清楚',
  R2:  '几个团队的活不一样，考核用的好像是同一套逻辑',
  R3:  '有些成果是一群人一起做出来的，但现在按个人算',
  R4:  '有些岗位是个人扛结果，但钱摊给了所有人',
  R5:  '现在拿到钱的依据，是职级和可见度，还是结果',
  R6:  '今年分钱的规则好像没有事先说清楚，我想确认一下当时是怎么定的',
  R7:  '要一年才见结果的事，现在按季度结算',
  R8:  '钱到手的时候，离做那件事已经太远了',
  R9:  '有些业务年初定不出靠谱目标，但现在定了',
  R10: '能算清楚的活，用了排名来发钱',
  R11: '有些业务的目标是按绝对值定的，但客户是几年前就有的',
  R12: '新业务从零开始，但按和老业务一样的标准结算',
  R13: '目标定得太高，中途已经有人不抱希望',
  R14: '做砸了谁担，现在有没有明确说法',
  R15: '现在只奖励收入，利润、回款、续约没进考核',
  R16: '规则要么看不见，要么中途改了',
  R17: '奖金池和当年赚多少，好像没有直接关系',
  R18: '主管自己还背着个人业绩',
  R19: '干了三年的人，收入可能还不如新来的',
  R20: '做到多少封顶、出了问题要不要追回，现在有没有明确说法',
  R21: '干好干坏，收入上的差别有多大',
  R22: '不同区域或不同产品的提成（返点）不一样，我想先弄清楚这个差异是怎么定的',
  R23: '提成里有多少是行情给的，我想先弄清楚',
  D1:  '同一件事，一套机制在奖励，另一套在惩罚',
  D2:  '目标跟着业绩往上涨，做得越好越难拿到',
  D3:  '这笔奖金对大家来说，还算奖金，还是已经算成固定收入了',
  D4:  '数字好看了，但客户投诉也跟着多了',
  D5:  '去年的考核结果，好像分不出好坏',
  D6:  '除了头部那几个人，其他人基本只做最低要求',
  D7:  '前台和中后台的分配，长期不在一个量级'
};

/* ========== 通用判断（G1-G6） ==========
 * 不是全部展示——只展示跟这次诊断相关的。
 * 六条都对，但对具体某个人来说可能有五条跟他没关系；
 * 塞六条不相关的大道理进去，会把报告花力气做出来的精准感冲掉。
 *
 * 命中规则：Top3 病因链里只要有任意一条的病因代码在 causes 里，这条就展示。
 * 一条都不命中就整块不显示。
 *
 * 注意：不要按「旋钮」匹配。旋钮一底下装着四种完全不同的毛病
 * （按谁算 / 算什么数 / 什么时候兑现 / 目标怎么定），按旋钮匹配会误报——
 * 比如「销售抢客户」会命中讲软指标验证的 G4。只按病因精确匹配。
 */
const PRINCIPLES = [
  {
    id: 'G1',
    text: '政策里的每一处差异，都会被当成套利的斜坡——差异可以是好设计，但必须同时回答"这个差异会诱使谁做什么"。',
    causes: ['R22']
  },
  {
    id: 'G2',
    text: '归因之前先剥离：行情、禀赋、调度这类努力够不着的成分，必须先从考核基数里剔出去。',
    causes: ['R1', 'R11', 'R12', 'D7']
  },
  {
    id: 'G3',
    text: '受益者永远沉默。强者受损看行为（躺平、准时下班、离职），弱者受损听声音（抱怨）——抱怨音量与问题严重程度无关。',
    causes: ['R4', 'R21', 'D5', 'D6', 'D7']
  },
  {
    id: 'G4',
    text: '可测吃不可测，吃在验证上：软指标验收标准天然模糊，模糊即博弈空间。中间兑现（节点奖、里程碑）权重不能过高，验收要有外部锚。',
    causes: ['R7', 'R9', 'R10', 'D4']
  },
  {
    id: 'G5',
    text: '行政制造的区分度不能超过可验证的真实贡献差——超出的部分会被轮流坐庄再平均。',
    causes: ['R21', 'D5', 'D6']
  },
  {
    id: 'G6',
    text: '激励规则必须员工自己能算出来；不用排名这类博弈后的相对规则。',
    causes: ['R6', 'R10', 'R16', 'R22']
  }
];

/* ========== 两说卡（TRADEOFFS） ==========
 * 有些事没有唯一正确的答案——两种做法各有代价。
 * 这些地方工具不替你选，只把两边的代价摆清楚。硬给一个答案就成了算命。
 * 命中时附在病因卡下面。
 *
 * 匹配：按病因，不按旋钮。
 * 旋钮一底下装着四种完全不同的毛病——按旋钮匹配会误报，
 * 比如一个"新手保护期"的人会看到"行情钱"的卡。
 * 通用判断 G1-G6 踩过一次这个坑（见上面 PRINCIPLES 那段注释），这里不再踩。
 */
const TRADEOFFS = [
  {
    id: 't-market', causes: ['R23'],
    title: '行情钱：全奖还是剥离',
    a:   '全奖：简单、冲劲足、"卖出去就是本事"——代价是公平感崩、低谷年留不住人。',
    b:   '剥离：设行情基准线，只奖超出部分——代价是算得复杂、可能打击冲劲。',
    mid: '中间路径：阶梯提成率随价格区间浮动／丰年计提风险准备金补欠年。'
  },
  {
    id: 't-uniform', causes: ['R22'],
    title: '提成率：统一还是差异',
    a:   '统一：没有套利空间——代价是抹平了区域和产品的难度差异。',
    b:   '差异：政策精准——代价是差异本身就是套利斜坡（压单、窜货）。',
    mid: '中间路径：把差异挪到底薪或区域系数里，提成率统一，窜货另外装稽查罚则。'
  },
  {
    id: 't-granularity', causes: ['R3', 'R4'],
    title: '核算颗粒度：粗还是细',
    a:   '细（算到个人）：激励精准——代价是核算成本翻倍，对数据能力和人员要求高。',
    b:   '粗（算到团队）：成本低、落得下去——代价是组内容易小锅饭。',
    mid: '铁律：激励精度不能细过组织的核算能力。'
  },
  {
    id: 't-cliff', causes: ['R12'],
    title: '保障期满：断崖还是递减',
    a:   '断崖快筛：适合学习曲线短的岗位（计件、操作类）——不行即汰，不继续占用资源。',
    b:   '逐月递减：适合学习曲线长的岗位（销售、技术类）——防错杀"下个月就能活"的人。',
    mid: '前提一样：保障期长度以"够天赋悟性显现"为准。'
  },
  {
    id: 't-quality', causes: ['R15'],
    title: '质量：罚检兜底还是能力建设',
    a:   '罚+检：见效快——但治标，防得住出厂，防不住过程返工。',
    b:   '培训/技术管控：治本——但慢，短期产量可能承压。',
    mid: '组合：罚检守底线，能力建设管长远。返工成本落到班组时，注意别让班组因此排斥新手。'
  }
];

/* ========== 验证时间窗 ==========
 * 先说清楚这不是什么：它不是「机制什么时候会坏」。
 *
 * 机制如果是设计错的，第一天就已经错了。错要被**看见**还需要时间——
 * 人要摸出套利路径、后果要累积到能看出来、抱怨要积累到有人敢说。
 * 所以这个时间测的是「从发生到被看见」的延迟，它回答的是：
 *    这个判断，你大概什么时候能验证？
 *
 * 「机制越软，显影越慢」——越软的问题越依赖它自己浮出来，那时候通常已经晚了。
 * 预警层的全部意义，就是把看不见的慢问题提前变成能看见的早信号。
 *
 * 下面 6 档是从 5 个真实案例估出来的经验值，不是测量数据。
 */
const VERIFY_FAMILIES = {
  fast:    { label: '几周内',         note: '冲突当场就会爆，不用等' },
  onboard: { label: '入职第 1 个月',   note: '保底期或培训期结束前后就是窗口' },
  year:    { label: '约一年',         note: '要等一个完整的结算周期走完' },
  slow:    { label: '约两年',         note: '显形慢——受益者沉默，强者是悄悄走的' },
  slower:  { label: '两到三年',       note: '报表上看不见，等看出来已经很深' },
  cycle:   { label: '看你的结算周期', note: '约等于你最长那个结算周期走完一遍' }
};

const CAUSE_FAMILY = {
  R3: 'fast',  R6: 'fast',  R16: 'fast',  D1: 'fast',
  R12: 'onboard',
  R1: 'year',  R8: 'year',  R9: 'year',  R10: 'year', R11: 'year',
  R13: 'year', R15: 'year', R17: 'year', R18: 'year', R22: 'year',
  R4: 'slow',  R5: 'slow',  R7: 'slow',  R19: 'slow', R21: 'slow',
  D5: 'slow',  D6: 'slow',  D7: 'slow',
  R2: 'slower', D2: 'slower', D3: 'slower', D4: 'slower', R23: 'slower',
  R14: 'cycle', R20: 'cycle'
};

/* 个别病因的说明跟它所在的那一档不一样，单独写一句。
 *
 * 例：R23 行情钱也在「两到三年」档，但它跟机制退化类（棘轮、固化）不是一回事——
 * 那类是真"报表上看不见"，行情钱是在报表上能看见的，只是要等行情转过一轮才看得出来。
 * 同一档里说不同的话，这是「时间窗不只是一个值」的开始。
 */
const VERIFY_NOTE_OVERRIDE = {
  R23: '行情不转过一轮，看不出谁在挣行情的钱'
};

/* ========== 边界说明 ========== */
const BOUNDARY = [
  '股权、期权的具体条款设计涉及法律和财税，不在本工具范围内。工具只停在「要不要用、什么时候用、给谁」这一层。',
  '本工具不给具体比例和数字。比例没有普适解，要由你用自己的业务数据推出来。',
  '输出是待确认的假设，不是结论。任何一条都应该先验证再动手。',
  '一次只拧一个旋钮。同时动五个，三个月后你分不清是哪个起了作用。',
  '「大概什么时候能验证」是从真实案例估的经验值，不是测量数据。它说的是「你大概什么时候能验证这个判断」，不是「机制什么时候会坏」——机制如果是设计错的，第一天就已经错了。'
];
