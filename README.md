# 業順營造官網（yeshun-web）

給有營造、裝修需求的業主看的公司官網。舊站 `yeshuncompany` 保留不動，這是重新製作的新版。

## 技術
- Astro（靜態輸出），部署在 GitHub Pages：https://s0901598.github.io/yeshun-web/
- 內容（案例、施工進度、照片、注重的細節、服務流程）存在 Supabase 專案 `yeshun-web`（東京機房，ref `tstqnfsnjefuwdkywxke`）。注意：同一個帳號下還有另一個無關的專案，不要混用
- 後台：https://s0901598.github.io/yeshun-web/admin/ （Preact，登入後直接讀寫資料庫）
- 站內連結和圖片一律用 `src/lib/url.ts` 的 `u()` 包起來，才會自動加上 `/yeshun-web` 根路徑；換成公司網域時改 `astro.config.mjs` 的 `site` 與 `base` 即可

## 內容更新流程：儲存 → 預覽 → 發布
```
後台修改（先暫存在畫面上）→「全部儲存並上傳」存進資料庫（官網不變）
  →「預覽」/preview/?id=…（登入才看得到，含未發布內容）
  → 案例按「發布這個案例」；其他內容按上方「發布到官網」
  → Supabase 函式 trigger-deploy（確認是後台人員）→ GitHub Actions 重新打包 → GitHub Pages（約 1–2 分鐘）
```
- 新上傳的照片是「未發布」，案例按「發布這個案例」時會一起發布；勾「不放上官網」的照片會略過。
- 資料庫記錄最後修改與最後發布時間（`site_meta`），後台上方會顯示「有變更還沒發布」。
- 注意：任何一次發布（或推程式碼）都會把所有「已儲存」的細節、流程、公司資料一起帶上官網；案例則只有已發布的會出現。
- 推程式碼到 main 也會自動部署；`npm run deploy` 可以手動觸發一次。
- 自動更新需要在 Supabase → Edge Functions → Secrets 設定 `GITHUB_DEPLOY_TOKEN`（只對 yeshun-web 有 Contents 讀寫權限的 GitHub token）。

## 資料庫與權限
- 結構在 `supabase/migrations/`，用 `npx supabase db push` 套用。
- 訪客（官網）只讀得到 `published = true` 的內容；只有 `staff` 名單裡的帳號能新增、修改、刪除與上傳照片。
- 後台角色：**管理員**（內容＋帳號管理）、**編輯**（所有內容，含發布與刪除，不能管理帳號）。
- 已關閉自行註冊。帳號由管理員在後台「帳號管理」建立，系統產生隨機密碼（只顯示一次），使用者登入後可自己改密碼。
- 後台帳號 `xxx` 實際存成 `xxx@yeshun.local`（Supabase 需要 email 格式），登入時只要輸入帳號。
- 建立帳號、重設密碼需要最高權限金鑰，只在 Supabase 函式 `manage-accounts` 裡使用。
- `.env`（不會上傳）存放資料庫密碼、最高權限金鑰與後台初始密碼。

## 指令
| 指令 | 說明 |
|---|---|
| `npm install` | 安裝套件 |
| `npm run dev` | 本機開發，網址 http://localhost:4321 |
| `npm run build` | 打包到 `dist/` |
| `npm run preview` | 預覽打包結果，網址 http://localhost:4321/yeshun-web/ |
| `npm run verify` | 完整驗證（Chrome＋iPhone Safari 核心 × 手機/平板/電腦 × 深/淺色，含開選單、看大圖、篩選、主題切換）。先執行 `npm run preview`；也可以加網址測線上版：`npm run verify -- https://s0901598.github.io/yeshun-web` |
| `npm run verify:admin` | 後台權限驗證（建立臨時編輯帳號測試權限，測完自動刪除）。需要本機 `.env` |
| `npm run verify:flow` | 後台完整流程驗證（新增案例、階段、照片、儲存、預覽、發布、下架、刪除、公司資料），會自己建立並刪除測試資料，發布呼叫會被攔截不會更新官網。需要 `.env` |
| `npm run deploy` | 手動觸發 GitHub Actions 重新部署官網 |
| `npm run seed` | （只在初次建置用）把 `scripts/sample-data.ts` 的示意內容匯入資料庫，會覆蓋現有內容 |

## 頁面
| 網址 | 內容 |
|---|---|
| `/` | 首頁：主視覺、數據、精選案例、注重的細節、服務流程 |
| `/about/` | 關於我們（兩家公司入口） |
| `/about/yeshun/`、`/about/yaosan/` | 業順營造、耀三室內裝修介紹 |
| `/preview/?id=…` | 後台預覽案例（需登入，不會被搜尋引擎收錄） |
| `/projects` | 案例作品（可依分類篩選，支援 `?cat=residential`） |
| `/projects/<slug>` | 案例詳情：照片、案例說明、施工進度時間軸 |
| `/details` | 我們注重的細節 |
| `/process` | 服務流程：時間軸跟著捲動畫出，步驟依序亮起 |
| `/contact` | 聯絡我們：聯絡方式、需求表單、地圖 |

## 要改內容去哪裡
| 內容 | 在哪裡改 |
|---|---|
| 案例、施工進度、照片、注重的細節、服務流程 | 後台 `/admin/` |
| 兩家公司介紹、登記字號、登記證照片、電話、LINE、地址、營業時間、首頁數據 | 後台「公司資料」 |
| 首頁標語、選單 | `src/data/site.ts` |

- 標了 `todo: true` 的欄位是示意內容，頁面上會顯示橘色「待補」標籤。
- 全部換成真實資料後，把 `src/data/site.ts` 的 `showTodo` 改成 `false`，所有「待補」標籤就會消失。

## 發布規則
- 案例、照片：上傳後是草稿，按「發布」才公開；發布案例前必須有封面。
- 細節、流程：關掉「顯示在官網」可以暫時隱藏。
- 官網讀資料的入口只有 `src/lib/data.ts`。

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
2. 買公司網域並掛到 GitHub Pages
