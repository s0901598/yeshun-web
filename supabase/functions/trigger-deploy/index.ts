// 後台按「發布」或儲存後呼叫：確認是管理員，再請 GitHub 重新打包官網。
// 需要在 Supabase 設定秘密變數 GITHUB_DEPLOY_TOKEN（只對 yeshun-web repo 有權限的 GitHub token）。
import { createClient } from 'npm:@supabase/supabase-js@2';

const REPO = 's0901598/yeshun-web';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  // 用呼叫者自己的登入憑證查詢，只有 admins 名單裡的人會得到 true
  const authHeader = req.headers.get('Authorization') ?? '';
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: isAdmin, error } = await supabase.rpc('is_admin');
  if (error || !isAdmin) return json(403, { error: 'forbidden' });

  // 去掉貼上時可能多出的空白或換行
  const token = Deno.env.get('GITHUB_DEPLOY_TOKEN')?.trim();
  if (!token) return json(503, { error: 'not_configured' });

  const res = await fetch(`https://api.github.com/repos/${REPO}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'yeshun-admin',
    },
    body: JSON.stringify({ event_type: 'content-updated' }),
  });
  if (!res.ok) return json(502, { error: 'github_failed', status: res.status });
  return json(200, { ok: true });
});
