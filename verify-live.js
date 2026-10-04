/* 线上站点验收：控制台报错 / 失败请求 / 关键资源状态 / 截图 */
const { chromium } = require('playwright-core');

const CHROME = process.env.CHROME || 'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';
const URL = 'https://yinminj.github.io/pokemon-pokedex/';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();

  const errors = [];
  const failed = [];
  page.on('pageerror', e => errors.push(e.message.slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  page.on('requestfailed', r => failed.push(r.url().slice(0, 140) + ' -> ' + (r.failure() || {}).errorText));
  page.on('response', r => { if (r.status() >= 400) failed.push('HTTP ' + r.status() + ' ' + r.url().slice(0, 140)); });

  const t0 = Date.now();
  await page.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(6000);

  const info = await page.evaluate(() => {
    const imgs = Array.from(document.images);
    return {
      title: document.title,
      cards: document.querySelectorAll('.card, [data-id]').length,
      imgsTotal: imgs.length,
      imgsLoaded: imgs.filter(i => i.complete && i.naturalWidth > 0).length,
      imgsBroken: imgs.filter(i => i.complete && i.naturalWidth === 0).length,
      hasDaily: !!document.body.innerText.match(/每日一宠|TODAY/),
    };
  });

  console.log('标题      :', info.title);
  console.log('卡片数    :', info.cards);
  console.log('图片      :', info.imgsLoaded + '/' + info.imgsTotal + ' 已加载，破图 ' + info.imgsBroken);
  console.log('每日一宠  :', info.hasDaily);
  console.log('加载耗时  :', ((Date.now() - t0) / 1000).toFixed(1) + 's');
  console.log('JS 报错   :', errors.length ? errors.join(' | ') : '无');
  console.log('失败请求  :', failed.length ? failed.join(' | ') : '无');

  await page.screenshot({ path: 'live-desktop.png' });

  // 手机视口
  const m = await ctx.newPage();
  await m.setViewportSize({ width: 390, height: 844 });
  await m.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await m.waitForTimeout(4000);
  await m.screenshot({ path: 'live-mobile.png' });
  console.log('截图      : live-desktop.png / live-mobile.png');

  await browser.close();
})();
