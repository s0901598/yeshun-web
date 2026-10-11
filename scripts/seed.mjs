// 一次性建置：建立後台管理員、上傳示意照片、把示意內容寫進資料庫。
// 用法：node --env-file=.env scripts/seed.mjs <管理員 email>
// 需要 .env 裡的 PUBLIC_SUPABASE_URL 與 SUPABASE_SECRET_KEY（最高權限，只在本機使用）。
import { createClient } from '@supabase/supabase-js';
import { readFile, appendFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { projects, details, processSteps } from './sample-data.ts';

const email = process.argv[2];
if (!email) throw new Error('請提供管理員 email');

const db = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const must = ({ data, error }) => { if (error) throw error; return data; };

// 1. 管理員帳號
let adminId;
const existing = must(await db.auth.admin.listUsers()).users.find((x) => x.email === email);
if (existing) {
  adminId = existing.id;
  console.log('管理員已存在：', email);
} else {
  const password = randomBytes(12).toString('base64url');
  adminId = must(await db.auth.admin.createUser({ email, password, email_confirm: true })).user.id;
  await appendFile('.env', `# 後台登入（第一次登入後建議到後台修改密碼）\nADMIN_EMAIL=${email}\nADMIN_PASSWORD=${password}\n`);
  console.log('已建立管理員：', email, '（密碼寫在 .env 的 ADMIN_PASSWORD）');
}
must(await db.from('staff').upsert({ user_id: adminId, role: 'admin' }));

// 2. 上傳示意照片（同一張只傳一次）
const uploaded = new Map();
async function upload(localPath) {
  if (uploaded.has(localPath)) return uploaded.get(localPath);
  const file = await readFile(`public${localPath}`);
  const key = `seed/${localPath.split('/').pop()}`;
  must(await db.storage.from('photos').upload(key, file, { contentType: 'image/webp', upsert: true }));
  uploaded.set(localPath, key);
  return key;
}

// 3. 案例、施工階段、照片（重跑時先清掉舊的示意資料）
must(await db.from('projects').delete().neq('id', '00000000-0000-0000-0000-000000000000'));
for (const pj of projects) {
  const row = must(await db.from('projects').insert({
    slug: pj.slug, title: pj.title, category: pj.category, location: pj.location,
    area_ping: pj.areaPing, duration_days: pj.durationDays, status: pj.status,
    summary: pj.summary, highlights: pj.highlights, cover_path: await upload(pj.cover),
    featured: pj.featured, published: pj.published, started_at: pj.startedAt,
  }).select('id').single());
  for (const st of pj.stages) {
    const stage = must(await db.from('stages').insert({
      project_id: row.id, name: st.name, date: st.date, note: st.note, sort: st.sort,
    }).select('id').single());
    for (const ph of st.photos) {
      must(await db.from('photos').insert({
        stage_id: stage.id, path: await upload(ph.url), caption: ph.caption, published: ph.published, sort: ph.sort,
      }));
    }
  }
  console.log('案例：', pj.title);
}

// 4. 注重的細節、服務流程
must(await db.from('details').delete().neq('id', '00000000-0000-0000-0000-000000000000'));
for (const [i, d] of details.entries()) {
  must(await db.from('details').insert({
    title: d.title, summary: d.summary, body: d.body, image_path: await upload(d.image), sort: i,
  }));
}
must(await db.from('process_steps').delete().neq('id', '00000000-0000-0000-0000-000000000000'));
for (const [i, s] of processSteps.entries()) {
  must(await db.from('process_steps').insert({
    title: s.title, en: s.en, description: s.desc, items: s.items, duration: s.duration, sort: i,
  }));
}
console.log(`完成：${details.length} 項細節、${processSteps.length} 個流程步驟、${uploaded.size} 張照片`);
