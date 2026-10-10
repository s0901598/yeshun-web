// 站內連結與圖片路徑都要經過這裡，自動加上網站的根路徑。
// GitHub Pages 的網址是 /yeshun-web/，之後換成公司網域時只要改 astro.config.mjs 的 base。
const base = import.meta.env.BASE_URL.replace(/\/$/, '');

export function u(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//')) return path; // 外部連結、tel:、mailto: 不處理
  if (base && (path === base || path.startsWith(base + '/'))) return path; // 已經加過
  return base + path;
}
