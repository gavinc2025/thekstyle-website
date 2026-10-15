// 師傅作品（2026-10-16 用戶要求；只限海上居＝網站寰宇天下店、澳門大學店）
//   師傅專屬連結頁「上載作品」：相（手機縮細先上）或者一條短片（分段上載）＋做咗咩／客人原本嘅問題／點樣幫客解決
//   → KV work:<id>（status new→uploaded）→ NAS 容器 salon-works-sync 拉原檔、ffmpeg 轉 720p mp4＋封面
//   → PUT 返 wmedia:<id>:<檔> → status pending → 老闆連結「作品」分頁批准 → live → 分店頁 /api/works?shop= 顯示
// KV：work:<id> JSON；workidx = [id..]（新→舊）；wraw:<id>:<k> 原檔（14 日 TTL，NAS 處理完即刪）；wmedia:<id>:<f> 網站用檔
// 公開：GET /api/works?shop=universe|um；GET /w/<id>/<f>（媒體，支援 Range，pending 都出得——老闆預覽要用；id 隨機 16 位）
export const WORK_SHOPS = { 海上居: "universe", 澳門大學: "um" };
const SHOP_NAME = { universe: "寰宇天下店", um: "澳門大學店" };
const PART = 20 * 1024 * 1024;     // 短片每段 20MB（KV 單值上限 25MB）
const VIDEO_MAX = 300 * 1024 * 1024, PHOTO_MAX = 8;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});
const nowMo = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 16).replace("T", " ");
const rid = () => [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(16).padStart(2, "0")).join("");
const STATUS_TXT = { new: "上載中", uploaded: "處理緊", pending: "等老闆睇", live: "已上網站", rejected: "暫時唔用" };

export const canWork = (data, name) => Object.keys(WORK_SHOPS).includes(data.home[name]);

async function getIdx(env) { return (await env.STATUS.get("workidx", "json")) || []; }
async function getWorks(env, ids) { return (await Promise.all(ids.map(id => env.STATUS.get(`work:${id}`, "json")))).filter(Boolean); }
const putWork = (env, w) => env.STATUS.put(`work:${w.id}`, JSON.stringify(w));

// 公開資料（唔出原檔資料）
const pub = w => ({
  id: w.id, shop: w.shop, name: w.name, title: w.title, problem: w.problem, solution: w.solution, at: w.at,
  photos: (w.media && w.media.photos || []).map(f => `/w/${w.id}/${f}`),
  video: w.media && w.media.video ? `/w/${w.id}/${w.media.video}` : null,
  poster: w.media && w.media.poster ? `/w/${w.id}/${w.media.poster}` : null,
});

// ===== 師傅頁卡 =====
export async function worksCard(env, data, name, code) {
  const shops = Object.keys(WORK_SHOPS);
  const home = data.home[name];
  const mine = (await getWorks(env, (await getIdx(env)).slice(0, 200))).filter(w => w.name === name).slice(0, 10);
  const list = mine.length ? `<div class="wk-mine">${mine.map(w => `<div class="wk-row"><span>${esc(w.title)}</span><small class="wk-st wk-${w.status}">${STATUS_TXT[w.status] || w.status}</small></div>`).join("")}</div>` : "";
  return `<div class="card wkcard"><details><summary class="lbl">📸 上載作品（會放上網站）</summary>
  <form id="wkf">
    <label>邊間舖做<select name="shop">${shops.map(s => `<option ${s === home ? "selected" : ""}>${s}</option>`).join("")}</select></label>
    <label>做咗咩<input name="title" maxlength="40" required placeholder="例：男士冷棕色染髮、學生韓式短髮"></label>
    <label>客人原本有咩問題／想要咩<textarea name="problem" maxlength="200" rows="2" placeholder="例：頭髮太厚好焗、白頭髮多、自己吹唔到型"></textarea></label>
    <label>你點樣幫佢解決<textarea name="solution" maxlength="300" rows="3" placeholder="例：打薄兩側、留長頂位，自己吹兩分鐘就有型"></textarea></label>
    <label>相（最多 ${PHOTO_MAX} 張）<input type="file" name="photos" accept="image/*" multiple></label>
    <label>或者一條短片（2 分鐘內）<input type="file" name="video" accept="video/*"></label>
    <label class="wk-ok"><input type="checkbox" name="consent" required> 客人已經同意相片／短片放上網</label>
    <button type="submit">上載</button>
    <div id="wkmsg" class="mates"></div>
  </form>
  ${list}<div class="mates">老闆睇過先會出現喺網站分店頁。</div></details></div>
<script>(function(){
const f=document.getElementById("wkf"),m=document.getElementById("wkmsg"),CODE=${JSON.stringify(code)},PART=${PART};
async function shrink(file){const u=URL.createObjectURL(file);try{const img=await new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=()=>no(new Error("開唔到張相"));i.src=u});
const s=Math.min(1,1600/Math.max(img.width,img.height)),c=document.createElement("canvas");c.width=Math.round(img.width*s);c.height=Math.round(img.height*s);
c.getContext("2d").drawImage(img,0,0,c.width,c.height);return await new Promise(ok=>c.toBlob(ok,"image/jpeg",.85))}finally{URL.revokeObjectURL(u)}}
function dur(file){return new Promise(ok=>{const v=document.createElement("video");v.preload="metadata";v.onloadedmetadata=()=>{ok(v.duration);URL.revokeObjectURL(v.src)};v.onerror=()=>ok(0);v.src=URL.createObjectURL(file)})}
async function api(b){const r=await fetch("/api/work",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(Object.assign({code:CODE},b))});const d=await r.json();if(!r.ok)throw new Error(d.error||"出錯");return d}
async function up(id,k,blob){const r=await fetch("/api/work-up?code="+CODE+"&id="+id+"&k="+k,{method:"PUT",body:blob});if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.error||"上載失敗")}}
f.onsubmit=async e=>{e.preventDefault();const b=f.querySelector("button");b.disabled=true;
 try{const ps=[...f.photos.files],v=f.video.files[0];
  if(!ps.length&&!v)throw new Error("揀相或者短片先");if(ps.length>${PHOTO_MAX})throw new Error("相最多 ${PHOTO_MAX} 張");
  if(v){if(v.size>${VIDEO_MAX})throw new Error("條片太大（最多 300MB），剪短啲");const d=await dur(v);if(d>125)throw new Error("條片要 2 分鐘內")}
  m.textContent="準備緊…";const blobs=[];for(const p of ps)blobs.push(await shrink(p));
  const parts=v?Math.ceil(v.size/PART):0;
  const r=await api({op:"new",shop:f.shop.value,title:f.title.value,problem:f.problem.value,solution:f.solution.value,consent:f.consent.checked,photos:blobs.length,parts,vtype:v?v.type:""});
  for(let i=0;i<blobs.length;i++){m.textContent="上載相 "+(i+1)+"/"+blobs.length;await up(r.id,"p"+(i+1),blobs[i])}
  for(let i=0;i<parts;i++){m.textContent="上載短片 "+Math.round(i/parts*100)+"%";await up(r.id,"v"+i,v.slice(i*PART,(i+1)*PART))}
  await api({op:"done",id:r.id});m.textContent="✅ 上載咗！老闆睇過就會放上網站。";f.reset();
 }catch(err){m.textContent="❌ "+err.message}finally{b.disabled=false}};
})();</script>`;
}

// ===== 老闆頁分頁 =====
export async function worksBoss(env, code) {
  const ws = (await getWorks(env, (await getIdx(env)).slice(0, 100))).filter(w => w.status !== "new");
  const card = w => {
    const p = pub(w);
    const media = p.video ? `<video src="${p.video}" poster="${p.poster || ""}" controls preload="none" playsinline></video>`
      : p.photos.map(s => `<img src="${s}" loading="lazy">`).join("");
    const act = w.status === "uploaded" ? `<small class="mates">處理緊短片／相，等一陣再睇</small>`
      : `<div class="wk-act">${w.status !== "live" ? `<button data-a="live" data-id="${w.id}">✅ 放上網站</button>` : `<button data-a="rejected" data-id="${w.id}">落架</button>`}
         ${w.status === "pending" ? `<button data-a="rejected" data-id="${w.id}" class="no">唔用</button>` : ""}</div>`;
    return `<div class="card wk-b"><div class="lbl">${esc(SHOP_NAME[w.shop])} ‧ ${esc(w.name)} ‧ ${esc(w.at)} <small class="wk-st wk-${w.status}">${STATUS_TXT[w.status]}</small></div>
      <div class="big">${esc(w.title)}</div>${w.problem ? `<p><b>問題：</b>${esc(w.problem)}</p>` : ""}${w.solution ? `<p><b>解決：</b>${esc(w.solution)}</p>` : ""}
      <div class="wk-media">${media}</div>${act}</div>`;
  };
  const pend = ws.filter(w => w.status === "pending" || w.status === "uploaded");
  return `${pend.length ? pend.map(card).join("") : `<p class="mates">冇作品等你睇</p>`}
  ${ws.some(w => w.status === "live") ? `<details><summary class="mates">已上網站（${ws.filter(w => w.status === "live").length}）</summary>${ws.filter(w => w.status === "live").map(card).join("")}</details>` : ""}
<script>document.querySelectorAll(".wk-act button").forEach(b=>b.onclick=async()=>{b.disabled=true;
const r=await fetch("/api/work",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({code:${JSON.stringify(code)},op:"review",id:b.dataset.id,status:b.dataset.a})});
if(r.ok)b.closest(".wk-b").querySelector(".wk-act").innerHTML=b.dataset.a==="live"?"✅ 已放上網站":"已收起";else{b.disabled=false;alert("出錯")}})</script>`;
}
export const pendingCount = async env => (await getWorks(env, (await getIdx(env)).slice(0, 100))).filter(w => w.status === "pending").length;

// ===== API =====
// POST /api/work（師傅／老闆，body 帶專屬碼；index.js 已認咗身份）
export async function workApi(env, data, name, isBoss, b) {
  if (b.op === "review") {
    if (!isBoss) return json({ error: "淨係老闆可以批" }, 403);
    const w = await env.STATUS.get(`work:${b.id}`, "json");
    if (!w || !["live", "rejected"].includes(b.status)) return json({ error: "bad" }, 400);
    w.status = b.status; w.reviewed = nowMo(); await putWork(env, w);
    return json({ ok: true });
  }
  if (isBoss || !canWork(data, name)) return json({ error: "呢個功能淨係開俾海上居、澳大師傅" }, 403);
  if (b.op === "new") {
    if (!WORK_SHOPS[b.shop]) return json({ error: "舖頭唔啱" }, 400);
    if (!b.consent) return json({ error: "要客人同意先上得網" }, 400);
    const title = String(b.title || "").trim().slice(0, 40);
    if (!title) return json({ error: "寫低做咗咩" }, 400);
    const photos = Math.max(0, Math.min(PHOTO_MAX, b.photos | 0)), parts = Math.max(0, Math.min(Math.ceil(VIDEO_MAX / PART), b.parts | 0));
    if (!photos && !parts) return json({ error: "揀相或者短片先" }, 400);
    const w = {
      id: rid(), shop: WORK_SHOPS[b.shop], shopName: b.shop, name, title,
      problem: String(b.problem || "").trim().slice(0, 200), solution: String(b.solution || "").trim().slice(0, 300),
      photos, parts, vtype: String(b.vtype || "").slice(0, 40), status: "new", at: nowMo(), got: [],
    };
    await putWork(env, w);
    const idx = await getIdx(env); idx.unshift(w.id);
    await env.STATUS.put("workidx", JSON.stringify(idx.slice(0, 1000)));
    return json({ ok: true, id: w.id });
  }
  if (b.op === "done") {
    const w = await env.STATUS.get(`work:${b.id}`, "json");
    if (!w || w.name !== name || w.status !== "new") return json({ error: "bad" }, 400);
    w.status = "uploaded"; await putWork(env, w);
    return json({ ok: true });
  }
  return json({ error: "op" }, 400);
}

// PUT /api/work-up?code&id&k   k＝p1..p8（jpeg）或 v0..vN（短片分段）
export async function workUpload(request, env, name, url) {
  const id = url.searchParams.get("id") || "", k = url.searchParams.get("k") || "";
  const w = /^[0-9a-f]{16}$/.test(id) && await env.STATUS.get(`work:${id}`, "json");
  if (!w || w.name !== name || w.status !== "new") return json({ error: "bad" }, 400);
  const m = /^(p|v)(\d+)$/.exec(k);
  if (!m || (m[1] === "p" ? !(+m[2] >= 1 && +m[2] <= w.photos) : !(+m[2] < w.parts))) return json({ error: "k" }, 400);
  const buf = await request.arrayBuffer();
  if (!buf.byteLength || buf.byteLength > PART + 1024) return json({ error: "太大" }, 400);
  await env.STATUS.put(`wraw:${id}:${k}`, buf, { expirationTtl: 60 * 60 * 24 * 14 });
  return json({ ok: true });
}

// 公開
export async function worksPublic(env, url) {
  const shop = url.searchParams.get("shop");
  if (!Object.values(WORK_SHOPS).includes(shop)) return json({ error: "shop" }, 400);
  const ws = (await getWorks(env, (await getIdx(env)).slice(0, 300))).filter(w => w.shop === shop && w.status === "live").slice(0, 30);
  return new Response(JSON.stringify({ works: ws.map(pub) }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}

const CT = { mp4: "video/mp4", jpg: "image/jpeg" };
export async function workMedia(request, env, url) {
  const m = /^\/w\/([0-9a-f]{16})\/([a-z0-9_]+\.(mp4|jpg))$/.exec(url.pathname);
  if (!m) return new Response("not found", { status: 404 });
  const w = await env.STATUS.get(`work:${m[1]}`, "json");
  if (!w || !["pending", "live"].includes(w.status)) return new Response("not found", { status: 404 });
  const buf = await env.STATUS.get(`wmedia:${m[1]}:${m[2]}`, "arrayBuffer");
  if (!buf) return new Response("not found", { status: 404 });
  const h = { "content-type": CT[m[3]], "accept-ranges": "bytes", "cache-control": w.status === "live" ? "public, max-age=86400" : "no-store" };
  const rg = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") || "");
  if (rg) {
    const size = buf.byteLength;
    let s = rg[1] === "" ? size - +rg[2] : +rg[1], e = rg[1] !== "" && rg[2] !== "" ? +rg[2] : size - 1;
    s = Math.max(0, s); e = Math.min(size - 1, e);
    if (s > e) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    return new Response(buf.slice(s, e + 1), { status: 206, headers: { ...h, "content-range": `bytes ${s}-${e}/${size}`, "content-length": String(e - s + 1) } });
  }
  return new Response(buf, { headers: h });
}

// NAS（Bearer roster token）
//   GET  /api/works-nas                 → {works:[uploaded 狀態，未處理]}
//   GET  /api/work-raw?id&k             → 原檔
//   PUT  /api/work-media?id&f           → 網站用檔（v.mp4／poster.jpg／p1.jpg..）
//   POST /api/work-nas {id, media:{photos:[..], video, poster}}  → status pending，刪原檔
export async function worksNas(request, env, url) {
  if (url.pathname === "/api/works-nas" && request.method === "GET") {
    const ws = (await getWorks(env, (await getIdx(env)).slice(0, 200))).filter(w => w.status === "uploaded");
    return json({ works: ws });
  }
  if (url.pathname === "/api/work-raw" && request.method === "GET") {
    const buf = await env.STATUS.get(`wraw:${url.searchParams.get("id")}:${url.searchParams.get("k")}`, "arrayBuffer");
    return buf ? new Response(buf, { headers: { "content-type": "application/octet-stream" } }) : json({ error: "none" }, 404);
  }
  if (url.pathname === "/api/work-media" && request.method === "PUT") {
    const id = url.searchParams.get("id") || "", f = url.searchParams.get("f") || "";
    if (!/^[0-9a-f]{16}$/.test(id) || !/^[a-z0-9_]+\.(mp4|jpg)$/.test(f)) return json({ error: "bad" }, 400);
    const buf = await request.arrayBuffer();
    if (buf.byteLength > 25 * 1024 * 1024) return json({ error: "太大" }, 400);
    await env.STATUS.put(`wmedia:${id}:${f}`, buf);
    return json({ ok: true });
  }
  if (url.pathname === "/api/work-nas" && request.method === "POST") {
    const b = await request.json().catch(() => null);
    const w = b && await env.STATUS.get(`work:${b.id}`, "json");
    if (!w) return json({ error: "bad" }, 400);
    w.media = b.media; w.status = "pending"; await putWork(env, w);
    const raw = [...Array(w.photos).keys()].map(i => `p${i + 1}`).concat([...Array(w.parts).keys()].map(i => `v${i}`));
    await Promise.all(raw.map(k => env.STATUS.delete(`wraw:${w.id}:${k}`)));
    return json({ ok: true });
  }
  return null;
}

export const WORKS_CSS = `.wkcard summary{cursor:pointer}.wkcard form{display:grid;gap:10px;margin-top:10px}.wkcard label{display:grid;gap:4px;font-size:.9rem}
.wkcard input,.wkcard select,.wkcard textarea{font:inherit;padding:8px;border:1px solid #cfd8d8;border-radius:8px;background:#fff}
.wkcard .wk-ok{display:flex;gap:8px;align-items:center}.wkcard button{padding:11px;border:0;border-radius:10px;background:var(--teal);color:#fff;font-size:1rem}
.wk-row{display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid #eee;font-size:.92rem}
.wk-st{padding:1px 8px;border-radius:99px;background:#eee;font-size:.75rem;white-space:nowrap}.wk-live{background:#dcfce7;color:#166534}.wk-pending{background:#fef3c7;color:#92400e}
.wk-media{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:6px;margin:8px 0}.wk-media img,.wk-media video{width:100%;border-radius:8px;background:#000}
.wk-media video{grid-column:1/-1;max-height:420px}.wk-act{display:flex;gap:8px}.wk-act button{flex:1;padding:10px;border:0;border-radius:10px;background:var(--teal);color:#fff;font-size:1rem}.wk-act .no{background:#999}
.wk-b p{margin:4px 0;font-size:.92rem}`;
