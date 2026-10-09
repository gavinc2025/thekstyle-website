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
const PHOTO_KINDS = ["mp", "big"];   // 單據相：澳門通、大頭工銀（海上居）
export const photoKey = (date, key, kind, rev, i) => `photo:${date}:${key}:${kind}:${rev}:${i}`;

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
      if (r.name === name) st[k].mine = { f: r.f, note: r.note || "", at: r.at, rev: r.rev, ph: r.ph || {}, ok: !!(a && a.rev === r.rev), rid: a && a.rid };
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
  // 單據相（自選）：body.photos {mp:[base64 jpeg..], big:[..]}，每類 1–3 張；冇帶就沿用上次交嗰批
  const photos = {};
  for (const kind of PHOTO_KINDS) {
    const arr = body.photos && body.photos[kind];
    if (!Array.isArray(arr) || !arr.length) continue;
    if (arr.length > 3) return json({ error: "每類單據最多 3 張相" }, 400);
    const bins = [];
    for (const b64 of arr) {
      let bin;
      try { bin = Uint8Array.from(atob(String(b64).replace(/^data:image\/jpeg;base64,/, "")), c => c.charCodeAt(0)); }
      catch { return json({ error: "相片格式唔啱" }, 400); }
      if (bin.length > 1.5e6 || bin[0] !== 0xff || bin[1] !== 0xd8) return json({ error: "相片太大或者格式唔啱" }, 400);
      bins.push(bin);
    }
    photos[kind] = bins;
  }
  const rev = Math.max(Date.now(), prev ? prev.rev + 1 : 0);
  const ph = {};
  for (const kind of PHOTO_KINDS) {
    if (photos[kind]) ph[kind] = { rev, n: photos[kind].length };
    else if (prev && prev.ph && prev.ph[kind]) ph[kind] = prev.ph[kind];
  }
  if (body.shop !== "海上居") delete ph.big;
  // 大頭工銀一定要單據（工銀機冇 CSV，老闆靠相對數；用戶 10/9 定）
  if (f.big > 0 && !ph.big) return json({ error: "大頭工銀要影單據先交到" }, 400);
  // 澳門通單據：REPORT_PHOTO_REQUIRED="1" 先必須（而家自選）
  if (env.REPORT_PHOTO_REQUIRED === "1" && f.mp != null && !ph.mp) return json({ error: "澳門通要影單據先交到" }, 400);
  const rec = {
    date, shop: body.shop, name, f, note: String(body.note || "").slice(0, 200), test,
    at: new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 19).replace("T", " "),
    // rev＝時間戳（KV 有 cache，用 +1 會撞號）；n＝第幾次交，淨係顯示用
    rev, n: (prev ? prev.n || 1 : 0) + 1, ph,
  };
  const ttl = { expirationTtl: 60 * 60 * 24 * 45 };
  // 相先存（14 日 TTL；NAS 拉落去之後即刪）
  for (const [kind, bins] of Object.entries(photos))
    await Promise.all(bins.map((b, i) => env.STATUS.put(photoKey(date, key, kind, rev, i + 1), b, { expirationTtl: 60 * 60 * 24 * 14 })));
  await env.STATUS.put(`rep:${date}:${key}`, JSON.stringify(rec), { ...ttl, metadata: { rev: rec.rev } });
  const idx = (await env.STATUS.get(`repidx:${date}`, "json")) || {};
  idx[key] = rec.rev;
  await env.STATUS.put(`repidx:${date}`, JSON.stringify(idx), ttl);
  const mates = (await dayReports(env, date, body.shop)).filter(r => r.name !== name);
  return json({ ok: true, rev: rec.rev, n: rec.n, date, warns: checks(body.shop, rec, mates) });
}

// NAS 用（Bearer roster token）
//   GET  /api/reports?date=D            → {date, idx}（只 index，好平）
//   GET  /api/reports?date=D&keys=a,b   → {date, reports:[...]}
//   GET  /api/reports?date=D&sweep=1    → {date, idx}（用 KV list 補返 index 甩咗嘅）
//   POST /api/report-ack {date, acks:{key:{rid,rev}}}
//   GET  /api/report-photo?key=photo:..  → jpeg；POST /api/report-photo-del {keys:[..]}
//   POST /api/report-purge {date: 2099-12-31}  淨係刪得測試日（連相）
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
  if (url.pathname === "/api/report-photo" && request.method === "GET") {   // NAS 拉相（binary）
    const k = url.searchParams.get("key") || "";
    if (!k.startsWith("photo:")) return json({ error: "key" }, 400);
    const v = await env.STATUS.get(k, "arrayBuffer");
    return v ? new Response(v, { headers: { "content-type": "image/jpeg", "cache-control": "no-store" } }) : json({ error: "gone" }, 404);
  }
  if (url.pathname === "/api/report-photo-del" && request.method === "POST") {   // NAS 存好就刪
    const b = await request.json().catch(() => null);
    const keys = ((b && b.keys) || []).filter(k => typeof k === "string" && k.startsWith("photo:")).slice(0, 50);
    await Promise.all(keys.map(k => env.STATUS.delete(k)));
    return json({ ok: true, deleted: keys.length });
  }
  if (url.pathname === "/api/report-purge" && request.method === "POST") {
    const b = await request.json().catch(() => null);
    if (!b || b.date !== TEST_DATE) return json({ error: "只可以刪測試日" }, 400);
    const r = await env.STATUS.list({ prefix: `rep:${TEST_DATE}:` });
    const p = await env.STATUS.list({ prefix: `photo:${TEST_DATE}:` });
    await Promise.all([...r.keys, ...p.keys].map(k => env.STATUS.delete(k.name)));
    await env.STATUS.delete(`repidx:${TEST_DATE}`);
    await env.STATUS.delete(`repack:${TEST_DATE}`);
    return json({ ok: true, deleted: r.keys.length, photos: p.keys.length });
  }
  return null;
}

// 員工頁「報數」卡（server 出 HTML，表單用 fetch 交）
export function reportCard(data, name, today, st, test, hour, photoReq = false) {
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
    test, today, yest, name, defDate, shops: data.shops, st, photoReq,
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
  <div class="rsec"><div class="rsh">單據相</div>
    ${[["mp", "澳門通單據", photoReq ? "（有填澳門通就要影）" : "（可以唔影）"], ["big", "大頭工銀單據", "（有填大頭工銀就一定要影）"]].map(([k, lab, hint]) => `<div class="phrow" id="pw-${k}">
      <label class="phbig">📷 影${lab}<input type="file" accept="image/*" capture="environment" data-k="${k}"></label>
      <div class="phsub"><small>${hint}　最多 3 張</small><label class="phalt">或者揀相<input type="file" accept="image/*" multiple data-k="${k}"></label></div>
      <div class="phst" id="ps-${k}"></div><div class="thumbs" id="pt-${k}"></div></div>`).join("")}
  </div>
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
const P={mp:[],big:[]};
async function shrink(file){const u=URL.createObjectURL(file);try{const img=await new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=()=>no(new Error("開唔到張相"));i.src=u});
  let L=1600,q=0.7,out;for(let t=0;t<5;t++){const z=Math.min(1,L/Math.max(img.naturalWidth,img.naturalHeight)),c=document.createElement("canvas");
    c.width=Math.round(img.naturalWidth*z);c.height=Math.round(img.naturalHeight*z);c.getContext("2d").drawImage(img,0,0,c.width,c.height);
    out=c.toDataURL("image/jpeg",q);if(out.length*0.75<4e5)break;if(q>0.5)q-=0.1;else L=Math.round(L*0.8)}return out}finally{URL.revokeObjectURL(u)}}
function thumbs(k){const m=((C.st[date()+":"+$("r-shop").value]||{}).mine||{}).ph||{};
  $("pt-"+k).innerHTML=P[k].map((u,i)=>'<span class="th"><img src="'+u+'"><b data-k="'+k+'" data-i="'+i+'">✕</b></span>').join("");
  $("ps-"+k).textContent=P[k].length?"已影 "+P[k].length+" 張，撳「交數」一齊上載"+(m[k]?"（會換走之前 "+m[k].n+" 張）":""):m[k]?"✅ 已上載 "+m[k].n+" 張（再揀就換過）":"";}
document.querySelectorAll(".phrow input[type=file]").forEach(inp=>inp.onchange=async()=>{const k=inp.dataset.k,fs=[...inp.files];inp.value="";
  $("ps-"+k).textContent="處理緊相…";$("r-msg").innerHTML="";
  for(const f of fs){if(P[k].length>=3){$("r-msg").innerHTML='<p class="rerr">每類最多 3 張，撳相上面 ✕ 刪咗先再影</p>';break}try{P[k].push(await shrink(f))}catch(e){$("r-msg").innerHTML='<p class="rerr">'+e.message+'</p>'}}thumbs(k)});
document.querySelectorAll(".thumbs").forEach(t=>t.onclick=e=>{const b=e.target.closest("b");if(!b)return;P[b.dataset.k].splice(+b.dataset.i,1);thumbs(b.dataset.k)});
function load(){const d=date(),s=$("r-shop").value,k=d+":"+s,x=C.st[k]||{},al=(C.alone[d]||{})[s]!==false;
  P.mp=[];P.big=[];$("pw-big").hidden=s!=="海上居";
  $("w-big").hidden=s!=="海上居";$("w-normal").hidden=s!=="澳門大學";$("w-t").hidden=al;
  $("shopnote").textContent=al?"（得你一個，照填）":x.shopBy&&!(x.mine&&SF.some(f=>x.mine.f[f]!=null))?"（"+x.shopBy+" 已經填咗，唔使再填）":"（同舖多過一個人，只需一位同事填）";
  const m=x.mine;F.forEach(f=>$("f-"+f).value=m&&m.f[f]!=null?m.f[f]:"");$("f-note").value=m?m.note:"";
  $("r-status").innerHTML=m?(m.ok?"✅ 已入數（"+m.at.slice(11,16)+" 交）":"⏳ 已交（"+m.at.slice(11,16)+"），等入數")+"　可以改":(x.shopBy?x.shopBy+" 已交全店數：客流 "+(x.shopF.t??"-")+"、澳門通 $"+(x.shopF.mp??"-"):"未交");
  $("r-msg").innerHTML="";thumbs("mp");thumbs("big");}
$("r-shop").onchange=load;if(!C.test)$("r-date").onchange=()=>{const d=C.def[date()];if(d)$("r-shop").value=d;load()};load();
$("r-send").onclick=async()=>{const s=$("r-shop").value,d=date(),al=(C.alone[d]||{})[s]!==false,f={};
  F.forEach(k=>{const v=$("f-"+k).value.trim();f[k]=v===""?null:+v});
  if(f.p==null){$("r-msg").innerHTML='<p class="rerr">個人單剪一定要填</p>';return}
  if(al&&f.t==null)f.t=f.p;
  const m0=((C.st[d+":"+s]||{}).mine||{}).ph||{};
  if(s==="海上居"&&f.big>0&&!P.big.length&&!m0.big){$("r-msg").innerHTML='<p class="rerr big">大頭工銀要影單據先交到</p>';$("pw-big").scrollIntoView({block:"center"});return}
  if(C.photoReq&&f.mp!=null&&!P.mp.length&&!m0.mp){$("r-msg").innerHTML='<p class="rerr big">澳門通要影單據先交到</p>';return}
  const photos={};["mp","big"].forEach(k=>{if(P[k].length)photos[k]=P[k]});
  $("r-send").disabled=true;$("r-msg").textContent=Object.keys(photos).length?"交緊（連相上載，可能要幾秒）…":"交緊…";
  try{const code=location.pathname.split("/")[2];
    const r=await fetch("/api/report",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({code,date:d,shop:s,f,note:$("f-note").value,test:C.test,photos})});
    const j=await r.json();
    if(!r.ok)throw new Error(j.error||r.status);
    const ph=Object.assign({},m0);["mp","big"].forEach(k=>{if(P[k].length)ph[k]={n:P[k].length}});
    C.st[d+":"+s]=Object.assign(C.st[d+":"+s]||{},{mine:{f,note:$("f-note").value,ph,at:new Date(Date.now()+288e5).toISOString().slice(0,19).replace("T"," "),ok:false}});load();
    $("r-msg").innerHTML='<p class="rok">✅ 交咗（第 '+j.n+' 次）'+s+'</p>'+(j.warns.length?'<p class="rerr">⚠️ 請核對：<br>'+j.warns.join("<br>")+'<br>有錯就改完再交；冇錯唔使理。</p>':"");
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
.rf[hidden]{display:none}.phrow{padding:8px 0;border-bottom:1px solid #f0eee8}.phrow[hidden]{display:none}
.phbig{display:block;text-align:center;padding:16px 10px;border:2px solid var(--teal);border-radius:12px;color:var(--teal);background:#fff;font-size:1.2rem;font-weight:700}
.phbig:active{background:#e6f2f2}.phbig input,.phalt input{display:none}
.phsub{display:flex;justify-content:space-between;align-items:center;margin-top:6px}.phsub small{color:var(--muted);font-size:.82rem}
.phalt{color:var(--teal);text-decoration:underline;font-size:.95rem;padding:6px 2px}
.phst{font-size:1rem;margin-top:4px}.rerr.big{font-size:1.15rem;font-weight:700}.thumbs{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.th{position:relative}
.th img{width:84px;height:84px;object-fit:cover;border-radius:6px;border:1px solid #ddd}
.th b{position:absolute;top:-8px;right:-8px;background:#c0562b;color:#fff;border-radius:50%;width:28px;height:28px;font-size:15px;line-height:28px;text-align:center;cursor:pointer}
.rbtn:disabled{opacity:.5}.rok{color:var(--deep);font-weight:600}.rerr{color:#c0562b}`;
