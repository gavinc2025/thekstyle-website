// 澳大 2027 開放日「新生見面券」（用戶 11/9 定）
//   2027/1/10（日）開放日：澳大店單剪 $50（promo.js promoPrice）；必勝卡當日不適用（promo.js state）
//   訪客喺舖頭門口掃二維碼 → /xinsheng 領券；唔使剪髮都領得，要輸入師傅講／門口寫嘅「今日密碼」，每部手機一張
//   使用期 2027/8/1–10/31（新生開學）：只限澳大店、憑券單剪收 $50（學校卡客都係 $50）、每次一張、不可同其他優惠同用
//   師傅喺 /r/<碼> 影券上面嘅二維碼（/x/<券號>）→ 確認 → 標記已用
// KV：xs:v:<券號> = {id, at, dev, test, used:{by,date,at}|null}
//     xs:dev:<裝置> = 券號；xs:used:<日期> = [{id,by,at,test}]（對數用；NAS GET /api/xinsheng/used?date=）
//     xs:fail:<ip>:<日期> = 輸錯密碼次數
import { dailyPin, atShop } from "./promo.js";

export const XS = {
  shop: "澳門大學",
  day: "2027-01-10",                              // 開放日＝領取日
  useFrom: "2027-08-01", useTo: "2027-10-31",
  price: 50, orig: 60,
};
const ALPHA = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const REVIEW_PIN = "4545";                        // 同必勝卡一樣，俾澳大審批試；只限 ?test=1 而且開放日前
const FAIL_MAX = 30;
const KEEP = { expirationTtl: 60 * 60 * 24 * 330 };   // 1/10 領、10/31 先完 → 要成 10 個月

const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const md = d => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
const ymd = d => `${d.slice(0, 4)}/${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
const nowMacau = () => new Date(Date.now() + 8 * 3600e3).toISOString();

export const inUse = d => d >= XS.useFrom && d <= XS.useTo;
const testOk = today => today < XS.day;           // 測試券只限開放日前

const newId = () => [...crypto.getRandomValues(new Uint8Array(8))].map(b => ALPHA[b % ALPHA.length]).join("");
export const normId = s => String(s || "").toUpperCase().replace(/^.*\/X\//, "").replace(/[^0-9A-Z]/g, "").replace(/[01IOL]/g, "").slice(0, 8);
const cleanDev = s => String(s || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 40);

function state(v, today) {
  if (!v) return { ok: false, code: "none", msg: "搵唔到呢張券" };
  if (v.used) return { ok: false, code: "used", msg: `已經喺 ${ymd(v.used.date)} 用咗` };
  if (v.test) return testOk(today) ? { ok: true, code: "test", msg: "測試券（唔計數）" } : { ok: false, code: "test", msg: "測試券，開放日後已失效" };
  if (today < XS.useFrom) return { ok: false, code: "early", msg: `${ymd(XS.useFrom)} 起先用得` };
  if (today > XS.useTo) return { ok: false, code: "expired", msg: `已過期（使用期至 ${ymd(XS.useTo)}）` };
  return { ok: true, code: "ok", msg: `有效，今次單剪收 $${XS.price}` };
}

// POST /api/xinsheng/claim {pin, dev, test}
export async function claim(request, env, today, body) {
  const test = !!body.test && testOk(today);
  const dev = cleanDev(body.dev);
  if (dev.length < 16) return json({ error: "請用手機瀏覽器開呢頁再試" }, 400);
  const had = await env.STATUS.get(`xs:dev:${dev}`);
  if (had) {
    const v = await env.STATUS.get(`xs:v:${had}`, "json");
    if (v && v.test === test) return json({ ok: true, id: v.id, test: v.test, again: true, ...XS });
  }
  if (!test && today !== XS.day) return json({ error: today < XS.day ? `${ymd(XS.day)} 開放日當日先開始領取` : "領取日已經過咗，多謝支持！" }, 403);
  const ip = request.headers.get("cf-connecting-ip") || "x";
  const fk = `xs:fail:${ip}:${today}`;
  const fails = +(await env.STATUS.get(fk)) || 0;
  if (fails >= FAIL_MAX) return json({ error: "輸錯太多次，請睇清楚門口嘅密碼，或者問師傅" }, 429);
  const pin = String(body.pin || "").replace(/\D/g, "");
  if (!(test && pin === REVIEW_PIN) && pin !== await dailyPin(env, today)) {
    await env.STATUS.put(fk, String(fails + 1), { expirationTtl: 60 * 60 * 26 });
    return json({ error: "密碼唔啱，請睇返門口嘅密碼，或者問師傅" }, 400);
  }
  let id;
  for (let i = 0; i < 5 && !id; i++) { const t = newId(); if (!await env.STATUS.get(`xs:v:${t}`)) id = t; }
  const v = { id, at: nowMacau().slice(0, 16).replace("T", " "), dev, test, used: null };
  await env.STATUS.put(`xs:v:${id}`, JSON.stringify(v), KEEP);
  await env.STATUS.put(`xs:dev:${dev}`, id, KEEP);
  return json({ ok: true, id, test, ...XS });
}

// GET /api/xinsheng/v?id=
export async function view(env, today, id) {
  const v = await env.STATUS.get(`xs:v:${normId(id)}`, "json");
  return json({ id: v && v.id, test: v && v.test, ...state(v, today), ...XS });
}

// POST /api/xinsheng/redeem {code, id, confirm}
export async function redeem(env, data, name, today, body) {
  const id = normId(body.id);
  if (id.length !== 8) return json({ error: "券號唔啱（應該係 8 個字）" }, 400);
  if (!atShop(data, name, today)) return json({ error: `新生見面券只限${XS.shop}店用；更表顯示你今日唔喺${XS.shop}` }, 403);
  const v = await env.STATUS.get(`xs:v:${id}`, "json");
  const st = state(v, today);
  if (!body.confirm || !st.ok) return json({ id, test: v && v.test, ...st });
  v.used = { by: name, date: today, at: nowMacau().slice(11, 16) };
  await env.STATUS.put(`xs:v:${id}`, JSON.stringify(v), KEEP);
  const lk = `xs:used:${today}`, list = (await env.STATUS.get(lk, "json")) || [];
  if (!list.some(x => x.id === id)) list.push({ id, by: name, at: v.used.at, test: !!v.test });
  await env.STATUS.put(lk, JSON.stringify(list), KEEP);
  return json({ id, test: v.test, ok: true, code: "done", msg: v.test ? "✅ 測試券已核銷（唔計數）" : `✅ 已核銷，今次收 $${XS.price}` });
}

export async function usedCount(env, date) {
  const list = (await env.STATUS.get(`xs:used:${date}`, "json")) || [];
  return list.filter(x => !x.test).length;
}

// NAS：GET /api/xinsheng/used?date=D
export async function nasUsed(env, url) {
  const date = url.searchParams.get("date") || "";
  if (!/^\d{4}-\d\d-\d\d$/.test(date)) return json({ error: "date" }, 400);
  return json({ date, used: (await env.STATUS.get(`xs:used:${date}`, "json")) || [] });
}

// 客掃自己張券：/x/<券號>
export async function xPage(env, today, raw) {
  const id = normId(raw), v = id.length === 8 ? await env.STATUS.get(`xs:v:${id}`, "json") : null, st = state(v, today);
  const color = st.ok ? "#2D8484" : "#c0562b";
  return `<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow"><title>新生見面券 ‧ 上手屋</title></head>
<body style="margin:0;font:17px/1.6 -apple-system,'PingFang TC','Microsoft JhengHei',sans-serif;background:#F7F4EC;color:#1d2b2b;text-align:center;padding:40px 20px">
<div style="max-width:420px;margin:0 auto;background:#13403f;color:#F7F4EC;border-radius:18px;padding:28px 20px;border:3px solid #D8B860">
<div style="color:#D8B860;letter-spacing:.2em">上手屋 ‧ 澳門大學店</div>
<h1 style="margin:6px 0;font-size:1.8rem">新生見面券</h1>
${v ? `<div style="font:700 1.3rem monospace;letter-spacing:.15em">${esc(id.slice(0, 4))}-${esc(id.slice(4))}</div>` : ""}
<p style="background:#fff;color:${color};border-radius:10px;padding:10px;font-weight:700">${esc(st.msg)}</p>
<p style="font-size:.9rem;opacity:.85">使用期 ${ymd(XS.useFrom)} – ${ymd(XS.useTo)}<br>只限澳門大學店 ‧ 憑券單剪 MOP ${XS.price} ‧ 每次限用一張<br>請將張券出示畀師傅掃描</p>
</div><p><a href="/xinsheng" style="color:#2D8484">新生見面券詳情</a></p></body></html>`;
}

// 員工頁卡：開放日顯示今日密碼（門口寫／口頭講）；使用期顯示掃券；?test=1 兩樣都有
export async function xsCard(env, data, name, today, test) {
  test = test && testOk(today);
  if (!atShop(data, name, today) && !test) return "";
  const claimOn = today === XS.day || test, useOn = inUse(today) || test;
  if (!claimOn && !useOn) return "";
  const pin = claimOn ? await dailyPin(env, today) : "";
  return `<div class="card bscard" id="xscard">
  <div class="lbl">新生見面券（開放日）${test ? ` <b class="leave">測試模式</b>` : ""}</div>
  ${claimOn ? `<div class="bspin"><small>今日領券密碼（寫喺門口告示，或者口頭講）</small><b>${pin}</b>
    <div class="mates">同訪客講：「掃門口二維碼，輸入呢個密碼，免費領新生見面券，8 月開學嚟剪只收 $${XS.price}。」唔使剪髮都領得。<br>
    今日係開放日：所有客單剪收 <b>$${XS.price}</b>；客出示考試必勝卡唔好掃，叫佢留返 1/31 前用。</div></div>` : ""}
  ${useOn ? `<div class="bsscan">
    <label class="phbig">📷 影客張新生見面券<input type="file" accept="image/*" capture="environment" id="xs-file"></label>
    <div class="phsub"><small>影唔到可以手打券號（8 個字）</small></div>
    <div class="rrow"><input id="xs-id" type="text" maxlength="9" placeholder="例：AB23-CD45" autocapitalize="characters"><button id="xs-chk" class="bsbtn">查</button></div>
    <div id="xs-res"></div></div>
  <div class="mates">新生見面券只限澳大店、${ymd(XS.useFrom)}–${ymd(XS.useTo)}、每次一張；核銷咗嗰剪收 $${XS.price}（唔好計入「正常收費」）。</div>` : ""}
</div>
${useOn ? `<script src="/js/vendor/jsQR.min.js" defer></script>
<script>
(()=>{const $=id=>document.getElementById(id),code=location.pathname.split("/")[2];
async function api(id,confirm){const r=await fetch("/api/xinsheng/redeem",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({code,id,confirm})});return r.json()}
function show(j){const ok=j.ok&&j.code!=="done";
  $("xs-res").innerHTML=(j.error?'<p class="rerr big">'+j.error+'</p>':'<p class="'+(j.ok?"rok":"rerr big")+'">券號 '+(j.id||"").replace(/(.{4})/,"$1-")+'：'+j.msg+'</p>')
   +(ok?'<button class="rbtn" id="xs-go">確認使用（收 $${XS.price}）</button>':"");
  if(ok)$("xs-go").onclick=async()=>{$("xs-go").disabled=true;show(await api(j.id,true))};}
async function check(id){$("xs-res").textContent="查緊…";try{show(await api(id,false))}catch(e){$("xs-res").innerHTML='<p class="rerr">網絡有問題，再試</p>'}}
$("xs-chk").onclick=()=>check($("xs-id").value);
$("xs-file").onchange=async()=>{const f=$("xs-file").files[0];$("xs-file").value="";if(!f)return;$("xs-res").textContent="讀緊二維碼…";
  const u=URL.createObjectURL(f);try{const img=await new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=no;i.src=u});
    let hit=null;for(const L of [1000,1600,700]){const z=Math.min(1,L/Math.max(img.naturalWidth,img.naturalHeight)),c=document.createElement("canvas");
      c.width=Math.round(img.naturalWidth*z);c.height=Math.round(img.naturalHeight*z);const x=c.getContext("2d");x.drawImage(img,0,0,c.width,c.height);
      hit=jsQR(x.getImageData(0,0,c.width,c.height).data,c.width,c.height);if(hit)break}
    if(!hit){$("xs-res").innerHTML='<p class="rerr big">認唔到二維碼：影近啲、對正啲再試，或者手打券號</p>';return}
    if(/\\/q\\//i.test(hit.data)){$("xs-res").innerHTML='<p class="rerr big">呢張係考試必勝卡，唔係新生見面券</p>';return}
    $("xs-id").value=hit.data.replace(/^.*\\/x\\//i,"");check(hit.data)}
  catch(e){$("xs-res").innerHTML='<p class="rerr">開唔到張相</p>'}finally{URL.revokeObjectURL(u)}};
})();
</script>` : ""}`;
}

// 老闆頁統計（接喺「必勝卡」分頁下面）
export async function xsBoss(env, today) {
  const vs = [];
  let cursor;
  do {
    const r = await env.STATUS.list({ prefix: "xs:v:", cursor });
    vs.push(...await Promise.all(r.keys.map(k => env.STATUS.get(k.name, "json"))));
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor);
  const real = vs.filter(v => v && !v.test), used = real.filter(v => v.used);
  const pinNote = today === XS.day ? `今日領券密碼：<b>${await dailyPin(env, today)}</b>；` : "";
  return `<h3 style="margin:18px 0 6px">新生見面券（澳大開放日）</h3>
  <p class="mates">${pinNote}領取日 ${ymd(XS.day)}；使用期 ${md(XS.useFrom)}–${md(XS.useTo)}（只限${XS.shop}，收 $${XS.price}）</p>
  <div class="cards"><div class="card"><div class="lbl">已領</div><div class="big">${real.length} 張</div></div>
    <div class="card"><div class="lbl">已用</div><div class="big">${used.length} 張</div></div></div>
  ${used.length ? `<div class="card leavecard"><div class="lbl">已用（最近 30 張）</div><table>${used.sort((a, b) => (b.used.date + b.used.at).localeCompare(a.used.date + a.used.at)).slice(0, 30)
    .map(v => `<tr><th>${md(v.used.date)} ${esc(v.used.at)}</th><td>${esc(v.id)} ‧ ${esc(v.used.by)}</td></tr>`).join("")}</table></div>` : ""}`;
}
