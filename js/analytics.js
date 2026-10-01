/**
 * analytics.js —— 统计代码，五个页面共用一份
 *
 * 【要改的只有下面这一行】
 *
 * 怎么拿 ID：
 *   1. 登录 tongji.baidu.com（新注册一个账号，或者用你的主账号新增一个网站）
 *   2. 管理 → 新增网站，域名先随便填（比如 pay.example.com，以后再改）
 *   3. 拿到代码后，只要 hm.js? 后面那一串 32 位十六进制
 *   4. 粘到下面，保存，刷新页面就生效——五个页面一起生效
 *
 * 留空 = 不上报。所以在 ID 填上之前，页面照常跑，不会报错。
 *
 * 注意：这个 ID 是给「分钱机制诊断」单独用的，不要跟战略诊断
 * （c1350882bbca6aeedd57dec0c4376483）混在一起——混了就分不清
 * 哪些流量是这个工具的。
 */
var BAIDU_TONGJI_ID = '';

(function () {
  if (!BAIDU_TONGJI_ID) return;   // 没填 ID 就静默跳过

  var _hmt = window._hmt = window._hmt || [];
  (function () {
    var hm = document.createElement('script');
    hm.src = 'https://hm.baidu.com/hm.js?' + BAIDU_TONGJI_ID;
    var s = document.getElementsByTagName('script')[0];
    s.parentNode.insertBefore(hm, s);
  })();
})();

/**
 * 打一个步骤埋点。
 *
 * 现在没有任何地方调用它——要没要开，你说了算。
 *
 * 如果要看「完诊率」（选了人群之后走完全流程的比例），
 * 这是唯一值得先加的指标：它当天就能测，而且它是「行动率」的上限——
 * 没走完的人不可能去验证任何事。
 *
 * 加的地方（js/pay-app.js）：
 *   - goToPre()      → trackStep('start')      进来了
 *   - goToTeams()    → trackStep('pre-done')   两问填完了
 *   - renderCross()  → trackStep('survey-done') 症状过完了
 *   - renderReport() → trackStep('report')     拿到结果了
 */
function trackStep(step) {
  if (!BAIDU_TONGJI_ID || !window._hmt) return;
  window._hmt.push(['_trackEvent', 'pay', step]);
}
