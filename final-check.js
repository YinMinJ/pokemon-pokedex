/* 最终验收：键盘导航 / 分享链接 / 每日一宠 / 离线单文件版 */
const { chromium } = require('playwright-core');
const CHROME = 'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const errors = [];

  // ===== 1. 部署版：键盘导航 + 哈希路由 + 每日一宠 =====
  const p1 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  p1.on('pageerror', e => errors.push('deploy: ' + e.message.slice(0, 160)));
  await p1.goto('http://127.0.0.1:8899/index.html#p/25', { waitUntil: 'load', timeout: 60000 });
  await p1.waitForTimeout(1800);

  const routed = await p1.evaluate(() => ({
    opened: document.getElementById('mask').classList.contains('show'),
    name: document.querySelector('#m-body h2')?.textContent?.trim(),
    hash: location.hash,
  }));
  console.log('[分享链接 #p/25]', JSON.stringify(routed));

  // 键盘 ← 应回到 24 号（皮卡丘前一只）
  await p1.keyboard.press('ArrowRight');
  await p1.waitForTimeout(500);
  const kb = await p1.evaluate(() => ({
    name: document.querySelector('#m-body h2')?.textContent?.trim(),
    hash: location.hash,
  }));
  console.log('[按 → 后]', JSON.stringify(kb));

  // 每日一宠可点开
  const daily = await p1.evaluate(async () => {
    document.getElementById('mask').classList.remove('show');
    const name = document.getElementById('dailyName').textContent;
    document.getElementById('daily').click();
    await new Promise(r => setTimeout(r, 300));
    return { dailyName: name, opened: document.querySelector('#m-body h2')?.textContent?.trim() };
  });
  console.log('[每日一宠点击]', JSON.stringify(daily));

  // 详情弹窗滚动到底，确认无布局溢出
  const overflow = await p1.evaluate(() => {
    const m = document.getElementById('modal');
    m.scrollTop = m.scrollHeight;
    return { modalScrollH: m.scrollHeight, clientH: m.clientHeight, canScroll: m.scrollHeight > m.clientHeight };
  });
  console.log('[弹窗可滚动]', JSON.stringify(overflow));
  await p1.waitForTimeout(400);
  await p1.screenshot({ path: 'ui_13_detail_bottom.png' });

  await p1.close();

  // ===== 2. 离线单文件版 =====
  const p2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  p2.on('pageerror', e => errors.push('offline: ' + e.message.slice(0, 160)));
  const t0 = Date.now();
  await p2.goto('file:///C:/Users/Administrator/WorkBuddy/2026-08-28-09-16-15/pokedex-offline.html',
    { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p2.waitForTimeout(4000);
  const off = await p2.evaluate(() => {
    const img = document.querySelector('#grid .card img');
    return {
      cards: document.querySelectorAll('#grid .card').length,
      firstImgIsBase64: !!(img && img.src.startsWith('data:image/webp;base64,')),
      daily: document.getElementById('dailyName').textContent,
      heroGlow: getComputedStyle(document.querySelector('header')).getPropertyValue('--glowA').trim(),
    };
  });
  console.log('[离线版]', JSON.stringify(off), '加载', ((Date.now() - t0) / 1000).toFixed(1) + 's');

  // 离线版详情（含雷达图 + 相性）
  await p2.evaluate(() => showModal(DEX.find(x => x.id === 445)));
  await p2.waitForTimeout(1200);
  const off2 = await p2.evaluate(() => ({
    radar: !!document.querySelector('#m-body .radar svg'),
    matchup: document.querySelectorAll('#m-body .muRow').length,
    artOk: (() => { const i = document.querySelector('#m-body .dArt img'); return !!(i && i.src.startsWith('data:')); })(),
  }));
  console.log('[离线版详情 烈咬陆鲨]', JSON.stringify(off2));
  await p2.screenshot({ path: 'ui_14_offline_detail.png' });

  await p2.close();
  await browser.close();
  console.log('\n=== JS 异常 ===', errors.length ? errors : '无');
})();
