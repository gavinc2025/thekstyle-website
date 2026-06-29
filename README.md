# The K Style 上手屋 — 官方網站

澳門單剪專門店官方網站（靜態網站：HTML / CSS / JS，無需後端）。

## 檔案結構

```
index.html          首頁（單頁式）
css/style.css       樣式
js/main.js          互動 + 分店資料（改分店請編輯呢度）
assets/img/         logo、相片、分店門面相
robots.txt          畀搜尋器爬蟲
sitemap.xml         網站地圖（畀 Google）
```

> ⚠️ 換 domain 後，記得將以下檔案入面嘅 `https://www.thekstyle.mo` 全部改成你嘅真實網址：
> `index.html`（canonical / og:url / og:image / 結構化資料）、`robots.txt`、`sitemap.xml`。

---

## 一、放上 GitHub

1. 去 https://github.com 開一個帳戶（如未有），撳 **New repository**，名例如 `thekstyle-website`，設為 **Public**，唔好勾任何 README/gitignore（呢度已經有）。
2. 喺呢個資料夾執行（首次）：

```bash
git remote add origin https://github.com/你的帳戶/thekstyle-website.git
git branch -M main
git push -u origin main
```

之後每次改完內容更新網站：

```bash
git add -A
git commit -m "更新內容"
git push
```

---

## 二、用 Cloudflare Pages 部署（免費）

1. 去 https://dash.cloudflare.com 開帳戶 → 左邊 **Workers & Pages** → **Create** → **Pages** → **Connect to Git**。
2. 揀返頭先個 GitHub repo。
3. Build 設定：**Framework preset = None**，Build command 留空，**Output directory = `/`**（根目錄）。撳 **Save and Deploy**。
4. 幾十秒後會畀你一個免費網址，例如 `thekstyle-website.pages.dev`，即刻睇到網站。

之後你一 `git push`，Cloudflare 會自動重新部署，唔使理。

---

## 三、駁自己 domain（建議，利於 Google 排名）

1. 買 domain（`.com` 約 HK$100/年；`.mo` 澳門域名要澳門商業登記，較正式）。
2. Cloudflare Pages 個 project → **Custom domains** → **Set up a domain** → 輸入你 domain → 跟指示改 DNS（如果 domain 都係放喺 Cloudflare，會自動搞掂）。
3. Cloudflare 會自動發 SSL（https），唔使另外整。

---

## 四、令 Google 搜尋到（重要）

1. 去 **Google Search Console**：https://search.google.com/search-console
2. 加入你嘅網址（建議用 Domain property，用 DNS 驗證；Cloudflare 加一筆 TXT 記錄即可）。
3. 驗證後，喺左邊 **Sitemaps** 提交：`sitemap.xml`
4. 用 **網址審查 (URL Inspection)** 貼上首頁網址 → **要求建立索引 (Request Indexing)**，加快收錄。
5. 通常幾日內，search「上手屋 The K Style」就會見到你個官方網站。

> 補充：Google 地圖商家卡仍然會照樣顯示（無法移除）。最有效改善評論觀感嘅方法，係主動邀請滿意客人留五星好評，並專業回覆負評。

---

## 改分店 / 內容

- **分店資料**（名、地址、電話、地圖、門面相）：改 `js/main.js` 最上面嘅 `branches` 陣列。
- **門面相**：放入 `assets/img/branch/`，喺 `branches` 入面填返 `photo` 路徑。
- 改完 `git push`，Cloudflare 自動更新。
