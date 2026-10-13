// 網站固定文案。公司資料與聯絡方式改在後台「公司資料」管理（src/lib/data.ts 的 getCompanies、getSettings）
// 深色模式：訪客按過切換鈕就用他選的；沒選過就跟著系統設定，系統沒設定時是淺色。頁首有切換鈕。
// 改成 false 會全站固定淺色、拿掉切換鈕
export const darkModeEnabled = true;

// 進站 Loading、Cookie 提示＋隱私權政策：等業主確認後才開（true＝顯示）
export const loaderEnabled = false;
export const cookieNoticeEnabled = false;

export const site = {
  slogan: '從設計到完工，每個細節都看得見',
};

export interface NavItem { href: string; label: string; en: string; children?: { href: string; label: string }[] }
// 「注重的細節」頁：業主覺得名稱不夠專業，先隱藏（選單、頁尾、首頁區塊都不顯示，網址轉回首頁）。改成 true 就恢復
export const detailsEnabled = false;

const allNav: NavItem[] = [
  { href: '/about', label: '公司介紹', en: 'ABOUT' },
  { href: '/projects', label: '案例作品', en: 'PROJECTS' },
  { href: '/details', label: '注重的細節', en: 'DETAILS' },
  { href: '/process', label: '服務流程', en: 'PROCESS' },
];
// 實際顯示的選單：公司介紹的名稱來自後台（公司資料 → 公司介紹頁 → 頁面名稱）
export const siteNav = (aboutTitle: string): NavItem[] => allNav
  .filter((item) => detailsEnabled || item.href !== '/details')
  .map((item) => (item.href === '/about' && aboutTitle ? { ...item, label: aboutTitle } : item));

// 服務流程內容改由後台管理；todo 為 true 時流程頁顯示「內容待確認」
export const processTodo = true;
