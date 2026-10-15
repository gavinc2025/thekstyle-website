#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
由 BRANCHES 資料一次過產生六版分店頁 → branches/<slug>.html
用法: python3 build_branches.py
改分店資料/相片/點去，改呢個檔就得，唔好逐版 html 手改。
"""
import os, html, json

SITE   = "https://thekstyle.com"
PHONE  = "+85368016817"
PHONE_TXT = "6801 6817"
HOURS  = "星期一至日 10:00 – 20:00"
import datetime
TODAY  = datetime.date.today().isoformat()

# 「大頭」服務 —— 全澳只有寰宇天下店做（其餘五間只做單剪）
# 價錢係起步價：唔分男女，長頭髮會加少少
# 洗頭只做畀旅客（本地人唔會淨洗頭）→ 洗頭資料一律用簡體，唔放入繁體收費表
WASH_PRICE = 200    # MOP，包吹乾、不包造型
SERVICES = [
    ("染髮", "MOP 580 起", "男女都做；長髮按長度另加少少"),
    ("燙髮（電髮）", "MOP 580 起", "男仔電髮、女士曲髮都得"),
    ("直髮", "MOP 580 起", "柔順拉直"),
]
UNIVERSE_FAQ = [
    ("澳门哪里可以洗头？",
     f"上手屋只有寰宇天下店（黑沙环中街 194 号）可以洗头，MOP {WASH_PRICE}，包吹干、不包造型，不用剪发也可以。"
     f"请先致电 {PHONE_TXT} 预约；营业时间每天 10:00–20:00。"),
    ("染髮、電髮幾錢？",
     "染髮 MOP 580 起、燙髮（電髮）MOP 580 起、直髮 MOP 580 起，唔分男女；長頭髮會按長度另加少少。實際價錢可以致電查詢。"),
    ("用咩牌子嘅染髮劑？",
     "採用日本 Milbon 專業染髮產品，喺樓上獨立染燙區進行，唔會同剪髮客人擠埋一齊。"),
    ("男仔可唔可以染髮、電髮？",
     "當然得，男士染髮、男仔電髮都係我哋常做嘅服務。"),
    ("使唔使預約？",
     f"染髮、燙髮、直髮請先致電 {PHONE_TXT} 預約；單剪就唔使預約，直接到店取票。"),
    ("營業時間係幾點？", f"同分店一樣，{HOURS}。"),
]

# 染燙小知識短片（VoxPix 出片，女聲；只放自己網站，唔放有留言嘅平台——用戶 10/16）
# (檔名, 標題, 描述)；檔案喺 assets/video/<檔名>.mp4 ＋ <檔名>.jpg 封面
# ⚠️新片放最前（寰宇天下頁只顯示頭 4 條，其餘喺 /tips 專頁）；分批上線：出好片抄去 assets/video 先加入呢度
KNOW_VIDEOS = [
    ("k8_lvke_xitou", "来澳门玩，想洗个头？", "游客洗头 MOP 200，包吹干、不包造型；全澳上手屋只有寰宇天下店提供。"),
    ("k7_youshui", "染完頭髮游水會唔會甩色？", "游水、玩海水前後做好幾步，減少氯水同海水傷害染過嘅頭髮。"),
    ("k6_tuise", "染完好快褪色點算？", "染完頭髮好快褪色？太陽、洗頭、吹頭三樣日常習慣要留意。"),
    ("k5_nanshi_ranse", "男士染髮點揀色？", "男仔第一次染髮唔知揀咩色？記住「三度以內」同「染深比染淺少傷」。"),
    ("k4_baitou", "白頭髮點染先自然？", "白頭髮愈來愈多？教你揀啱染膏、揀啱顏色，同點樣補髮根。"),
    ("k1_ranfa", "染頭髮前後要注意咩？", "第一次染先喺耳後試敏感、染前一日唔好洗頭、染完 48 小時內唔好洗頭，用護色洗頭水。"),
    ("k2_dianfa", "電髮點樣先可以長啲？", "電完 48 小時唔好洗頭、唔好綁頭；電髮同染髮最好隔一至兩個星期。"),
    ("k3_lazhi", "拉直頭髮要知嘅三件事", "做完 48–72 小時唔好洗頭、唔好綁頭；新生頭髮會再曲，一般幾個月補做髮根。"),
]

BRANCHES = [
    dict(slug="tsaikong", en="Tsai Kong Nam", name="雀仔園分店", area="澳門半島",
         addr="澳門馬大臣街 39-A 號富麗樓地下 B 舖",
         schema_addr="馬大臣街39-A號富麗樓地下B舖",
         map="澳門馬大臣街39-A號富麗樓 上手屋",
         howto="近雀仔園街市，沿馬大臣街步行可達。",
         price=[("單剪", "MOP 60")],
         photos=[("assets/img/branch/tsaikong.jpg", "雀仔園分店門面")],
         kw="雀仔園髮型屋,雀仔園剪髮,雀仔園快剪,澳門半島單剪,澳門快剪",
         title="雀仔園快剪 ‧ 單剪 $60 ‧ 澳門半島剪髮"),
    dict(slug="parknshop", en="Park N Shop", area="黑沙環", name="黑沙環百佳分店",
         addr="澳門黑沙環大馬路 114 號利添閣／利寶閣／利盛閣　百佳購物中心地下內舖 BD（小熊貓入口）",
         schema_addr="黑沙環大馬路114號利添閣／利寶閣／利盛閣 百佳購物中心地下內舖BD",
         map="澳門黑沙環大馬路114號 百佳購物中心 上手屋",
         howto="百佳購物中心地下內舖，由「小熊貓」入口入，見到百佳超市後直行。",
         price=[("單剪", "MOP 60")],
         photos=[("assets/img/branch/parknshop.jpg", "黑沙環百佳分店門面")],
         kw="黑沙環髮型屋,黑沙環剪髮,黑沙環快剪,黑沙環百佳,百佳購物中心理髮,澳門快剪",
         title="黑沙環百佳快剪 ‧ 單剪 $60 ‧ 黑沙環剪髮"),
    dict(slug="sanmiu", en="San Miu", area="氹仔", name="氹仔新苗超市店",
         addr="氹仔柯維納馬路　匯景商場地下 AE 舖（商場內舖，入口近匯景花園第三座）",
         schema_addr="氹仔柯維納馬路 匯景商場地下AE舖",
         map="氹仔柯維納馬路 匯景商場 上手屋",
         howto="匯景商場地下內舖，由匯景花園第三座旁邊嘅商場入口入，近新苗超級市場。",
         price=[("單剪", "MOP 60")],
         photos=[("assets/img/branch/sanmiu.jpg", "氹仔新苗超市店門面")],
         kw="氹仔快剪,氹仔剪頭髮,氹仔髮型屋,氹仔剪髮,新苗超市理髮,匯景商場",
         title="氹仔快剪 ‧ 單剪 $60 ‧ 新苗超市／匯景商場"),
    dict(slug="nanjing", en="Nam Keng", area="氹仔", name="氹仔消防局店",
         addr="氹仔南京街 372 號帝庭軒地下 F 座",
         schema_addr="氹仔南京街372號帝庭軒地下F座",
         map="氹仔南京街372號帝庭軒 上手屋",
         howto="近氹仔消防局，帝庭軒地下，南京街街口。",
         price=[("單剪", "MOP 80")],
         photos=[("assets/img/branch/nanjing.jpg", "氹仔消防局店門面"),
                 ("assets/img/branch/nanjing-street.jpg", "氹仔消防局店對面街望過去"),
                 ("assets/img/branch/nanjing-interior-1.jpg", "氹仔消防局店店內座位"),
                 ("assets/img/branch/nanjing-interior-2.jpg", "氹仔消防局店店內霓虹燈裝飾")],
         kw="氹仔快剪,氹仔剪頭髮,氹仔髮型屋,氹仔剪髮,消防局理髮,南京街,帝庭軒",
         title="氹仔消防局快剪 ‧ 單剪 $80 ‧ 南京街剪髮",
         live="nanjing"),   # SH04 路由器偵測師傅返工 → 頁頂「已開門」
    dict(slug="um", en="University of Macau", area="澳門大學", name="澳門大學店",
         addr="澳門大學　大學大馬路薈萃坊商場 S8 座 2 樓 2011 室（超級市場對面）",
         schema_addr="大學大馬路薈萃坊商場S8座2樓2011室",
         map="澳門大學 薈萃坊商場 上手屋",
         howto="澳門大學校園內薈萃坊商場 S8 座，上二樓，超級市場對面。",
         price=[("學生／教職員（學校卡）", "MOP 54"), ("一般收費", "MOP 60")],
         live_works=True,   # 師傅喺專屬連結上載、老闆批咗 → /api/works?shop=um
         live="um",   # 路由器偵測師傅返工 → 頁頂顯示「已開門」（_worker/index.js /api/status）
         photos=[("assets/img/branch/um-front.jpg", "澳門大學店門面"),
                 ("assets/img/branch/um.jpg", "澳門大學店店內座位")],
         kw="澳門大學剪髮,澳大理髮,澳大快剪,薈萃坊商場,學生剪髮",
         title="澳門大學剪髮 ‧ 學生 $54 ‧ 薈萃坊快剪"),
    dict(slug="universe", en="The Praia", area="黑沙環", name="寰宇天下店",
         addr="澳門黑沙環中街 194 號寰宇天下地下 AA 座",
         schema_addr="黑沙環中街194號寰宇天下地下AA座",
         map="澳門黑沙環中街194號寰宇天下 The K Style 上手屋",
         howto="寰宇天下地下，黑沙環中街街口。",
         price=[("單剪", "MOP 80")],
         photos=[("assets/img/branch/universe.jpg", "寰宇天下店門面"),
                 ("assets/img/branch/universe-service.jpg", "寰宇天下店髮型師為客人做頭髮")],
         kw="黑沙環髮型屋,寰宇天下理髮,黑沙環中街剪髮,澳門染髮,黑沙環染髮,澳門電髮,黑沙環燙髮,"
            "澳門直髮,男士染髮,男仔電髮,Milbon染髮,日本染髮,澳门洗头,澳门哪里可以洗头,游客洗头,澳门染发,澳门烫发",
         tagline="快剪 ‧ 染髮 ‧ 燙髮 ‧ 直髮",
         title="黑沙環剪髮、染髮、電髮 ‧ 澳门洗头",
         works_title="師傅作品",
         live_works=True,
         videos=KNOW_VIDEOS,
         services=SERVICES, faq=UNIVERSE_FAQ),
]

ICO_PIN = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" '
           'stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>')
ICO_PHONE = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" '
             'stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 '
             '19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 '
             '9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>')
ICO_CLOCK = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" '
             'stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>')
ICO_TAG = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" '
           'stroke-linejoin="round"><path d="M20.59 13.41 12 4.83A2 2 0 0 0 10.59 4H4v6.59a2 2 0 0 0 .59 1.41l8.58 8.59a2 '
           '2 0 0 0 2.83 0l4.59-4.59a2 2 0 0 0 0-2.59z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>')


def load_works(root, b):
    d = os.path.join(root, "assets", "img", "works", b["slug"])
    if not os.path.isdir(d):
        return []
    caps = {}
    cf = os.path.join(d, "captions.txt")
    if os.path.exists(cf):
        for line in open(cf, encoding="utf-8"):
            if "|" in line:
                k, v = line.rstrip("\n").split("|", 1)
                caps[k.strip()] = v.strip()
    return [(f"assets/img/works/{b['slug']}/{f}", caps.get(f) or b["name"] + "師傅作品")
            for f in sorted(os.listdir(d)) if f.lower().endswith((".jpg", ".jpeg", ".webp", ".png"))]


def map_url(q):
    from urllib.parse import quote
    return "https://www.google.com/maps/search/?api=1&query=" + quote(q)


def page(b, others):
    e = html.escape
    title = f"{b.get('title') or b['name'] + ' ‧ ' + b['area'] + '剪髮'}｜上手屋{b['name']}"
    price_txt = "、".join(f"{n} {p}" for n, p in b["price"])
    # 描述放價錢＋唔使預約喺最前（手機搜尋結果只見頭 70 字左右）
    desc = (f"上手屋{b['name']}｜{price_txt}，唔使預約、即到即剪。{b['howto']}"
            f"{HOURS}，全年無休，致電 {PHONE_TXT}。")
    if b.get("services"):
        desc = (f"The K Style 上手屋 {b['name']}：全澳唯一做染髮、燙髮（電髮）、直髮嘅分店，"
                f"樓上設獨立染燙區，採用日本 Milbon 染髮產品，染髮 MOP 580 起，男女都做。{b['addr']}。{HOURS}，致電 {PHONE_TXT} 預約。游客洗头 MOP {WASH_PRICE}。")
    photos = "".join(
        f'<figure class="bp-photo"><img src="../{src}" alt="{e(alt)}" loading="lazy"></figure>'
        for src, alt in b["photos"]) or (
        '<p class="bp-nophoto">分店相片稍後上載。</p>')
    works = b.get("works") or []
    works_html = ""
    works_js = ""
    if works or b.get("live_works"):
        figs = "".join(
            f'<figure class="bp-photo bp-work"><img src="../{src}" alt="{e(alt)}" loading="lazy">'
            f'{f"<figcaption>{e(alt)}</figcaption>" if alt != b["name"] + "師傅作品" else ""}</figure>'
            for src, alt in works)
        works_html = f"""
  <section class="wrap bp-sec" id="works"{"" if works else " hidden"}>
    <h2>{e(b.get('works_title') or '師傅作品')}</h2>
    <div class="bp-works" id="liveWorks"></div>
    <div class="bp-gallery">{figs}</div>
  </section>
"""
    works_js = ""
    if b.get("live_works"):
        works_js = """
(function () {
  var box = document.getElementById("liveWorks"), sec = document.getElementById("works");
  function esc(s) { return String(s || "").replace(/[&<>"']/g, function (c) { return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  fetch("/api/works?shop=%s").then(function (r) { return r.json(); }).then(function (d) {
    if (!d.works || !d.works.length) return;
    box.innerHTML = d.works.map(function (w) {
      var m = w.video ? '<video src="' + w.video + '" poster="' + (w.poster || "") + '" controls preload="none" playsinline></video>'
        : w.photos.map(function (p) { return '<img src="' + p + '" alt="' + esc(w.title) + '" loading="lazy">'; }).join("");
      return '<article class="bp-wk"><div class="bp-wk-m' + (w.video ? " v" : "") + '">' + m + '</div><div class="bp-wk-t"><h3>' + esc(w.title) + '</h3>'
        + (w.problem ? '<p><b>客人想要：</b>' + esc(w.problem) + '</p>' : "")
        + (w.solution ? '<p><b>師傅點做：</b>' + esc(w.solution) + '</p>' : "")
        + '<small>師傅 ' + esc(w.name) + '</small></div></article>';
    }).join("");
    sec.hidden = false;
  }).catch(function () {});
})();""" % b["slug"]
    vid_html = ""
    if b.get("videos"):
        more = len(b["videos"]) > 4
        cards = "".join(
            f'<figure class="bp-vid"><video src="../assets/video/{f}.mp4" poster="../assets/video/{f}.jpg" controls preload="none" playsinline></video>'
            f'<figcaption><b>{e(t)}</b>{e(d)}</figcaption></figure>' for f, t, d in b["videos"][:4])
        vid_html = f"""
  <section class="wrap bp-sec" id="tips">
    <h2>染燙小知識</h2>
    <div class="bp-vids">{cards}</div>
    {f'<p class="bp-more"><a class="btn btn-teal" href="../tips">睇晒全部 {len(b["videos"])} 條染燙小知識 →</a></p>' if more else ''}
  </section>
"""
        vids_ld = [{"@context": "https://schema.org", "@type": "VideoObject", "name": t, "description": d,
                    "thumbnailUrl": f"{SITE}/assets/video/{f}.jpg", "contentUrl": f"{SITE}/assets/video/{f}.mp4",
                    "uploadDate": "2026-10-16", "inLanguage": "yue"} for f, t, d in b["videos"]]
    prices = "".join(f"<tr><th>{e(n)}</th><td>{e(p)}</td></tr>" for n, p in b["price"])
    nav_others = "".join(
        f'<li><a href="{o["slug"]}">{e(o["name"])}<span>{e(o["area"])}</span></a></li>'
        for o in others if o["slug"] != b["slug"])
    schema = {
        "@context": "https://schema.org", "@type": "HairSalon",
        "@id": f"{SITE}/branches/{b['slug']}#shop",
        "name": f"The K Style 上手屋 ‧ {b['name']}",
        "url": f"{SITE}/branches/{b['slug']}",
        "telephone": "+853-6801-6817", "priceRange": "$",
        "address": {"@type": "PostalAddress", "streetAddress": b["schema_addr"],
                    "addressLocality": "澳門", "addressCountry": "MO"},
        "openingHoursSpecification": [{"@type": "OpeningHoursSpecification",
                                       "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday",
                                                     "Friday", "Saturday", "Sunday"],
                                       "opens": "10:00", "closes": "20:00"}],
    }
    if b["photos"] or works:
        schema["image"] = [f"{SITE}/{src}" for src, _ in b["photos"] + works]
    if b.get("services"):
        offers = []
        for n, p, _ in b["services"]:
            o = {"@type": "Offer", "itemOffered": {"@type": "Service", "name": n}}
            num = "".join(c for c in p if c.isdigit())
            if num:
                o["priceSpecification"] = {"@type": "PriceSpecification", "minPrice": int(num),
                                           "priceCurrency": "MOP"}
            offers.append(o)
        offers.append({"@type": "Offer", "itemOffered": {"@type": "Service", "name": "洗头（包吹干）"},
                       "price": WASH_PRICE, "priceCurrency": "MOP"})
        schema["makesOffer"] = offers
    extra_ld = ""
    if b.get("faq"):
        faq = {"@context": "https://schema.org", "@type": "FAQPage",
               "mainEntity": [{"@type": "Question", "name": q,
                               "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in b["faq"]]}
        extra_ld = ('\n<script type="application/ld+json">'
                    + json.dumps(faq, ensure_ascii=False, indent=2) + '</script>')
    if b.get("videos"):
        extra_ld += ('\n<script type="application/ld+json">'
                     + json.dumps(vids_ld, ensure_ascii=False, indent=2) + '</script>')
    og_img = f'\n<meta property="og:image" content="{SITE}/{b["photos"][0][0]}">' if b["photos"] else ""
    live_html = ""
    live_js = ""
    if b.get("live"):
        live_html = '<p class="bp-live" id="liveStatus" hidden></p>\n    '
        live_js = """
(function () {
  var el = document.getElementById("liveStatus");
  function macauNow() { var d = new Date(Date.now() + 8 * 3600 * 1000); return d.getUTCHours() * 60 + d.getUTCMinutes(); }
  function show(cls, txt) { el.className = "bp-live " + cls; el.textContent = txt; el.hidden = false; }
  function tick() {
    if (macauNow() >= 20 * 60) { show("closed", "已收舖 ‧ 明日 10:00 開門"); return; }
    fetch("/api/status?shop=%s", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
      if (d.open) show("open", "已開門（" + d.open + " 開始營業）"); else el.hidden = true;
    }).catch(function () {});
  }
  tick(); setInterval(tick, 60000);
})();""" % b["live"]
    svc_html = ""
    if b.get("services"):
        rows = "".join(f'<tr><th>{e(n)}<small>{e(d)}</small></th><td>{e(p)}</td></tr>'
                       for n, p, d in b["services"])
        faqs = "".join(f'<details class="bp-faq"><summary>{e(q)}</summary><p>{e(a)}</p></details>'
                       for q, a in b["faq"])
        svc_html = f"""
  <section class="wrap bp-sec bp-svc" id="services">
    <h2>染髮 ‧ 燙髮 ‧ 直髮</h2>
    <p class="bp-lead"><b>全澳上手屋只有呢間分店做</b>，其餘五間只做單剪。<b>樓上設獨立染燙區</b>，採用<b>日本 Milbon</b> 專業染髮產品。男女都做，歡迎男士染髮、男仔電髮。</p>
    <table class="bp-price bp-price-svc"><tbody>{rows}</tbody></table>
    <p class="bp-note">以上為起步價，唔分男女；長頭髮會按長度另加少少。染、燙、直請先致電 <a href="tel:{PHONE}">{PHONE_TXT}</a> 預約。</p>
    <div class="bp-sc" lang="zh-Hans" id="wash">
      <h3>游客洗头 <span>MOP {WASH_PRICE}</span></h3>
      <p>全澳上手屋<b>只有这间分店可以洗头</b>，不用剪发也可以。包吹干，不包造型。</p>
      <p>请先致电 <a href="tel:{PHONE}">{PHONE_TXT}</a> 预约 ‧ 营业时间每天 10:00–20:00 ‧ 黑沙环中街 194 号寰宇天下地下 AA 座</p>
    </div>
  </section>

  <section class="wrap bp-sec">
    <h2>常見問題</h2>
    {faqs}
  </section>
"""
    elif any(o.get("services") for o in others):
        svc_html = f"""
  <section class="wrap bp-sec">
    <p class="bp-xsell">想染髮、電髮或者直髮？呢間分店只做單剪，請去 <a href="universe#services">寰宇天下店</a>（黑沙環中街 194 號），先致電 {PHONE_TXT} 預約。</p>
    <p class="bp-xsell bp-xsell-sc" lang="zh-Hans">想洗头？请到 <a href="universe#wash">寰宇天下店</a>（黑沙环中街 194 号），MOP {WASH_PRICE}，包吹干，请先致电 {PHONE_TXT} 预约。</p>
  </section>
"""
    return f"""<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<meta name="keywords" content="{e(b['kw'])},上手屋,The K Style,澳門單剪">
<meta name="theme-color" content="#2D8484">
<link rel="canonical" href="{SITE}/branches/{b['slug']}">
<meta property="og:type" content="business.business">
<meta property="og:title" content="{e(title)}">
<meta property="og:url" content="{SITE}/branches/{b['slug']}">{og_img}
<meta property="og:description" content="{e(desc)}">
<meta property="og:locale" content="zh_HK">
<link rel="icon" type="image/png" href="../assets/img/favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;1,500&family=Noto+Serif+TC:wght@500;700;900&family=Noto+Sans+TC:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../css/style.css">
<link rel="stylesheet" href="../css/branch.css">
<script type="application/ld+json">{json.dumps(schema, ensure_ascii=False, indent=2)}</script>{extra_ld}
</head>
<body class="branch-page">

<nav class="nav scrolled" id="nav">
  <div class="wrap">
    <a href="../index.html" class="nav-logo">
      <img src="../assets/img/logo-white.png" alt="The K Style 上手屋">
      <span class="zh">上手屋</span>
    </a>
    <div class="nav-links" id="navLinks">
      <a href="../index.html#about">關於我們</a>
      <a href="../index.html#branches">所有分店</a>
      <a href="tel:{PHONE}" class="btn btn-gold btn-sm nav-cta">致電預約</a>
    </div>
    <button class="nav-toggle" id="navToggle" aria-label="選單"><span></span><span></span><span></span></button>
  </div>
</nav>

<header class="bp-head">
  <div class="wrap">
    <nav class="crumb" aria-label="麵包屑"><a href="../index.html">主頁</a> ‧ <a href="../index.html#branches">分店</a> ‧ <span>{e(b['name'])}</span></nav>
    <p class="bp-en">{e(b['en'])}</p>
    {live_html}<h1>{e(b['name'])}<small>{e(b['area'])} ‧ {e(b.get('tagline') or '快剪 ‧ 單剪專門店')}</small></h1>

    <ul class="bp-facts">
      <li>{ICO_PIN}<span>{e(b['addr'])}</span></li>
      <li>{ICO_CLOCK}<span>{HOURS}</span></li>
      <li>{ICO_TAG}<span>{e('／'.join(f'{n} {p}' for n, p in b['price']))}{'／染髮 MOP 580 起' if b.get('services') else ''}</span></li>
      <li>{ICO_PHONE}<a href="tel:{PHONE}">{PHONE_TXT}</a></li>
    </ul>

    <div class="bp-cta">
      <a class="btn btn-gold" href="tel:{PHONE}">{ICO_PHONE} 致電查詢</a>
      <a class="btn btn-outline" href="{map_url(b['map'])}" target="_blank" rel="noopener">{ICO_PIN} 用地圖帶路</a>
    </div>
  </div>
</header>

<main>
{svc_html}{vid_html}{works_html}
  <section class="wrap bp-sec">
    <h2>點去</h2>
    <p class="bp-howto">{e(b['howto'])}</p>
  </section>

  <section class="wrap bp-sec">
    <h2>收費</h2>
    <table class="bp-price"><tbody>{prices}</tbody></table>
    <p class="bp-note">只接受電子支付，不設找續。詳情歡迎致電 {PHONE_TXT} 查詢。</p>
  </section>

  <section class="wrap bp-sec">
    <h2>店內環境</h2>
    <div class="bp-gallery">{photos}</div>
  </section>

  <section class="wrap bp-sec">
    <h2>其他分店</h2>
    <ul class="bp-others">{nav_others}</ul>
  </section>
</main>

<footer class="footer">
  <div class="wrap footer-bottom">
    © <span id="year"></span> The K Style 上手屋 ‧ 版權所有 ‧ <a href="tel:{PHONE}">{PHONE_TXT}</a>
  </div>
</footer>

<script>
document.getElementById("year").textContent = new Date().getFullYear();{live_js}{works_js}
var t = document.getElementById("navToggle"), l = document.getElementById("navLinks");
if (t && l) t.addEventListener("click", function () {{ l.classList.toggle("open"); }});
</script>
</body>
</html>
"""


def tips_page():
    e = html.escape
    cards = "".join(
        f'<figure class="bp-vid" id="{f}"><video src="assets/video/{f}.mp4" poster="assets/video/{f}.jpg" controls preload="none" playsinline></video>'
        f'<figcaption><b>{e(t)}</b>{e(d)}</figcaption></figure>' for f, t, d in KNOW_VIDEOS)
    ld = [{"@context": "https://schema.org", "@type": "VideoObject", "name": t, "description": d,
           "thumbnailUrl": f"{SITE}/assets/video/{f}.jpg", "contentUrl": f"{SITE}/assets/video/{f}.mp4",
           "uploadDate": "2026-10-16", "inLanguage": "yue"} for f, t, d in KNOW_VIDEOS]
    title = "染髮、電髮、拉直小知識短片｜上手屋寰宇天下店"
    desc = (f"{len(KNOW_VIDEOS)} 條 30 秒廣東話短片：白頭髮點染、男士染髮揀色、染完褪色、電髮打理、拉直注意事項、游客洗头。"
            f"上手屋寰宇天下店，染／燙／直 MOP 580 起，致電 {PHONE_TXT} 預約。")
    return f"""<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<meta name="keywords" content="染髮知識,電髮打理,拉直頭髮,白頭髮染髮,男士染髮,染髮褪色,澳門染髮,黑沙環染髮,澳门洗头,上手屋">
<meta name="theme-color" content="#2D8484">
<link rel="canonical" href="{SITE}/tips">
<meta property="og:type" content="website">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{SITE}/tips">
<meta property="og:image" content="{SITE}/assets/video/{KNOW_VIDEOS[0][0]}.jpg">
<meta property="og:locale" content="zh_HK">
<link rel="icon" type="image/png" href="assets/img/favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;1,500&family=Noto+Serif+TC:wght@500;700;900&family=Noto+Sans+TC:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="css/style.css">
<link rel="stylesheet" href="css/branch.css">
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False, indent=2)}</script>
</head>
<body class="branch-page">
<nav class="nav scrolled" id="nav">
  <div class="wrap">
    <a href="index.html" class="nav-logo"><img src="assets/img/logo-white.png" alt="The K Style 上手屋"><span class="zh">上手屋</span></a>
    <div class="nav-links" id="navLinks">
      <a href="branches/universe#services">染燙收費</a>
      <a href="index.html#branches">所有分店</a>
      <a href="tel:{PHONE}" class="btn btn-gold btn-sm nav-cta">致電預約</a>
    </div>
    <button class="nav-toggle" id="navToggle" aria-label="選單"><span></span><span></span><span></span></button>
  </div>
</nav>
<header class="bp-head">
  <div class="wrap">
    <nav class="crumb" aria-label="麵包屑"><a href="index.html">主頁</a> ‧ <a href="branches/universe">寰宇天下店</a> ‧ <span>染燙小知識</span></nav>
    <p class="bp-en">Hair Tips</p>
    <h1>染燙小知識<small>{len(KNOW_VIDEOS)} 條 30 秒短片 ‧ 寰宇天下店師傅話你知</small></h1>
    <div class="bp-cta">
      <a class="btn btn-gold" href="tel:{PHONE}">{ICO_PHONE} 致電預約 {PHONE_TXT}</a>
      <a class="btn btn-outline" href="branches/universe">{ICO_PIN} 寰宇天下店</a>
    </div>
  </div>
</header>
<main>
  <section class="wrap bp-sec">
    <div class="bp-vids">{cards}</div>
    <p class="bp-note">染髮、燙髮（電髮）、直髮 MOP 580 起，唔分男女；只限寰宇天下店（黑沙環中街 194 號），請先致電 {PHONE_TXT} 預約。</p>
  </section>
</main>
<footer class="footer"><div class="wrap footer-bottom">© <span id="year"></span> The K Style 上手屋 ‧ <a href="tel:{PHONE}">{PHONE_TXT}</a></div></footer>
<script>
document.getElementById("year").textContent = new Date().getFullYear();
var t = document.getElementById("navToggle"), l = document.getElementById("navLinks");
if (t && l) t.addEventListener("click", function () {{ l.classList.toggle("open"); }});
</script>
</body>
</html>
"""


def main():
    root = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(root, "branches")
    os.makedirs(out, exist_ok=True)
    for b in BRANCHES:
        b["works"] = load_works(root, b)
    for b in BRANCHES:
        p = os.path.join(out, b["slug"] + ".html")
        with open(p, "w", encoding="utf-8") as f:
            f.write(page(b, BRANCHES))
        print("寫咗", os.path.relpath(p, root), "—", b["name"], "(%d 張相、%d 張作品)" % (len(b["photos"]), len(b["works"])))
    with open(os.path.join(root, "tips.html"), "w", encoding="utf-8") as f:
        f.write(tips_page())
    print("寫咗 tips.html —", len(KNOW_VIDEOS), "條知識片")
    # sitemap
    urls = [f"{SITE}/"] + [f"{SITE}/branches/{b['slug']}" for b in BRANCHES] + [f"{SITE}/tips"]
    sm = ['<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u in urls:
        sm.append(f"  <url>\n    <loc>{u}</loc>\n    <changefreq>monthly</changefreq>"
                  f"\n    <priority>{'1.0' if u.endswith('/') else '0.8'}</priority>\n  </url>")
    sm.append("</urlset>")
    sm = [x.replace("<changefreq>", f"<lastmod>{TODAY}</lastmod>\n    <changefreq>") for x in sm]
    with open(os.path.join(root, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write("\n".join(sm) + "\n")
    print("更新咗 sitemap.xml（%d 條）" % len(urls))


if __name__ == "__main__":
    main()
