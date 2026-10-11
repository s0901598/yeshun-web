-- 1. 公司資料（業順營造、耀三室內裝修）與共用聯絡資料：改成後台可以編輯
-- 2. 案例：承作公司、兩個新分類
-- 3. 照片：可以設定「不放上官網」
-- 4. 發布狀態：記錄內容最後修改與最後發布的時間，後台據此顯示「有變更尚未發布」

-- ---------- 公司 ----------
create table public.companies (
  id text primary key check (id in ('yeshun', 'yaosan')),
  name text not null,
  short_name text not null,
  english_name text not null default '',
  field text not null default '',            -- 營造工程／室內裝修
  intro text not null default '',
  services text[] not null default '{}',
  license_no text not null default '',       -- 登記字號，空白時官網不顯示
  license_image_path text,                   -- 登記證照片
  show_license_image boolean not null default false,
  sort integer not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.companies (id, name, short_name, english_name, field, intro, services, sort) values
('yeshun', '業順營造有限公司', '業順營造', 'YE-SHUN CONSTRUCTION', '營造工程',
 '業順營造承攬建築營造、結構改建與各類工程，從規劃、施工到驗收，每一道工序都拍照記錄、透明交付。',
 array['建築營造與新建工程', '結構補強與改建工程', '商業辦公空間、廠房辦公空間工程', '公共工程與社區公設'], 0),
('yaosan', '耀三室內裝修', '耀三室內裝修', 'YAO-SAN INTERIOR', '室內裝修',
 '耀三室內裝修專注住宅、商業與辦公空間的室內裝修設計與施工。好的空間來自看不見的地方——防水、管線、隱蔽工程，我們都用心把關。',
 array['住宅翻新與新屋裝修', '商業空間（店面、餐飲）', '辦公室規劃與裝修', '老屋翻新', '水電、防水等專項工程'], 1);

-- ---------- 共用聯絡資料（只有一筆） ----------
create table public.site_settings (
  id integer primary key default 1 check (id = 1),
  phone text not null default '',
  line_id text not null default '',
  line_url text not null default '',
  email text not null default '',
  address text not null default '',
  hours text not null default '',
  stats jsonb not null default '[]',   -- 首頁數據 [{label, value, suffix}]
  updated_at timestamptz not null default now()
);
-- 已知的資料先填入；電話、LINE、營業時間、首頁數據請在後台補上（空白時官網不顯示）
insert into public.site_settings (id, email, address) values (1, 'ye.shun7589@gmail.com', '新北市蘆洲區三民路128巷118號');

create trigger companies_touch before update on public.companies for each row execute function public.touch_updated_at();
create trigger site_settings_touch before update on public.site_settings for each row execute function public.touch_updated_at();

alter table public.companies enable row level security;
alter table public.site_settings enable row level security;
create policy "public reads companies" on public.companies for select to anon, authenticated using (true);
create policy "staff manage companies" on public.companies for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy "public reads site settings" on public.site_settings for select to anon, authenticated using (true);
create policy "staff manage site settings" on public.site_settings for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));

-- ---------- 案例：承作公司、分類 ----------
alter table public.projects add column company text not null default 'yeshun' check (company in ('yeshun', 'yaosan'));
update public.projects set company = 'yaosan' where category in ('residential', 'commercial', 'office');

alter table public.projects drop constraint projects_category_check;
alter table public.projects add constraint projects_category_check
  check (category in ('residential', 'commercial', 'office', 'public', 'commercial_office', 'factory_office'));

-- ---------- 照片：不放上官網 ----------
-- published = 已發布到官網；hidden = 刻意不公開（按「發布」時會略過）
alter table public.photos add column hidden boolean not null default false;

-- ---------- 發布狀態 ----------
create table public.site_meta (
  id integer primary key default 1 check (id = 1),
  changed_at timestamptz not null default now(),
  deployed_at timestamptz
);
insert into public.site_meta (id, deployed_at) values (1, now());
alter table public.site_meta enable row level security; -- 只透過下面的函式讀寫

create or replace function public.mark_site_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.site_meta set changed_at = now() where id = 1;
  return null;
end;
$$;

create trigger projects_changed after insert or update or delete on public.projects for each statement execute function public.mark_site_changed();
create trigger stages_changed after insert or update or delete on public.stages for each statement execute function public.mark_site_changed();
create trigger photos_changed after insert or update or delete on public.photos for each statement execute function public.mark_site_changed();
create trigger details_changed after insert or update or delete on public.details for each statement execute function public.mark_site_changed();
create trigger process_steps_changed after insert or update or delete on public.process_steps for each statement execute function public.mark_site_changed();
create trigger companies_changed after insert or update or delete on public.companies for each statement execute function public.mark_site_changed();
create trigger site_settings_changed after insert or update or delete on public.site_settings for each statement execute function public.mark_site_changed();

-- 後台顯示用：有沒有尚未發布的變更
create or replace function public.publish_status()
returns table (changed_at timestamptz, deployed_at timestamptz, pending boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select m.changed_at, m.deployed_at, (m.deployed_at is null or m.changed_at > m.deployed_at)
  from public.site_meta m
  where m.id = 1 and (select public.is_staff());
$$;

-- 發布案例：案例設為已發布，並把這個案例所有未發布、沒有設定「不放上官網」的照片一起發布
create or replace function public.publish_project(project uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.projects set published = true where id = project;
  update public.photos ph set published = true
  from public.stages s
  where ph.stage_id = s.id and s.project_id = project and not ph.hidden and not ph.published;
end;
$$;

revoke execute on function public.publish_status() from anon;
revoke execute on function public.publish_project(uuid) from anon;
