import { chromium, webkit } from 'playwright';
import { createClient } from '@supabase/supabase-js';
// 後台權限驗證：建立臨時編輯帳號，測完自動刪除，不會改動既有內容。
// 用法：npm run verify:admin [網址]（需要 .env 的 Supabase 金鑰，後台 admin 密碼需為 .env 的 ADMIN_PASSWORD）
const B = process.argv[2] ?? 'http://localhost:4321/yeshun-web';
const SB_URL = process.env.PUBLIC_SUPABASE_URL, SB_KEY = process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY, SECRET = process.env.SUPABASE_SECRET_KEY;
const ADMIN_PW = process.env.ADMIN_PASSWORD;
// 先清掉上次沒跑完留下的測試帳號
{ const s = createClient(SB_URL, SECRET, { auth: { persistSession: false } });
  const u = (await s.auth.admin.listUsers()).data.users.find((x) => x.email === 'e2e-editor@yeshun.local');
  if (u) { await s.auth.admin.deleteUser(u.id); console.log('(cleaned leftover e2e-editor)'); } }
const results = []; const ok = (m) => { results.push('✓ ' + m); }; const fail = (m) => { results.push('✗ ' + m); };
const check = (cond, m) => (cond ? ok(m) : fail(m));

async function login(p, user, pw) {
  await p.goto(B + '/admin/');
  // 等畫面載入完：不是登入表單，就是已登入的後台
  const form = p.getByRole('button', { name: '登入' }), logout = p.getByRole('button', { name: '登出' });
  await form.or(logout).first().waitFor({ timeout: 20000 });
  if (await logout.isVisible()) { await logout.click(); await form.waitFor(); }
  await p.getByLabel('帳號', { exact: true }).fill(user); await p.getByLabel('密碼').fill(pw);
  await form.click();
}
const toastHas = (p, text) => p.locator('.a-toast', { hasText: text }).waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
const appears = (loc) => loc.waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
const disappears = (loc) => loc.waitFor({ state: 'detached', timeout: 20000 }).then(() => true).catch(() => false);

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
const errors = []; p.on('pageerror', (e) => errors.push(e.message));
let dialogAnswers = []; p.on('dialog', (d) => d.type() === 'prompt' ? d.accept(dialogAnswers.shift()) : d.accept());

// 1. 管理員登入，看得到帳號管理，建立編輯帳號
await login(p, 'admin', ADMIN_PW);
await p.getByRole('heading', { name: /案例作品/ }).waitFor();
check(await p.getByRole('link', { name: '帳號管理' }).isVisible(), 'admin sees 帳號管理 tab');
check((await p.locator('.a-footer').textContent()).includes('管理員'), 'footer shows role 管理員');
await p.getByRole('link', { name: '帳號管理' }).click();
await p.getByRole('heading', { name: /帳號管理/ }).waitFor();
await p.locator('.a-account').first().waitFor();
check(!(await p.locator('.a-account', { hasText: 'admin' }).getByRole('button', { name: '刪除' }).isVisible()), 'admin cannot delete own account (no button)');
await p.getByLabel(/^帳號3/).fill('e2e-editor');
await p.getByRole('button', { name: '建立帳號並產生密碼' }).click();
await p.locator('.a-secret__pw').waitFor();
const pw1 = (await p.locator('.a-secret__pw').textContent()).trim();
check(/^[A-Za-z0-9]{10}$/.test(pw1), `random password generated (${pw1.length} chars)`);
await 
await p.getByRole('button', { name: '我記下了，關閉' }).click();
check(await appears(p.locator('.a-account', { hasText: 'e2e-editor' }).filter({ hasText: '編輯' })), 'new account listed as 編輯');
// 同名帳號
await p.getByLabel(/^帳號3/).fill('e2e-editor');
await p.getByRole('button', { name: '建立帳號並產生密碼' }).click();
check(await toastHas(p, '已經有人用了'), 'duplicate username rejected');
// 不能把自己（唯一管理員）降成編輯
await p.locator('.a-account', { hasText: '你' }).locator('select').selectOption('editor');
check(await toastHas(p, '至少要保留一位管理員'), 'cannot demote the last admin');
await p.waitForTimeout(1500);
check(await p.locator('.a-account', { hasText: '你' }).locator('select').inputValue() === 'admin', 'dropdown snaps back to 管理員 after blocked change');

// 2. 編輯登入：沒有帳號管理，可以編輯內容
await login(p, 'e2e-editor', pw1);
await p.getByRole('heading', { name: /案例作品/ }).waitFor();
check(!(await p.getByRole('link', { name: '帳號管理' }).isVisible()), 'editor does NOT see 帳號管理 tab');
check((await p.locator('.a-footer').textContent()).includes('編輯'), 'footer shows role 編輯');
await p.locator('.a-row').first().waitFor();
const totalCases = (await createClient(SB_URL, SECRET, { auth: { persistSession: false } }).from('projects').select('id')).data.length;
check(await p.locator('.a-row').count() === totalCases, `editor sees all ${totalCases} cases incl. drafts`);
await p.goto(B + '/admin/#/accounts'); await p.waitForTimeout(800);
check(!(await p.getByRole('heading', { name: /帳號管理/ }).isVisible()), 'editor typing #/accounts URL does not open account page');
// 直接呼叫帳號管理函式也會被擋
const editorClient = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });
await editorClient.auth.signInWithPassword({ email: 'e2e-editor@yeshun.local', password: pw1 });
const r = await editorClient.functions.invoke('manage-accounts', { body: { action: 'list' } });
check(r.error && (await r.error.context.json()).error.includes('只有管理員'), 'editor blocked from account API (403)');
const first = (await editorClient.from('details').select('id, published').order('sort').limit(1)).data[0];
const pub = await editorClient.from('details').update({ published: first.published }).eq('id', first.id).select(); // 寫回原值，不改內容
check(!pub.error && pub.data.length === 1, 'editor can update content (RLS allows)');
const dep = await editorClient.functions.invoke('trigger-deploy', { method: 'POST' });
check(dep.data?.ok === true, 'editor can trigger site update');
// 編輯自己改密碼
dialogAnswers = ['Mynewpass88', 'Mynewpass88'];
await p.goto(B + '/admin/'); await p.getByRole('button', { name: '改密碼' }).click();
check(await toastHas(p, '密碼已更新'), 'editor changed own password');
await login(p, 'e2e-editor', 'Mynewpass88');
check(await p.getByRole('heading', { name: /案例作品/ }).isVisible({ timeout: 15000 }).catch(() => false) || await p.getByRole('heading', { name: /案例作品/ }).waitFor({ timeout: 15000 }).then(() => true).catch(() => false), 'editor logs in with new password');

// 3. 管理員重設編輯的密碼
await login(p, 'admin', ADMIN_PW);
await p.getByRole('heading', { name: /案例作品/ }).waitFor();
await p.getByRole('link', { name: '帳號管理' }).click();
await p.locator('.a-account', { hasText: 'e2e-editor' }).getByRole('button', { name: '重設密碼' }).click();
await p.locator('.a-secret__pw').waitFor();
const pw2 = (await p.locator('.a-secret__pw').textContent()).trim();
const old = await createClient(SB_URL, SB_KEY, { auth: { persistSession: false } }).auth.signInWithPassword({ email: 'e2e-editor@yeshun.local', password: 'Mynewpass88' });
const nw = await createClient(SB_URL, SB_KEY, { auth: { persistSession: false } }).auth.signInWithPassword({ email: 'e2e-editor@yeshun.local', password: pw2 });
check(!!old.error && !nw.error, 'after reset: old password fails, new password works');
await p.getByRole('button', { name: '我記下了，關閉' }).click();
// 改角色成管理員再改回
await p.locator('.a-account', { hasText: 'e2e-editor' }).locator('select').selectOption('admin');
check(await toastHas(p, '角色已更新'), 'admin can promote editor to 管理員');
await p.locator('.a-account', { hasText: 'e2e-editor' }).locator('select').selectOption('editor');
await toastHas(p, '角色已更新');

// 4. 刪除測試帳號
await p.locator('.a-account', { hasText: 'e2e-editor' }).getByRole('button', { name: '刪除' }).click();
check(await toastHas(p, '帳號已刪除'), 'test account deleted');

check(await disappears(p.locator('.a-account', { hasText: 'e2e-editor' })), 'test account gone from list');
await b.close();

// WebKit：管理員登入看得到帳號管理分頁
const w = await webkit.launch(); const wp = await w.newPage({ viewport: { width: 390, height: 844 } });
await login(wp, 'admin', ADMIN_PW); await wp.getByRole('link', { name: '帳號管理' }).click();
await wp.locator('.a-account').first().waitFor();
check(await wp.locator('.a-account').count() === 1 && await wp.locator('.a-account', { hasText: 'admin' }).isVisible(), 'webkit: account page works, only admin remains');
await w.close();

console.log(results.join('\n'));
console.log(errors.length ? 'PAGE ERRORS:\n' + errors.join('\n') : 'no page errors');
if (errors.length || results.some((r) => r.startsWith('✗'))) process.exitCode = 1;
