-- 後台分權限：管理員（admin）可以管理帳號；編輯（editor）只能管理內容。
-- 兩種角色都能新增、修改、刪除、發布內容。

alter table public.admins rename to staff;
alter table public.staff add column role text not null default 'editor' check (role in ('admin', 'editor'));
update public.staff set role = 'admin'; -- 既有帳號都是管理員

-- 原本的 is_admin() 其實是「是否為後台人員」，改名讓意思正確；內容權限規則會跟著沿用
alter function public.is_admin() rename to is_staff;
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.staff where user_id = (select auth.uid()));
$$;

-- 是否為可以管理帳號的管理員
create or replace function public.is_account_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.staff where user_id = (select auth.uid()) and role = 'admin');
$$;

-- 目前登入者的角色（後台用來決定要不要顯示帳號管理）
create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.staff where user_id = (select auth.uid());
$$;

-- staff 名單：自己看得到自己；管理員看得到全部。新增、修改、刪除只能透過 manage-accounts 函式
drop policy "admins can read admin list" on public.staff;
create policy "staff read own row" on public.staff
  for select to authenticated using (user_id = (select auth.uid()));
create policy "account admins read all staff" on public.staff
  for select to authenticated using ((select public.is_account_admin()));

revoke execute on function public.is_account_admin() from anon;
revoke execute on function public.my_role() from anon;
