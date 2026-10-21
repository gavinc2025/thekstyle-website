// 澳大 45 周年「考試打打氣」：電子考試必勝卡（用戶 10/21 定）
//   活動期 11/23–12/17：澳大店單剪 $50；剪完 Google 搜「上手屋快剪」→ /bisheng 領券
//   領券要輸入師傅口頭講嘅「今日密碼」（每日自動換），每部手機限領一張
//   使用期 12/18–1/31：只限澳大店、按原價扣 $10（即 $50）、每次限用一張、活動期內不適用
//   師傅喺專屬連結 /r/<碼> 影券上面嘅二維碼 → 確認 → 標記已用（一張只用一次）
// KV：bs:secret（密碼種子，第一次用自動生成）
//     bs:v:<券號> = {id, at, dev, test, used:{by,date,at}|null}
//     bs:dev:<裝置> = 券號（每部手機一張）
//     bs:used:<日期> = [{id,by,at,test}]（對數用；NAS GET /api/bisheng/used?date=）
//     bs:fail:<ip>:<日期> = 輸錯密碼次數
export const PROMO = {
  shop: "澳門大學",
  start: "2026-11-23", end: "2026-12-17",       // 領取期（＝活動期）
  useFrom: "2026-12-18", useTo: "2027-01-31",   // 使用期（活動完 45 日）
  price: 50, off: 10,
};
const ALPHA = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";   // 唔用 0/O/1/I/L 免得睇錯
const FAIL_MAX = 30;                              // 同一 IP 一日輸錯幾多次就停（校園 Wi-Fi 好多人共用 IP，唔好設太緊）
const KEEP = { expirationTtl: 60 * 60 * 24 * 180 };

const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const md = d => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
const ymd = d => `${d.slice(0, 4)}/${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
const bare = n => n.replace(/[◆●]$/, "");

export const inClaim = d => d >= PROMO.start && d <= PROMO.end;
export const inUse = d => d >= PROMO.useFrom && d <= PROMO.useTo;
// 活動期澳大全部單剪 $50（唔分學校卡／正常收費）
export const promoPrice = (shop, date) => shop === PROMO.shop && date && inClaim(date) ? PROMO.price : null;

async function secret(env) {
  let s = await env.STATUS.get("bs:secret");
  if (!s) {
    s = [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, "0")).join("");
    await env.STATUS.put("bs:secret", s);
  }
  return s;
}

// 今日密碼：HMAC(種子, 日期) → 4 位數
export async function dailyPin(env, date) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(await secret(env)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("pin:" + date)));
  return String(((sig[0] << 24 | sig[1] << 16 | sig[2] << 8 | sig[3]) >>> 0) % 10000).padStart(4, "0");
}

const newId = () => [...crypto.getRandomValues(new Uint8Array(8))].map(b => ALPHA[b % ALPHA.length]).join("");
export const normId = s => String(s || "").toUpperCase().replace(/^.*\/Q\//, "").replace(/[^0-9A-Z]/g, "").replace(/[01IOL]/g, "").slice(0, 8);
const cleanDev = s => String(s || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 40);

// 券狀態（客自己睇、師傅掃完睇）
function state(v, today) {
  if (!v) return { ok: false, code: "none", msg: "搵唔到呢張券" };
  if (v.used) return { ok: false, code: "used", msg: `已經喺 ${ymd(v.used.date)} 用咗` };
  if (v.test) return today < PROMO.start ? { ok: true, code: "test", msg: "測試券（唔計數）" } : { ok: false, code: "test", msg: "測試券，活動開始後已失效" };
  if (today < PROMO.useFrom) return { ok: false, code: "early", msg: `${ymd(PROMO.useFrom)} 起先用得（活動期內不適用）` };
  if (today > PROMO.useTo) return { ok: false, code: "expired", msg: `已過期（使用期至 ${ymd(PROMO.useTo)}）` };
  return { ok: true, code: "ok", msg: `有效，可以減 $${PROMO.off}` };
}

// POST /api/bisheng/claim {pin, dev, test}
export async function claim(request, env, today, body) {
  const test = !!body.test && today < PROMO.start;   // 測試券只限活動開始前（之後 ?test=1 照出真券規則）
  const dev = cleanDev(body.dev);
  if (dev.length < 16) return json({ error: "請用手機瀏覽器開呢頁再試" }, 400);
  // 同一部手機已經領過 → 照俾返嗰張（截圖唔見咗都攞得返）
  const had = await env.STATUS.get(`bs:dev:${dev}`);
  if (had) {
    const v = await env.STATUS.get(`bs:v:${had}`, "json");
    if (v && v.test === test) return json({ ok: true, id: v.id, test: v.test, again: true, ...PROMO });
  }
  if (!test && !inClaim(today)) return json({ error: today < PROMO.start ? `${ymd(PROMO.start)} 先開始領取` : "領取期已經完咗" }, 403);
  const ip = request.headers.get("cf-connecting-ip") || "x";
  const fk = `bs:fail:${ip}:${today}`;
  const fails = +(await env.STATUS.get(fk)) || 0;
  if (fails >= FAIL_MAX) return json({ error: "輸錯太多次，請聽清楚師傅講嘅密碼，聽日再試" }, 429);
  const pin = String(body.pin || "").replace(/\D/g, "");
  if (pin !== await dailyPin(env, today)) {
    await env.STATUS.put(fk, String(fails + 1), { expirationTtl: 60 * 60 * 26 });
    return json({ error: "密碼唔啱，請問返師傅今日嘅密碼" }, 400);
  }
  let id;
  for (let i = 0; i < 5 && !id; i++) { const t = newId(); if (!await env.STATUS.get(`bs:v:${t}`)) id = t; }
  const v = { id, at: new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 16).replace("T", " "), dev, test, used: null };
  await env.STATUS.put(`bs:v:${id}`, JSON.stringify(v), KEEP);
  await env.STATUS.put(`bs:dev:${dev}`, id, KEEP);
  return json({ ok: true, id, test, ...PROMO });
}

// GET /api/bisheng/v?id=  客睇自己張券
export async function view(env, today, id) {
  const v = await env.STATUS.get(`bs:v:${normId(id)}`, "json");
  return json({ id: v && v.id, test: v && v.test, ...state(v, today), ...PROMO });
}

// 師傅今日係咪喺澳大（更表），老闆都得
export function atShop(data, name, today) {
  if (name === "老闆") return true;
  const day = data.days.find(x => x.d === today);
  if (day) return (day.s[PROMO.shop] || []).some(x => bare(x) === name);
  return data.home[name] === PROMO.shop;
}

// POST /api/bisheng/redeem {code, id, confirm}；冇 confirm＝淨係睇狀態
export async function redeem(env, data, name, today, body) {
  const id = normId(body.id);
  if (id.length !== 8) return json({ error: "券號唔啱（應該係 8 個字）" }, 400);
  if (!atShop(data, name, today)) return json({ error: `必勝卡只限${PROMO.shop}店用；更表顯示你今日唔喺${PROMO.shop}` }, 403);
  const v = await env.STATUS.get(`bs:v:${id}`, "json");
  const st = state(v, today);
  if (!body.confirm || !st.ok) return json({ id, test: v && v.test, ...st });
  v.used = { by: name, date: today, at: new Date(Date.now() + 8 * 3600e3).toISOString().slice(11, 16) };
  await env.STATUS.put(`bs:v:${id}`, JSON.stringify(v), KEEP);
  const lk = `bs:used:${today}`, list = (await env.STATUS.get(lk, "json")) || [];
  if (!list.some(x => x.id === id)) list.push({ id, by: name, at: v.used.at, test: !!v.test });
  await env.STATUS.put(lk, JSON.stringify(list), KEEP);
  return json({ id, test: v.test, ok: true, code: "done", msg: v.test ? "✅ 測試券已核銷（唔計數）" : `✅ 已核銷，今次收 $${PROMO.price}` });
}

// 當日真券用咗幾張（對數用）
export async function usedCount(env, date) {
  const list = (await env.STATUS.get(`bs:used:${date}`, "json")) || [];
  return list.filter(x => !x.test).length;
}

// NAS：GET /api/bisheng/used?date=D
export async function nasUsed(env, url) {
  const date = url.searchParams.get("date") || "";
  if (!/^\d{4}-\d\d-\d\d$/.test(date)) return json({ error: "date" }, 400);
  return json({ date, used: (await env.STATUS.get(`bs:used:${date}`, "json")) || [] });
}

// 客掃自己張券嘅二維碼：/q/<券號>
export async function qPage(env, today, raw) {
  const id = normId(raw), v = id.length === 8 ? await env.STATUS.get(`bs:v:${id}`, "json") : null, st = state(v, today);
  const color = st.ok ? "#2D8484" : "#c0562b";
  return `<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow"><title>考試必勝卡 ‧ 上手屋</title></head>
<body style="margin:0;font:17px/1.6 -apple-system,'PingFang TC','Microsoft JhengHei',sans-serif;background:#F7F4EC;color:#1d2b2b;text-align:center;padding:40px 20px">
<div style="max-width:420px;margin:0 auto;background:#13403f;color:#F7F4EC;border-radius:18px;padding:28px 20px;border:3px solid #D8B860">
<div style="color:#D8B860;letter-spacing:.2em">上手屋 ‧ 澳門大學店</div>
<h1 style="margin:6px 0;font-size:1.8rem">考試必勝卡</h1>
${v ? `<div style="font:700 1.3rem monospace;letter-spacing:.15em">${esc(id.slice(0, 4))}-${esc(id.slice(4))}</div>` : ""}
<p style="background:#fff;color:${color};border-radius:10px;padding:10px;font-weight:700">${esc(st.msg)}</p>
<p style="font-size:.9rem;opacity:.85">使用期 ${ymd(PROMO.useFrom)} – ${ymd(PROMO.useTo)}<br>只限澳門大學店 ‧ 按原價減 $${PROMO.off} ‧ 每次限用一張<br>請將張券出示畀師傅掃描</p>
</div><p><a href="/bisheng" style="color:#2D8484">考試必勝卡詳情</a></p></body></html>`;
}

// 員工頁卡：活動期顯示今日密碼；使用期顯示掃券；?test=1 兩樣都有
export async function promoCard(env, data, name, today, test) {
  test = test && today < PROMO.start;
  if (!atShop(data, name, today) && !test) return "";
  const claimOn = inClaim(today) || test, useOn = inUse(today) || test;
  if (!claimOn && !useOn) return "";
  const pin = claimOn ? await dailyPin(env, today) : "";
  return `<div class="card bscard" id="bscard">
  <div class="lbl">考試必勝卡${test ? ` <b class="leave">測試模式</b>` : ""}</div>
  ${claimOn ? `<div class="bspin"><small>今日領卡密碼（口頭講畀剪完髮嘅客）</small><b>${pin}</b>
    <div class="mates">同客講：「Google 搜『上手屋快剪』，入去輸入呢個密碼就領到 $10 券。」每日密碼唔同。</div></div>` : ""}
  ${useOn ? `<div class="bsscan">
    <label class="phbig">📷 影客張必勝卡<input type="file" accept="image/*" capture="environment" id="bs-file"></label>
    <div class="phsub"><small>影唔到可以手打券號（8 個字）</small></div>
    <div class="rrow"><input id="bs-id" type="text" maxlength="9" placeholder="例：AB23-CD45" autocapitalize="characters"><button id="bs-chk" class="bsbtn">查</button></div>
    <div id="bs-res"></div></div>
  <div class="mates">必勝卡只限澳大店、${ymd(PROMO.useFrom)}–${ymd(PROMO.useTo)}、每次一張；核銷咗嗰剪收 $${PROMO.price}（唔好計入「正常收費」）。</div>` : ""}
</div>
${useOn ? `<script src="/js/vendor/jsQR.min.js" defer></script>
<script>
(()=>{const $=id=>document.getElementById(id),code=location.pathname.split("/")[2];
async function api(id,confirm){const r=await fetch("/api/bisheng/redeem",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({code,id,confirm})});return r.json()}
function show(j){const ok=j.ok&&j.code!=="done";
  $("bs-res").innerHTML=(j.error?'<p class="rerr big">'+j.error+'</p>':'<p class="'+(j.ok?"rok":"rerr big")+'">券號 '+(j.id||"").replace(/(.{4})/,"$1-")+'：'+j.msg+'</p>')
   +(ok?'<button class="rbtn" id="bs-go">確認使用（收 $${PROMO.price}）</button>':"");
  if(ok)$("bs-go").onclick=async()=>{$("bs-go").disabled=true;show(await api(j.id,true))};}
async function check(id){$("bs-res").textContent="查緊…";try{show(await api(id,false))}catch(e){$("bs-res").innerHTML='<p class="rerr">網絡有問題，再試</p>'}}
$("bs-chk").onclick=()=>check($("bs-id").value);
$("bs-file").onchange=async()=>{const f=$("bs-file").files[0];$("bs-file").value="";if(!f)return;$("bs-res").textContent="讀緊二維碼…";
  const u=URL.createObjectURL(f);try{const img=await new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=no;i.src=u});
    let hit=null;for(const L of [1000,1600,700]){const z=Math.min(1,L/Math.max(img.naturalWidth,img.naturalHeight)),c=document.createElement("canvas");
      c.width=Math.round(img.naturalWidth*z);c.height=Math.round(img.naturalHeight*z);const x=c.getContext("2d");x.drawImage(img,0,0,c.width,c.height);
      hit=jsQR(x.getImageData(0,0,c.width,c.height).data,c.width,c.height);if(hit)break}
    if(!hit){$("bs-res").innerHTML='<p class="rerr big">認唔到二維碼：影近啲、對正啲再試，或者手打券號</p>';return}
    $("bs-id").value=hit.data.replace(/^.*\\/q\\//i,"");check(hit.data)}
  catch(e){$("bs-res").innerHTML='<p class="rerr">開唔到張相</p>'}finally{URL.revokeObjectURL(u)}};
})();
</script>` : ""}`;
}

// 老闆頁「必勝卡」分頁：今日密碼＋統計（KV list，張數唔多）
export async function promoBoss(env, today) {
  const vs = [];
  let cursor;
  do {
    const r = await env.STATUS.list({ prefix: "bs:v:", cursor });
    vs.push(...await Promise.all(r.keys.map(k => env.STATUS.get(k.name, "json"))));
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor);
  const real = vs.filter(v => v && !v.test), used = real.filter(v => v.used);
  const byDay = {};
  for (const v of real) byDay[v.at.slice(0, 10)] = (byDay[v.at.slice(0, 10)] || 0) + 1;
  const pinNote = inClaim(today) ? `今日領卡密碼：<b>${await dailyPin(env, today)}</b>` : `領取期 ${md(PROMO.start)}–${md(PROMO.end)}`;
  return `<p class="mates">${pinNote}；使用期 ${md(PROMO.useFrom)}–${md(PROMO.useTo)}（只限${PROMO.shop}）</p>
  <div class="cards"><div class="card"><div class="lbl">已領</div><div class="big">${real.length} 張</div></div>
    <div class="card"><div class="lbl">已用</div><div class="big">${used.length} 張</div></div></div>
  ${Object.keys(byDay).length ? `<div class="card leavecard"><div class="lbl">每日領取</div><table>${Object.entries(byDay).sort().map(([d, n]) => `<tr><th>${md(d)}</th><td>${n}</td></tr>`).join("")}</table></div>` : ""}
  ${used.length ? `<div class="card leavecard"><div class="lbl">已用（最近 30 張）</div><table>${used.sort((a, b) => (b.used.date + b.used.at).localeCompare(a.used.date + a.used.at)).slice(0, 30)
    .map(v => `<tr><th>${md(v.used.date)} ${esc(v.used.at)}</th><td>${esc(v.id)} ‧ ${esc(v.used.by)}</td></tr>`).join("")}</table></div>` : ""}
  <p class="mates">測試券（?test=1 領嘅）唔計入。</p>`;
}

export const PROMO_CSS = `
.bscard{margin-top:10px;border:2px solid var(--gold)}.bspin{background:#faf7ef;border-radius:10px;padding:10px 12px;margin:6px 0;text-align:center}
.bspin small{display:block;color:var(--muted)}.bspin b{display:block;font-size:2.6rem;letter-spacing:.3em;color:var(--deep);font-variant-numeric:tabular-nums}
.bsscan{margin:8px 0}.bsscan input[type=text]{flex:1;padding:8px;font-size:1.1rem;border:1px solid #ccd;border-radius:8px;text-transform:uppercase;letter-spacing:.1em}
.bsbtn{padding:8px 16px;border:0;border-radius:8px;background:var(--teal);color:#fff;font-size:1rem}`;
