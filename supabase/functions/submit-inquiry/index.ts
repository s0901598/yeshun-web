// 官網「聯絡我們」表單送出時呼叫：檢查格式、擋機器人與連續送出 → 存進 inquiries（後台「客戶需求」）→ 寄 Email 通知。
// 寄信用 Resend（https://resend.com）。需要在 Supabase 設定秘密變數：
//   RESEND_API_KEY：Resend 的 API key
//   INQUIRY_TO：收通知的信箱（沒有自己的網域時，只能是註冊 Resend 用的那個信箱）
// 沒設定時表單照樣存進後台，只是不寄信。
import { createClient } from 'npm:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = ['https://s0901598.github.io', 'http://localhost:4321'];
const ADMIN_URL = 'https://s0901598.github.io/yeshun-web/admin/#/inquiries';
const LIMIT = 3, WINDOW_MIN = 10; // 同一個連線 10 分鐘內最多 3 筆

const corsFor = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
});

const clean = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  const cors = corsFor(req.headers.get('Origin'));
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: 'bad_json' }); }

  // 機器人陷阱：畫面上看不到的欄位，人不會填
  if (clean(body.website, 200)) return json(200, { ok: true });

  const row = {
    name: clean(body.name, 60),
    phone: clean(body.phone, 30),
    service: clean(body.service, 60),
    category: clean(body.category, 60),
    area: clean(body.area, 20),
    location: clean(body.location, 100),
    message: clean(body.message, 2000),
  };
  if (!row.name) return json(400, { error: 'name_required' });
  if (!/^[0-9+()\-\s#]{6,30}$/.test(row.phone) || (row.phone.match(/\d/g) ?? []).length < 6) return json(400, { error: 'phone_invalid' });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  const ipHash = await sha256(`yeshun-inquiry:${ip}`);
  const since = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString();
  const { count } = await db.from('inquiries').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('created_at', since);
  if ((count ?? 0) >= LIMIT) return json(429, { error: 'too_many' });

  const { data: saved, error } = await db.from('inquiries').insert({ ...row, ip_hash: ipHash }).select('id, created_at').single();
  if (error) return json(500, { error: 'save_failed' });

  // 寄通知信（失敗不影響已存進後台的資料）
  let emailSent = false;
  const key = Deno.env.get('RESEND_API_KEY')?.trim();
  const to = Deno.env.get('INQUIRY_TO')?.trim();
  if (key && to) {
    const when = new Date(saved.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
    const rows: [string, string][] = [
      ['姓名', row.name], ['電話', row.phone], ['需求類型', row.service], ['空間類型', row.category],
      ['坪數', row.area ? `${row.area} 坪` : ''], ['案場地區', row.location], ['需求說明', row.message], ['送出時間', when],
    ];
    const html = `<div style="font-family:'Noto Sans TC','PingFang TC',sans-serif;color:#1c1b1a;max-width:560px">
      <h2 style="color:#94703a;margin:0 0 12px">官網有新的客戶需求</h2>
      <table style="border-collapse:collapse;width:100%;font-size:15px">${rows.filter(([, v]) => v).map(([k, v]) =>
        `<tr><th style="text-align:left;padding:8px;border-bottom:1px solid #eee;width:96px;color:#6f6a63;vertical-align:top">${k}</th><td style="padding:8px;border-bottom:1px solid #eee;white-space:pre-wrap">${esc(v)}</td></tr>`).join('')}</table>
      <p style="margin-top:16px"><a href="tel:${esc(row.phone.replace(/[^0-9+]/g, ''))}" style="color:#94703a">撥打 ${esc(row.phone)}</a>　｜　<a href="${ADMIN_URL}" style="color:#94703a">到後台查看</a></p>
    </div>`;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: '業順官網 <onboarding@resend.dev>',
        to: [to],
        subject: `【官網需求】${row.name}｜${row.service || '未選擇需求類型'}`,
        html,
        text: rows.filter(([, v]) => v).map(([k, v]) => `${k}：${v}`).join('\n') + `\n\n到後台查看：${ADMIN_URL}`,
      }),
    }).catch(() => null);
    emailSent = !!res?.ok;
    if (emailSent) await db.from('inquiries').update({ email_sent: true }).eq('id', saved.id);
  }
  return json(200, { ok: true, emailSent });
});
