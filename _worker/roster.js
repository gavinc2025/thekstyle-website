// 員工更表頁：GET /r/<專屬碼>
//   每個師傅一條專屬連結（唔使密碼），條連結本身就係身份；KV 只存專屬碼嘅 sha256。
//   專屬碼對應「老闆」嘅就出老闆頁（全部人嘅更表 + 假期結餘）。
//   資料由 NAS 更表推上嚟（POST /api/roster），見 ~/salon/salon_roster_push.py
export const BOSS = "老闆";
const WK = "日一二三四五六";
const DAYS = 60;

const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const md = d => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
const bare = n => n.replace(/[◆●]$/, "");
const num = v => (Math.round(v * 10) / 10).toString();

// 某人某日喺邊：{kind: work|off|leave|none, shop, tag}
function where(day, name) {
  if (day.leave.includes(name)) return { kind: "leave" };
  if (day.off.includes(name)) return { kind: "off" };
  for (const [shop, names] of Object.entries(day.s)) {
    const n = names.find(x => bare(x) === name);
    if (n) return { kind: "work", shop, tag: n.endsWith("◆") ? "頂班" : n.endsWith("●") ? "調更返工" : "" };
  }
  return { kind: "none" };
}

function place(w, home) {
  if (w.kind === "leave") return `<b class="leave">放假</b>`;
  if (w.kind === "off") return `<b class="off">休息</b>`;
  if (w.kind === "none") return `<b class="off">—</b>`;
  const away = w.tag === "頂班" || (home && w.shop !== home);
  return `<b class="${away ? "away" : "work"}">${esc(w.shop)}</b>${w.tag ? `<small>${w.tag}</small>` : ""}`;
}

function staffName(n, me) {
  const b = bare(n), tag = n.endsWith("◆") ? "（頂）" : n.endsWith("●") ? "（調）" : "";
  return `<span class="${b === me ? "me" : ""}">${esc(b)}${tag}</span>`;
}

const myList = (data, days, name) => `<ul>${days.map(day =>
  `<li class="${day.w === 0 || day.w === 6 ? "wkend" : ""}"><span class="d">${md(day.d)}<i>${WK[day.w]}</i></span><span class="p">${place(where(day, name), data.home[name])}</span></li>`
).join("")}</ul>`;

const allShops = (data, days, today, me) => days.map(day => `
  <section class="day"><h3>${md(day.d)}（${WK[day.w]}）${day.d === today ? "<em>今日</em>" : ""}</h3>
    <table>${data.shops.map(s => `<tr><th>${esc(s)}</th><td>${day.s[s].length ? day.s[s].map(n => staffName(n, me)).join("、") : `<span class="gap">冇人</span>`}</td></tr>`).join("")}
    ${day.off.length ? `<tr class="sub"><th>休息</th><td>${day.off.map(n => staffName(n, me)).join("、")}</td></tr>` : ""}
    ${day.leave.length ? `<tr class="sub"><th>放假</th><td>${day.leave.map(n => staffName(n, me)).join("、")}</td></tr>` : ""}</table>
  </section>`).join("");

// 已批假期（今日之後）
const upcoming = (data, name, today) => (data.leaves || [])
  .filter(l => l.who === name && l.to >= today)
  .map(l => l.from === l.to ? md(l.from) : `${md(l.from)}–${md(l.to)}`);

function balance(data, name) {
  const lb = data.leave_balance;
  if (!lb || !(name in lb.balance)) return null;
  return { v: lb.balance[name], asof: lb.label };
}

function leaveCard(data, name, today) {
  const b = balance(data, name), up = upcoming(data, name, today);
  if (!b && !up.length) return "";
  return `<div class="card leavecard">
    ${b ? `<div class="lbl">假期結餘（截至${esc(b.asof)}）</div><div class="big ${b.v < 0 ? "neg" : ""}">${num(b.v)} 日${b.v < 0 ? "<small>欠假</small>" : ""}</div>` : ""}
    ${up.length ? `<div class="mates">已批假期：${up.join("、")}</div>` : ""}
    <div class="mates">每月尾計完假期先會更新結餘</div></div>`;
}

const tabs = list => `<div class="tabs">${list.map(([id, label], i) =>
  `<button class="${i ? "" : "on"}" data-t="${id}">${label}</button>`).join("")}</div>`;

const TAB_JS = `<script>
document.querySelectorAll(".tabs").forEach(g=>g.querySelectorAll("button").forEach(b=>b.onclick=()=>{
  g.querySelectorAll("button").forEach(x=>{x.classList.toggle("on",x===b);const p=document.getElementById(x.dataset.t);if(p)p.hidden=x!==b});
}));
</script>`;

const page = (title, sub, body) => `<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>${esc(title)}</title>
<style>
:root{--teal:#2D8484;--deep:#13403f;--gold:#D8B860;--cream:#F7F4EC;--ink:#1d2b2b;--muted:#5a6b6b}
*{box-sizing:border-box}body{margin:0;background:var(--cream);color:var(--ink);font:16px/1.5 -apple-system,"PingFang TC","PingFang SC","Microsoft JhengHei",sans-serif}
header{background:var(--deep);color:var(--cream);padding:18px 16px 16px}
header h1{margin:0;font-size:1.35rem}header p{margin:4px 0 0;font-size:.8rem;opacity:.7}
main{max-width:640px;margin:0 auto;padding:14px 16px 40px}
.cards{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.card{background:#fff;border-radius:14px;padding:12px 14px;box-shadow:0 4px 14px rgba(19,64,63,.08)}
.leavecard{margin-top:10px}.neg{color:#c0562b}
.card .lbl{font-size:.85rem;color:var(--muted)}.card .big{font-size:1.4rem;margin-top:2px}
.card .big small{display:inline-block;margin-left:8px;font-size:.8rem;color:var(--muted);font-weight:400}.mates{font-size:.82rem;color:var(--muted);margin-top:4px}
.tabs{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0 10px}.tabs button{flex:1 1 auto;min-width:4.5em;padding:10px;border:1px solid var(--teal);background:#fff;color:var(--teal);border-radius:10px;font-size:1rem}
.tabs button.on{background:var(--teal);color:#fff}.tabs.names button{flex:0 0 auto;padding:6px 12px;font-size:.95rem}
ul{list-style:none;margin:0;padding:0;background:#fff;border-radius:14px;overflow:hidden}
li{display:flex;align-items:center;padding:10px 14px;border-bottom:1px solid #eee}li.wkend{background:#faf7ef}
li .d{width:5.5em;font-variant-numeric:tabular-nums}li .d i{font-style:normal;color:var(--muted);margin-left:6px}
li .p small{margin-left:8px;font-size:.8rem;color:var(--muted)}
b.work{color:var(--deep)}b.away{color:#1f5fa8}b.off{color:#999;font-weight:500}b.leave{color:#c0562b}
.day{background:#fff;border-radius:14px;padding:10px 14px;margin-bottom:10px}.day h3{margin:0 0 6px;font-size:1rem}
.day h3 em{font-style:normal;font-size:.75rem;background:var(--gold);color:var(--deep);border-radius:6px;padding:1px 6px;margin-left:6px}
table{width:100%;border-collapse:collapse;font-size:.95rem}th{text-align:left;width:5em;color:var(--muted);font-weight:500;padding:3px 0;vertical-align:top}td{padding:3px 0}
tr.sub th,tr.sub td{font-size:.85rem;color:var(--muted)}.me{background:#fdf1c7;border-radius:4px;padding:0 3px;font-weight:700;color:var(--ink)}.gap{color:#c00;font-weight:700}
.bal{background:#fff;border-radius:14px;padding:6px 14px}.bal th,.bal td{padding:8px 0;border-bottom:1px solid #eee}.bal td.n{text-align:right;font-weight:700;font-variant-numeric:tabular-nums;width:4em}
.note{font-size:.78rem;color:var(--muted);margin-top:16px}
</style></head><body>
<header><h1>${esc(title)}</h1><p>${sub}</p></header>
<main>${body}</main>${TAB_JS}</body></html>`;

const updated = data => `更新：${esc(data.updated.replace("T", " ").slice(0, 16))}`;

export function rosterPage(data, name, today) {
  if (name === BOSS) return bossPage(data, today);
  const home = data.home[name] || null;
  const days = data.days.filter(d => d.d >= today).slice(0, DAYS);
  const card = (day, label) => {
    if (!day) return "";
    const w = where(day, name);
    const mates = w.kind === "work" ? day.s[w.shop].filter(x => bare(x) !== name) : [];
    return `<div class="card"><div class="lbl">${label} ${md(day.d)}（${WK[day.w]}）</div>
      <div class="big">${place(w, home)}</div>
      ${mates.length ? `<div class="mates">同你一齊：${mates.map(x => esc(bare(x))).join("、")}</div>` : ""}</div>`;
  };
  return page(`上手屋更表 ‧ ${name}`, `${updated(data)}　${home ? `本店：${esc(home)}` : "頂班師傅"}`, `
<div class="cards">${card(days[0], "今日")}${card(days[1], "明日")}</div>
${leaveCard(data, name, today)}
${tabs([["mine", "我嘅更"], ["all", "全店更表"]])}
<div id="mine">${myList(data, days, name)}</div>
<div id="all" hidden>${allShops(data, days, today, name)}</div>
<p class="note">藍色＝去其他舖　（頂）＝頂班　（調）＝休息日調咗返工<br>以呢頁為準；有問題搵老闆。呢條連結係你專用，唔好轉發。</p>`);
}

function bossPage(data, today) {
  const days = data.days.filter(d => d.d >= today).slice(0, DAYS);
  const names = Object.keys(data.home);
  const lb = data.leave_balance;
  const balRows = names.map(n => {
    const b = balance(data, n), up = upcoming(data, n, today);
    return `<tr><th>${esc(n)}</th><td>${esc(data.home[n] || "頂班")}${up.length ? `<br><small class="mates">已批：${up.join("、")}</small>` : ""}</td>
      <td class="n ${b && b.v < 0 ? "neg" : ""}">${b ? num(b.v) : "—"}</td></tr>`;
  }).join("");
  const total = lb ? num(names.reduce((s, n) => s + (lb.balance[n] || 0), 0)) : "—";
  return page("上手屋更表 ‧ 老闆", `${updated(data)}　全部員工`, `
${tabs([["all", "全店更表"], ["bal", "假期結餘"], ["person", "個人更表"]])}
<div id="all">${allShops(data, days, today, null)}</div>
<div id="bal" hidden>
  <p class="mates">${lb ? `截至${esc(lb.label)}（已核對）；每月尾計完假期先更新` : "未有假期結餘資料"}</p>
  <div class="bal"><table>${balRows}<tr><th>合計</th><td></td><td class="n">${total}</td></tr></table></div>
</div>
<div id="person" hidden>
  ${tabs(names.map(n => ["p-" + n, esc(n)])).replace('class="tabs"', 'class="tabs names"')}
  ${names.map((n, i) => `<div id="p-${esc(n)}" ${i ? "hidden" : ""}>${myList(data, days, n)}</div>`).join("")}
</div>
<p class="note">呢條係老闆專用連結，睇到全部員工嘅更表同假期結餘，唔好轉發俾員工。</p>`);
}

export const goneHtml = `<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="robots" content="noindex"><title>連結無效</title></head>
<body style="font:16px -apple-system,sans-serif;padding:40px 20px;text-align:center;color:#1d2b2b;background:#F7F4EC"><h2>連結無效或已停用</h2><p>請聯絡老闆攞新連結。</p></body></html>`;
