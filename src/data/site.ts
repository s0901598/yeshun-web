// 網站固定文案。公司資料與聯絡方式改在後台「公司資料」管理（src/lib/data.ts 的 getCompanies、getSettings）
// 深色模式：業主希望以淺色為主，先關掉（全站固定淺色、不顯示切換鈕）。改成 true 就恢復切換
export const darkModeEnabled = false;

export const site = {
  slogan: '從設計到完工，每個細節都看得見',
};

export interface NavItem { href: string; label: string; en: string; children?: { href: string; label: string }[] }
export const nav: NavItem[] = [
  { href: '/about', label: '關於我們', en: 'ABOUT' },
  { href: '/projects', label: '案例作品', en: 'PROJECTS' },
  { href: '/details', label: '注重的細節', en: 'DETAILS' },
  { href: '/process', label: '服務流程', en: 'PROCESS' },
];

// 服務流程內容改由後台管理；todo 為 true 時流程頁顯示「內容待確認」
export const processTodo = true;
