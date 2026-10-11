// 後台完整流程驗證：新增案例 → 新增多個階段（含中間插入）→ 選照片 → 全部儲存並上傳 → 預覽 → 發布 → 修改 → 下架 → 刪除。
// 另外測：離開提醒、公司資料、細節儲存後的發布狀態。
// 測試會自己建立、自己刪除「E2E 測試案例」，不碰既有內容；「發布到官網」的呼叫會被攔截，不會真的更新官網。
// 用法：npm run verify:flow [網址]（需要 .env）
import { chromium, webkit } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const B = process.argv[2] ?? 'http://localhost:4321/yeshun-web';
const { PUBLIC_SUPABASE_URL: SB_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY: SB_KEY, SUPABASE_SECRET_KEY: SECRET, ADMIN_PASSWORD } = process.env;
const svc = createClient(SB_URL, SECRET, { auth: { persistSession: false } });
const anon = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });
const SLUG = 'e2e-flow-case';
const results = [];
const check = (cond, m) => results.push((cond ? '✓ ' : '✗ ') + m);

// 測試照片（純色圖片）
const dir = mkdtempSync(join(tmpdir(), 'yeshun-e2e-'));
const jpg = (name, rgb) => {
  // 最小的 1x1 JPEG 不好產生，改用 SVG→PNG 不行；直接用 canvas 在瀏覽器裡產生，這裡只放檔名
  return join(dir, name);
};
async function makePhotos(browser) {
  const p = await browser.newPage();
  const files = [];
  for (const [i, color] of ['#b98b5a', '#5a7fb9', '#7fb95a'].entries()) {
    const b64 = await p.evaluate((color) => {
      const c = document.createElement('canvas'); c.width = 2400; c.height = 1800;
      const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, 2400, 1800);
      g.fillStyle = '#fff'; g.font = 'bold 300px sans-serif'; g.fillText('E2E', 700, 1000);
      return c.toDataURL('image/jpeg', 0.95).split(',')[1];
    }, color);
    const f = jpg(`photo-${i}.jpg`); writeFileSync(f, Buffer.from(b64, 'base64')); files.push(f);
  }
  await p.close();
  return files;
}

async function cleanupTestCase() {
  const { data } = await svc.from('projects').select('id').eq('slug', SLUG);
  for (const r of data ?? []) {
    const { data: files } = await svc.storage.from('photos').list(`projects/${r.id}`);
    if (files?.length) await svc.storage.from('photos').remove(files.map((f) => `projects/${r.id}/${f.name}`));
    await svc.from('projects').delete().eq('id', r.id);
  }
  // 「新增案例」按下後還沒改名的空白測試案例
  const { data: blanks } = await svc.from('projects').select('id, title, created_at').eq('title', 'E2E 測試案例');
  for (const r of blanks ?? []) await svc.from('projects').delete().eq('id', r.id);
}

async function setup(page) {
  const dialogs = [];
  page.dialogQueue = [];
  page.on('dialog', async (d) => {
    dialogs.push(d.message());
    const answer = page.dialogQueue.shift();
    if (answer === false) await d.dismiss(); else await d.accept(typeof answer === 'string' ? answer : undefined);
  });
  page.dialogs = dialogs;
  // 攔截「發布到官網」：回傳成功，但不真的觸發 GitHub 部署
  await page.route('**/functions/v1/trigger-deploy', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' },
    body: JSON.stringify({ ok: true }),
  }));
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
}

const toastHas = (p, text) => p.locator('.a-toast', { hasText: text }).waitFor({ timeout: 60000 }).then(() => true).catch(() => false);

async function login(p) {
  await p.goto(B + '/admin/');
  const form = p.getByRole('button', { name: '登入' }), logout = p.getByRole('button', { name: '登出' });
  await form.or(logout).first().waitFor({ timeout: 20000 });
  if (await logout.isVisible()) return;
  await p.getByLabel('帳號', { exact: true }).fill('admin');
  await p.getByLabel('密碼').fill(ADMIN_PASSWORD);
  await form.click();
  await p.getByRole('heading', { name: /案例作品/ }).waitFor();
}

const stageNames = (p) => p.locator('.a-stage:not(.a-stage--deleted)').evaluateAll((els) => els.map((e) => e.querySelector('input').value));

await cleanupTestCase();
const browser = await chromium.launch();
const photos = await makePhotos(browser);
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();
await setup(p);
await login(p);

// ---------- 1. 新增案例、填基本資料 ----------
await p.getByRole('button', { name: '＋ 新增案例' }).click();
await p.getByRole('heading', { name: '新案例' }).waitFor();
check((await p.locator('.a-status__main').textContent()).includes('未發布'), 'new case starts as 未發布');
await p.getByLabel('案例名稱').fill('E2E 測試案例');
await p.getByLabel(/^網址代稱/).fill(SLUG);
await p.getByLabel('分類').selectOption({ label: '廠房辦公空間' });
await p.getByLabel('承作公司').selectOption({ label: '業順營造' });
await p.getByLabel('地區').fill('新北市測試區');
check((await p.locator('.a-savebar__msg').textContent()).includes('1 項變更還沒儲存'), 'savebar shows 1 unsaved change after editing basic info');
check(await p.locator('.a-savebar').isVisible() && (await p.locator('.a-savebar').boundingBox()).y + (await p.locator('.a-savebar').boundingBox()).height <= 845, 'savebar is fixed at the bottom of the screen');

// ---------- 2. 新增階段：上方按鈕 → 每個階段右下角按鈕（插在下面） ----------
await p.locator('.a-card__head').getByRole('button', { name: '＋ 新增階段' }).click();
await p.locator('.a-stage').first().locator('input').first().fill('拆除');
await p.locator('.a-stage').first().locator('input[type=file]:not([capture])').setInputFiles([photos[0], photos[1]]);
check(await p.locator('.a-stage').first().locator('.a-photo__flag--new').count() === 2, 'selected photos show as 待上傳 (not uploaded yet)');
const { count: beforeSave } = await svc.from('photos').select('id', { count: 'exact', head: true }).like('path', 'projects/%');
await p.locator('.a-stage').first().getByRole('button', { name: '＋ 新增階段' }).click();
await p.waitForTimeout(700);
const second = p.locator('.a-stage').nth(1);
const box = await second.boundingBox();
check(box && box.y > 0 && box.y < 844, 'stage added from bottom-right button is scrolled into view');
check(await second.locator('input').first().evaluate((el) => el === document.activeElement), 'cursor is placed in the new stage name');
await second.locator('input').first().fill('水電');
await second.locator('input[type=file]:not([capture])').setInputFiles([photos[2]]);
// 從第一個階段再按一次 → 新階段要插在「拆除」和「水電」中間
await p.locator('.a-stage').first().getByRole('button', { name: '＋ 新增階段' }).click();
await p.waitForTimeout(500);
await p.locator('.a-stage').nth(1).locator('input').first().fill('保護工程');
check(JSON.stringify(await stageNames(p)) === JSON.stringify(['拆除', '保護工程', '水電']), 'new stage is inserted right below the stage whose button was pressed');
await p.locator('.a-photo').first().getByRole('button', { name: '設為封面' }).click();
const pending = await p.locator('.a-savebar__msg').textContent();
check(/有 \d+ 項變更還沒儲存/.test(pending), `savebar counts pending changes (${pending.trim()})`);

// ---------- 3. 離開提醒：取消會留在原頁 ----------
p.dialogQueue.push(false);
await p.getByRole('link', { name: '注重的細節' }).click();
await p.waitForTimeout(500);
check(p.dialogs.at(-1)?.includes('還沒儲存'), 'leaving with unsaved changes asks for confirmation');
check(/#\/projects\/[0-9a-f-]{36}$/.test(p.url()) && await p.getByLabel('案例名稱').inputValue() === 'E2E 測試案例'
  && JSON.stringify(await stageNames(p)) === JSON.stringify(['拆除', '保護工程', '水電']), 'choosing 取消 keeps you on the editor with edits intact');

// ---------- 4. 全部儲存並上傳 ----------
await p.getByRole('button', { name: '全部儲存並上傳' }).click();
check(await toastHas(p, '已全部儲存'), 'save all → success message');
const { data: pj } = await svc.from('projects').select('*').eq('slug', SLUG).single();
const { data: st } = await svc.from('stages').select('name, sort, photos(published, hidden, path)').eq('project_id', pj.id).order('sort');
check(pj.category === 'factory_office' && pj.company === 'yeshun' && pj.location === '新北市測試區', 'basic info saved (廠房辦公空間, 業順營造)');
check(JSON.stringify(st.map((s) => s.name)) === JSON.stringify(['拆除', '保護工程', '水電']), 'all 3 stages saved in on-screen order');
const allPh = st.flatMap((s) => s.photos);
check(allPh.length === 3 && allPh.every((x) => !x.published), '3 photos uploaded as 未發布');
check(pj.cover_path && allPh.some((x) => x.path === pj.cover_path), 'cover set to the chosen stage photo');
const { data: obj } = await svc.storage.from('photos').list(`projects/${pj.id}`);
check(obj.length === 3 && obj.every((o) => o.metadata.size < 300000), `photos compressed before upload (${obj.map((o) => Math.round(o.metadata.size / 1024) + 'KB').join(', ')})`);
check(!pj.published && ((await anon.from('projects').select('id').eq('slug', SLUG)).data.length === 0), 'saved case is NOT visible to the public');
check((await p.locator('.a-savebar__msg').textContent()).includes('已全部儲存'), 'savebar shows 已全部儲存');
check((await p.locator('.a-site').textContent()).includes('還沒發布'), 'top bar shows there are unpublished changes');

// ---------- 5. 預覽 ----------
const [pv] = await Promise.all([ctx.waitForEvent('page'), p.getByRole('button', { name: '預覽' }).click()]);
await pv.waitForLoadState('networkidle');
await pv.locator('.pd .title').waitFor({ timeout: 20000 });
check((await pv.locator('.pd .title').textContent()) === 'E2E 測試案例', 'preview opens with the case title');
check((await pv.locator('.pv-bar').textContent()).includes('還沒發布'), 'preview banner says the case is not published yet');
check(JSON.stringify(await pv.locator('.stage__name').evaluateAll((els) => els.map((e) => e.lastChild?.textContent?.trim() || e.textContent))) .includes('保護工程'), 'preview shows the stages');
check(await pv.locator('.pv-flag', { hasText: '未發布' }).count() >= 3, 'preview marks unpublished photos');
const specs = await pv.locator('.specs').textContent();
check(specs.includes('廠房辦公空間') && specs.includes('承作：業順營造'), 'preview shows category and 承作公司');
const imgsOk = await pv.evaluate(async () => { const im = [...document.images]; await Promise.all(im.map((i) => i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; }))); return im.every((i) => i.naturalWidth > 0); });
check(imgsOk, 'all preview images load');
await pv.screenshot({ path: join(dir, 'preview.png'), fullPage: true });
await pv.close();

// ---------- 6. 發布到官網 ----------
await p.getByRole('button', { name: '發布這個案例' }).click();
check(await toastHas(p, '已發布'), 'publish → success message');
const { data: pj2 } = await svc.from('projects').select('published').eq('id', pj.id).single();
const { data: ph2 } = await svc.from('photos').select('published, stages!inner(project_id)').eq('stages.project_id', pj.id);
check(pj2.published && ph2.every((x) => x.published), 'case and all its photos are published');
check((await anon.from('projects').select('id').eq('slug', SLUG)).data.length === 1, 'published case is now readable by the public');
check((await p.locator('.a-status__main').textContent()).includes('已發布'), 'editor status shows 已發布');

// ---------- 7. 發布後修改：一張照片不放上官網、刪除一個階段（先復原再刪） ----------
await p.locator('.a-photo').nth(1).getByLabel('不放上官網').check();
const stageByName = async (name) => p.locator('.a-stage:not(.a-stage--deleted)').nth((await stageNames(p)).indexOf(name));
await (await stageByName('水電')).getByRole('button', { name: '刪除這個階段' }).click();
check(await p.locator('.a-stage--deleted').count() === 1, 'deleting a stage shows a 復原 placeholder (not deleted yet)');
await p.locator('.a-stage--deleted').getByRole('button', { name: '復原' }).click();
check(JSON.stringify(await stageNames(p)) === JSON.stringify(['拆除', '保護工程', '水電']), '復原 brings the stage back');
await (await stageByName('水電')).getByRole('button', { name: '刪除這個階段' }).click();
await p.getByRole('button', { name: '全部儲存並上傳' }).click();
check(await toastHas(p, '已全部儲存'), 'save after edits → success');
const { data: st3 } = await svc.from('stages').select('name, photos(hidden, published)').eq('project_id', pj.id).order('sort');
check(JSON.stringify(st3.map((s) => s.name)) === JSON.stringify(['拆除', '保護工程']), 'deleted stage removed after save');
check(st3[0].photos.some((x) => x.hidden && !x.published), '「不放上官網」photo is hidden and unpublished');
const { data: obj3 } = await svc.storage.from('photos').list(`projects/${pj.id}`);
check(obj3.length === 2, 'photo file of the deleted stage removed from storage');

// ---------- 8. 下架 ----------
p.dialogQueue.push(true);
await p.getByRole('button', { name: '從官網下架' }).click();
check(await toastHas(p, '已下架'), 'unpublish → success');
check(!(await svc.from('projects').select('published').eq('id', pj.id).single()).data.published, 'case is unpublished in the database');

// ---------- 9. 刪除測試案例 ----------
await p.getByRole('button', { name: '刪除這個案例' }).click();
await p.getByRole('heading', { name: /案例作品/ }).waitFor();
check((await svc.from('projects').select('id').eq('id', pj.id)).data.length === 0, 'test case deleted');
check(((await svc.storage.from('photos').list(`projects/${pj.id}`)).data ?? []).length === 0, 'all test photo files removed from storage');

// ---------- 10. 公司資料（測完還原） ----------
const { data: origCo } = await svc.from('companies').select('*').eq('id', 'yaosan').single();
await p.getByRole('link', { name: '公司資料' }).click();
await p.getByRole('heading', { name: '公司資料' }).waitFor();
const yaosanCard = p.locator('.a-card', { hasText: '耀三室內裝修' }).first();
await yaosanCard.getByLabel(/^登記字號/).fill('E2E 測試字號');
await yaosanCard.locator('input[type=file]:not([capture])').setInputFiles(photos[0]);
await yaosanCard.getByLabel('在官網「關於我們」顯示登記證照片').check();
await p.getByRole('button', { name: '全部儲存並上傳' }).click();
check(await toastHas(p, '已全部儲存'), 'company info saved');
const { data: co } = await svc.from('companies').select('*').eq('id', 'yaosan').single();
check(co.license_no === 'E2E 測試字號' && co.license_image_path && co.show_license_image, 'license number and certificate photo saved');
// 用「移除照片」還原
await yaosanCard.getByLabel(/^登記字號/).fill(origCo.license_no);
await yaosanCard.getByRole('button', { name: '移除照片' }).click();
await p.getByRole('button', { name: '全部儲存並上傳' }).click();
await toastHas(p, '已全部儲存');
const { data: co2 } = await svc.from('companies').select('*').eq('id', 'yaosan').single();
check(co2.license_no === origCo.license_no && co2.license_image_path === origCo.license_image_path, 'company info restored; 移除照片 works');
check(!(await svc.storage.from('photos').list('companies')).data?.some((f) => f.name === co.license_image_path.split('/').pop()), 'removed certificate file deleted from storage');

const errs = p.errors;
await browser.close();

// ---------- 11. iPhone Safari 核心：編輯頁版面與新增階段 ----------
const w = await webkit.launch();
const wctx = await w.newContext({ viewport: { width: 390, height: 844 } });
const wp = await wctx.newPage();
await setup(wp);
await login(wp);
await wp.getByRole('button', { name: '＋ 新增案例' }).click();
await wp.getByRole('heading', { name: '新案例' }).waitFor();
await wp.getByLabel('案例名稱').fill('E2E 測試案例');
await wp.locator('.a-card__head').getByRole('button', { name: '＋ 新增階段' }).click();
await wp.locator('.a-stage').first().getByRole('button', { name: '＋ 新增階段' }).click();
await wp.waitForTimeout(700);
const sb = await wp.locator('.a-savebar').boundingBox();
check(sb && Math.round(sb.y + sb.height) <= 845 && sb.y > 600, 'webkit: savebar fixed at bottom');
check(await wp.locator('.a-stage').count() === 2, 'webkit: add-stage buttons work');
await wp.screenshot({ path: join(dir, 'webkit-editor.png') });
await w.close();
await cleanupTestCase();

console.log(results.join('\n'));
console.log(errs.length ? 'PAGE ERRORS:\n' + errs.join('\n') : 'no page errors');
console.log('screenshots:', dir);
if (errs.length || results.some((r) => r.startsWith('✗'))) process.exitCode = 1;
