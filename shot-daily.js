/* 每日一宠卡片验证：默认是谁 / ↻ 换一只 / 倒计时文案 / 刷新保持 */
const { chromium } = require('playwright-core');
const URL = 'http://127.0.0.1:8899/index.html';
const CHROME = 'C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe';

(async () => {
  const b = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));

  await p.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(1800);

  const read = () => p.evaluate(() => ({
    name: document.getElementById('dailyName').textContent,
    label: document.getElementById('dailyLabel').textContent,
    sub: document.getElementById('dailySub').textContent,
    next: document.getElementById('dailyNext').textContent.trim(),
    color: getComputedStyle(document.getElementById('daily')).getPropertyValue('--tc').trim(),
  }));

  const a = await read();
  console.log('① 首次加载：', JSON.stringify(a, null, 0));

  // 点 ↻ 换一只
  await p.hover('#daily');
  await p.waitForTimeout(300);
  await p.click('#dailyDice');
  await p.waitForTimeout(500);
  const b2 = await read();
  console.log('② 点 ↻ 之后：', JSON.stringify(b2, null, 0));
  console.log('   ↻ 生效:', a.name !== b2.name ? '✓ 换成了 ' + b2.name : '✗ 没变');

  // 再换 5 次，确认随机且不重复触发弹窗
  const seq = [];
  for (let i = 0; i < 5; i++) { await p.click('#dailyDice'); await p.waitForTimeout(200); seq.push((await read()).name); }
  console.log('③ 连点 5 次：', seq.join(' → '));
  const modalOpen = await p.evaluate(() => !!document.querySelector('#mask.show'));
  console.log('   点 ↻ 是否误开详情弹窗:', modalOpen ? '✗ 误开了' : '✓ 没有');

  // 刷新后是否保持手动选择
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(1500);
  const c = await read();
  console.log('④ 刷新后：', c.name, '|', c.label, '| 与上次一致:', c.name === seq[seq.length - 1] ? '✓' : '✗ ' + c.name);

  // 清掉手动记录，回到每日默认
  await p.evaluate(() => { localStorage.removeItem('pdx_dailyPick'); });
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(1500);
  const d = await read();
  console.log('⑤ 清记录后复位：', d.name, '|', d.label, '| 与首次一致:', d.name === a.name ? '✓' : '✗');

  // 卡片点击仍能开详情
  await p.click('#dailyName');
  await p.waitForTimeout(600);
  const ok = await p.evaluate(() => {
    const m = document.querySelector('#mask.show');
    return m ? (document.querySelector('#m-body h2') || {}).textContent : null;
  });
  console.log('⑥ 点卡片开详情：', ok ? '✓ ' + ok : '✗ 没打开');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);

  // 截图（桌面 + 移动）
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(400);
  await p.hover('#daily');
  await p.waitForTimeout(400);
  await p.locator('header').screenshot({ path: 'daily_desktop.png' });

  const m = await ctx.newPage();
  await m.setViewportSize({ width: 390, height: 844 });
  await m.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await m.waitForTimeout(1800);
  await m.locator('header').screenshot({ path: 'daily_mobile.png' });

  console.log('控制台错误:', errs.length ? errs.slice(0, 5) : '无');
  await b.close();
})();
