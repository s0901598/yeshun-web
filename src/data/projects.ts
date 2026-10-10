// 示意案例資料。欄位對應之後 Supabase 的三張資料表：projects、stages、photos。
// 接上資料庫後，這個檔案會被 src/lib/data.ts 裡的查詢取代。

export type Category = 'residential' | 'commercial' | 'office' | 'public';
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
};

export const statusLabels: Record<Status, string> = {
  in_progress: '施工中',
  completed: '已完工',
};

let seq = 0;
const p = (url: string, caption: string, published = true): Photo => ({
  id: `ph${++seq}`,
  url,
  caption,
  published,
  sort: seq,
});

export const projects: Project[] = [
  {
    id: 'pj1',
    slug: 'luzhou-house',
    title: '蘆洲 林宅 老屋翻新',
    category: 'residential',
    location: '新北市蘆洲區',
    areaPing: 32,
    durationDays: 75,
    status: 'completed',
    summary: '屋齡 35 年的公寓全室翻新，重新配置管線與格局，改善採光與收納。',
    highlights: ['全室管線更新', '浴室防水重做', '開放式廚房', '增加收納 40%'],
    cover: '/images/case-house.webp',
    featured: true,
    published: true,
    startedAt: '2026-03-02',
    stages: [
      { id: 'st1', name: '拆除', date: '2026-03-02', note: '拆除舊有隔間與天花板，清運廢棄物。', sort: 1,
        photos: [p('/images/stage-site.webp', '拆除後現況'), p('/images/stage-frame.webp', '天花板拆除')] },
      { id: 'st2', name: '水電', date: '2026-03-15', note: '全室管線更新，新增廚房獨立迴路。', sort: 2,
        photos: [p('/images/stage-wall.webp', '牆面管線配置'), p('/images/detail-tools.webp', '配電規劃')] },
      { id: 'st3', name: '木作', date: '2026-04-01', note: '天花板、收納櫃體與隔間施作。', sort: 3,
        photos: [p('/images/stage-frame.webp', '天花板骨架'), p('/images/detail-plan.webp', '櫃體放樣')] },
      { id: 'st4', name: '完工', date: '2026-05-18', note: '清潔、驗收、交屋。', sort: 4,
        photos: [p('/images/case-house.webp', '外觀'), p('/images/case-gallery.webp', '客廳'), p('/images/case-colonnade.webp', '走廊')] },
    ],
  },
  {
    id: 'pj2',
    slug: 'sanchong-cafe',
    title: '三重 咖啡廳 商空設計',
    category: 'commercial',
    location: '新北市三重區',
    areaPing: 25,
    durationDays: 45,
    status: 'completed',
    summary: '臨街店面改裝為咖啡廳，以清水模與木質調打造沉穩氛圍。',
    highlights: ['清水模牆面', '吧台動線規劃', '排煙與空調整合'],
    cover: '/images/case-gallery.webp',
    featured: true,
    published: true,
    startedAt: '2026-01-10',
    stages: [
      { id: 'st5', name: '拆除', date: '2026-01-10', note: '拆除舊店面裝修。', sort: 1,
        photos: [p('/images/stage-site.webp', '原始店面')] },
      { id: 'st6', name: '水電空調', date: '2026-01-20', note: '吧台給排水與空調管線。', sort: 2,
        photos: [p('/images/stage-wall.webp', '吧台管線')] },
      { id: 'st7', name: '完工', date: '2026-02-24', note: '開幕前驗收。', sort: 3,
        photos: [p('/images/case-gallery.webp', '店內空間'), p('/images/case-office.webp', '座位區')] },
    ],
  },
  {
    id: 'pj3',
    slug: 'taipei-office',
    title: '台北 科技公司辦公室',
    category: 'office',
    location: '台北市內湖區',
    areaPing: 80,
    durationDays: 60,
    status: 'completed',
    summary: '60 人辦公室，規劃開放工作區、會議室與休憩空間。',
    highlights: ['會議室隔音', '網路與弱電整合', '分區照明'],
    cover: '/images/case-office.webp',
    featured: true,
    published: true,
    startedAt: '2025-11-03',
    stages: [
      { id: 'st8', name: '隔間', date: '2025-11-03', note: '輕隔間與會議室隔音牆。', sort: 1,
        photos: [p('/images/stage-frame.webp', '隔間骨架')] },
      { id: 'st9', name: '完工', date: '2026-01-02', note: '進駐前驗收。', sort: 2,
        photos: [p('/images/case-office.webp', '開放工作區'), p('/images/case-colonnade.webp', '走道')] },
    ],
  },
  {
    id: 'pj4',
    slug: 'xinzhuang-tower',
    title: '新莊 大樓公設改造',
    category: 'public',
    location: '新北市新莊區',
    areaPing: 120,
    durationDays: 90,
    status: 'in_progress',
    summary: '社區大廳與公共走廊翻新，施工期間維持住戶正常進出。',
    highlights: ['分區施工不停用', '無障礙動線', '公共照明更新'],
    cover: '/images/case-tower.webp',
    featured: true,
    published: true,
    startedAt: '2026-08-15',
    stages: [
      { id: 'st10', name: '保護工程', date: '2026-08-15', note: '電梯與走道保護、施工區圍籬。', sort: 1,
        photos: [p('/images/stage-site.webp', '施工區規劃')] },
      { id: 'st11', name: '泥作', date: '2026-09-10', note: '大廳地坪整平。', sort: 2,
        photos: [p('/images/stage-wall.webp', '地坪施作'), p('/images/stage-frame.webp', '尚未審核的照片', false)] },
    ],
  },
  {
    id: 'pj5',
    slug: 'draft-sample',
    title: '（草稿）尚未發布的案例',
    category: 'residential',
    location: '新北市',
    areaPing: 20,
    durationDays: 30,
    status: 'in_progress',
    summary: '這筆是草稿，不應該出現在官網上，用來確認發布機制。',
    highlights: [],
    cover: '/images/case-colonnade.webp',
    featured: false,
    published: false,
    startedAt: '2026-10-01',
    stages: [],
  },
];
