/* ============ The K Style 上手屋 ============ */

// ---- 分店資料（一處維護，自動產生卡片 + 電話/地圖連結）----
const PHONE = "+85368016817";
const branches = [
  {
    en: "Tsai Kong Nam",
    name: "雀仔園分店",
    slug: "tsaikong",
    addr: "澳門馬大臣街 39-A 號富麗樓地下 B 舖",
    map: "澳門馬大臣街39-A號富麗樓 上手屋",
    photo: "assets/img/branch/tsaikong.jpg"
  },
  {
    en: "Park N Shop",
    name: "黑沙環百佳分店",
    slug: "parknshop",
    addr: "澳門黑沙環大馬路 114 號利添閣／利寶閣／利盛閣　百佳購物中心地下內舖 BD（小熊貓入口）",
    map: "澳門黑沙環大馬路114號 百佳購物中心 上手屋",
    photo: "assets/img/branch/parknshop.jpg"
  },
  {
    en: "San Miu",
    name: "氹仔新苗超市店",
    slug: "sanmiu",
    addr: "氹仔柯維納馬路　匯景商場地下 AE 舖（商場內舖，入口近匯景花園第三座）",
    map: "氹仔柯維納馬路 匯景商場 上手屋",
    photo: "assets/img/branch/sanmiu.jpg"
  },
  {
    en: "Nam Keng",
    name: "氹仔消防局店",
    slug: "nanjing",
    addr: "氹仔南京街 372 號帝庭軒地下 F 座",
    map: "氹仔南京街372號帝庭軒 上手屋",
    photo: "assets/img/branch/nanjing-interior-1.jpg"
  },
  {
    en: "University of Macau",
    name: "澳門大學店",
    slug: "um",
    addr: "澳門大學　大學大馬路薈萃坊商場 S8 座 2 樓 2011 室（超級市場對面）",
    map: "澳門大學 薈萃坊商場 上手屋",
    photo: "assets/img/branch/um.jpg"
  },
  {
    en: "The Praia",
    name: "寰宇天下店",
    slug: "universe",
    addr: "澳門黑沙環中街 194 號寰宇天下地下 AA 座",
    map: "澳門黑沙環中街194號寰宇天下 The K Style 上手屋",
    photo: "assets/img/branch/universe.jpg"
  }
];

const icoPin = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
const icoPhone = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';
const icoClock = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>';

const grid = document.getElementById("branchGrid");
if (grid) {
  grid.innerHTML = branches.map(b => {
    const mapUrl = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(b.map);
    const media = b.photo
      ? `<div class="branch-media"><img src="${b.photo}" alt="${b.name}門面" loading="lazy">
           <div class="branch-cap"><span class="branch-tag">${b.en}</span><h3>${b.name}</h3></div></div>`
      : `<div class="branch-media placeholder"><span class="soon">門面相稍後上載</span>
           <div class="branch-cap"><span class="branch-tag">${b.en}</span><h3>${b.name}</h3></div></div>`;
    return `
    <article class="branch reveal">
      ${media}
      <div class="branch-content">
        <div class="branch-addr">${icoPin}<span>${b.addr}</span></div>
        <div class="branch-hours">${icoClock} 星期一至日 10:00–20:00</div>
        <div class="branch-actions">
          <a class="btn btn-gold btn-sm" href="branches/${b.slug}.html">分店詳情</a>
          <a class="btn btn-outline btn-sm" href="tel:${PHONE}">${icoPhone} 致電</a>
          <a class="btn btn-outline btn-sm" href="${mapUrl}" target="_blank" rel="noopener">${icoPin} 地圖</a>
        </div>
      </div>
    </article>`;
  }).join("");
}

// ---- 導覽列：捲動變色 ----
const nav = document.getElementById("nav");
const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 40);
onScroll();
window.addEventListener("scroll", onScroll, { passive: true });

// ---- 手機選單 ----
const toggle = document.getElementById("navToggle");
const links = document.getElementById("navLinks");
toggle.addEventListener("click", () => {
  links.classList.toggle("open");
  nav.classList.toggle("menu-open");
});
links.querySelectorAll("a").forEach(a =>
  a.addEventListener("click", () => {
    links.classList.remove("open");
    nav.classList.remove("menu-open");
  })
);

// ---- 捲動顯示動畫 ----
const io = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  });
}, { threshold: 0.12 });
document.querySelectorAll(".reveal").forEach(el => io.observe(el));

// ---- 年份 ----
document.getElementById("year").textContent = new Date().getFullYear();
