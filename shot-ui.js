/* UI 重构验证：控制台报错 / 资源 404 / 新功能逐项截图 */
const { chromium } = require('playwright-core');

const URL = 'http://127.0.0.1:8899/index.html';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const errors = [], failed = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message.slice(0, 200)));
  page.on('response', r => { if (r.status() >= 400) failed.push(r.status() + ' ' + r.url().split('/').slice(-2).join('/')); });

  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1600);

  // —— 基础状态 ——
  const base = await page.evaluate(() => ({
    cards: document.querySelectorAll('#grid .card').length,
    count: document.getElementById('count').textContent,
    daily: document.getElementById('dailyName').textContent,
    dailySub: document.getElementById('dailySub').textContent,
    glowA: getComputedStyle(document.querySelector('header')).getPropertyValue('--glowA').trim(),
    stats: [...document.querySelectorAll('.heroStats b')].map(b => b.textContent),
    toolbarRows: document.querySelectorAll('.toolbar .chip-row').length,
  }));
  console.log('[首屏]', JSON.stringify(base, null, 1));

  await page.screenshot({ path: 'ui_1_top.png' });

  // —— 卡片网格 ——
  await page.evaluate(() => window.scrollTo(0, 640));
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'ui_2_grid.png' });

  // —— 属性双选 ——
  const dual = await page.evaluate(() => {
    const row = document.getElementById('type-row');
    const pick = n => [...row.querySelectorAll('.chip.type[data-t]')].find(c => c.dataset.t === n);
    pick('fire').click(); pick('flying').click();
    return {
      selected: state.types,
      count: document.getElementById('count').textContent,
      hint: [...row.querySelectorAll('span')].pop().textContent,
      chipHTML: pick('fire').innerHTML,
    };
  });
  console.log('[属性双选 火+飞行]', JSON.stringify(dual));
  await page.screenshot({ path: 'ui_3_filter.png' });

  // —— 排序 ——
  const sortRes = await page.evaluate(async () => {
    // 先清掉属性筛选
    [...document.querySelectorAll('#type-row .chip.type')].find(c => !c.dataset.t).click();
    const sel = document.getElementById('sortSel');
    sel.value = 'speed'; sel.dispatchEvent(new Event('change'));
    const first = view.slice(0, 3).map(p => p.zh + ':' + (statsOf(p)?.speed ?? '-'));
    return { top3: first, shown: view.length, count: document.getElementById('count').textContent };
  });
  console.log('[按速度降序]', JSON.stringify(sortRes));
  await page.screenshot({ path: 'ui_4_sort.png' });

  // —— 详情弹窗（火系双属性，展示雷达图 + 相性）——
  await page.evaluate(() => showModal(DEX.find(x => x.id === 6)));
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'ui_5_detail.png' });
  const det = await page.evaluate(() => ({
    radar: !!document.querySelector('#m-body .radar svg'),
    matchupRows: document.querySelectorAll('#m-body .muRow').length,
    moves: document.querySelectorAll('#m-body table.mv tbody tr').length,
    evo: document.querySelectorAll('#m-body .ebtn').length,
    teamBtn: document.getElementById('mTeam').textContent,
  }));
  console.log('[详情 喷火龙]', JSON.stringify(det));

  // 详情下半部分（招式表）
  await page.evaluate(() => { document.getElementById('modal').scrollTop = 700; });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'ui_6_detail_moves.png' });

  // —— 深色模式详情 ——
  await page.evaluate(() => {
    document.getElementById('modal').scrollTop = 0;
    document.body.classList.add('dark');
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'ui_7_detail_dark.png' });
  await page.evaluate(() => document.body.classList.remove('dark'));

  // —— 队伍分析 ——
  await page.evaluate(() => {
    document.getElementById('mask').classList.remove('show');
    team = [6, 9, 3, 25, 149, 130];
    store.set('team', team);
    document.getElementById('teamBar').classList.add('show');
    document.getElementById('btn-team').classList.add('on');
    syncTeamBar();
    document.getElementById('teamAnalyze').click();
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'ui_8_team.png' });
  const ana = await page.evaluate(() => ({
    metrics: [...document.querySelectorAll('.anaMetric b')].map(b => b.textContent),
    covered: document.querySelectorAll('.coverage .cv:not(.off)').length,
    members: document.querySelectorAll('#anaBody .anaRow').length,
    threats: [...document.querySelectorAll('.threatRow .thN')].map(x => x.textContent),
  }));
  console.log('[队伍分析]', JSON.stringify(ana));

  // —— 道馆视图 ——
  await page.evaluate(() => {
    document.getElementById('anaMask').classList.remove('show');
    setView('gym');
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'ui_9_gym.png' });

  // —— 回图鉴 + 深色首屏 ——
  await page.evaluate(() => { setView('dex'); document.body.classList.add('dark'); });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'ui_10_dark_top.png' });
  await page.evaluate(() => window.scrollTo(0, 560));
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'ui_11_dark_grid.png' });

  // —— 移动端 ——
  await page.setViewportSize({ width: 420, height: 900 });
  await page.evaluate(() => { document.body.classList.remove('dark'); window.scrollTo(0, 0); });
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'ui_12_mobile.png' });

  console.log('\n=== 控制台错误 ===', errors.length ? errors : '无');
  console.log('=== 失败请求 ===', failed.length ? failed.slice(0, 10) : '无');
  await browser.close();
})();
