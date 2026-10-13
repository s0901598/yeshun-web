-- 各頁頂端底圖（banner）：後台上傳，{ about, projects, process, contact, details: storage 路徑 }；沒有的用網站內建照片
alter table public.site_settings add column page_banners jsonb not null default '{}'::jsonb;
