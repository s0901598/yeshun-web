// 後台共用：資料庫連線、照片壓縮上傳、檔案清理、通知官網更新
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

export const BUCKET = 'photos';

export function photoUrl(path: string | null | undefined): string {
  if (!path) return '';
  if (/^https?:\/\//.test(path)) return path;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** 資料庫操作失敗時丟出中文錯誤 */
export function must<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

// ---------- 照片壓縮 ----------
// 長邊縮到 1920px。瀏覽器支援就存 WebP，不支援（例如部分 iPhone Safari）就存 JPEG。
async function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function compressImage(file: File, maxSide = 1920): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const webp = await encode(canvas, 'image/webp', 0.82);
  if (webp && webp.type === 'image/webp') return webp;
  const jpeg = await encode(canvas, 'image/jpeg', 0.85);
  if (!jpeg) throw new Error('照片處理失敗');
  return jpeg;
}

/** 壓縮後上傳，回傳在照片空間裡的路徑 */
export async function uploadImage(folder: string, file: File): Promise<string> {
  const blob = await compressImage(file);
  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  must(await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: '31536000' }));
  return path;
}

/** 刪除照片檔；如果還有其他地方在用（例如被設為封面），就保留不刪 */
export async function removeFileIfUnused(path: string | null | undefined) {
  if (!path || /^https?:\/\//.test(path)) return;
  const counts = await Promise.all([
    supabase.from('photos').select('id', { count: 'exact', head: true }).eq('path', path),
    supabase.from('projects').select('id', { count: 'exact', head: true }).eq('cover_path', path),
    supabase.from('details').select('id', { count: 'exact', head: true }).eq('image_path', path),
  ]);
  if (counts.some((c) => (c.count ?? 0) > 0)) return;
  must(await supabase.storage.from(BUCKET).remove([path]));
}

// ---------- 通知官網更新 ----------
// 內容有變動時排程一次「重新打包官網」；連續修改只會在停手幾秒後送出一次。
export type SiteStatus = 'idle' | 'pending' | 'sent' | 'not_configured' | 'error';
let status: SiteStatus = 'idle';
const listeners = new Set<(s: SiteStatus) => void>();
let timer: ReturnType<typeof setTimeout> | undefined;

function setStatus(s: SiteStatus) {
  status = s;
  listeners.forEach((fn) => fn(s));
}
export function onSiteStatus(fn: (s: SiteStatus) => void) {
  listeners.add(fn);
  fn(status);
  return () => listeners.delete(fn);
}

export function scheduleSiteUpdate() {
  setStatus('pending');
  clearTimeout(timer);
  timer = setTimeout(sendSiteUpdate, 5000);
}

export async function sendSiteUpdate() {
  clearTimeout(timer);
  const { data, error } = await supabase.functions.invoke('trigger-deploy', { method: 'POST' });
  if (!error && data?.ok) return setStatus('sent');
  const body = error && 'context' in error ? await (error as any).context?.json?.().catch(() => null) : null;
  setStatus(body?.error === 'not_configured' ? 'not_configured' : 'error');
}

// 離開頁面前還有沒送出的更新，就立刻送出
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { if (status === 'pending') void sendSiteUpdate(); });
}

// ---------- 其他 ----------
/** 官網上的網址（自動加上 /yeshun-web 根路徑） */
export const siteUrl = (path: string) => import.meta.env.BASE_URL.replace(/\/$/, '') + path;

export const categoryOptions = [
  { value: 'residential', label: '住宅空間' },
  { value: 'commercial', label: '商業空間' },
  { value: 'office', label: '辦公空間' },
  { value: 'public', label: '公共空間' },
];

export const lines = (text: string) => text.split('\n').map((s) => s.trim()).filter(Boolean);

/** 依畫面上的順序把整串重新編號成 0,1,2… 存回資料庫 */
export async function saveOrder(table: string, ids: string[]) {
  await Promise.all(ids.map((id, sort) => supabase.from(table).update({ sort }).eq('id', id)));
}
export function move<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr;
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
