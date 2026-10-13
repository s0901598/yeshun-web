-- 客戶需求：官網聯絡表單送出的內容。只能透過 submit-inquiry 函式寫入（service role）；後台人員可以看、標記已處理、刪除
create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 60),
  phone text not null check (char_length(phone) between 6 and 30),
  service text not null default '' check (char_length(service) <= 60),
  category text not null default '' check (char_length(category) <= 60),
  area text not null default '' check (char_length(area) <= 20),
  location text not null default '' check (char_length(location) <= 100),
  message text not null default '' check (char_length(message) <= 2000),
  status text not null default 'new' check (status in ('new', 'done')),
  handled_at timestamptz,
  email_sent boolean not null default false,
  ip_hash text not null default ''
);
create index inquiries_created_at on public.inquiries (created_at desc);
create index inquiries_ip_recent on public.inquiries (ip_hash, created_at desc);

alter table public.inquiries enable row level security;
create policy "staff read inquiries" on public.inquiries for select to authenticated using ((select public.is_staff()));
create policy "staff update inquiries" on public.inquiries for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy "staff delete inquiries" on public.inquiries for delete to authenticated using ((select public.is_staff()));
-- 沒有 insert policy：一般訪客不能直接寫入，只能經過函式（會檢查格式、擋機器人、限制頻率）
