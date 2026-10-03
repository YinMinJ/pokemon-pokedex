/**
 * 针对低分辨率馆主立绘，用 MediaWiki 搜索找更清晰的官方立绘
 * 对每位馆主搜索名字 → 收集候选 → 过滤掉非立绘文件 → 取尺寸最大者
 */
const fs = require('fs');
const API = 'https://archives.bulbagarden.net/w/api.php';
const UA = 'Mozilla/5.0 PokedexBuilder/1.0';

// 明确排除的非立绘关键词
const EXCLUDE = /(anime|adventures|manga|tcg|card|lineup|stadium|colosseum|\bXD\b|snap|masters|emote|illustration|\bRP\b|pbr|figure|plush|concept|screenshot|episode|movie|poster|walkthrough|\bbattle\b|model|fanart|artwork by|scan|gacha|sets?|badge|z-ring|key chain|merch|toy|amibo|amiibo|quote|icon|logo|box|cover|logo)/i;
// 明显是像素 sprite / 小图标的
const SPRITE = /^(Spr|OD|Bag|Held|Dream|Menu|Icon|VS\s|Footprint|Shiny|Back|Overworld)/i;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function search(term, limit = 50) {
  const url = `${API}?action=query&list=search&srsearch=${encodeURIComponent(term)}` +
    `&srnamespace=6&srlimit=${limit}&format=json`;
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  const j = await r.json();
  return ((j.query && j.query.search) || []).map(x => x.title.replace(/^File:/, ''));
}

async function info(titles) {
  const out = {};
  for (let i = 0; i < titles.length; i += 40) {
    const chunk = titles.slice(i, i + 40);
    const url = `${API}?action=query&titles=${encodeURIComponent(chunk.map(t => 'File:' + t).join('|'))}` +
      `&prop=imageinfo&iiprop=url|size&format=json`;
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      const j = await r.json();
      Object.values((j.query && j.query.pages) || {}).forEach(p => {
        if (p.missing !== undefined) return;
        const inf = p.imageinfo && p.imageinfo[0];
        if (!inf || !inf.url) return;
        out[p.title.replace(/^File:/, '')] = { file: p.title.replace(/^File:/, ''), url: inf.url, w: inf.width, h: inf.height, size: inf.size };
      });
    } catch (e) { /* 忽略单批失败 */ }
  }
  return out;
}

(async () => {
  const cur = JSON.parse(fs.readFileSync(__dirname + '/leaderimg.json', 'utf8'));
  const gyms = JSON.parse(fs.readFileSync(__dirname + '/gyms.json', 'utf8'));
  const leaders = [];
  gyms.gens.forEach(g => g.leaders.forEach(L => { if (!leaders.some(x => x.en === L.en)) leaders.push(L.en); }));

  // 只处理低分辨率（最长边 < 300）或缺失的
  const targets = leaders.filter(en => {
    const p = cur.leaders[en];
    return !p || Math.max(p.w, p.h) < 300;
  });
  console.log(`需要升级的馆主: ${targets.length} 位\n`);

  const upgrades = {};
  for (const en of targets) {
    const term = en.replace(/\./g, '').replace(/&/g, ' ');
    let hits = [];
    try { hits = await search(term, 50); } catch (e) { console.log('  搜索失败', en); }
    // 过滤
    const cand = hits.filter(t =>
      /\.png$/i.test(t) && !SPRITE.test(t) && !EXCLUDE.test(t) &&
      new RegExp(en.split(/[.\s&/]+/).filter(Boolean)[0], 'i').test(t)
    );
    if (!cand.length) { console.log(`${en.padEnd(24)} 无候选`); await sleep(200); continue; }
    const inf = await info(cand);
    // 评分：最大边 >= 300 优先，再按最大边排序
    const list = Object.values(inf).sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h));
    const best = list[0];
    const oldMax = Math.max(cur.leaders[en]?.w || 0, cur.leaders[en]?.h || 0);
    const newMax = best ? Math.max(best.w, best.h) : 0;
    if (best && newMax > oldMax * 1.4) {
      upgrades[en] = best;
      console.log(`${en.padEnd(24)} 升级: ${String(oldMax).padStart(4)}px → ${newMax}px  ${best.file}`);
    } else {
      console.log(`${en.padEnd(24)} 保持 ${oldMax}px（候选最佳 ${newMax}px: ${best ? best.file : '无'}）`);
    }
    await sleep(150);
  }

  fs.writeFileSync(__dirname + '/leaderimg-upgrade.json', JSON.stringify(upgrades, null, 1));
  console.log(`\n共 ${Object.keys(upgrades).length} 位可升级，已写入 leaderimg-upgrade.json`);
})();
