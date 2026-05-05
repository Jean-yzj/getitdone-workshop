# 今天一定要把事情解決工作坊 · 官方網站

> 用 5 小時，把那件你拖了很久的事完成。

純靜態網站（HTML + CSS + JS），可直接推上 GitHub 並用 [Zeabur](https://zeabur.com) 一鍵部署。視覺定調為「實習通的清爽信任感 × 懶熊的溫潤手感」。

---

## 📁 專案結構

```
getitdone-website/
├── index.html         # 首頁（hero + 為什麼 + 流程 + 規則 + 報名表 + FAQ）
├── success.html       # 報名成功頁
├── style.css          # 全部樣式（藍灰流線視覺系統）
├── script.js          # 表單行為、滾動動畫
├── assets/
│   └── bear.svg       # 懶熊 mascot
├── package.json       # Zeabur 偵測用
├── zeabur.json        # Zeabur 部署設定（靜態站）
├── .gitignore
└── README.md
```

---

## 🚀 快速本地預覽

任選一種方式：

```bash
# 方法 1：用 npx serve（不用裝任何東西）
npx serve .

# 方法 2：用 Python 內建 HTTP server
python3 -m http.server 3000

# 方法 3：直接在 Finder/檔案總管雙擊 index.html
```

打開 [http://localhost:3000](http://localhost:3000) 即可預覽。

---

## 🔌 把表單接上真的會收到信的後端

預設 `index.html` 表單的 `action` 是 `https://formspree.io/f/YOUR_FORMSPREE_ID` —— 這是個佔位字串，**送出後會自動 fallback 到 success.html**（用 JavaScript 接管）。要正式收信，請選一種：

### 選項 A · Formspree（推薦，最快）
1. 到 [formspree.io](https://formspree.io) 註冊帳號（免費方案每月 50 封）
2. 點 **New Form**，填入接收信箱
3. 複製它給你的端點，例如 `https://formspree.io/f/abcd1234`
4. 把 `index.html` 裡的 `YOUR_FORMSPREE_ID` 改成 `abcd1234`
5. 完成。每次有人報名你就會收到 email

### 選項 B · Web3Forms（完全免費，無上限）
1. 到 [web3forms.com](https://web3forms.com) 用 email 申請 access key
2. 把表單 `action` 改為 `https://api.web3forms.com/submit`
3. 在 form 內加一行：`<input type="hidden" name="access_key" value="你的 KEY">`

### 選項 C · 接到 Google 表單
最簡單但 UI 會跳走：把表單區塊改成一個按鈕，連到你的 Google 表單 URL 即可。

> 任何選項，記得設好「送出後跳轉到 `success.html`」（Formspree 會用 `_redirect` hidden field，已經幫你設好）。

---

## 🐙 推上 GitHub

```bash
# 1. 在這個資料夾初始化 git
cd getitdone-website
git init
git add .
git commit -m "feat: 第一版網站"

# 2. 在 GitHub 開一個新 repo（不勾 README、不勾 .gitignore）
# 假設 repo 叫 getitdone-workshop

# 3. 連結並推送
git branch -M main
git remote add origin https://github.com/你的帳號/getitdone-workshop.git
git push -u origin main
```

---

## ☁️ 部署到 Zeabur

### 5 步驟，2 分鐘完成

1. 到 [zeabur.com](https://zeabur.com) 登入（用 GitHub 登入最快）
2. 點 **Create Project** → 取個名字
3. 點 **Deploy New Service** → 選 **Git**
4. 選擇你剛剛推上去的 `getitdone-workshop` repo
5. Zeabur 會偵測到 `zeabur.json` → 自動把它當成靜態站部署 → 等 30 秒 → ✅ 完成

部署完成後 Zeabur 會給你一個 `xxx.zeabur.app` 的網址，可以直接用。

### 換成自己的網域

1. Zeabur Dashboard → 你的 service → **Domain**
2. 點 **Add Domain**，填入你的網域（例如 `getitdone.tw`）
3. 它會給你一筆 CNAME 紀錄，到你的 DNS 商（Cloudflare / Gandi / Namecheap）加上去
4. 等幾分鐘 DNS propagate → 完成

---

## 🎨 客製化重點

| 想改什麼 | 在哪裡改 |
|----------|----------|
| 活動日期、地點、費用 | `index.html` 多處有 `[週六/日]` `13:00-18:00` 等字樣，搜尋取代 |
| 配色 | `style.css` 最上面 `:root` 內的 CSS 變數 |
| 懶熊長相 | `assets/bear.svg`（純 SVG，可以直接編輯線條與顏色） |
| 加 Logo | 在 `<nav>` 區塊裡換掉 `.brand` 內的內容 |
| 加 Google Analytics | 在 `<head>` 結尾加 GA tag |
| 加 Open Graph 預覽圖 | 在 `<head>` 加 `<meta property="og:image" content="...">` |

---

## 📝 待辦提醒

- [ ] 把 `Formspree YOUR_FORMSPREE_ID` 換成真的端點
- [ ] 確認 `index.html` 內 `[週六/日]` `13:00-18:00` `hello@getitdone.tw` 等佔位字串
- [ ] 製作一張 1200×630 的 OG 預覽圖，放在 `assets/og.png`，並在 `<head>` 加 `<meta property="og:image">`
- [ ] 在 favicon 之外，可以再做一個 `apple-touch-icon.png` 增加完成度
- [ ] 上線前測試所有表單欄位、success.html 跳轉、手機版佈局

---

## 📄 授權

MIT。如果你 fork 或衍生使用，希望你也辦一場「拖延處理活動」，幫一個人完成他想做的事。

---

> Made with quiet courage. 🐻
