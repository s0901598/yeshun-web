// 案例的型別與分類標籤。實際資料存在 Supabase（projects、stages、photos 三張表），由 src/lib/data.ts 讀取。

export type Category = 'residential' | 'commercial' | 'office' | 'public' | 'commercial_office' | 'factory_office';
export type CompanyId = 'yeshun' | 'yaosan';
export type Status = 'in_progress' | 'completed';

export interface Photo {
  id: string;
  url: string;
  caption: string;
  published: boolean;
  sort: number;
}

export interface Stage {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  note: string;
  sort: number;
  photos: Photo[];
}

export interface Project {
  id: string;
  slug: string;
  title: string;
  category: Category;
  company: CompanyId;
  location: string;
  areaPing: number;
  durationDays: number;
  status: Status;
  summary: string;
  highlights: string[];
  cover: string;
  featured: boolean;
  published: boolean;
  startedAt: string;
  stages: Stage[];
}

export const categoryLabels: Record<Category, { zh: string; en: string }> = {
  residential: { zh: '住宅空間', en: 'RESIDENTIAL' },
  commercial: { zh: '商業空間', en: 'COMMERCIAL' },
  office: { zh: '辦公空間', en: 'OFFICE' },
  public: { zh: '公共空間', en: 'PUBLIC' },
  commercial_office: { zh: '商業辦公空間', en: 'COMMERCIAL OFFICE' },
  factory_office: { zh: '廠房辦公空間', en: 'FACTORY OFFICE' },
};

export const statusLabels: Record<Status, string> = {
  in_progress: '施工中',
  completed: '已完工',
};
