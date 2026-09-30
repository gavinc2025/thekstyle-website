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

// 上個月假期點變：格式跟老闆發俾同事嘅「【上手屋 8月假期結餘】」訊息
function leaveDetail(data, name) {
  const lb = data.leave_balance, d = lb && lb.detail && lb.detail[name];
  if (!d) return "";
  const m = lb.month, pm = `${((parseInt(m) + 10) % 12) + 1}月`;
  const signed = v => (v > 0 ? "+" : v < 0 ? "−" : "") + num(Math.abs(v));
  const rows = [
    ["例假", `逢星期${esc(d.weekday)}`],
    [`${m}應得例假`, `${num(d.due)} 日`],
    [`${m}實際放假`, `${num(d.taken)} 日`],
    ["入職日期", esc(d.joined || "")],
    ["年假", d.grant ? `+${num(d.grant)} 日${d.anniv ? `（${esc(String(d.anniv).replace("★", ""))}）` : ""}` : "無"],
    ...(d.adj ? [["其他調整", `${signed(d.adj)} 日`]] : []),
    ["上月結餘", `${num(d.start)} 日<small class="mates">（${pm}尾）</small>`],
    ["本月結餘", `<b class="${d.end < 0 ? "neg" : ""}">${num(d.end)} 日</b><small class="mates">（${m}尾）</small>`],
    ...(d.note ? [["備註", esc(d.note)]] : []),
    [`${m}放假`, esc(d.days || "—")],
  ];
  return `<div class="ld"><div class="ldt">【上手屋 ${esc(m)}假期結餘】</div>
    <table>${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join("")}</table></div>`;
}

// 上月工資：格式跟老闆發俾同事嘅「【上手屋 9月工資】」訊息；員工只睇到自己
const money = v => Number(v || 0).toLocaleString("en-US");
function payTable(data, name) {
  const pr = data.payroll, p = pr && pr.detail && pr.detail[name];
  if (!p) return "";
  const rows = [["單剪數目", String(p.cuts)], ["底薪", money(p.base)], ["單剪拆帳", money(p.split)],
    [`假期上班${pr.holiday_note ? `（${esc(pr.holiday_note)}）` : ""}`, money(p.holiday)], ["小費", money(p.tips)],
    ["大頭拆帳", money(p.bighead)], ["獎金", money(p.bonus)], ["合計", `<b>${money(p.total)}</b>`]];
  return `<div class="ld"><div class="ldt">【上手屋 ${esc(pr.month)}工資】</div>
    <table>${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join("")}</table></div>`;
}
function payCard(data, name) {
  const t = payTable(data, name);
  return t ? `<div class="card leavecard"><details><summary>${esc(data.payroll.month)}工資</summary>${t}</details>
    <div class="mates">工資或者假期有唔啱，歡迎打電話問老闆</div></div>` : "";
}

function leaveCard(data, name, today) {
  const b = balance(data, name), up = upcoming(data, name, today);
  if (!b && !up.length) return "";
  return `<div class="card leavecard">
    ${b ? `<div class="lbl">假期結餘（截至${esc(b.asof)}）</div><div class="big ${b.v < 0 ? "neg" : ""}">${num(b.v)} 日${b.v < 0 ? "<small>欠假</small>" : ""}</div>` : ""}
    ${up.length ? `<div class="mates">已批假期：${up.join("、")}</div>` : ""}
    ${b && leaveDetail(data, name) ? `<details open><summary>${esc(data.leave_balance.month)}點計</summary>${leaveDetail(data, name)}</details>` : ""}
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
.bal{background:#fff;border-radius:14px;padding:4px 14px}
.brow{border-bottom:1px solid #eee}.brow summary,.brow.tot{display:flex;align-items:center;gap:8px;padding:10px 0;cursor:pointer;list-style:none}
.brow summary::-webkit-details-marker{display:none}.bn{width:4.2em;font-weight:600}.bs{flex:1}.bs small{display:block}
.brow .n{font-weight:700;font-variant-numeric:tabular-nums;min-width:3em;text-align:right}.brow.tot{border:0;cursor:default}
.leavecard details summary{margin-top:6px;color:var(--teal);font-size:.9rem;cursor:pointer}
.ld{background:#faf7ef;border-radius:10px;padding:10px 12px;margin:8px 0 10px}.ldt{font-weight:700;margin-bottom:4px}
.ld th{width:7.5em;font-size:.88rem}.ld small{margin-left:4px}.ld td{font-size:.92rem}
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
${payCard(data, name)}
${tabs([["mine", "我嘅更"], ["all", "全店更表"]])}
<div id="mine">${myList(data, days, name)}</div>
<div id="all" hidden>${allShops(data, days, today, name)}</div>
<p class="note">藍色＝去其他舖　（頂）＝頂班　（調）＝休息日調咗返工<br>以呢頁為準；工資、假期或者更表有問題，歡迎打電話問老闆。<br>呢條連結係你專用，有你嘅工資資料，唔好轉發俾其他人。</p>`);
}

function bossPage(data, today) {
  const days = data.days.filter(d => d.d >= today).slice(0, DAYS);
  const names = Object.keys(data.home);
  const lb = data.leave_balance;
  const balRows = names.map(n => {
    const b = balance(data, n), up = upcoming(data, n, today), det = leaveDetail(data, n);
    return `<details class="brow"><summary><span class="bn">${esc(n)}</span><span class="bs">${esc(data.home[n] || "頂班")}${up.length ? `<small class="mates">已批：${up.join("、")}</small>` : ""}</span>
      <span class="n ${b && b.v < 0 ? "neg" : ""}">${b ? num(b.v) : "—"}</span></summary>${det || `<p class="mates">冇明細</p>`}</details>`;
  }).join("");
  const total = lb ? num(names.reduce((s, n) => s + (lb.balance[n] || 0), 0)) : "—";
  return page("上手屋更表 ‧ 老闆", `${updated(data)}　全部員工`, `
${tabs([["all", "全店更表"], ["bal", "假期結餘"], ["pay", "工資"], ["person", "個人更表"]])}
<div id="all">${allShops(data, days, today, null)}</div>
<div id="bal" hidden>
  <p class="mates">${lb ? `截至${esc(lb.label)}（已核對）；每月尾計完假期先更新` : "未有假期結餘資料"}</p>
  <div class="bal">${balRows}<div class="brow tot"><span class="bn">合計</span><span class="bs"></span><span class="n">${total}</span></div></div>
  <p class="mates">撳個名睇佢上個月點計</p>
</div>
<div id="pay" hidden>
  ${data.payroll ? `<p class="mates">${esc(data.payroll.month)}工資（${esc(data.payroll.source || "")}）；撳個名睇細項</p>
  <div class="bal">${names.filter(n => data.payroll.detail[n]).map(n => `<details class="brow"><summary><span class="bn">${esc(n)}</span><span class="bs">${esc(data.home[n] || "頂班")}</span>
    <span class="n">${money(data.payroll.detail[n].total)}</span></summary>${payTable(data, n)}</details>`).join("")}
    <div class="brow tot"><span class="bn">合計</span><span class="bs"></span><span class="n">${money(names.reduce((s, n) => s + ((data.payroll.detail[n] || {}).total || 0), 0))}</span></div></div>` : `<p class="mates">未有工資資料</p>`}
</div>
<div id="person" hidden>
  ${tabs(names.map(n => ["p-" + n, esc(n)])).replace('class="tabs"', 'class="tabs names"')}
  ${names.map((n, i) => `<div id="p-${esc(n)}" ${i ? "hidden" : ""}>${myList(data, days, n)}</div>`).join("")}
</div>
<p class="note">呢條係老闆專用連結，睇到全部員工嘅更表、假期結餘同工資，唔好轉發俾員工。</p>`);
}

export const goneHtml = `<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="robots" content="noindex"><title>連結無效</title></head>
<body style="font:16px -apple-system,sans-serif;padding:40px 20px;text-align:center;color:#1d2b2b;background:#F7F4EC"><h2>連結無效或已停用</h2><p>請聯絡老闆攞新連結。</p></body></html>`;
