// 員工網頁報數（2026-10 起）：員工專屬連結頁「今日報數」→ POST /api/report → KV
//   NAS 容器 salon-report-sync 每分鐘拉新報數 → 寫入 DB（同 TG 報數 bot 一樣嘅 daily_reports／report_payments）
//   → 發 TG 報數通知頻道 → POST /api/report-ack 標「已入數」。
// KV：rep:<日期>:<舖>:<名> = 一份報數（metadata {rev}）；repidx:<日期> = {"舖:名": rev}；repack:<日期> = {"舖:名": {rid, rev}}
//   測試模式（連結加 ?test=1）一律存日期 2099-12-31，NAS 入 DB 都係呢個日期、raw 前面加「[測試]」，試完 purge。
export const TEST_DATE = "2099-12-31";
const PRICE = { 消防: 80, 海上居: 80, 澳門大學: 54 };
const NORMAL = { 澳門大學: 60 };   // 澳大「正常收費」每剪 $60（學校卡 $54）
export const price = shop => PRICE[shop] || 60;
// 欄：個人單剪必填；其餘留空＝冇
const F = ["p", "t", "mp", "cash", "icbc", "card", "tip", "big", "normal"];
const SHOP_F = ["t", "mp", "cash", "icbc", "card", "normal"];   // 全店數：同舖多人時只需一個人填

const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});
const addDays = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const bare = n => n.replace(/[◆●]$/, "");

// 核對（員工交數時即刻睇；NAS 入數時再用全舖資料核一次）
export function checks(shop, r, mates = []) {
  const f = r.f, w = [], pr = price(shop);
  if (f.t != null && f.p > f.t) w.push(`個人 ${f.p} 多過全店 ${f.t}`);
  if (f.p > 80) w.push(`個人 ${f.p} 剪好多，請再睇吓`);
  if (f.mp != null && f.t != null) {
    const nrm = f.normal || 0;
    const exp = f.t * pr + nrm * ((NORMAL[shop] || pr) - pr);
    const got = f.mp + ((f.cash || 0) + (f.icbc || 0) + (f.card || 0)) * pr;
    if (exp !== got) w.push(`全店 ${f.t}×$${pr}${nrm ? `（正常收費 ${nrm}）` : ""}＝$${exp}，但澳門通 $${f.mp}＋現金/工銀/消卡 ${(f.cash || 0) + (f.icbc || 0) + (f.card || 0)} 剪×$${pr}＝$${got}（差 $${exp - got}）`);
  }
  const t = f.t != null ? f.t : (mates.find(m => m.f.t != null) || {}).f?.t;
  if (t != null && mates.length) {
    const sum = f.p + mates.reduce((s, m) => s + m.f.p, 0);
    if (sum > t) w.push(`同事加埋個人 ${sum} 多過全店 ${t}`);
  }
  return w;
}

async function dayReports(env, date, shop) {
  const idx = (await env.STATUS.get(`repidx:${date}`, "json")) || {};
  const keys = Object.keys(idx).filter(k => !shop || k.startsWith(shop + ":"));
  const out = await Promise.all(keys.map(k => env.STATUS.get(`rep:${date}:${k}`, "json")));
  return out.filter(Boolean);
}

// 員工頁要用嘅資料：自己今日／昨日（或測試日）報咗咩、同舖同事填咗嘅全店數、入數狀態
export async function reportState(env, name, today, test) {
  const dates = test ? [TEST_DATE] : [today, addDays(today, -1)];
  const st = {};
  for (const d of dates) {
    const [reps, ack] = await Promise.all([dayReports(env, d), env.STATUS.get(`repack:${d}`, "json")]);
    for (const r of reps) {
      const k = `${d}:${r.shop}`, a = (ack || {})[`${r.shop}:${r.name}`];
      st[k] = st[k] || { mine: null, shopBy: null, shopF: null };
      if (r.name === name) st[k].mine = { f: r.f, note: r.note || "", at: r.at, rev: r.rev, ok: !!(a && a.rev === r.rev), rid: a && a.rid };
      else if (SHOP_F.some(x => r.f[x] != null) && (!st[k].shopAt || r.at > st[k].shopAt)) {
        st[k].shopBy = r.name; st[k].shopAt = r.at; st[k].shopF = Object.fromEntries(SHOP_F.map(x => [x, r.f[x]]));
      }
    }
  }
  return st;
}

// POST /api/report  body {code, date, shop, f:{...}, note, test}；專屬碼＝身份
export async function postReport(request, env, data, name, today, body) {
  const test = !!body.test;
  const okDates = [today, addDays(today, -1)];
  const date = test ? TEST_DATE : body.date;
  if (!test && !okDates.includes(date)) return json({ error: "日期只可以係今日或者昨日" }, 400);
  if (!data.shops.includes(body.shop)) return json({ error: "揀間舖先" }, 400);
  const f = {};
  for (const k of F) {
    const v = body.f && body.f[k];
    if (v === null || v === undefined || v === "") { f[k] = null; continue; }
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 99999) return json({ error: `「${k}」要填整數` }, 400);
    f[k] = n;
  }
  if (f.p == null) return json({ error: "個人單剪一定要填" }, 400);
  if (body.shop !== "海上居") f.big = null;
  if (body.shop !== "澳門大學") f.normal = null;
  const key = `${body.shop}:${name}`;
  const prev = await env.STATUS.get(`rep:${date}:${key}`, "json");
  const rec = {
    date, shop: body.shop, name, f, note: String(body.note || "").slice(0, 200), test,
    at: new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 19).replace("T", " "),
    rev: (prev ? prev.rev : 0) + 1,
  };
  const ttl = { expirationTtl: 60 * 60 * 24 * 45 };
  await env.STATUS.put(`rep:${date}:${key}`, JSON.stringify(rec), { ...ttl, metadata: { rev: rec.rev } });
  const idx = (await env.STATUS.get(`repidx:${date}`, "json")) || {};
  idx[key] = rec.rev;
  await env.STATUS.put(`repidx:${date}`, JSON.stringify(idx), ttl);
  const mates = (await dayReports(env, date, body.shop)).filter(r => r.name !== name);
  return json({ ok: true, rev: rec.rev, date, warns: checks(body.shop, rec, mates) });
}

// NAS 用（Bearer roster token）
//   GET  /api/reports?date=D            → {date, idx}（只 index，好平）
//   GET  /api/reports?date=D&keys=a,b   → {date, reports:[...]}
//   GET  /api/reports?date=D&sweep=1    → {date, idx}（用 KV list 補返 index 甩咗嘅）
//   POST /api/report-ack {date, acks:{key:{rid,rev}}}
//   POST /api/report-purge {date: 2099-12-31}  淨係刪得測試日
export async function nasApi(request, env, url) {
  if (url.pathname === "/api/reports" && request.method === "GET") {
    const date = url.searchParams.get("date") || "";
    if (!/^\d{4}-\d\d-\d\d$/.test(date)) return json({ error: "date" }, 400);
    if (url.searchParams.get("keys")) {
      const keys = url.searchParams.get("keys").split(",").slice(0, 50);
      const reps = await Promise.all(keys.map(k => env.STATUS.get(`rep:${date}:${k}`, "json")));
      return json({ date, reports: reps.filter(Boolean) });
    }
    if (url.searchParams.get("sweep")) {
      const idx = {};
      let cursor;
      do {
        const r = await env.STATUS.list({ prefix: `rep:${date}:`, cursor });
        for (const k of r.keys) idx[k.name.slice(`rep:${date}:`.length)] = (k.metadata || {}).rev || 0;
        cursor = r.list_complete ? null : r.cursor;
      } while (cursor);
      return json({ date, idx });
    }
    return json({ date, idx: (await env.STATUS.get(`repidx:${date}`, "json")) || {} });
  }
  if (url.pathname === "/api/report-ack" && request.method === "POST") {
    const b = await request.json().catch(() => null);
    if (!b || !/^\d{4}-\d\d-\d\d$/.test(b.date || "") || typeof b.acks !== "object") return json({ error: "bad" }, 400);
    const cur = (await env.STATUS.get(`repack:${b.date}`, "json")) || {};
    Object.assign(cur, b.acks);
    await env.STATUS.put(`repack:${b.date}`, JSON.stringify(cur), { expirationTtl: 60 * 60 * 24 * 45 });
    return json({ ok: true, n: Object.keys(cur).length });
  }
  if (url.pathname === "/api/report-purge" && request.method === "POST") {
    const b = await request.json().catch(() => null);
    if (!b || b.date !== TEST_DATE) return json({ error: "只可以刪測試日" }, 400);
    const r = await env.STATUS.list({ prefix: `rep:${TEST_DATE}:` });
    await Promise.all(r.keys.map(k => env.STATUS.delete(k.name)));
    await env.STATUS.delete(`repidx:${TEST_DATE}`);
    await env.STATUS.delete(`repack:${TEST_DATE}`);
    return json({ ok: true, deleted: r.keys.length });
  }
  return null;
}

// 員工頁「報數」卡（server 出 HTML，表單用 fetch 交）
export function reportCard(data, name, today, st, test, hour) {
  const dayOf = d => data.days.find(x => x.d === d);
  const myShop = d => {
    const day = dayOf(d);
    if (!day) return null;
    for (const [s, ns] of Object.entries(day.s)) if (ns.some(x => bare(x) === name)) return s;
    return null;
  };
  // 每間舖嗰日係咪得佢一個（得一個就唔使填全店客流）
  const alone = d => {
    const day = dayOf(d), o = {};
    if (day) for (const [s, ns] of Object.entries(day.s)) o[s] = ns.filter(x => bare(x) !== name).length === 0;
    return o;
  };
  const yest = addDays(today, -1);
  const defDate = test ? TEST_DATE : (hour < 5 ? yest : today);
  const cfg = {
    test, today, yest, name, defDate, shops: data.shops, st,
    def: { [today]: myShop(today), [yest]: myShop(yest), [TEST_DATE]: myShop(today) },
    alone: { [today]: alone(today), [yest]: alone(yest), [TEST_DATE]: alone(today) },
    price: Object.fromEntries(data.shops.map(s => [s, price(s)])),
  };
  const md = d => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
  const num = (id, label, hint = "") => `<label class="rf" id="w-${id}"><span>${label}${hint ? `<small>${hint}</small>` : ""}</span><input id="f-${id}" type="number" inputmode="numeric" min="0" step="1"></label>`;
  return `<div class="card repcard" id="report">
  <div class="lbl">報數${test ? ` <b class="leave">測試模式（唔會入真數）</b>` : ""}</div>
  <div class="rrow">
    ${test ? `<span class="mates">測試日 ${TEST_DATE}</span>` : `<select id="r-date"><option value="${today}">今日 ${md(today)}</option><option value="${yest}">昨日 ${md(yest)}</option></select>`}
    <select id="r-shop">${data.shops.map(s => `<option>${esc(s)}</option>`).join("")}</select>
  </div>
  <div id="r-status" class="mates"></div>
  ${num("p", "個人單剪", "（必填）")}
  <div class="rsec" id="shopsec"><div class="rsh">全店數 <small id="shopnote"></small></div>
    ${num("t", "全店客流")}${num("mp", "澳門通金額 $")}${num("cash", "現金剪數")}${num("icbc", "工銀剪數")}${num("card", "消卡剪數")}${num("normal", "正常收費剪數", "（$60 嗰啲）")}
  </div>
  ${num("big", "大頭工銀 $")}${num("tip", "小費 $")}
  <label class="rf"><span>備註</span><input id="f-note" type="text" maxlength="200" placeholder="可以唔填"></label>
  <button id="r-send" class="rbtn">交數</button>
  <div id="r-msg"></div>
  <div class="mates">交咗想改：再填過再交就得，以最後一次為準。網頁交唔到就照舊打字俾老闆。</div>
</div>
<script>
(()=>{const C=${JSON.stringify(cfg).replace(/</g, "\\u003c")};
const $=id=>document.getElementById(id),F=["p","t","mp","cash","icbc","card","tip","big","normal"],SF=["t","mp","cash","icbc","card","normal"];
const date=()=>C.test?"${TEST_DATE}":$("r-date").value;
if(!C.test)$("r-date").value=C.defDate;
const ds=C.def[date()];if(ds)$("r-shop").value=ds;
function load(){const d=date(),s=$("r-shop").value,k=d+":"+s,x=C.st[k]||{},al=(C.alone[d]||{})[s]!==false;
  $("w-big").hidden=s!=="海上居";$("w-normal").hidden=s!=="澳門大學";$("w-t").hidden=al;
  $("shopnote").textContent=al?"（得你一個，照填）":x.shopBy&&!(x.mine&&SF.some(f=>x.mine.f[f]!=null))?"（"+x.shopBy+" 已經填咗，唔使再填）":"（同舖多過一個人，只需一位同事填）";
  const m=x.mine;F.forEach(f=>$("f-"+f).value=m&&m.f[f]!=null?m.f[f]:"");$("f-note").value=m?m.note:"";
  $("r-status").innerHTML=m?(m.ok?"✅ 已入數（"+m.at.slice(11,16)+" 交）":"⏳ 已交（"+m.at.slice(11,16)+"），等入數")+"　可以改":(x.shopBy?x.shopBy+" 已交全店數：客流 "+(x.shopF.t??"-")+"、澳門通 $"+(x.shopF.mp??"-"):"未交");
  $("r-msg").innerHTML="";}
$("r-shop").onchange=load;if(!C.test)$("r-date").onchange=()=>{const d=C.def[date()];if(d)$("r-shop").value=d;load()};load();
$("r-send").onclick=async()=>{const s=$("r-shop").value,d=date(),al=(C.alone[d]||{})[s]!==false,f={};
  F.forEach(k=>{const v=$("f-"+k).value.trim();f[k]=v===""?null:+v});
  if(f.p==null){$("r-msg").innerHTML='<p class="rerr">個人單剪一定要填</p>';return}
  if(al&&f.t==null)f.t=f.p;
  $("r-send").disabled=true;$("r-msg").textContent="交緊…";
  try{const code=location.pathname.split("/")[2];
    const r=await fetch("/api/report",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({code,date:d,shop:s,f,note:$("f-note").value,test:C.test})});
    const j=await r.json();
    if(!r.ok)throw new Error(j.error||r.status);
    C.st[d+":"+s]=Object.assign(C.st[d+":"+s]||{},{mine:{f,note:$("f-note").value,at:new Date(Date.now()+288e5).toISOString().slice(0,19).replace("T"," "),ok:false}});load();
    $("r-msg").innerHTML='<p class="rok">✅ 交咗（第 '+j.rev+' 次）'+s+'</p>'+(j.warns.length?'<p class="rerr">⚠️ 請核對：<br>'+j.warns.join("<br>")+'<br>有錯就改完再交；冇錯唔使理。</p>':"");
  }catch(e){$("r-msg").innerHTML='<p class="rerr">交唔到：'+e.message+'<br>請再試，唔得就照舊打字俾老闆。</p>'}
  $("r-send").disabled=false;};
})();
</script>`;
}

export const REPORT_CSS = `
.repcard{margin-top:10px}.rrow{display:flex;gap:8px;margin:8px 0}.rrow select{flex:1;padding:8px;font-size:1rem;border:1px solid #ccd;border-radius:8px;background:#fff}
.rf{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid #f0eee8}
.rf span{font-size:.95rem}.rf small{color:var(--muted);font-size:.78rem;margin-left:4px}
.rf input{width:7.5em;padding:8px;font-size:1.05rem;border:1px solid #ccd;border-radius:8px;text-align:right}
.rf input[type=text]{width:12em;text-align:left;font-size:.95rem}
.rsec{background:#faf7ef;border-radius:10px;padding:4px 10px;margin:8px 0}.rsh{font-weight:600;padding-top:4px}.rsh small{font-weight:400;color:var(--muted)}
.rbtn{width:100%;margin-top:12px;padding:12px;font-size:1.1rem;border:0;border-radius:10px;background:var(--teal);color:#fff}
.rf[hidden]{display:none}.rbtn:disabled{opacity:.5}.rok{color:var(--deep);font-weight:600}.rerr{color:#c0562b}`;
