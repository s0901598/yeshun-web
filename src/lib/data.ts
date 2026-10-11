// 官網讀取資料的唯一入口：打包網站時從 Supabase 讀取內容。
// 使用公開金鑰（publishable key），資料庫權限規則保證只讀得到「已發布」的內容。
import { createClient } from '@supabase/supabase-js';
import type { Category, CompanyId, Project, Status } from '../data/projects';

const url = import.meta.env.PUBLIC_SUPABASE_URL;
const key = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error('缺少 PUBLIC_SUPABASE_URL 或 PUBLIC_SUPABASE_PUBLISHABLE_KEY，請確認 .env');

const db = createClient(url, key, { auth: { persistSession: false } });

/** 照片在資料庫存的是照片空間裡的路徑，轉成可以直接顯示的網址 */
export function photoUrl(path: string | null | undefined): string {
  if (!path) return '';
  if (/^https?:\/\//.test(path)) return path;
  return `${url}/storage/v1/object/public/photos/${path}`;
}

function must<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(`讀取資料庫失敗：${error.message}`);
  return data as T;
}

const bySort = <T extends { sort: number }>(a: T, b: T) => a.sort - b.sort;

// 一次打包會呼叫很多次，結果暫存起來只讀一次
let projectsCache: Promise<Project[]> | undefined;

export function getProjects(): Promise<Project[]> {
  projectsCache ??= (async () => {
    const rows = must(await db
      .from('projects')
      .select('*, stages(*, photos(*))')
      .order('started_at', { ascending: false, nullsFirst: false }));
    return rows.map((r: any): Project => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      category: r.category as Category,
      company: r.company as CompanyId,
      location: r.location,
      areaPing: r.area_ping === null ? 0 : Number(r.area_ping),
      durationDays: r.duration_days ?? 0,
      status: r.status as Status,
      summary: r.summary,
      highlights: r.highlights ?? [],
      cover: photoUrl(r.cover_path),
      featured: r.featured,
      published: r.published,
      startedAt: r.started_at ?? '',
      stages: (r.stages ?? []).sort(bySort).map((s: any) => ({
        id: s.id,
        name: s.name,
        date: s.date ?? '',
        note: s.note,
        sort: s.sort,
        photos: (s.photos ?? []).sort(bySort).map((ph: any) => ({
          id: ph.id,
          url: photoUrl(ph.path),
          caption: ph.caption,
          published: ph.published,
          sort: ph.sort,
        })),
      })),
    }));
  })();
  return projectsCache;
}

export async function getFeaturedProjects(limit = 4): Promise<Project[]> {
  return (await getProjects()).filter((pj) => pj.featured).slice(0, limit);
}

export interface DetailItem { id: string; code: string; title: string; summary: string; body: string; image: string }

export async function getDetails(): Promise<DetailItem[]> {
  const rows = must(await db.from('details').select('*').order('sort'));
  return rows.map((r: any, i: number) => ({
    id: r.id,
    code: `D-${String(i + 1).padStart(2, '0')}`,
    title: r.title,
    summary: r.summary,
    body: r.body,
    image: photoUrl(r.image_path),
  }));
}

export interface ProcessStep { id: string; no: string; en: string; title: string; desc: string; items: string[]; duration: string }

export async function getProcessSteps(): Promise<ProcessStep[]> {
  const rows = must(await db.from('process_steps').select('*').order('sort'));
  return rows.map((r: any, i: number) => ({
    id: r.id,
    no: String(i + 1).padStart(2, '0'),
    en: r.en,
    title: r.title,
    desc: r.description,
    items: r.items ?? [],
    duration: r.duration,
  }));
}

// ---------- 公司資料（業順營造、耀三室內裝修） ----------
export interface Company {
  id: CompanyId; name: string; shortName: string; englishName: string; field: string;
  intro: string; services: string[]; licenseNo: string; licenseImage: string; sort: number;
}

let companiesCache: Promise<Record<CompanyId, Company>> | undefined;
export function getCompanies(): Promise<Record<CompanyId, Company>> {
  companiesCache ??= (async () => {
    const rows = must(await db.from('companies').select('*').order('sort'));
    return Object.fromEntries(rows.map((r: any) => [r.id, {
      id: r.id, name: r.name, shortName: r.short_name, englishName: r.english_name, field: r.field,
      intro: r.intro, services: r.services ?? [], licenseNo: r.license_no.trim(), sort: r.sort,
      // 登記證照片：後台勾選「顯示在官網」才放出來
      licenseImage: r.show_license_image ? photoUrl(r.license_image_path) : '',
    } satisfies Company])) as Record<CompanyId, Company>;
  })();
  return companiesCache;
}

// ---------- 共用聯絡資料：空白的欄位不顯示 ----------
export interface Settings {
  phone: string; phoneHref: string; lineId: string; lineHref: string; email: string; emailHref: string;
  address: string; hours: string; mapEmbed: string; stats: { label: string; value: number; suffix: string }[];
}

let settingsCache: Promise<Settings> | undefined;
export function getSettings(): Promise<Settings> {
  settingsCache ??= (async () => {
    const r: any = must(await db.from('site_settings').select('*').eq('id', 1).single());
    const phone = r.phone.trim(), lineId = r.line_id.trim(), email = r.email.trim(), address = r.address.trim();
    return {
      phone, phoneHref: phone ? `tel:${phone.replace(/[^0-9+]/g, '')}` : '',
      lineId, lineHref: r.line_url.trim() || (lineId ? `https://line.me/R/ti/p/${encodeURIComponent(lineId)}` : ''),
      email, emailHref: email ? `mailto:${email}` : '',
      address, hours: r.hours.trim(),
      // 地圖直接用地址產生，不需要另外貼地圖程式碼
      mapEmbed: address ? `https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed&hl=zh-TW` : '',
      stats: (r.stats ?? []).filter((x: any) => x?.label && Number.isFinite(Number(x.value)))
        .map((x: any) => ({ label: String(x.label), value: Number(x.value), suffix: String(x.suffix ?? '') })),
    };
  })();
  return settingsCache;
}
