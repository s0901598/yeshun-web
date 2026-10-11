// 後台帳號管理（只有管理員能用）：列出、新增（隨機密碼）、重設密碼、改角色、刪除。
// 建立帳號需要最高權限金鑰，所以只能在伺服器端做，不能放在網頁裡。
import { createClient } from 'npm:@supabase/supabase-js@2';

const DOMAIN = 'yeshun.local'; // 帳號 admin → 登入 email admin@yeshun.local
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// 隨機密碼：去掉容易看錯的 0 O 1 l I
function randomPassword(length = 10) {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  return [...bytes].map((b) => chars[b % chars.length]).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: '只接受 POST' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: me } = await caller.auth.getUser();
  const { data: isAdmin } = await caller.rpc('is_account_admin');
  if (!me?.user || !isAdmin) return json(403, { error: '只有管理員可以管理帳號' });

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const body = await req.json().catch(() => ({}));
  const role = (r: unknown) => (r === 'admin' ? 'admin' : 'editor');

  const staffRows = async () => {
    const { data, error } = await admin.from('staff').select('user_id, role');
    if (error) throw error;
    return data as { user_id: string; role: string }[];
  };
  const adminCount = async () => (await staffRows()).filter((s) => s.role === 'admin').length;
  const roleOf = async (id: string) => (await staffRows()).find((s) => s.user_id === id)?.role;

  try {
    switch (body.action) {
      case 'list': {
        const staff = await staffRows();
        const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
        if (error) throw error;
        const accounts = data.users
          .filter((u) => staff.some((s) => s.user_id === u.id))
          .map((u) => ({
            id: u.id,
            username: (u.email ?? '').replace(`@${DOMAIN}`, ''),
            role: staff.find((s) => s.user_id === u.id)!.role,
            createdAt: u.created_at,
            lastSignInAt: u.last_sign_in_at ?? null,
            isMe: u.id === me.user.id,
          }))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        return json(200, { accounts });
      }

      case 'create': {
        const username = String(body.username ?? '').trim().toLowerCase();
        if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(username)) {
          return json(400, { error: '帳號需為 3–30 個字，只能用英文小寫、數字、. _ -' });
        }
        const password = randomPassword();
        const { data, error } = await admin.auth.admin.createUser({
          email: `${username}@${DOMAIN}`, password, email_confirm: true,
        });
        if (error) {
          return json(400, { error: /already|registered|exists/i.test(error.message) ? '這個帳號已經有人用了' : error.message });
        }
        const { error: e2 } = await admin.from('staff').insert({ user_id: data.user.id, role: role(body.role) });
        if (e2) {
          await admin.auth.admin.deleteUser(data.user.id);
          throw e2;
        }
        return json(200, { username, password });
      }

      case 'reset-password': {
        if (!(await roleOf(body.userId))) return json(404, { error: '找不到這個帳號' });
        const password = randomPassword();
        const { error } = await admin.auth.admin.updateUserById(body.userId, { password });
        if (error) throw error;
        return json(200, { password });
      }

      case 'set-role': {
        const current = await roleOf(body.userId);
        if (!current) return json(404, { error: '找不到這個帳號' });
        const next = role(body.role);
        if (current === 'admin' && next !== 'admin' && (await adminCount()) <= 1) {
          return json(400, { error: '至少要保留一位管理員' });
        }
        const { error } = await admin.from('staff').update({ role: next }).eq('user_id', body.userId);
        if (error) throw error;
        return json(200, { ok: true });
      }

      case 'delete': {
        if (body.userId === me.user.id) return json(400, { error: '不能刪除自己的帳號' });
        const current = await roleOf(body.userId);
        if (!current) return json(404, { error: '找不到這個帳號' });
        if (current === 'admin' && (await adminCount()) <= 1) return json(400, { error: '至少要保留一位管理員' });
        const { error } = await admin.auth.admin.deleteUser(body.userId); // staff 名單會自動移除
        if (error) throw error;
        return json(200, { ok: true });
      }

      default:
        return json(400, { error: '不明的操作' });
    }
  } catch (err) {
    return json(500, { error: (err as Error).message });
  }
});
