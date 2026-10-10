/**
 * observe.js —— 实测用的计时条（只在地址带 ?observe=1 时出现）
 *
 * 为什么有它：实测的时候你要同时做三件事——看人、记笔记、掐表。
 * 掐表交给它，你只管看人。
 *
 * 怎么开：地址后面加 ?observe=1，比如
 *     index.html?observe=1
 * 开了之后右下角有个小黑条：
 *     本轮 1:23 ｜ 累计 4:05
 * **每过完一个团队，「本轮」自动归零重计。**
 *
 * 于是你一眼就能看出那件事——
 * 第一个团队花了 3 分钟，第二个只花 40 秒：他开始不看了。
 *
 * 不带 ?observe=1 的话，这个文件什么都不做，对真实用户零影响。
 */
(function () {
  if (!/[?&]observe=1/.test(location.search)) return;

  var bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;right:10px;bottom:10px;z-index:99999;' +
    'background:rgba(15,23,42,.9);color:#fff;font:12px/1.6 system-ui,-apple-system,sans-serif;' +
    'padding:6px 11px;border-radius:9px;letter-spacing:.3px;pointer-events:none';
  document.body.appendChild(bar);

  var t0 = Date.now();
  var last = t0;
  var rounds = [];
  try { rounds = JSON.parse(localStorage.getItem('obs-rounds') || '[]'); } catch (e) {}

  function fmt(ms) {
    var s = Math.round(ms / 1000);
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }
  function paint() {
    bar.textContent = '本轮 ' + fmt(Date.now() - last) + ' ｜ 累计 ' + fmt(Date.now() - t0);
  }
  setInterval(paint, 1000);
  paint();

  /* 开始一次新的实测：清零重来。
   * 不这么做的话，上一个人的用时会在屏幕上、也会混进下一个人的数据里。 */
  window.observeStart = function () {
    rounds = [];
    t0 = Date.now();
    last = t0;
    try { localStorage.removeItem('obs-rounds'); } catch (e) {}
    paint();
  };

  /* 过完一个团队：记下这一轮，然后本轮归零 */
  window.observeTeam = function (name) {
    rounds.push({ team: name, sec: Math.round((Date.now() - last) / 1000) });
    try { localStorage.setItem('obs-rounds', JSON.stringify(rounds)); } catch (e) {}
    last = Date.now();
    paint();
  };
})();
