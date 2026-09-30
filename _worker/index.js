// 上手屋網站：靜態頁 + 細 API（分店「已開門」狀態）
//   POST /api/open    路由器見到師傅手機 → 記低今日開門時間（每日第一次為準）
//                     header: Authorization: Bearer <token>；body: {"shop":"um","time":"09:51"}（加 "dry":true 只測試唔寫）
//   GET  /api/status?shop=um → {"date":"2026-09-27","open":"09:51"}（未開 = null）
//   POST /api/roster  NAS 推員工更表（Bearer ROSTER token）→ KV "roster"
//   GET  /r/<專屬碼>  員工更表頁（見 roster.js；唔俾 Google 收錄）
// 其餘網址照出靜態檔（wrangler.jsonc 只將 /api/* 交畀呢個程式）
import { rosterPage, goneHtml } from "./roster.js";

const SHOPS = new Set(["um", "nanjing"]);  // 澳大店（SH06）、消防局店（SH04）
const TZ_MS = 8 * 3600 * 1000;            // 澳門時間 UTC+8

const macauDate = () => new Date(Date.now() + TZ_MS).toISOString().slice(0, 10);
const html = (body, status = 200) => new Response(body, {
  status, headers: {
    "content-type": "text/html; charset=utf-8", "cache-control": "no-store",
    "x-robots-tag": "noindex, nofollow", "referrer-policy": "no-referrer",
  },
});
const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

async function sha256hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/r/") && request.method === "GET") {
      const code = url.pathname.slice(3);
      const data = /^[A-Za-z0-9_-]{16,64}$/.test(code) && await env.STATUS.get("roster", "json");
      const name = data && data.links[await sha256hex(code)];
      return name ? html(rosterPage(data, name, macauDate())) : html(goneHtml, 404);
    }
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

    if (url.pathname === "/api/roster" && request.method === "POST") {
      const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
      if (!token || (await sha256hex(token)) !== env.ROSTER_TOKEN_SHA256) return json({ error: "auth" }, 401);
      let body;
      try { body = await request.json(); } catch { return json({ error: "body" }, 400); }
      if (!body || !Array.isArray(body.days) || !Array.isArray(body.shops) || typeof body.links !== "object") return json({ error: "bad" }, 400);
      await env.STATUS.put("roster", JSON.stringify(body));
      return json({ ok: true, days: body.days.length, links: Object.keys(body.links).length });
    }

    if (url.pathname === "/api/status" && request.method === "GET") {
      const shop = url.searchParams.get("shop");
      if (!SHOPS.has(shop)) return json({ error: "shop" }, 400);
      const date = macauDate();
      const open = await env.STATUS.get(`open:${shop}:${date}`);
      return json({ date, open });
    }

    if (url.pathname === "/api/open" && request.method === "POST") {
      const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
      if (!token || !env.OPEN_TOKEN_SHA256.split(",").includes(await sha256hex(token))) return json({ error: "auth" }, 401);
      let body;
      try { body = await request.json(); } catch { return json({ error: "body" }, 400); }
      const { shop, time } = body || {};
      if (!SHOPS.has(shop) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time || "")) return json({ error: "bad" }, 400);
      if (body.dry) return json({ ok: true, dry: true });   // 測試用：驗證 token/格式，唔寫入
      const key = `open:${shop}:${macauDate()}`;
      const prev = await env.STATUS.get(key);
      if (!prev) await env.STATUS.put(key, time, { expirationTtl: 60 * 60 * 24 * 40 });
      return json({ ok: true, open: prev || time, first: !prev });
    }

    return json({ error: "not found" }, 404);
  },
};
