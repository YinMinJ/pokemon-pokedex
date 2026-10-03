/**
 * 徽章最终解析：优先选分辨率最高的版本（官方徽章图）
 * 缺失的 Z 纯晶 / 朱紫徽章单独补搜
 */
const fs = require('fs');
const path = require('path');

const API = 'https://archives.bulbagarden.net/w/api.php';
const UA = 'Mozilla/5.0 PokedexBuilder/1.0 (personal offline project)';

const ABBRS = ['LGPE', 'PE', 'SwSh', 'SV', 'SM', 'USUM', 'XY', 'ORAS', 'B2W2', 'BW',
  'HGSS', 'BDSP', 'Pt', 'DP', 'FRLG', 'RSE', 'RS', 'E', 'GS', 'Crystal', 'RB', 'RG', 'Y'];
const GAME_FULL = ['Sword Shield', 'Scarlet Violet', 'Sun Moon', 'Ultra Sun Ultra Moon',
  'X Y', 'Omega Ruby Alpha Sapphire', 'Black White', 'Black 2 White 2',
  'HeartGold SoulSilver', 'Diamond Pearl', 'Platinum', 'Brilliant Diamond Shining Pearl',
  'FireRed LeafGreen', 'Ruby Sapphire Emerald', 'Gold Silver', 'Crystal', 'Red Blue', 'Yellow'];

async function query(titles) {
  const out = {};
  for (let i = 0; i < titles.length; i += 40) {
    const chunk = titles.slice(i, i + 40);
    const url = `${API}?action=query&titles=${encodeURIComponent(chunk.map(t => 'File:' + t).join('|'))}` +
      `&prop=imageinfo&iiprop=url|size&format=json&redirects=1`;
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      const j = await r.json();
      Object.values((j.query && j.query.pages) || {}).forEach(p => {
        if (p.missing !== undefined) return;
        const inf = p.imageinfo && p.imageinfo[0];
        if (!inf || !inf.url) return;
        out[p.title.replace(/^File:/, '')] = { file: p.title.replace(/^File:/, ''), url: inf.url, w: inf.width, h: inf.height, size: inf.size };
      });
    } catch (e) { console.error('  批次失败:', e.message); }
  }
  return out;
}

async function search(term, limit = 20) {
  const url = `${API}?action=query&list=search&srsearch=${encodeURIComponent(term)}&srnamespace=6&srlimit=${limit}&format=json`;
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  const j = await r.json();
  return ((j.query && j.query.search) || []).map(x => x.title.replace(/^File:/, ''));
}

(async () => {
  const gyms = JSON.parse(fs.readFileSync(path.join(__dirname, 'gyms.json'), 'utf8'));
  const badges = [];
  gyms.gens.forEach(g => g.leaders.forEach(L => { if (!badges.includes(L.badgeEn)) badges.push(L.badgeEn); }));

  const isZ = b => /\sZ$/.test(b);
  // 候选构造：基础名 + 缩写前缀 + 游戏全名前缀
  const cand = {}; // title -> badge
  badges.forEach(b => {
    const stems = isZ(b) ? [b, b.replace(/\s+Z$/, ''), b.replace(/\s+Z$/, ' Z-Crystal')]
      : [b, b.replace(/ Badge$/, '') + ' Badge'];
    stems.forEach(st => {
      const t0 = `${st}.png`;
      if (!cand[t0]) cand[t0] = b;
      ABBRS.forEach(ab => { const t = `${ab} ${st}.png`; if (!cand[t]) cand[t] = b; });
      GAME_FULL.forEach(gf => { const t = `${gf} ${st}.png`; if (!cand[t]) cand[t] = b; });
    });
  });

  const titles = Object.keys(cand);
  console.log(`徽章 ${badges.length} 个，候选 ${titles.length} 个，查询中...`);
  const hits = await query(titles);
  console.log(`命中 ${Object.keys(hits).length} 个\n`);

  // 每个徽章选「分辨率最高」的版本（高清优先，同等则文件大者）
  const pick = {};
  Object.entries(hits).forEach(([title, info]) => {
    const b = cand[title];
    if (!b) return;
    const cur = pick[b];
    const score = Math.min(info.w, info.h); // 以短边衡量清晰度
    const curScore = cur ? Math.min(cur.w, cur.h) : -1;
    if (!cur || score > curScore || (score === curScore && info.size > cur.size)) pick[b] = info;
  });

  const miss = badges.filter(b => !pick[b]);
  console.log(`===== 徽章结果 =====`);
  console.log(`命中 ${badges.length - miss.length} / ${badges.length}`);
  if (miss.length) console.log('缺失:', miss.join(', '));

  const es = Object.entries(pick);
  const lo = es.filter(([, v]) => Math.min(v.w, v.h) < 128);
  console.log(`短边<128px 的: ${lo.length} 个 →`, lo.map(([k, v]) => `${k}(${v.w}x${v.h})`).join(', ') || '无');
  console.log('\n抽样:');
  ['Boulder Badge', 'Rising Badge', 'Stone Badge', 'Coal Badge', 'Trio Badge', 'Wave Badge',
    'Grass Badge', 'Fire Badge'].forEach(b => {
      const p = pick[b];
      console.log(' ', b.padEnd(20), p ? p.file + ' (' + p.w + 'x' + p.h + ')' : '✗');
    });

  fs.writeFileSync(path.join(__dirname, 'badgeimg.json'), JSON.stringify({ badges: pick, _miss: miss }, null, 1));
  console.log('\n已写入 badgeimg.json');

  // ---- 补搜缺失的 Z 纯晶 / 朱紫徽章 ----
  if (miss.length) {
    console.log('\n===== 补搜 =====');
    for (const b of miss.slice(0, 6)) {
      const q = isZ(b) ? b.replace(/\s+Z$/, '') : b;
      const hits2 = await search(q, 15);
      console.log(`\n[${b}] 搜 "${q}":`);
      hits2.slice(0, 15).forEach(h => console.log('   ', h));
    }
  }
})();
