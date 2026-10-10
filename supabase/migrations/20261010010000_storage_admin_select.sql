-- 照片空間：刪除與覆蓋檔案時，Supabase 需要先「查得到」那個檔案，
-- 所以管理員也要有讀取權限，否則刪除會靜默失敗、檔案留在空間裡佔容量。
create policy "admins read photo objects" on storage.objects
  for select to authenticated using (bucket_id = 'photos' and (select public.is_admin()));
