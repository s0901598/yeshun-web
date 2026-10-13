// 完整驗證：Chromium + WebKit × 手機/平板/電腦 × 淺色/深色（預設淺色，深色是訪客自己切換）× 所有頁面，含互動狀態
import { chromium, webkit } from 'playwright';
const B = process.argv[2] ?? 'http://localhost:4321/yeshun-web';
const pages = ['/', '/about/', '/projects/', '/projects/luzhou-house/', '/process/', '/contact/', '/privacy/']; // /details/ 目前隱藏（轉回首頁），另外測
const sizes = [[390, 844, 'phone'], [820, 1180, 'tablet'], [1440, 900, 'desktop']];
const problems = []; let checks = 0;
const bad = (m) => problems.push(m);
for (const [name, launch] of [['chromium', () => chromium.launch()], ['webkit', () => webkit.launch()]]) {
  const b = await launch();
  // 一般檢查：當作「這個分頁已經看過 Loading、也關過 Cookie 提示」，避免蓋住畫面；兩者另外專門測
  const rawNewContext = b.newContext.bind(b);
  b.newContext = async (opts, fresh = false) => {
    const c = await rawNewContext(opts);
    if (!fresh) await c.addInitScript(() => { try { sessionStorage.setItem('yeshun-loaded', '1'); localStorage.setItem('yeshun-cookie-ok', '1'); } catch {} });
    return c;
  };
  for (const scheme of ['dark', 'light']) for (const [w, h, dev] of sizes) {
    // 沒選過深淺色的訪客：跟著系統設定
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
      checks++; if (await p.evaluate(() => document.documentElement.dataset.theme) !== scheme) bad(`${tag}: theme mismatch`);
      // 淺色＝白底、深色＝黑底（不能是米色／咖啡色）
      const bodyBg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
      checks++; if (bodyBg !== (scheme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(26, 26, 26)')) bad(`${tag}: background ${bodyBg}`);
      checks++; if (!(await p.locator('[data-theme-btn]').isVisible())) bad(`${tag}: theme toggle missing`);
      // Logo 兩行：同一欄中文、英文的頭尾對齊（扣掉最後一個字後面的字距），且不能壓到右邊的按鈕
      const brand = await p.evaluate(() => {
        const ink = (el) => { const r = el.getBoundingClientRect(); return [r.left, r.right - (parseFloat(el.style.letterSpacing) || 0)]; };
        const [z1, z2] = [...document.querySelectorAll('.brand__zh')].map(ink);
        const [e1, e2] = [...document.querySelectorAll('.brand__en')].map(ink);
        const aligned = [[z1, e1], [z2, e2]].every(([a, b]) => Math.abs(a[0] - b[0]) < 1.5 && Math.abs(a[1] - b[1]) < 1.5);
        const textRight = Math.max(z2[1], e2[1]);
        const next = [...document.querySelectorAll('[data-menu-btn], [data-nav], [data-theme-btn]')].filter((e) => getComputedStyle(e).position !== 'fixed' && getComputedStyle(e).display !== 'none')
          .map((e) => e.getBoundingClientRect().left);
        return { aligned, clear: next.every((x) => x >= textRight + 4) };
      });
      checks++; if (!brand.aligned) bad(`${tag}: logo lines not aligned`);
      checks++; if (!brand.clear) bad(`${tag}: logo text runs into menu`);
      // 頁尾前：結語＋預約諮詢（聯絡頁除外），舊的「有裝修或營造的需求？」不能再出現
      const cta = await p.evaluate(() => ({ old: document.body.innerText.includes('有裝修或營造的需求'), quote: !!document.querySelector('.cta__quote'), btn: !!document.querySelector('.cta__btn') }));
      checks++; if (cta.old) bad(`${tag}: old CTA text still shown`);
      if (path !== '/contact/' && path !== '/privacy/') { checks++; if (!cta.quote || !cta.btn) bad(`${tag}: closing block missing ${JSON.stringify(cta)}`); }
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
      // 選單：「公司介紹」（名稱來自後台）直接連到單一頁；「注重的細節」目前隱藏
      checks++; if (await p.evaluate(() => document.body.innerText.includes('注重的細節') || !!document.querySelector('a[href$="/details"], a[href$="/details/"]'))) bad(`${tag}: 注重的細節 still shown`);
      checks++; if (await p.evaluate(() => [...document.querySelectorAll('.nav__link')].some((a) => a.textContent.includes('關於我們')))) bad(`${tag}: menu still says 關於我們`);
      if (path === '/') {
        checks++; if (await p.locator('.nav__sub, [data-sub-toggle]').count()) bad(`${tag}: about submenu still exists`);
        if (dev !== 'desktop') { await p.click('[data-menu-btn]'); await p.waitForTimeout(350); }
        await p.locator('.nav__link', { hasText: '公司介紹' }).click(); await p.waitForLoadState('networkidle');
        checks++; if (!/\/about\/?$/.test(new URL(p.url()).pathname)) bad(`${tag}: 公司介紹 link opened ${p.url()}`);
        checks++; if ((await p.locator('h1').textContent()).trim() !== '公司介紹') bad(`${tag}: about h1 is not 公司介紹`);
        await p.goto(B + path, { waitUntil: 'networkidle' });
      }
      // 公司介紹頁：五格、服務項目、字不能太小；業順／耀三的公司資料區塊已移除
      if (path === '/about/') {
        const a = await p.evaluate(() => {
          const f = [...document.querySelectorAll('.feature')];
          const fs = (sel) => Math.min(...[...document.querySelectorAll(sel)].map((e) => parseFloat(getComputedStyle(e).fontSize)));
          return { features: f.length, bodyFont: fs('.feature__body'), titleFont: fs('.feature__title'), services: document.querySelectorAll('.services li').length,
            companies: document.querySelectorAll('.company, .companies').length,
            noPhoto: !document.querySelector('.photo, .license'), field: document.querySelector('.hero-field') === null };
        });
        checks++; if (a.features !== 5 || a.services !== 5 || a.companies !== 0) bad(`${tag}: about content count ${JSON.stringify(a)}`);
        checks++; if (a.bodyFont < 18 || a.titleFont < 22) bad(`${tag}: about feature text too small ${JSON.stringify(a)}`);
        checks++; if (!a.noPhoto || !a.field) bad(`${tag}: about page has photo or 營造工程 subtitle`);
        // 五格：淺金底（跟頁面背景不同）、標題咖啡金色；服務項目字放大
        const look = await p.evaluate(() => {
          const cs = (sel) => getComputedStyle(document.querySelector(sel));
          const gold = getComputedStyle(document.documentElement).getPropertyValue('--gold-text').trim();
          const toRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };
          return { cardBg: cs('.feature').backgroundColor, pageBg: getComputedStyle(document.body).backgroundColor,
            titleGold: cs('.feature__title').color === toRgb(gold),
            serviceFont: parseFloat(cs('.services__main').fontSize), noteFont: parseFloat(cs('.services__note').fontSize) };
        });
        checks++; if (look.cardBg === look.pageBg || look.cardBg === 'rgba(0, 0, 0, 0)') bad(`${tag}: feature cards same background as page`);
        checks++; if (!look.titleGold) bad(`${tag}: titles not gold ${JSON.stringify(look)}`);
        checks++; if (look.serviceFont < 21 || look.noteFont < 18) bad(`${tag}: services sizing ${JSON.stringify(look)}`);
        // 手機：內文先收起，點標題展開；電腦／平板：內文直接顯示
        const shown = () => p.evaluate(() => getComputedStyle(document.querySelector('.feature__more')).display !== 'none');
        if (dev === 'phone') {
          checks++; if (await shown()) bad(`${tag}: feature body not collapsed on phone`);
          await p.locator('[data-feature-toggle]').first().click(); await p.waitForTimeout(200);
          checks++; if (!(await shown())) bad(`${tag}: tapping feature did not expand`);
        } else { checks++; if (!(await shown())) bad(`${tag}: feature body hidden on ${dev}`); }
      }
      // 首頁背景：好幾張照片、同一時間只有一張在顯示；第一張要完整載入；照片右側不能被遮罩壓黑／壓白
      if (path === '/') {
        const h = await p.evaluate(() => {
          const s = [...document.querySelectorAll('.hero__slide')];
          return { n: s.length, active: s.filter((x) => x.classList.contains('is-active')).length, first: s[0]?.complete && s[0].naturalWidth > 0 };
        });
        checks++; if (h.n < 2 || h.active !== 1 || !h.first) bad(`${tag}: hero slideshow ${JSON.stringify(h)}`);
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
  // 主題：沒選過→跟系統（系統沒設定＝淺色）；按過切換鈕→用選的，系統是什麼都一樣；換頁、上一頁、重新整理都保持
  for (const [sys, want] of [['light', 'light'], ['dark', 'dark']]) { // 「系統沒設定」測不到（測試瀏覽器會沿用這台電腦的設定），由程式預設淺色處理
    const c = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: sys });
    const pg = await c.newPage(); await pg.goto(B + '/about/', { waitUntil: 'load' });
    checks++; if (await pg.evaluate(() => document.documentElement.dataset.theme) !== want) bad(`${name}: system ${sys} should show ${want}`);
    await pg.click('[data-theme-btn]');
    await pg.goto(B + '/projects/', { waitUntil: 'load' });
    checks++; if (await pg.evaluate(() => document.documentElement.dataset.theme) === want) bad(`${name}: chosen theme not kept over system ${sys}`);
    await c.close();
  }
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light' });
  const p = await ctx.newPage();
  const theme = () => p.evaluate(() => document.documentElement.dataset.theme);
  await p.goto(B + '/', { waitUntil: 'load' });
  checks++; if (await theme() !== 'light') bad(`${name}: default not light on light system`);
  await p.click('[data-theme-btn]');
  checks++; if (await theme() !== 'dark') bad(`${name}: toggle did not switch to dark`);
  await p.goto(B + '/about/', { waitUntil: 'load' });
  checks++; if (await theme() !== 'dark') bad(`${name}: dark not kept after changing page`);
  await p.goto(B + '/projects/', { waitUntil: 'load' });
  await p.click('[data-theme-btn]');
  await p.goBack({ waitUntil: 'load' }); await p.waitForTimeout(300);
  checks++; if (await theme() !== 'light') bad(`${name}: back button shows old theme`);
  await p.goForward({ waitUntil: 'load' }); await p.waitForTimeout(300);
  checks++; if (await theme() !== 'light') bad(`${name}: forward button shows old theme`);
  await p.reload({ waitUntil: 'load' });
  checks++; if (await theme() !== 'light') bad(`${name}: light not kept after reload`);
  const homeHtml = await (await fetch(B + '/')).text();
  const loaderOn = homeHtml.includes('id="site-loader"'), cookieOn = homeHtml.includes('id="cookie-notice"');
  // 進站 Loading（開啟時才測）：從首頁網址進來 → Logo 填滿到 100% → 3 秒內跳到案例作品；同一個分頁再回首頁不再出現；
  // 從其他頁進來 → Loading 完留在原頁。底色跟網站深淺色一致
  if (loaderOn) for (const [w, h] of [[390, 844], [1440, 900]]) for (const theme of ['light', 'dark']) {
    const lc = await b.newContext({ viewport: { width: w, height: h }, colorScheme: theme }, true);
    await lc.addInitScript(() => { try { localStorage.setItem('yeshun-cookie-ok', '1'); } catch {} });
    const lp = await lc.newPage(); const t0 = Date.now();
    await lp.goto(B + '/', { waitUntil: 'commit' });
    await lp.waitForFunction(() => { const l = document.getElementById('site-loader'); return l && getComputedStyle(l).position === 'fixed'; }, null, { timeout: 5000 });
    const look = await lp.evaluate(() => {
      const l = document.getElementById('site-loader'); const r = l.getBoundingClientRect();
      return { full: r.width >= innerWidth - 1 && r.height >= innerHeight - 1, bg: getComputedStyle(l).backgroundColor, body: getComputedStyle(document.body).backgroundColor };
    });
    checks++; if (!look.full || look.bg !== look.body) bad(`${name}/${w}/${theme}: loader not full screen or bg differs ${JSON.stringify(look)}`);
    await lp.waitForURL(/\/projects\/$/, { timeout: 6000 }).catch(() => {});
    const took = Date.now() - t0;
    checks++; if (!/\/projects\/$/.test(lp.url())) bad(`${name}/${w}/${theme}: loader did not go to 案例作品 (${lp.url()})`);
    checks++; if (took > 4200) bad(`${name}/${w}/${theme}: loader took ${took}ms (limit 3s + page load)`);
    await lp.waitForLoadState('load');
    checks++; if (await lp.evaluate(() => document.documentElement.classList.contains('is-loading'))) bad(`${name}/${w}/${theme}: loader shown again on 案例作品`);
    // 重新整理：Loading 要再出現（在案例作品頁重新整理，完成後留在原頁）
    await lp.reload({ waitUntil: 'commit' });
    await lp.waitForFunction(() => document.documentElement.classList.contains('is-loading'), null, { timeout: 5000 }).catch(() => {});
    checks++; if (!(await lp.evaluate(() => document.documentElement.classList.contains('is-loading')))) bad(`${name}/${w}/${theme}: loader not shown on reload`);
    await lp.waitForFunction(() => !document.documentElement.classList.contains('is-loading'), null, { timeout: 5000 }).catch(() => {});
    checks++; if (!/\/projects\/$/.test(lp.url())) bad(`${name}/${w}/${theme}: reload on 案例作品 did not stay (${lp.url()})`);
    await Promise.all([lp.waitForNavigation(), lp.locator('.nav__link', { hasText: '公司介紹' }).click()]).catch(() => {});
    checks++; if (await lp.evaluate(() => document.documentElement.classList.contains('is-loading'))) bad(`${name}/${w}/${theme}: loader shown on in-site navigation`);
    // 重新整理一律回到案例作品最上方：在公司介紹捲到下面再重新整理 → 案例作品、捲動位置 0
    await lp.goto(B + '/about/', { waitUntil: 'load' }); await lp.evaluate(() => scrollTo(0, 1500)); await lp.waitForTimeout(300);
    await lp.reload({ waitUntil: 'commit' });
    await lp.waitForURL(/\/projects\/$/, { timeout: 6000 }).catch(() => {});
    await lp.waitForFunction(() => !document.documentElement.classList.contains('is-loading'), null, { timeout: 6000 }).catch(() => {});
    checks++; if (!/\/projects\/$/.test(lp.url()) || await lp.evaluate(() => scrollY) > 5) bad(`${name}/${w}/${theme}: reload did not return to top of 案例作品 (${lp.url()} y=${await lp.evaluate(() => scrollY)})`);
    await lp.evaluate(() => scrollTo(0, 1200)); await lp.waitForTimeout(300);
    await lp.reload({ waitUntil: 'load' });
    await lp.waitForFunction(() => !document.documentElement.classList.contains('is-loading'), null, { timeout: 6000 }).catch(() => {});
    await lp.waitForTimeout(300);
    checks++; if (await lp.evaluate(() => scrollY) > 5) bad(`${name}/${w}/${theme}: reload on 案例作品 kept scroll position`);
    await lp.goto(B + '/', { waitUntil: 'load' }); await lp.waitForTimeout(400);
    checks++; if (!/\/yeshun-web\/$/.test(new URL(lp.url()).pathname) || await lp.locator('#site-loader').isVisible()) bad(`${name}/${w}/${theme}: homepage not reachable after loading (${lp.url()})`);
    await lc.close();
  }
  if (loaderOn && cookieOn) {
    const lc = await b.newContext({ viewport: { width: 1440, height: 900 } }, true);
    const lp = await lc.newPage(); await lp.goto(B + '/about/', { waitUntil: 'load' });
    await lp.waitForFunction(() => !document.documentElement.classList.contains('is-loading'), null, { timeout: 5000 }).catch(() => {});
    checks++; if (!new URL(lp.url()).pathname.endsWith('/about/') || await lp.evaluate(() => document.documentElement.classList.contains('is-loading'))) bad(`${name}: loader on /about/ did not finish in place`);
    // Cookie 提示：第一次出現、在手機快速聯絡列上方、按「我知道了」後消失，重新整理也不再出現
    checks++; if (!(await lp.locator('#cookie-notice').isVisible())) bad(`${name}: cookie notice not shown on first visit`);
    await lp.locator('[data-cookie-ok]').click(); await lp.waitForTimeout(400);
    checks++; if (await lp.locator('#cookie-notice').isVisible()) bad(`${name}: cookie notice did not close`);
    await lp.reload({ waitUntil: 'load' });
    checks++; if (await lp.locator('#cookie-notice').isVisible()) bad(`${name}: cookie notice came back after reload`);
    await lc.close();
    const pc = await b.newContext({ viewport: { width: 390, height: 844 } }, true);
    await pc.addInitScript(() => { try { sessionStorage.setItem('yeshun-loaded', '1'); } catch {} });
    const pp = await pc.newPage(); await pp.goto(B + '/projects/', { waitUntil: 'load' });
    const pos = await pp.evaluate(() => {
      const c = document.getElementById('cookie-notice').getBoundingClientRect(), q = document.querySelector('.quickbar').getBoundingClientRect();
      return { above: c.bottom <= q.top, inside: c.left >= 0 && c.right <= innerWidth && c.top >= 0 };
    });
    checks++; if (!pos.above || !pos.inside) bad(`${name}: cookie notice overlaps quick bar or off screen ${JSON.stringify(pos)}`);
    await pp.locator('.cookie__text a').click(); await pp.waitForLoadState('load');
    checks++; if (!new URL(pp.url()).pathname.includes('/privacy')) bad(`${name}: privacy link broken (${pp.url()})`);
    await pc.close();
  }
  // 上一頁只退一層：主要頁面之間切換不累積紀錄（按上一頁就離開官網）；點進案例按上一頁回列表；「回案例列表」直接回去
  {
    const hc = await b.newContext({ viewport: { width: 1440, height: 900 } });
    const hp = await hc.newPage();
    await hp.goto('data:text/html,<title>外部網站</title>外部網站');
    await hp.goto(B + '/about/', { waitUntil: 'load' });
    for (const label of ['案例作品', '服務流程', '公司介紹']) await Promise.all([hp.waitForNavigation(), hp.locator('.nav__link', { hasText: label }).click()]);
    await hp.goBack({ waitUntil: 'load' }).catch(() => {});
    checks++; if (!hp.url().startsWith('data:')) bad(`${name}: back after switching main pages should leave site (${hp.url()})`);
    await hp.goto(B + '/projects/', { waitUntil: 'load' });
    await hp.evaluate(() => scrollTo(0, 700)); await hp.waitForTimeout(200);
    await Promise.all([hp.waitForNavigation(), hp.locator('[data-grid] a').first().click()]);
    const caseUrl = hp.url();
    await hp.goBack({ waitUntil: 'load' });
    checks++; if (!/\/projects\/$/.test(hp.url())) bad(`${name}: back from case should return to list (${hp.url()})`);
    await hp.goForward({ waitUntil: 'load' });
    checks++; if (hp.url() !== caseUrl) bad(`${name}: forward should reopen case`);
    await Promise.all([hp.waitForNavigation(), hp.locator('[data-back-to-list]').click()]);
    checks++; if (!/\/projects\/$/.test(hp.url())) bad(`${name}: 回案例列表 did not open list (${hp.url()})`);
    await hp.goBack({ waitUntil: 'load' }).catch(() => {});
    checks++; if (hp.url().includes('/projects/') && hp.url() !== B + '/projects/') bad(`${name}: 回案例列表 left an extra history step (${hp.url()})`);
    await hc.close();
  }
  // 聯絡表單：送出內容正確、成功／太頻繁／失敗都有清楚訊息（攔截送出，不會真的存檔或寄信）
  {
    const fc = await b.newContext({ viewport: { width: 390, height: 844 } });
    const fp = await fc.newPage(); let sent = null; let reply = { status: 200, body: '{"ok":true,"emailSent":true}' };
    await fp.route(/functions\/v1\/submit-inquiry/, (r) => { sent = r.request().postDataJSON(); r.fulfill({ status: reply.status, contentType: 'application/json', body: reply.body }); });
    await fp.goto(B + '/contact/', { waitUntil: 'load' });
    const submit = async () => { await fp.locator('.form__submit').click(); await fp.waitForTimeout(400); return fp.locator('[data-form-msg]').textContent(); };
    checks++; if (!(await submit()).includes('請填寫姓名與電話')) bad(`${name}: empty form not rejected`);
    await fp.locator('input[name=name]').fill('測試'); await fp.locator('input[name=phone]').fill('0912345678');
    await fp.locator('select[name=service]').selectOption({ index: 1 }); await fp.locator('textarea[name=message]').fill('想翻新');
    const okMsg = await submit();
    checks++; if (!okMsg.includes('已收到您的需求') || sent?.name !== '測試' || sent?.phone !== '0912345678' || !sent?.service || sent?.message !== '想翻新' || sent?.website) bad(`${name}: form submit wrong ${okMsg} ${JSON.stringify(sent)}`);
    checks++; if (await fp.locator('input[name=name]').inputValue() !== '') bad(`${name}: form not cleared after success`);
    await fp.locator('input[name=name]').fill('測試'); await fp.locator('input[name=phone]').fill('0912345678');
    reply = { status: 429, body: '{"error":"too_many"}' };
    checks++; if (!(await submit()).includes('剛剛已經送出過')) bad(`${name}: rate limit message missing`);
    reply = { status: 500, body: '{"error":"x"}' };
    checks++; if (!(await submit()).includes('電話、LINE')) bad(`${name}: error message missing`);
    checks++; if (await fp.locator('.form__trap').evaluate((el) => el.getBoundingClientRect().right > 0)) bad(`${name}: bot trap field on screen`);
    await fc.close();
  }
  // 內頁頂端底圖：主要頁面之間來回切換，每一頁的底圖都要出現（有載入、看得到、正在放大）；網路慢時圖片到了也要顯示
  for (const theme of ['light', 'dark']) {
    const sc = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
    const sp = await sc.newPage(); await sp.goto(B + '/projects/', { waitUntil: 'load' });
    const banner = () => sp.evaluate(() => { const i = document.querySelector('.page-hero__bg img'); const z = i.getAnimations().find((x) => x.animationName === 'page-hero-zoom'); return { loaded: i.complete && i.naturalWidth > 0, op: +getComputedStyle(i).opacity, zooming: !!z && z.playState === 'running' }; });
    for (const label of ['公司介紹', '服務流程', '案例作品', '聯絡我們', '案例作品']) {
      const link = label === '聯絡我們' ? sp.locator('.nav__cta') : sp.locator('.nav__link', { hasText: label });
      await Promise.all([sp.waitForNavigation(), link.click()]);
      await sp.waitForTimeout(1300);
      const r = await banner();
      checks++; if (!r.loaded || r.op < 0.5 || !r.zooming) bad(`${name}/${theme}: banner missing after switching to ${label} ${JSON.stringify(r)}`);
    }
    await sc.close();
    const slow = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
    await slow.route(/stage-site\.webp/, async (r) => { await new Promise((ok) => setTimeout(ok, 1500)); await r.continue(); });
    const sl = await slow.newPage(); await sl.goto(B + '/projects/', { waitUntil: 'load' }); await sl.waitForTimeout(1500);
    const r = await sl.evaluate(() => { const i = document.querySelector('.page-hero__bg img'); return { loaded: i.complete && i.naturalWidth > 0, op: +getComputedStyle(i).opacity }; });
    checks++; if (!r.loaded || r.op < 0.5) bad(`${name}/${theme}: banner not shown after slow load ${JSON.stringify(r)}`);
    await slow.close();
  }
  // 首頁背景輪播：6 秒後換到下一張；/details/ 隱藏中，要轉回首頁
  {
    const ctx3 = await b.newContext({ viewport: { width: 1440, height: 900 } });
    const hp = await ctx3.newPage(); await hp.goto(B + '/', { waitUntil: 'load' });
    await hp.waitForFunction(() => [...document.querySelectorAll('.hero__slide')].every((x) => x.complete), null, { timeout: 15000 }).catch(() => {});
    const activeIdx = () => hp.evaluate(() => [...document.querySelectorAll('.hero__slide')].findIndex((x) => x.classList.contains('is-active')));
    const first = await activeIdx();
    await hp.waitForTimeout(6800);
    checks++; if (await activeIdx() === first) bad(`${name}: hero slideshow did not advance`);
    await hp.goto(B + '/details/'); await hp.waitForURL((u) => !u.pathname.includes('/details'), { timeout: 8000 }).catch(() => {});
    checks++; if (new URL(hp.url()).pathname.includes('/details')) bad(`${name}: /details/ did not redirect home`);
    await ctx3.close();
  }
  // 五格動畫：一開始看不到，捲到之後依序浮出（第 1 格先、第 5 格最後），最後全部完整顯示
  {
    const ctx2 = await b.newContext({ viewport: { width: 1440, height: 700 } }); // 五格在第一屏之外
    const ap = await ctx2.newPage(); await ap.goto(B + '/about/', { waitUntil: 'networkidle' });
    const op = () => ap.evaluate(() => [...document.querySelectorAll('.feature')].map((f) => +getComputedStyle(f).opacity));
    const before = await op();
    await ap.locator('.features').scrollIntoViewIfNeeded(); await ap.waitForTimeout(350);
    const mid = await op();
    await ap.waitForTimeout(1600);
    const after = await op();
    checks++; if (!before.every((x) => x === 0)) bad(`${name}: features visible before scrolling ${before}`);
    checks++; if (!(mid[0] > mid[4])) bad(`${name}: features not staggered ${mid}`);
    checks++; if (!after.every((x) => x === 1)) bad(`${name}: features not all shown ${after}`);
    await ctx2.close();
  }
  // 手機封鎖網站資料（localStorage 不能用）時，同一個分頁換頁也要記得選的顏色
  const blocked = await b.newContext({ viewport: { width: 390, height: 844 } });
  await blocked.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
  const bp = await blocked.newPage();
  await bp.goto(B + '/', { waitUntil: 'load' });
  await bp.click('[data-theme-btn]');
  await bp.click('[data-menu-btn]'); await bp.waitForTimeout(400);
  await Promise.all([bp.waitForNavigation(), bp.locator('.nav__link', { hasText: '案例作品' }).click()]);
  checks++; if (await bp.evaluate(() => document.documentElement.dataset.theme) !== 'dark') bad(`${name}: theme lost when storage blocked`);
  await blocked.close();
  for (const old of ['/about/yeshun/', '/about/yaosan/']) {
    await p.goto(B + old); await p.waitForURL(/\/about\/$/, { timeout: 5000 }).catch(() => {});
    checks++; if (!new URL(p.url()).pathname.endsWith('/about/')) bad(`${name}: ${old} did not redirect (${p.url()})`);
  }
  await ctx.close();
  await b.close();
}
console.log(`checks run: ${checks}`);
console.log(problems.length ? `PROBLEMS (${problems.length}):\n` + problems.join('\n') : 'ALL PASSED');
