// 上手屋網站：靜態頁 + 細 API（分店「已開門」狀態）
//   POST /api/open    路由器見到師傅手機 → 記低今日開門時間（每日第一次為準）
//                     header: Authorization: Bearer <token>；body: {"shop":"um","time":"09:51"}
//   GET  /api/status?shop=um → {"date":"2026-09-27","open":"09:51"}（未開 = null）
// 其餘網址照出靜態檔（wrangler.jsonc 只將 /api/* 交畀呢個程式）
const SHOPS = new Set(["um"]);            // 暫時得澳大店（SH06）
const TZ_MS = 8 * 3600 * 1000;            // 澳門時間 UTC+8

const macauDate = () => new Date(Date.now() + TZ_MS).toISOString().slice(0, 10);
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
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

    if (url.pathname === "/api/status" && request.method === "GET") {
      const shop = url.searchParams.get("shop");
      if (!SHOPS.has(shop)) return json({ error: "shop" }, 400);
      const date = macauDate();
      const open = await env.STATUS.get(`open:${shop}:${date}`);
      return json({ date, open });
    }

    if (url.pathname === "/api/open" && request.method === "POST") {
      const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
      if (!token || (await sha256hex(token)) !== env.OPEN_TOKEN_SHA256) return json({ error: "auth" }, 401);
      let body;
      try { body = await request.json(); } catch { return json({ error: "body" }, 400); }
      const { shop, time } = body || {};
      if (!SHOPS.has(shop) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time || "")) return json({ error: "bad" }, 400);
      const key = `open:${shop}:${macauDate()}`;
      const prev = await env.STATUS.get(key);
      if (!prev) await env.STATUS.put(key, time, { expirationTtl: 60 * 60 * 24 * 40 });
      return json({ ok: true, open: prev || time, first: !prev });
    }

    return json({ error: "not found" }, 404);
  },
};
