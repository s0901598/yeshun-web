-- 業順營造官網：資料表、權限與照片空間
-- 規則：沒登入的訪客只能讀「已發布」的內容；只有 admins 名單裡的帳號能新增、修改、刪除。

-- 後台管理員名單
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

-- 自動更新 updated_at
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 案例
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null,
  category text not null check (category in ('residential', 'commercial', 'office', 'public')),
  location text not null default '',
  area_ping numeric(8, 1),
  duration_days integer,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  summary text not null default '',
  highlights text[] not null default '{}',
  cover_path text,
  featured boolean not null default false,
  published boolean not null default false,
  started_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 施工階段
create table public.stages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  date date,
  note text not null default '',
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index stages_project_id_idx on public.stages (project_id);

-- 施工照片
create table public.photos (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.stages (id) on delete cascade,
  path text not null,
  caption text not null default '',
  published boolean not null default false,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index photos_stage_id_idx on public.photos (stage_id);

-- 我們注重的細節
create table public.details (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text not null default '',
  body text not null default '',
  image_path text,
  published boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 服務流程
create table public.process_steps (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  en text not null default '',
  description text not null default '',
  items text[] not null default '{}',
  duration text not null default '',
  published boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger projects_touch before update on public.projects for each row execute function public.touch_updated_at();
create trigger stages_touch before update on public.stages for each row execute function public.touch_updated_at();
create trigger photos_touch before update on public.photos for each row execute function public.touch_updated_at();
create trigger details_touch before update on public.details for each row execute function public.touch_updated_at();
create trigger process_steps_touch before update on public.process_steps for each row execute function public.touch_updated_at();

-- 權限（Row Level Security）
alter table public.admins enable row level security;
alter table public.projects enable row level security;
alter table public.stages enable row level security;
alter table public.photos enable row level security;
alter table public.details enable row level security;
alter table public.process_steps enable row level security;

create policy "admins can read admin list" on public.admins
  for select to authenticated using ((select public.is_admin()));

-- 訪客：只讀已發布
create policy "public reads published projects" on public.projects
  for select to anon using (published);
create policy "public reads stages of published projects" on public.stages
  for select to anon using (
    exists (select 1 from public.projects p where p.id = project_id and p.published)
  );
create policy "public reads published photos" on public.photos
  for select to anon using (
    published and exists (
      select 1 from public.stages s join public.projects p on p.id = s.project_id
      where s.id = stage_id and p.published
    )
  );
create policy "public reads published details" on public.details
  for select to anon using (published);
create policy "public reads published process steps" on public.process_steps
  for select to anon using (published);

-- 管理員：全部權限
create policy "admins manage projects" on public.projects
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins manage stages" on public.stages
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins manage photos" on public.photos
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins manage details" on public.details
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins manage process steps" on public.process_steps
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- 照片空間：公開讀取（官網要顯示），只有管理員能上傳、修改、刪除
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 5242880, array['image/webp', 'image/jpeg', 'image/png']);

create policy "admins upload photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'photos' and (select public.is_admin()));
create policy "admins update photos" on storage.objects
  for update to authenticated using (bucket_id = 'photos' and (select public.is_admin()));
create policy "admins delete photos" on storage.objects
  for delete to authenticated using (bucket_id = 'photos' and (select public.is_admin()));
