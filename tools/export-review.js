/**
 * export-review.js —— 把规则库里「需要你判断」的内容导出成一份可读可写的 Markdown
 *
 * 用法：node tools/export-review.js
 * 产出：仓库根目录的「待填清单.md」
 *
 * 为什么要这个：pay-data.js 是代码文件，直接看很难。这份 Markdown 把要你改的地方
 * 全部摊平，每条下面留一行「改成：」——你在那一行写，写完整份发回来，我改进代码。
 *
 * 改完 pay-data.js 之后重跑一次，这份清单会跟着更新。
 */

const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '..', 'js', 'pay-data.js');
const outPath = path.join(__dirname, '..', '待填清单.md');

eval(fs.readFileSync(dataPath, 'utf8') + `
;global.__RULEBOOK__ = { SYMPTOMS, CAUSES, TEAMS, KNOBS, BOSS_LINES, SPEC_WEIGHT, PRE_QUESTION, BOUNDARY, PLANS, PLAN_OF, PRINCIPLES, VERIFY_FAMILIES, CAUSE_FAMILY };
`);
const { SYMPTOMS, CAUSES, TEAMS, KNOBS, BOSS_LINES, PLANS, PLAN_OF, PRINCIPLES, VERIFY_FAMILIES, CAUSE_FAMILY } = global.__RULEBOOK__;

const SPEC_CN = { strong: '强', mid: '中', weak: '弱' };
const L = [];

const today = new Date().toISOString().slice(0, 10);

L.push('# 分钱机制诊断 · 待填清单');
L.push('');
L.push(`> 导出时间：${today}　·　` +
       `病因 ${CAUSES.length} 条　症状 ${SYMPTOMS.length} 条`);
L.push('');
L.push('## 怎么用这份清单');
L.push('');
L.push('**规则库里需要你判断的东西全在这里。**每条下面都留了「改成：」那一行——');
L.push('你在那一行写内容，不用管格式，写完整份发回来，我改进代码。');
L.push('');
L.push('- **写不出来的，就空着。**空着比编一个好——编的那一条，就是以后被人一眼看穿的那一条。');
L.push('- **优先级从高到低**：鉴别诊断 ＞ 确认动作 ＞ 话术卡 ＞ 症状表。');
L.push('- 第 1、2 部分是按病因组织的（共 ' + CAUSES.length + ' 条），第 3 部分是话术卡，第 4 部分是症状表。');
L.push('');
L.push('---');
L.push('');

/* ==================== 零、改法地图 ==================== */
L.push('# 零、改法地图（L1 → L2 的接口）');
L.push('');
L.push('**这张表是给 L2 做手册用的，不是要你填的**——放在最前面是为了让你看见：');
L.push('你在下面各处写的内容，最后会被归到这几个「改法」上。');
L.push('');
L.push('为什么要按改法而不是按病因组织：**用户要的是「我该做什么」，不是「我得了什么病」。**');
L.push('而且多个病因指向同一个动作（R14 补保底 / R21 收保底 是同一个旋钮的相反方向），');
L.push('按住病因写方案，你会重复写很多遍。');
L.push('');
L.push('| 改法 | 旋钮 | 标题 | 谁能改 | 包含哪些病因 |');
L.push('|---|---|---|---|---|');
Object.keys(PLANS).forEach(p => {
  const causes = CAUSES.filter(c => PLAN_OF[c.code] === p).map(c => c.code).join('、');
  const knob = PLANS[p].knob === null ? '前置' : '旋钮' + '一二三四五'[PLANS[p].knob - 1];
  L.push(`| ${p} | ${knob} | ${PLANS[p].title} | ${PLANS[p].decider || '—'} | ${causes} |`);
});
L.push('');
L.push(`共 **${Object.keys(PLANS).length} 个改法**（L2 最少要有这么多篇手册，有几篇内容短可以合并）。`);
L.push('');
L.push('**「谁能改」这一栏**：绝大多数机制改动都是公司层拍板，不是 HR 自己推得动的。');
L.push('写出来是为了让用户知道**这事该找谁**——很多 HR 卡住，就是因为想在公司层的问题上做团队层的动作。');
L.push('');
L.push('各改法的**前提条件**（写在 pay-data.js 的 `PLANS[].preconditions` 里，不在这里重复）：');
L.push('前提不成立的时候，处方就是空头支票——案例里"人单合一之死"就是这么死的。');
L.push('');
L.push('---');
L.push('');

/* ==================== 一、鉴别诊断 + 确认动作 ==================== */
L.push('# 一、鉴别诊断 与 确认动作');
L.push('');
L.push('**这两栏为什么最重要：**');
L.push('');
L.push('- **鉴别诊断**（「如果不是这个原因，还可能是什么 + 怎么分辨」）——它是「诊断」和「症状匹配器」的分界线。');
L.push('  只说「也可能是别的」是免责声明；说清「怎么分辨」才是诊断。');
L.push('- **确认动作**——用户看完这一页要去做的那件事。约束是：**10 分钟、一个人、不用求人**。');
L.push('  三条缺一条，那个动作就是假的，用户不会去做。');
L.push('');

const roots = CAUSES.filter(c => c.layer === 'root');
const derived = CAUSES.filter(c => c.layer === 'derived');

function causeBlock(c, idx) {
  L.push(`## ${idx}. ${c.code} · ${c.name}`);
  L.push('');
  L.push(`**人话版**：${c.plain}`);
  if (c.knob) {
    L.push(`**调整的思路**：旋钮${'一二三四五'[c.knob - 1]} · ${KNOBS[c.knob].name}（${KNOBS[c.knob].plain}）`);
    if (c.knobDir) L.push(`　· 这条有专门的方向说明：${c.knobDir}`);
  } else if (c.isPre) {
    L.push('**调整的思路**：不是旋钮，是前置条件（资源分配）');
  }
  if (c.from && c.from.length) {
    L.push(`**由什么推出来**：${c.from.join('、')}`);
  }
  L.push('');
  L.push('**① 确认动作**（10分钟、一个人、不用求人）');
  L.push('');
  L.push(`> 现在：${c.confirm}`);
  L.push('> 改成：');
  L.push('');
  L.push('**② 鉴别诊断**');
  L.push('');
  (c.exclude || []).forEach((e, i) => {
    L.push(`- 别的解释 ${i + 1}：${e.alt}`);
    L.push(`  怎么分辨：${e.how}`);
    L.push('  改成：');
  });
  L.push('- 别的解释：（你觉得还可能是别的什么？）');
  L.push('  怎么分辨：');
  L.push('');
  L.push('---');
  L.push('');
}

L.push(`## 根因层（${roots.length} 条）—— 设计时的选择错了`);
L.push('');
roots.forEach((c, i) => causeBlock(c, i + 1));

L.push('');
L.push(`## 衍生层（${derived.length} 条）—— 机制跑了一段时间之后的产物`);
L.push('');
derived.forEach((c, i) => causeBlock(c, roots.length + i + 1));

/* ==================== 二、话术卡 ==================== */
L.push('');
L.push(`# 二、话术卡（${CAUSES.length} 条）`);
L.push('');
L.push('这是用户会**复制走、拿给别人看**的那句话。三条纪律：');
L.push('');
L.push('1. **不能出现「你/你们怎么怎么样」**——那是指控，用户说不出口。');
L.push('2. 只能是「我观察到 X」+「我想确认 Y」。**判断让老板自己得出。**');
L.push('3. 症状没法反驳，结论可以。所以永远陈述事实，不下结论。');
L.push('');
L.push('| 病因 | 现在的话 | 改成 |');
L.push('|---|---|---|');
CAUSES.forEach(c => {
  L.push(`| ${c.code} ${c.name} | ${BOSS_LINES[c.code] || '（缺）'} | |`);
});
L.push('');

/* ==================== 三、症状表 ==================== */
L.push('');
L.push('# 三、症状表（按团队）');
L.push('');
L.push('**这一栏是用户要打勾的东西**，所以每一条都必须是「一个没参与的人，一周内能看见并记录下来」的行为。');
L.push('');
L.push('要动的三种情况：');
L.push('');
L.push('- **删**：你觉得不像、或者不是分钱造成的');
L.push('- **改**：意思对但说法不像你会说的');
L.push('- **补**：你见过但这里没有的（写在每个团队表格下面）');
L.push('');
L.push('「特异性」是这条症状能不能反过来定位到具体病因：能定位=强，指向好几个=弱。**强的算 3 分，中的 2 分，弱的 1 分**——它同时就是权重。');
L.push('');

TEAMS.forEach(t => {
  const list = SYMPTOMS.filter(s => s.team === t.id);
  L.push(`## ${t.name}${t.desc ? '（' + t.desc + '）' : ''}　·　${list.length} 条`);
  L.push('');
  L.push('| # | 症状 | 指向 | 特异性 | 保留/删/改 |');
  L.push('|---|---|---|---|---|');
  list.forEach((s, i) => {
    L.push(`| ${i + 1} | ${s.text} | ${s.cause} | ${SPEC_CN[s.specificity]} | |`);
  });
  L.push('');
  L.push('**你要补的**（这个团队里你见过、但上面没有的）：');
  L.push('');
  L.push('1.');
  L.push('2.');
  L.push('3.');
  L.push('');
  L.push('---');
  L.push('');
});

const crossList = SYMPTOMS.filter(s => s.team === 'cross');
L.push(`## 跨团队（不属于任何一个团队，发生在两个团队之间）　·　${crossList.length} 条`);
L.push('');
L.push('这一组在工具里是单独一轮，最容易被忽略，也往往最集中。');
L.push('');
L.push('| # | 症状 | 指向 | 特异性 | 保留/删/改 |');
L.push('|---|---|---|---|---|');
crossList.forEach((s, i) => {
  L.push(`| ${i + 1} | ${s.text} | ${s.cause} | ${SPEC_CN[s.specificity]} | |`);
});
L.push('');
L.push('**你要补的**：');
L.push('');
L.push('1.');
L.push('2.');
L.push('3.');
L.push('');

const extList = SYMPTOMS.filter(s => s.team === 'external');
if (extList.length) {
  L.push('---');
  L.push('');
  L.push('## 对外（机制往外的反作用力）');
  L.push('');
  L.push('机制内部看不见，只能从外面看。这一条是「你的机制正在赶走你想要的人」唯一能被直接观察到的样子。');
  L.push('');
  extList.forEach(s => {
    L.push(`- ${s.text}`);
    L.push('  你见过的类似情况：');
  });
  L.push('');
}

/* ==================== 三点五、验证时间窗 ==================== */
L.push('---');
L.push('');
L.push('# 三点五、验证时间窗（请你核一遍）');
L.push('');
L.push('这一栏来自你那 5 个案例的估计值。**你说过这些时间是你大概估的，而且它测的不是"机制什么时候坏"，');
L.push('是"什么时候开始有反馈"。** 所以在工具里它是这么用的：');
L.push('');
L.push('> 它回答的不是"你什么时候会出问题"，是"**这个判断你大概什么时候能验证**"。');
L.push('');
L.push('这样定位的好处是它跟你的数据是匹配的——机制如果是设计错的，第一天就已经错了，');
L.push('错要被"看见"才需要时间（人要摸出套利路径、后果要累积、抱怨要积累到有人敢说）。');
L.push('');
L.push('| 档位 | 显示成 | 说明 | 挂在哪些病因 | 你的修正 |');
L.push('|---|---|---|---|---|');
Object.keys(VERIFY_FAMILIES).forEach(f => {
  const fam = VERIFY_FAMILIES[f];
  const causes = CAUSES.filter(c => CAUSE_FAMILY[c.code] === f).map(c => c.code).join('、');
  L.push(`| ${f} | **${fam.label}** | ${fam.note} | ${causes} | |`);
});
L.push('');
L.push('**要你做的**：看每一档的"显示成"和"说明"对不对，不对的写在最后一栏。');
L.push('尤其是有没有**分错档**的病因——比如某个病你实际见过的比"约两年"更快或更慢。');
L.push('');

/* ==================== 四、只有你能提供的 ==================== */
L.push('---');
L.push('');
L.push('# 四、只有你能提供的两样');
L.push('');
L.push('## 1. 五个真实案例');
L.push('');
L.push('| # | 什么业务 | 用了什么机制 | 什么时候开始坏 | 第一个信号是什么 |');
L.push('|---|---|---|---|---|');
for (let i = 1; i <= 5; i++) L.push(`| ${i} | | | 设下去之后几个月 | |`);
L.push('');
L.push('**后两栏是全部重点**，前三栏随手写。想不起来就空着——空着的那一格，就是你要去问别人的那一格。');
L.push('');
L.push('**抽样规则（别跳过）：** 把你带过或深度接触过的业务线先列全，再按时间顺序取最近五条，**不许挑**。');
L.push('凭印象挑的话，你一定会选出印象最深的那几个——而那些天然就是「和常规不一样」的案例，检验结果必然偏乐观。');
L.push('');
L.push('## 2. 机制开始坏，最快多久、最慢多久？');
L.push('');
L.push('最快：');
L.push('');
L.push('最慢：');
L.push('');
L.push('（这个问题决定工具里「预警」那层怎么写——写「会出现抢客户」是常识，写「提成制调整后第 4 个月开始抢客户」才是判断。）');
L.push('');
L.push('---');
L.push('');

/* ==================== 附：自检 ==================== */
const cnt = {};
SYMPTOMS.forEach(s => { cnt[s.cause] = (cnt[s.cause] || 0) + 1; });
const thin = CAUSES.filter(c => (cnt[c.code] || 0) <= 1);

L.push('# 附：结构自检');
L.push('');
L.push(`- 每个病因都至少挂了 1 条症状（不会有诊断不出来的孤儿病因）`);
if (thin.length) {
  L.push(`- 证据面偏窄的病因（只挂 1 条症状，建议补）：${thin.map(c => c.code + ' ' + c.name).join('、')}`);
} else {
  L.push('- 没有证据面偏窄的病因');
}
L.push(`- 每个病因都有鉴别诊断、确认动作、话术卡文案`);
L.push('');

fs.writeFileSync(outPath, L.join('\n'), 'utf8');
console.log('');
console.log('已导出：' + outPath);
console.log(`  病因 ${CAUSES.length} 条 · 症状 ${SYMPTOMS.length} 条 · 共 ${L.length} 行`);
console.log('');
