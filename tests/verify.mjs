// 完整驗證：Chromium + WebKit × 手機/平板/電腦 × 深/淺色 × 所有頁面，含互動狀態
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
      if (await p.evaluate(() => document.documentElement.dataset.theme) !== scheme) bad(`${tag}: theme mismatch`);
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
  // 互動：主題切換按鈕與記憶
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  const p = await ctx.newPage(); await p.goto(B + '/');
  await p.click('[data-theme-btn]'); await p.goto(B + '/about/');
  checks++; if (await p.evaluate(() => document.documentElement.dataset.theme) !== 'light') bad(`${name}: theme toggle not remembered`);
  await ctx.close();
  await b.close();
}
console.log(`checks run: ${checks}`);
console.log(problems.length ? `PROBLEMS (${problems.length}):\n` + problems.join('\n') : 'ALL PASSED');
