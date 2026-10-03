// 部署版验收（极简，逐步打点）
const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const p = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 });
  p.setDefaultTimeout(15000);
  const bad = [];
  p.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
  p.on('pageerror', e => bad.push('PAGEERROR: ' + e.message));

  console.log('1 打开页面');
  await p.goto('http://127.0.0.1:8899/index.html', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1800);

  console.log('2 切道馆视图');
  await p.click('#btn-gym');
  await p.waitForTimeout(1500);

  const more = await p.evaluate(() => {
    const m = document.getElementById('more');
    return m ? getComputedStyle(m).display : 'missing';
  });
  console.log('   「加载更多」display =', more, '(应 none)');

  console.log('3 切第 6 世代卡洛斯');
  await p.evaluate(() => {
    const c = document.querySelector('.gymGenRow .chip[data-g="6"]');
    if (c) c.click();
  });
  await p.waitForTimeout(1200);
  await p.evaluate(() => {
    const h = [...document.querySelectorAll('.genHead h3')].find(x => x.textContent.includes('第 6 世代'));
    if (h) h.scrollIntoView({ block: 'start' });
  });
  await p.waitForTimeout(500);
  await p.screenshot({ path: 'final_g6.png' });

  const list = await p.evaluate(() => {
    const imgs = [...document.querySelectorAll('.lbadge img')];
    return { total: imgs.length, ok: imgs.filter(i => i.naturalWidth > 0).length };
  });
  console.log('   列表徽章:', JSON.stringify(list));

  console.log('4 打开馆主详情');
  await p.evaluate(() => { const c = document.querySelector('.leaderCard'); if (c) c.click(); });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: 'final_detail.png' });

  const d = await p.evaluate(() => {
    const img = document.querySelector('.badgeBox .bshow img');
    return { loaded: !!img && img.naturalWidth > 0,
             nat: img && img.naturalWidth + 'x' + img.naturalHeight,
             title: document.querySelector('.badgeBox .btxt b')?.textContent,
             note: document.querySelector('.badgeBox .bsrc')?.textContent };
  });
  console.log('   详情徽章:', JSON.stringify(d));
  console.log('失败请求:', bad.length ? [...new Set(bad)].slice(0, 5) : '无');
  await browser.close();
  console.log('完成');
})();
