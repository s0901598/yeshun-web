# 業順營造官網（yeshun-web）

給有營造、裝修需求的業主看的公司官網。舊站 `yeshuncompany` 保留不動，這是重新製作的新版。

## 技術
- Astro（靜態輸出），部署在 GitHub Pages：https://s0901598.github.io/yeshun-web/
- 站內連結和圖片一律用 `src/lib/url.ts` 的 `u()` 包起來，才會自動加上 `/yeshun-web` 根路徑；換成公司網域時改 `astro.config.mjs` 的 `site` 與 `base` 即可
- 資料：目前寫在 `src/data/`，之後改接 Supabase（資料庫＋照片空間＋後台登入）

## 指令
| 指令 | 說明 |
|---|---|
| `npm install` | 安裝套件 |
| `npm run dev` | 本機開發，網址 http://localhost:4321 |
| `npm run build` | 打包到 `dist/` |
| `npm run preview` | 預覽打包結果，網址 http://localhost:4321/yeshun-web/ |
| `npm run deploy` | 打包並部署到 GitHub Pages（推到 `gh-pages` 分支） |

## 頁面
| 網址 | 內容 |
|---|---|
| `/` | 首頁：主視覺、數據、精選案例、注重的細節、服務流程 |
| `/about` | 關於業順 |
| `/projects` | 案例作品（可依分類篩選，支援 `?cat=residential`） |
| `/projects/<slug>` | 案例詳情：照片、案例說明、施工進度時間軸 |
| `/details` | 我們注重的細節 |
| `/process` | 服務流程：時間軸跟著捲動畫出，步驟依序亮起 |
| `/contact` | 聯絡我們：聯絡方式、需求表單、地圖 |

## 要改內容去哪裡
| 內容 | 檔案 |
|---|---|
| 公司資料、電話、LINE、地址、數據、服務流程、細節 | `src/data/site.ts` |
| 案例、施工階段、照片 | `src/data/projects.ts` |
| 照片檔 | `public/images/` |

- 標了 `todo: true` 的欄位是示意內容，頁面上會顯示橘色「待補」標籤。
- 全部換成真實資料後，把 `src/data/site.ts` 的 `showTodo` 改成 `false`，所有「待補」標籤就會消失。

## 發布規則
- 只有 `published: true` 的案例和照片會出現在官網，草稿不會產生頁面。
- 讀資料的入口只有 `src/lib/data.ts`，之後接 Supabase 時只要改這支檔案。

## 淺色／深色模式
- 預設跟隨使用者的系統設定；頁首 ☀/☾ 按鈕可以手動切換，網站會記住選擇。
- 顏色都定義在 `src/styles/global.css` 開頭：`:root` 是深色，`:root[data-theme='light']` 是淺色。
- 金色分兩種：`--gold` 用在線條和按鈕（兩種模式一樣），`--gold-text` 用在文字（淺色模式較深）。

## RWD 斷點
| 裝置 | 寬度 | 版面 |
|---|---|---|
| 手機 | < 768px | 單欄、漢堡選單、案例與照片可左右滑、底部固定聯絡列 |
| 平板 | 768–1199px | 雙欄、漢堡選單、底部固定聯絡列 |
| 電腦 | ≥ 1200px | 完整橫向選單、多欄版面 |

## 下一步
1. 換上真實內容（公司資料、登記字號、Logo、真實案例照片）
2. 建立 Supabase 資料表，官網改從資料庫讀取
3. 部署到 Cloudflare Pages
4. 第二階段：手機上傳照片的後台（上傳 → 草稿 → 按發布才公開）
