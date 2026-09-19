#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
由 BRANCHES 資料一次過產生六版分店頁 → branches/<slug>.html
用法: python3 build_branches.py
改分店資料/相片/點去，改呢個檔就得，唔好逐版 html 手改。
"""
import os, html, json

SITE   = "https://www.thekstyle.com"
PHONE  = "+85368016817"
PHONE_TXT = "6801 6817"
HOURS  = "星期一至日 10:00 – 20:00"

BRANCHES = [
    dict(slug="tsaikong", en="Tsai Kong Nam", name="雀仔園分店", area="澳門半島",
         addr="澳門馬大臣街 39-A 號富麗樓地下 B 舖",
         schema_addr="馬大臣街39-A號富麗樓地下B舖",
         map="澳門馬大臣街39-A號富麗樓 上手屋",
         howto="近雀仔園街市，沿馬大臣街步行可達。",
         price=[("單剪", "MOP 60")],
         photos=[("assets/img/branch/tsaikong.jpg", "雀仔園分店門面")],
         kw="雀仔園髮型屋,雀仔園剪髮,澳門半島單剪"),
    dict(slug="parknshop", en="Park N Shop", area="黑沙環", name="黑沙環百佳分店",
         addr="澳門黑沙環大馬路 114 號利添閣／利寶閣／利盛閣　百佳購物中心地下內舖 BD（小熊貓入口）",
         schema_addr="黑沙環大馬路114號利添閣／利寶閣／利盛閣 百佳購物中心地下內舖BD",
         map="澳門黑沙環大馬路114號 百佳購物中心 上手屋",
         howto="百佳購物中心地下內舖，由「小熊貓」入口入，見到百佳超市後直行。",
         price=[("單剪", "MOP 60")],
         photos=[("assets/img/branch/parknshop.jpg", "黑沙環百佳分店門面")],
         kw="黑沙環髮型屋,黑沙環剪髮,百佳購物中心理髮"),
    dict(slug="sanmiu", en="San Miu", area="氹仔", name="氹仔新苗超市店",
         addr="氹仔柯維納馬路　匯景商場地下 AE 舖（商場內舖，入口近匯景花園第三座）",
         schema_addr="氹仔柯維納馬路 匯景商場地下AE舖",
         map="氹仔柯維納馬路 匯景商場 上手屋",
         howto="匯景商場地下內舖，由匯景花園第三座旁邊嘅商場入口入，近新苗超級市場。",
         price=[("單剪", "MOP 60")],
         photos=[("assets/img/branch/sanmiu.jpg", "氹仔新苗超市店門面")],
         kw="氹仔髮型屋,氹仔剪髮,新苗超市理髮,匯景商場"),
    dict(slug="nanjing", en="Nam Keng", area="氹仔", name="氹仔消防局店",
         addr="氹仔南京街 372 號帝庭軒地下 F 座",
         schema_addr="氹仔南京街372號帝庭軒地下F座",
         map="氹仔南京街372號帝庭軒 上手屋",
         howto="近氹仔消防局，帝庭軒地下，南京街街口。",
         price=[("單剪", "MOP 80")],
         photos=[("assets/img/branch/nanjing-interior-1.jpg", "氹仔消防局店店內座位"),
                 ("assets/img/branch/nanjing-interior-2.jpg", "氹仔消防局店店內霓虹燈裝飾")],
         kw="氹仔髮型屋,氹仔剪髮,消防局理髮,帝庭軒"),
    dict(slug="um", en="University of Macau", area="澳門大學", name="澳門大學店",
         addr="澳門大學　大學大馬路薈萃坊商場 S8 座 2 樓 2011 室（超級市場對面）",
         schema_addr="大學大馬路薈萃坊商場S8座2樓2011室",
         map="澳門大學 薈萃坊商場 上手屋",
         howto="澳門大學校園內薈萃坊商場 S8 座，上二樓，超級市場對面。",
         price=[("學生／教職員（學校卡）", "MOP 54"), ("一般收費", "MOP 60")],
         photos=[("assets/img/branch/um.jpg", "澳門大學店店內座位與門面")],
         kw="澳門大學剪髮,澳大理髮,薈萃坊商場,學生剪髮"),
    dict(slug="universe", en="The Praia", area="黑沙環", name="寰宇天下店",
         addr="澳門黑沙環中街 194 號寰宇天下地下 AA 座",
         schema_addr="黑沙環中街194號寰宇天下地下AA座",
         map="澳門黑沙環中街194號寰宇天下 The K Style 上手屋",
         howto="寰宇天下地下，黑沙環中街街口。",
         price=[("單剪", "MOP 80")],
         photos=[("assets/img/branch/universe.jpg", "寰宇天下店門面")],
         kw="黑沙環髮型屋,寰宇天下理髮,黑沙環中街剪髮"),
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


def map_url(q):
    from urllib.parse import quote
    return "https://www.google.com/maps/search/?api=1&query=" + quote(q)


def page(b, others):
    e = html.escape
    title = f"{b['name']} ‧ {b['area']}剪髮 | The K Style 上手屋"
    desc = f"The K Style 上手屋 {b['name']}：{b['addr']}。{b['howto']} {HOURS}，致電 {PHONE_TXT} 查詢。"
    photos = "".join(
        f'<figure class="bp-photo"><img src="../{src}" alt="{e(alt)}" loading="lazy"></figure>'
        for src, alt in b["photos"]) or (
        '<p class="bp-nophoto">分店相片稍後上載。</p>')
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
    if b["photos"]:
        schema["image"] = f"{SITE}/{b['photos'][0][0]}"
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
<meta property="og:title" content="{e(b['name'])} ‧ The K Style 上手屋">
<meta property="og:description" content="{e(desc)}">
<meta property="og:locale" content="zh_HK">
<link rel="icon" type="image/png" href="../assets/img/favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;1,500&family=Noto+Serif+TC:wght@500;700;900&family=Noto+Sans+TC:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../css/style.css">
<link rel="stylesheet" href="../css/branch.css">
<script type="application/ld+json">{json.dumps(schema, ensure_ascii=False, indent=2)}</script>
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
    <h1>{e(b['name'])}<small>{e(b['area'])} ‧ 單剪專門店</small></h1>

    <ul class="bp-facts">
      <li>{ICO_PIN}<span>{e(b['addr'])}</span></li>
      <li>{ICO_CLOCK}<span>{HOURS}</span></li>
      <li>{ICO_TAG}<span>{e('／'.join(f'{n} {p}' for n, p in b['price']))}</span></li>
      <li>{ICO_PHONE}<a href="tel:{PHONE}">{PHONE_TXT}</a></li>
    </ul>

    <div class="bp-cta">
      <a class="btn btn-gold" href="tel:{PHONE}">{ICO_PHONE} 致電查詢</a>
      <a class="btn btn-outline" href="{map_url(b['map'])}" target="_blank" rel="noopener">{ICO_PIN} 用地圖帶路</a>
    </div>
  </div>
</header>

<main>
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
        p = os.path.join(out, b["slug"] + ".html")
        with open(p, "w", encoding="utf-8") as f:
            f.write(page(b, BRANCHES))
        print("寫咗", os.path.relpath(p, root), "—", b["name"], "(%d 張相)" % len(b["photos"]))
    # sitemap
    urls = [f"{SITE}/"] + [f"{SITE}/branches/{b['slug']}" for b in BRANCHES]
    sm = ['<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u in urls:
        sm.append(f"  <url>\n    <loc>{u}</loc>\n    <changefreq>monthly</changefreq>"
                  f"\n    <priority>{'1.0' if u.endswith('/') else '0.8'}</priority>\n  </url>")
    sm.append("</urlset>")
    with open(os.path.join(root, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write("\n".join(sm) + "\n")
    print("更新咗 sitemap.xml（%d 條）" % len(urls))


if __name__ == "__main__":
    main()
