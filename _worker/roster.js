// 員工更表頁：GET /r/<專屬碼>
//   每個師傅一條專屬連結（唔使密碼），條連結本身就係身份；KV 只存專屬碼嘅 sha256。
//   專屬碼對應「老闆」嘅就出老闆頁（全部人嘅更表 + 假期結餘）。
//   資料由 NAS 更表推上嚟（POST /api/roster），見 ~/salon/salon_roster_push.py
import { REPORT_CSS } from "./report.js";
import { WORKS_CSS } from "./works.js";
import { PROMO_CSS } from "./promo.js";
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


// ===== 當月業績（10/14 用戶：員工實時睇自己做成點；有排名但唔顯示其他人數字；唔顯示金額，海上居顯示大頭工銀） =====
const dow = d => new Date(d + "T00:00:00Z").getUTCDay();
const isWE = d => dow(d) === 0 || dow(d) === 6;
const avgOf = a => a.length ? a.reduce((s, [, n]) => s + n, 0) / a.length : 0;
function perfStats(data, name, today) {
  const P = data.perf, me = P && P.people && P.people[name];
  if (!me) return null;
  const [y, m] = P.month.split("-").map(Number), last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const monthEnd = `${P.month}-${String(last).padStart(2, "0")}`;
  const worked = Object.entries(me.days).filter(([, n]) => n > 0);
  const all = avgOf(worked), we = avgOf(worked.filter(([d]) => isWE(d))), wd = avgOf(worked.filter(([d]) => !isWE(d)));
  // 仲要返幾多日（按更表）：今日未報就連今日計
  const rem = data.days.filter(d => d.d >= today && d.d <= monthEnd && d.d.startsWith(P.month) && !(d.d === today && me.days[today] != null)
    && where(d, name).kind === "work");
  const remWE = rem.filter(d => isWE(d.d)).length, remWD = rem.length - remWE;
  const proj = Math.round(me.total + (wd || all) * remWD + (we || all) * remWE);
  const elapsed = Math.min(+today.slice(8, 10) - (me.days[today] != null ? 0 : 1), last);
  const best = worked.reduce((b, x) => (!b || x[1] > b[1] ? x : b), null);
  return { P, me, last, worked, all, we, wd, rem, remWE, remWD, proj, off: Math.max(0, elapsed - worked.length), best };
}
function perfCard(data, name, today) {
  const s = perfStats(data, name, today);
  if (!s) return "";
  const { P, me } = s, vt = P.verified_through || "", mo = +P.month.slice(5), pmo = +P.prev_month.slice(5);
  const max = Math.max(1, ...Object.values(me.days));
  const rows = [];
  for (let i = 1; i <= Math.max(P.upto, +today.slice(8, 10) * (today.startsWith(P.month) ? 1 : 0)); i++) {
    const d = `${P.month}-${String(i).padStart(2, "0")}`, n = me.days[d];
    if (d > today) break;
    const day = data.days.find(x => x.d === d), w = day ? where(day, name) : null;
    const tag = "";   // 10/14 用戶：已核／待核暫時唔顯示
    const big = me.bighead && me.bighead[d] ? `<small>大頭 $${me.bighead[d]}</small>` : "";
    rows.push(`<li class="${isWE(d) ? "wkend" : ""}"><span class="d">${md(d)}<i>${WK[dow(d)]}</i></span>${n != null
      ? `<span class="bar"><b style="width:${Math.round(n / max * 100)}%"></b></span><span class="n">${n}</span>${tag}${big}`
      : `<span class="bar none">${w && w.kind === "leave" ? "放假" : w && w.kind === "off" ? "休息" : d === today ? "今日未報" : "冇報數"}</span>`}</li>`);
  }
  const diff = me.total - me.prev_same;
  const need = me.prev_total > me.total && s.rem.length ? Math.ceil((me.prev_total - me.total) / s.rem.length) : 0;
  const bigTot = me.bighead ? Object.values(me.bighead).reduce((a, b) => a + b, 0) : 0;
  const tips = [
    `本月返咗 <b>${s.worked.length}</b> 日，休息／放假 <b>${s.off}</b> 日；平均每日 <b>${num(s.all)}</b> 剪`,
    s.we && s.wd ? `星期六日平均 <b>${num(s.we)}</b> 剪，平日 <b>${num(s.wd)}</b> 剪` : "",
    `${pmo}月同期（1–${P.upto} 號）：${me.prev_same} 剪，${diff >= 0 ? `今個月<b class="up">多 ${diff}</b>` : `今個月<b class="neg">少 ${-diff}</b>`}`,
    s.rem.length ? `按更表仲要返 <b>${s.rem.length}</b> 日，其中星期六日 <b>${s.remWE}</b> 日（星期六日客多）` : `今個月按更表已經冇更`,
    need ? `想追過 ${pmo}月全月（${me.prev_total} 剪），之後每日要做 <b>${need}</b> 剪` : me.prev_total ? `已經超過 ${pmo}月全月（${me.prev_total} 剪）👍` : "",
    s.best ? `今個月最好一日：${md(s.best[0])}（${WK[dow(s.best[0])]}）${s.best[1]} 剪` : "",
    bigTot ? `大頭工銀累計：<b>$${bigTot.toLocaleString("en-US")}</b>` : "",
  ].filter(Boolean);
  return `<div class="card leavecard perf">
    <div class="lbl">我 ${mo} 月業績（報數到 ${md(`${P.month}-${String(P.upto).padStart(2, "0")}`)}）</div>
    <div class="pgrid"><div><div class="big">${me.total}<small>剪</small></div><div class="mates">累計</div></div>
      <div><div class="big">≈ ${s.proj}<small>剪</small></div><div class="mates">按而家速度月尾大約</div></div></div>
    <ul class="ptips">${tips.map(t => `<li>${t}</li>`).join("")}</ul>
    <details><summary>每日明細</summary><ul class="pdays">${rows.join("")}</ul></details>
    <div class="mates">交咗報數幾分鐘內更新。</div></div>`;
}
function perfBoss(data, today) {
  const P = data.perf;
  if (!P) return `<p class="mates">未有業績資料</p>`;
  const names = Object.keys(P.people).filter(n => P.people[n].total || P.people[n].prev_same)
    .sort((a, b) => (P.people[a].rank || 99) - (P.people[b].rank || 99));
  return `<p class="mates">${+P.month.slice(5)} 月報數到 ${P.upto} 號；員工頁只見自己嘅數（冇排名）</p>
  <div class="ptab"><table><tr><th>名</th><th>剪數</th><th>日數</th><th>平均</th><th>上月同期</th><th>月尾≈</th></tr>
  ${names.map(n => { const s = perfStats(data, n, today) || {}, me = P.people[n];
    const big = me.bighead ? `<div class="mates">大頭 $${Object.values(me.bighead).reduce((a, b) => a + b, 0).toLocaleString("en-US")}</div>` : "";
    const d = me.total - me.prev_same;
    return `<tr><td>${me.rank}. ${esc(n)}${big}</td><td><b>${me.total}</b></td><td>${(s.worked || []).length}</td><td>${num(s.all || 0)}</td><td>${me.prev_same}<small class="${d >= 0 ? "up" : "neg"}">${d >= 0 ? "+" : ""}${d}</small></td><td>${s.proj ?? "—"}</td></tr>`; }).join("")}
  <tr class="tot"><td>合計</td><td><b>${names.reduce((a, n) => a + P.people[n].total, 0)}</b></td><td></td><td></td><td>${names.reduce((a, n) => a + P.people[n].prev_same, 0)}</td><td></td></tr></table></div>`;
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
.perf .pgrid{display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin:6px 0}.perf .pgrid .big{font-size:1.25rem}.perf .pgrid .big small{margin-left:3px}
.ptips{margin:6px 0;padding:0;list-style:none;font-size:.88rem}.ptips li{display:block;margin:4px 0;padding:0 0 0 12px;border:0;position:relative}.ptips li:before{content:'•';position:absolute;left:0;color:var(--teal)}.up{color:#2b8a3e}
.pdays{list-style:none;margin:6px 0;padding:0;font-size:.85rem}.pdays li{display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px solid #eee}.pdays li.wkend{background:#fbf6e6}
.pdays .d{width:4.4em;white-space:nowrap;flex:none}.pdays .d i{font-style:normal;color:var(--muted);margin-left:2px}.pdays .bar{flex:1;height:10px;background:#eef3f2;border-radius:5px;overflow:hidden}.pdays .bar b{display:block;height:100%;background:var(--teal)}
.pdays .bar.none{background:none;height:auto;color:var(--muted);font-size:.8rem}.pdays .n{width:2.2em;text-align:right;font-weight:600}.pdays i.ok,.pdays i.pend{font-style:normal;font-size:.72rem;padding:0 5px;border-radius:8px}
.pdays i.ok{background:#e3f2e6;color:#2b8a3e}.pdays i.pend{background:#fdf0dc;color:#b7791f}.pdays small{color:var(--muted);font-size:.72rem}
.ptab{overflow-x:auto}.ptab table{width:100%;border-collapse:collapse;font-size:.85rem;background:#fff;border-radius:10px}.ptab th,.ptab td{padding:6px 5px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap}.ptab th:first-child,.ptab td:first-child{text-align:left}.ptab small{margin-left:3px;font-size:.72rem}.ptab .tot td{font-weight:700}
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
${REPORT_CSS}
${WORKS_CSS}
${PROMO_CSS}
</style></head><body>
<header><h1>${esc(title)}</h1><p>${sub}</p></header>
<main>${body}</main>${TAB_JS}</body></html>`;

const updated = data => `更新：${esc(data.updated.replace("T", " ").slice(0, 16))}`;

export function rosterPage(data, name, today, extra = "", bisheng = "", test = false) {
  if (name === BOSS) return bossPage(data, today, extra, bisheng, test);
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
${extra}
${perfCard(data, name, today)}
${leaveCard(data, name, today)}
${payCard(data, name)}
${tabs([["mine", "我嘅更"], ["all", "全店更表"]])}
<div id="mine">${myList(data, days, name)}</div>
<div id="all" hidden>${allShops(data, days, today, name)}</div>
<p class="note">藍色＝去其他舖　（頂）＝頂班　（調）＝休息日調咗返工<br>以呢頁為準；工資、假期或者更表有問題，歡迎打電話問老闆。<br>呢條連結係你專用，有你嘅工資資料，唔好轉發俾其他人。</p>`);
}

function bossPage(data, today, works = "", bisheng = "", test = false) {
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
${tabs([...(test ? [["bisheng", "必勝卡"]] : []), ["all", "全店更表"], ["works", "作品"], ...(test ? [] : [["bisheng", "必勝卡"]]), ["perf", "業績"], ["bal", "假期結餘"], ["pay", "工資"], ["person", "個人更表"]])}
<div id="all"${test ? " hidden" : ""}>${allShops(data, days, today, null)}</div>
<div id="works" hidden>${works}</div>
<div id="bisheng"${test ? "" : " hidden"}>${bisheng}</div>
<div id="perf" hidden>${perfBoss(data, today)}</div>
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
