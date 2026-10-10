/**
 * selfcheck.js —— 规则库自检
 *
 * 用法：node tools/selfcheck.js
 *
 * 为什么需要它：上一版有两个病因（R8、R10）一条症状都没挂，
 * 在表里躺着，工具永远诊断不出来——人工审表看不出来，脚本一眼就能看到。
 *
 * 每次改完 pay-data.js 都跑一次。
 */

const fs = require('fs');
const path = require('path');

// 默认检 js/pay-data.js；也可以传一个路径进来（用来测自检本身能不能抓到错）
const dataPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, '..', 'js', 'pay-data.js');

// 一次性把数据文件的 const 取出来。
// 不能直接 eval(dataSrc) —— eval 里的 const 不会漏到外层作用域，
// 所以要在同一个 eval 里把需要的名字挂出去。
eval(fs.readFileSync(dataPath, 'utf8') + `
;global.__RULEBOOK__ = { SYMPTOMS, CAUSES, TEAMS, KNOBS, SPEC_WEIGHT, BOSS_LINES, PLANS, PLAN_OF, PRE_EFFECTS, PRE_QUESTION, PRE_EFFECTS_2, PRE_QUESTION_2, PRINCIPLES, TRADEOFFS, VERIFY_FAMILIES, CAUSE_FAMILY, VERIFY_NOTE_OVERRIDE, CAUSE_CONSTRAINTS };
`);

const { SYMPTOMS, CAUSES, TEAMS, KNOBS, SPEC_WEIGHT, BOSS_LINES, PLANS, PLAN_OF, PRE_EFFECTS, PRE_QUESTION, PRE_EFFECTS_2, PRE_QUESTION_2, PRINCIPLES, TRADEOFFS, VERIFY_FAMILIES, CAUSE_FAMILY, VERIFY_NOTE_OVERRIDE, CAUSE_CONSTRAINTS } = global.__RULEBOOK__;

let errors = [];
let warnings = [];

/* ---------- 1. 病因必须至少挂 1 条症状（孤儿病因 = 永远诊断不出来） ---------- */
const symptomCount = {};
SYMPTOMS.forEach(s => { symptomCount[s.cause] = (symptomCount[s.cause] || 0) + 1; });

CAUSES.forEach(c => {
  const n = symptomCount[c.code] || 0;
  if (n === 0) errors.push(`孤儿病因：${c.code}（${c.name}）没有任何症状指向它`);
  else if (n === 1) warnings.push(`只有 1 条症状：${c.code}（${c.name}）—— 证据面偏窄`);
});

/* ---------- 2. 每条症状的病因必须存在 ---------- */
const codes = new Set(CAUSES.map(c => c.code));
SYMPTOMS.forEach(s => {
  if (!codes.has(s.cause)) errors.push(`症状 ${s.id} 指向了不存在的病因 ${s.cause}`);
  if (!SPEC_WEIGHT[s.specificity]) errors.push(`症状 ${s.id} 的特异性取值非法：${s.specificity}`);
  if (!TEAMS.some(t => t.id === s.team) && s.team !== 'cross' && s.team !== 'external')
    errors.push(`症状 ${s.id} 的团队非法：${s.team}`);
});

/* ---------- 3. 症状 id 不能重复 ---------- */
const seen = new Set();
SYMPTOMS.forEach(s => {
  if (seen.has(s.id)) errors.push(`症状 id 重复：${s.id}`);
  seen.add(s.id);
});

/* ---------- 4. 旋钮：每个都被引用，且每个病因的 knob 值合法 ---------- */
const knobKeys = Object.keys(KNOBS);
[1, 2, 3, 4, 5].forEach(k => {
  const n = CAUSES.filter(c => c.knob === k).length;
  if (n === 0) errors.push(`旋钮 ${k}（${KNOBS[k].name}）没有任何病因引用它`);
});
CAUSES.forEach(c => {
  // 这条原来漏了：写错的 knob 值不会报错，只会让「调整的思路」整块不渲染
  if (c.knob !== null && c.knob !== undefined && knobKeys.indexOf(String(c.knob)) < 0) {
    errors.push(`${c.code} 的 knob=${c.knob} 不在 KNOBS 里（合法值：${knobKeys.join('/')}）`);
  }
});

/* ---------- 4b. 改法键：每个病因都要有，且指向真实存在的改法 ---------- */
const planKeys = Object.keys(PLANS);
const planUsed = {};
CAUSES.forEach(c => {
  const p = PLAN_OF[c.code];
  if (!p) errors.push(`${c.code} 没有登记改法（PLAN_OF 里缺 ${c.code}）`);
  else if (planKeys.indexOf(p) < 0) errors.push(`${c.code} 的改法 ${p} 不在 PLANS 里`);
  else planUsed[p] = (planUsed[p] || 0) + 1;
});
planKeys.forEach(p => {
  if (!planUsed[p]) errors.push(`改法 ${p}（${PLANS[p].title}）没有任何病因指向它`);
});
// 改法上的旋钮编号也要合法
planKeys.forEach(p => {
  const k = PLANS[p].knob;
  if (k !== null && k !== undefined && knobKeys.indexOf(String(k)) < 0) {
    errors.push(`改法 ${p} 的 knob=${k} 不在 KNOBS 里`);
  }
  // 每个改法都要说清「多久能看出效果」——这是「药的钟」，
  // 跟病因上的「病的钟」（CAUSE_FAMILY）是两回事，两个都要有。
  if (!PLANS[p].effectWindow) {
    errors.push(`改法 ${p}（${PLANS[p].title}）缺 effectWindow——用户不知道该多久回头看结果`);
  }
  // seeSpeed 是 effectWindow 的三档版，L2 拿它跟「你希望多久看到变化」比。
  // 缺了或者写错，那句冲突提醒就永远不会出来。
  if (['fast', 'cycle', 'year'].indexOf(PLANS[p].seeSpeed) < 0) {
    errors.push(`改法 ${p} 的 seeSpeed 非法（合法值：fast / cycle / year）——L2 的「多久看到变化」提醒会失效`);
  }
});

/* ---------- 4c. 前置问：每个选项都要有作用 ---------- */
[[PRE_QUESTION, PRE_EFFECTS], [PRE_QUESTION_2, PRE_EFFECTS_2]].forEach(([q, eff]) => {
  q.options.forEach(o => {
    const e = eff[o.value];
    if (!e || !Object.keys(e).length) {
      errors.push(`前置问「${q.id}」的选项 ${o.value}（${o.label}）没有登记影响，选了等于没选`);
      return;
    }
    Object.keys(e).forEach(code => {
      if (!codes.has(code)) errors.push(`前置问「${q.id}」的 ${o.value} 指向不存在的病因 ${code}`);
    });
  });
});

/* ---------- 5. 每条病因必须有：确认动作 / 鉴别诊断 / 话术卡文案 ---------- */
CAUSES.forEach(c => {
  if (!c.confirm) errors.push(`${c.code} 缺确认动作`);
  if (!c.exclude || !c.exclude.length) {
    errors.push(`${c.code} 缺鉴别诊断（exclude）`);
  } else {
    c.exclude.forEach((e, i) => {
      if (!e.alt) errors.push(`${c.code} 的 exclude[${i}] 缺 alt`);
      if (!e.how) errors.push(`${c.code} 的 exclude[${i}] 缺 how —— 只说「还可能是什么」不够，要说「怎么分辨」`);
    });
  }
  if (!BOSS_LINES[c.code]) errors.push(`${c.code} 缺话术卡文案（BOSS_LINES）`);
  if (!c.plain) errors.push(`${c.code} 缺人话版说明（plain）`);
});

/* ---------- 6. 衍生层的 from 必须指向真实存在的根因 ---------- */
CAUSES.filter(c => c.layer === 'derived').forEach(c => {
  (c.from || []).forEach(rc => {
    const target = CAUSES.find(x => x.code === rc);
    if (!target) errors.push(`${c.code} 的 from 指向不存在的病因 ${rc}`);
    else if (target.layer !== 'root') errors.push(`${c.code} 的 from 指向的不是根因：${rc}`);
  });
});

/* ---------- 7. 话术卡不能出现「你/你们」——那是指控，不是证据句 ---------- */
Object.keys(BOSS_LINES).forEach(code => {
  const line = BOSS_LINES[code];
  if (/[你您]/.test(line)) errors.push(`话术卡 ${code} 出现「你/您」—— 违反证据句纪律：${line}`);
  if (/(不对等|有问题|不合理|落后|失败)/.test(line)) warnings.push(`话术卡 ${code} 可能是判断句而非事实句：${line}`);
});

/* ---------- 7b. 通用判断：引用的病因和旋钮必须存在 ---------- */
PRINCIPLES.forEach(p => {
  if (!p.text) errors.push(`通用判断 ${p.id} 缺文案`);
  if (!p.causes || !p.causes.length) errors.push(`通用判断 ${p.id} 没有指向任何病因，永远不会命中`);
  (p.causes || []).forEach(c => {
    if (!codes.has(c)) errors.push(`通用判断 ${p.id} 引用了不存在的病因 ${c}`);
  });
  if (p.knobs) errors.push(`通用判断 ${p.id} 还在用 knobs 匹配——旋钮太宽会误报，只按病因匹配`);
});

/* ---------- 7c. 验证时间窗：每个病因都要能查到，值必须合法 ---------- */
const famKeys = Object.keys(VERIFY_FAMILIES);
CAUSES.forEach(c => {
  const f = CAUSE_FAMILY[c.code];
  if (!f) errors.push(`${c.code} 没有登记验证时间窗（CAUSE_FAMILY）`);
  else if (famKeys.indexOf(f) < 0) errors.push(`${c.code} 的时间窗 ${f} 不在 VERIFY_FAMILIES 里`);
});
famKeys.forEach(f => {
  const n = CAUSES.filter(c => CAUSE_FAMILY[c.code] === f).length;
  if (!n) warnings.push(`时间窗 ${f}（${VERIFY_FAMILIES[f].label}）没有任何病因用到`);
});
Object.keys(CAUSE_FAMILY).forEach(c => {
  if (!codes.has(c)) errors.push(`CAUSE_FAMILY 里有不存在的病因 ${c}`);
});
Object.keys(VERIFY_NOTE_OVERRIDE).forEach(c => {
  if (!codes.has(c)) errors.push(`VERIFY_NOTE_OVERRIDE 里有不存在的病因 ${c}`);
});

/* ---------- 7f. 约束属性：每条病因都要有 ----------
 * 漏一条 = 用户拿到一个跟他处境打架、却没人提醒他的方案。
 */
const CONSTR_KEYS = ['costsMoney', 'touchesExisting', 'needsReset'];
CAUSES.forEach(c => {
  const cc = CAUSE_CONSTRAINTS[c.code];
  if (!cc) {
    errors.push(`${c.code} 没登记约束属性（CAUSE_CONSTRAINTS）——L2 没法判断这个方案跟他现在的处境打不打架`);
    return;
  }
  CONSTR_KEYS.forEach(k => {
    if (typeof cc[k] !== 'boolean') errors.push(`CAUSE_CONSTRAINTS.${c.code}.${k} 必须是 true / false`);
  });
});
Object.keys(CAUSE_CONSTRAINTS).forEach(c => {
  if (!codes.has(c)) errors.push(`CAUSE_CONSTRAINTS 里有不存在的病因 ${c}`);
});

/* ---------- 7d. 注释里写的条数不能跟实际对不上 ----------
 * 自检的意义就是消除这种不一致——注释里的也算。
 * 这类错不会报错、也不会让页面白屏，只是让人数错东西。
 */
const rawSrc = fs.readFileSync(dataPath, 'utf8');
[
  { re: /病因表[（(](\d+)\s*条/g, actual: () => CAUSES.length,       label: '病因表' },
  { re: /症状表[（(](\d+)\s*条/g, actual: () => SYMPTOMS.length,     label: '症状表' },
  { re: /改法表?[（(](\d+)\s*条/g, actual: () => Object.keys(PLANS).length, label: '改法' }
].forEach(claim => {
  let m;
  while ((m = claim.re.exec(rawSrc)) !== null) {
    const claimed = parseInt(m[1], 10);
    const real = claim.actual();
    if (claimed !== real) {
      errors.push(`注释里的条数不对：${claim.label}写的是 ${claimed} 条，实际 ${real} 条`);
    }
  }
});

/* ---------- 7e. 两说卡：必须挂在真实存在的病因上 ----------
 * 两说卡是「没有唯一答案、把两边代价摆出来」的东西，
 * 所以 a / b / mid 三段缺一不可——缺了就变成了单边建议，等于替用户做了决定。
 */
const toIds = new Set();
TRADEOFFS.forEach(t => {
  if (!t.id) { errors.push('两说卡缺 id'); return; }
  if (toIds.has(t.id)) errors.push(`两说卡 id 重复：${t.id}`);
  toIds.add(t.id);
  if (!t.title) errors.push(`两说卡 ${t.id} 缺标题`);
  ['a', 'b', 'mid'].forEach(k => {
    if (!t[k]) errors.push(`两说卡 ${t.id} 缺「${k}」——两说必须写全两边 + 中间路径`);
  });
  if (t.knob) errors.push(`两说卡 ${t.id} 还在用 knob 匹配——旋钮太宽会误报，只按病因匹配`);
  if (!t.causes || !t.causes.length) {
    errors.push(`两说卡 ${t.id} 没有挂病因，永远不会命中`);
  } else {
    t.causes.forEach(c => {
      if (!codes.has(c)) errors.push(`两说卡 ${t.id} 指向不存在的病因 ${c}`);
    });
  }
});

/* ---------- 8. 根因/衍生分层的规模 ---------- */
const roots = CAUSES.filter(c => c.layer === 'root').length;
const derived = CAUSES.filter(c => c.layer === 'derived').length;

/* ---------- 输出 ---------- */
console.log('');
console.log('规则库自检 · ' + path.relative(process.cwd(), dataPath).replace(/\\/g, '/'));
console.log('─'.repeat(52));
console.log(`病因 ${CAUSES.length} 条（根因 ${roots} / 衍生 ${derived}）  症状 ${SYMPTOMS.length} 条`);
console.log('');

const maxN = Math.max(...CAUSES.map(c => symptomCount[c.code] || 0));
const minN = Math.min(...CAUSES.map(c => symptomCount[c.code] || 0));
console.log(`症状覆盖：最多 ${maxN} 条 / 最少 ${minN} 条`);
console.log('');

if (warnings.length) {
  console.log(`提醒 ${warnings.length} 条：`);
  warnings.forEach(w => console.log('  ! ' + w));
  console.log('');
}

if (errors.length) {
  console.log(`错误 ${errors.length} 条：`);
  errors.forEach(e => console.log('  x ' + e));
  console.log('');
  process.exit(1);
}

console.log('通过。');
console.log('');
