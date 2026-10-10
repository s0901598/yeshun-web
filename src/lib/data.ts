// 官網讀取資料的唯一入口：打包網站時從 Supabase 讀取內容。
// 使用公開金鑰（publishable key），資料庫權限規則保證只讀得到「已發布」的內容。
import { createClient } from '@supabase/supabase-js';
import type { Category, Project, Status } from '../data/projects';

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
