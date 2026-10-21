/* 澳大考試必勝卡：全站底部橫額（按澳門日期自動換字，2027/1/31 後自動消失） */
(function () {
  if (/\/bisheng/.test(location.pathname)) return;
  var d = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10), t;
  if (d < "2026-11-10" || d > "2027-01-31") return;
  if (d < "2026-11-23") t = "<b>11/23 起</b> 澳大店考試期單剪 <b>$50</b>＋考試必勝卡";
  else if (d <= "2026-12-17") t = "澳大店考試打打氣：單剪 <b>$50</b> ‧ 剪完<b>領考試必勝卡</b>";
  else t = "持<b>考試必勝卡</b>：1/31 前到澳大店減 <b>$10</b>";
  try { if (sessionStorage.getItem("bsx")) return; } catch (e) {}
  var root = /\/branches\//.test(location.pathname) ? "../" : "";
  var s = document.createElement("style");
  s.textContent = ".bsbar{position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:200;display:flex;align-items:center;gap:8px;max-width:560px;margin:0 auto;background:#13403f;color:#F7F4EC;border:2px solid #D8B860;border-radius:999px;padding:10px 10px 10px 18px;box-shadow:0 8px 24px rgba(0,0,0,.25);font:15px/1.4 'Noto Sans TC',-apple-system,'PingFang TC',sans-serif;text-decoration:none}" +
    ".bsbar b{color:#D8B860}.bsbar span{flex:1}.bsbar i{font-style:normal;background:#D8B860;color:#13403f;border-radius:999px;padding:4px 12px;font-weight:700;white-space:nowrap}" +
    ".bsbar button{background:none;border:0;color:#F7F4EC;opacity:.7;font-size:18px;padding:0 4px;cursor:pointer}";
  document.head.appendChild(s);
  var a = document.createElement("a");
  a.className = "bsbar"; a.href = root + "bisheng";
  a.innerHTML = "<span>🎓 " + t + "</span><i>撳此 →</i><button aria-label='關閉'>✕</button>";
  a.querySelector("button").onclick = function (e) { e.preventDefault(); a.remove(); try { sessionStorage.setItem("bsx", "1"); } catch (x) {} };
  document.body.appendChild(a);
})();
