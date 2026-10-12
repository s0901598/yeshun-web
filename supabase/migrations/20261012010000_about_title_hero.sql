-- 「關於我們」改名「公司介紹」，名稱可在後台修改；首頁背景輪播照片（storage 路徑陣列，依順序播放）
alter table public.site_settings
  add column about_title text not null default '公司介紹',
  add column hero_images jsonb not null default '[]'::jsonb;
