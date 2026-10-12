// 完整驗證：Chromium + WebKit × 手機/平板/電腦 × 系統深/淺色（網站固定淺色）× 所有頁面，含互動狀態
import { chromium, webkit } from 'playwright';
const B = process.argv[2] ?? 'http://localhost:4321/yeshun-web';
const pages = ['/', '/about/', '/projects/', '/projects/luzhou-house/', '/details/', '/process/', '/contact/'];
const sizes = [[390, 844, 'phone'], [820, 1180, 'tablet'], [1440, 900, 'desktop']];
const problems = []; let checks = 0;
const bad = (m) => problems.push(m);
for (const [name, launch] of [['chromium', () => chromium.launch()], ['webkit', () => webkit.launch()]]) {
  const b = await launch();
  for (const scheme of ['dark', 'light']) for (const [w, h, dev] of sizes) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, reducedMotion: 'reduce' });
    for (const path of pages) {
      const tag = `${name}/${dev}/${scheme}${path}`;
      const p = await ctx.newPage();
      p.on('pageerror', (e) => bad(`${tag}: JS error ${e.message}`));
      p.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('favicon')) bad(`${tag}: HTTP ${r.status()} ${r.url()}`); });
      await p.goto(B + path, { waitUntil: 'networkidle' });
      checks++;
      const ov = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (ov > 0) bad(`${tag}: horizontal overflow ${ov}px`);
      const broken = await p.evaluate(async () => {
        const imgs = [...document.images].filter((i) => i.getAttribute('src'));
        imgs.forEach((i) => { i.loading = 'eager'; });
        await Promise.all(imgs.map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; }))));
        return imgs.filter((i) => !i.naturalWidth).map((i) => i.src);
      });
      broken.forEach((x) => bad(`${tag}: broken image ${x}`));
      // 深色模式先關閉：不管系統設定，一律淺色、沒有切換鈕
      checks++; if (await p.evaluate(() => document.documentElement.dataset.theme) !== 'light') bad(`${tag}: not light theme`);
      checks++; if (await p.locator('[data-theme-btn]').count()) bad(`${tag}: theme toggle still shown`);
      // Logo 兩行：同一欄中文、英文的頭尾對齊（扣掉最後一個字後面的字距），且不能壓到右邊的按鈕
      const brand = await p.evaluate(() => {
        const ink = (el) => { const r = el.getBoundingClientRect(); return [r.left, r.right - (parseFloat(el.style.letterSpacing) || 0)]; };
        const [z1, z2] = [...document.querySelectorAll('.brand__zh')].map(ink);
        const [e1, e2] = [...document.querySelectorAll('.brand__en')].map(ink);
        const aligned = [[z1, e1], [z2, e2]].every(([a, b]) => Math.abs(a[0] - b[0]) < 1.5 && Math.abs(a[1] - b[1]) < 1.5);
        const textRight = Math.max(z2[1], e2[1]);
        const next = [...document.querySelectorAll('[data-menu-btn], [data-nav]')].filter((e) => getComputedStyle(e).position !== 'fixed' && getComputedStyle(e).display !== 'none')
          .map((e) => e.getBoundingClientRect().left);
        return { aligned, clear: next.every((x) => x >= textRight + 4) };
      });
      checks++; if (!brand.aligned) bad(`${tag}: logo lines not aligned`);
      checks++; if (!brand.clear) bad(`${tag}: logo text runs into menu`);
      // 頁尾前：結語＋預約諮詢（聯絡頁除外），舊的「有裝修或營造的需求？」不能再出現
      const cta = await p.evaluate(() => ({ old: document.body.innerText.includes('有裝修或營造的需求'), quote: !!document.querySelector('.cta__quote'), btn: !!document.querySelector('.cta__btn') }));
      checks++; if (cta.old) bad(`${tag}: old CTA text still shown`);
      if (path !== '/contact/') { checks++; if (!cta.quote || !cta.btn) bad(`${tag}: closing block missing ${JSON.stringify(cta)}`); }
      // 互動：手機/平板打開選單，選單要完整、最後一個按鈕要看得到
      if (dev !== 'desktop' && path === '/') {
        for (const y of [0, 1200]) {
          await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(200);
          await p.click('[data-menu-btn]'); await p.waitForTimeout(450);
          const m = await p.evaluate(() => {
            const nav = document.querySelector('[data-nav]').getBoundingClientRect();
            const last = document.querySelector('.nav__cta').getBoundingClientRect();
            return { full: nav.bottom >= innerHeight - 1 && nav.top <= 80, lastVisible: last.bottom <= Math.min(nav.bottom, innerHeight) && last.top >= nav.top };
          });
          checks++;
          if (!m.full || !m.lastVisible) bad(`${tag}: menu not fully shown (scroll ${y}) ${JSON.stringify(m)}`);
          await p.click('[data-menu-btn]'); await p.waitForTimeout(300);
        }
      }
      // 選單：「關於我們」直接連到單一頁，不再有下拉選單
      if (path === '/') {
        checks++; if (await p.locator('.nav__sub, [data-sub-toggle]').count()) bad(`${tag}: about submenu still exists`);
        if (dev !== 'desktop') { await p.click('[data-menu-btn]'); await p.waitForTimeout(350); }
        await p.locator('.nav__link', { hasText: '關於我們' }).click(); await p.waitForLoadState('networkidle');
        checks++; if (!/\/about\/?$/.test(new URL(p.url()).pathname)) bad(`${tag}: 關於我們 link opened ${p.url()}`);
        await p.goto(B + path, { waitUntil: 'networkidle' });
      }
      // 關於我們頁：五格、服務項目、兩家公司左右（手機上下）、字不能太小
      if (path === '/about/') {
        const a = await p.evaluate(() => {
          const f = [...document.querySelectorAll('.feature')];
          const fs = (sel) => Math.min(...[...document.querySelectorAll(sel)].map((e) => parseFloat(getComputedStyle(e).fontSize)));
          const c = [...document.querySelectorAll('.company')].map((e) => e.getBoundingClientRect());
          return { features: f.length, bodyFont: fs('.feature__body'), titleFont: fs('.feature__title'), services: document.querySelectorAll('.services li').length,
            companies: c.length, sideBySide: c.length === 2 && Math.abs(c[0].top - c[1].top) < 2 && c[1].left > c[0].right,
            noPhoto: !document.querySelector('.photo, .license'), field: document.querySelector('.hero-field') === null };
        });
        checks++; if (a.features !== 5 || a.services !== 5 || a.companies !== 2) bad(`${tag}: about content count ${JSON.stringify(a)}`);
        checks++; if (a.bodyFont < 18 || a.titleFont < 22) bad(`${tag}: about feature text too small ${JSON.stringify(a)}`);
        checks++; if (a.sideBySide !== (dev !== 'phone')) bad(`${tag}: company columns layout ${JSON.stringify(a)}`);
        checks++; if (!a.noPhoto || !a.field) bad(`${tag}: about page has photo or 營造工程 subtitle`);
      }
      // 互動：案例頁看大圖
      if (path.startsWith('/projects/luzhou')) {
        await p.locator('.stage__photos button').first().click(); await p.waitForTimeout(300);
        const lb = await p.evaluate(() => { const d = document.querySelector('dialog'); const i = d.querySelector('img'); return d.open && i.naturalWidth > 0; });
        checks++; if (!lb) bad(`${tag}: lightbox did not show photo`);
        await p.keyboard.press('Escape');
      }
      // 互動：案例篩選
      if (path === '/projects/') {
        await p.click('[data-filter="office"]');
        const n = await p.evaluate(() => [...document.querySelectorAll('[data-grid]>li')].filter((l) => !l.hidden).length);
        checks++; if (n !== 1) bad(`${tag}: filter office shows ${n}`);
      }
      await p.close();
    }
    await ctx.close();
  }
  // 以前存過「深色」的訪客，也要顯示淺色；舊的公司分頁網址要轉到關於我們
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  const p = await ctx.newPage(); await p.goto(B + '/');
  await p.evaluate(() => localStorage.setItem('theme', 'dark')); await p.goto(B + '/about/');
  checks++; if (await p.evaluate(() => document.documentElement.dataset.theme) !== 'light') bad(`${name}: saved dark theme still applied`);
  for (const old of ['/about/yeshun/', '/about/yaosan/']) {
    await p.goto(B + old); await p.waitForURL(/\/about\/$/, { timeout: 5000 }).catch(() => {});
    checks++; if (!new URL(p.url()).pathname.endsWith('/about/')) bad(`${name}: ${old} did not redirect (${p.url()})`);
  }
  await ctx.close();
  await b.close();
}
console.log(`checks run: ${checks}`);
console.log(problems.length ? `PROBLEMS (${problems.length}):\n` + problems.join('\n') : 'ALL PASSED');
