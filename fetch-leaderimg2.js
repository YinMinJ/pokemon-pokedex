/**
 * 馆主立绘最终解析：按「所属世代的官方立绘 → 其他世代立绘 → VS 对战立绘」优先级选图
 *
 * 命名规则（Bulbagarden Archives 实测）：
 *   官方立绘：`<游戏全名> <馆主名>.png`   如 `Sword Shield Milo.png` / `FireRed LeafGreen Erika.png`
 *   VS 立绘： `VS<馆主名>.png`            96x64~720x720 不等的对战开场立绘（全世代兜底）
 *
 * 输出：leaderimg2.json  { leaders: { en: {file,url,w,h} } }
 */
const fs = require('fs');
const path = require('path');

const API = 'https://archives.bulbagarden.net/w/api.php';
const UA = 'Mozilla/5.0 PokedexBuilder/1.0 (personal offline project)';

// 各世代官方立绘的游戏全名候选（按优先级）
const GEN_GAMES = {
  1: ['FireRed LeafGreen', 'Lets Go Pikachu and Eevee', "Let's Go Pikachu Eevee",
    'HeartGold SoulSilver', 'Black 2 White 2', 'Sun Moon', 'Ultra Sun Ultra Moon',
    'Red Blue', 'Yellow', 'Ruby Sapphire Emerald'],
  2: ['HeartGold SoulSilver', 'Crystal', 'Gold Silver', 'Black 2 White 2',
    'Sun Moon', 'Ultra Sun Ultra Moon'],
  3: ['Omega Ruby Alpha Sapphire', 'Ruby Sapphire Emerald', 'Emerald', 'Ruby Sapphire',
    'Sun Moon', 'Ultra Sun Ultra Moon'],
  4: ['Diamond Pearl', 'Platinum', 'Brilliant Diamond Shining Pearl', 'HeartGold SoulSilver',
    'Black 2 White 2'],
  5: ['Black White', 'Black 2 White 2'],
  6: ['X Y', 'XY', 'X and Y', 'Omega Ruby Alpha Sapphire'],
  7: ['Sun Moon', 'Ultra Sun Ultra Moon', "Let's Go Pikachu Eevee"],
  8: ['Sword Shield'],
  9: ['Scarlet Violet'],
};

/** 馆主英文名 → 文件名可能的写法 */
function nameVariants(en) {
  const out = [];
  const push = x => { const t = x.trim(); if (t && !out.includes(t)) out.push(t); };
  push(en);
  push(en.replace(/\./g, ''));
  if (/&/.test(en)) {
    const [a, b] = en.split('&').map(s => s.trim());
    push(`${a} and ${b}`); push(`${b} and ${a}`); push(`${b} & ${a}`);
    push(a); push(b);
  }
  if (/\//.test(en)) {
    const parts = en.split('/').map(s => s.trim());
    push(parts.join(' '));
    parts.forEach(push);
    // Black White Chili Cilan Cress 这类顺序
    push([...parts].reverse().join(' '));
  }
  return out;
}

async function queryTitles(titles) {
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
        out[p.title.replace(/^File:/, '')] = { file: p.title.replace(/^File:/, ''), url: inf.url, w: inf.width, h: inf.height };
      });
    } catch (e) { console.error('  批次失败:', e.message); }
  }
  return out;
}

(async () => {
  const gyms = JSON.parse(fs.readFileSync(path.join(__dirname, 'gyms.json'), 'utf8'));
  const leaders = [];
  gyms.gens.forEach(g => g.leaders.forEach(L => {
    if (!leaders.some(x => x.en === L.en)) leaders.push({ en: L.en, zh: L.name, gen: g.gen });
  }));

  // 构造候选：title -> {en, prio}
  const cand = {};
  leaders.forEach(L => {
    const order = [...(GEN_GAMES[L.gen] || []), ...GEN_GAMES[1], ...GEN_GAMES[8]];
    const uniqOrder = [...new Set(order)];
    nameVariants(L.en).forEach((nm, ni) => {
      uniqOrder.forEach((game, gi) => {
        const t = `${game} ${nm}.png`;
        if (!cand[t]) cand[t] = { en: L.en, prio: ni * 1000 + gi };
      });
    });
    // VS 立绘兜底
    nameVariants(L.en).forEach((nm, ni) => {
      const t = `VS${nm}.png`;
      if (!cand[t]) cand[t] = { en: L.en, prio: 90000 + ni };
    });
  });

  const titles = Object.keys(cand);
  console.log(`馆主 ${leaders.length} 位，候选标题 ${titles.length} 个，查询中...`);
  const hits = await queryTitles(titles);
  console.log(`命中 ${Object.keys(hits).length} 个\n`);

  const pick = {};
  Object.entries(hits).forEach(([title, info]) => {
    const meta = cand[title];
    if (!meta) return;
    const cur = pick[meta.en];
    if (!cur || meta.prio < cur.prio) pick[meta.en] = { ...info, prio: meta.prio };
  });

  const miss = leaders.filter(L => !pick[L.en]);
  console.log(`===== 结果 =====`);
  console.log(`命中 ${leaders.length - miss.length} / ${leaders.length}`);
  if (miss.length) console.log('缺失:', miss.map(x => `${x.gen}代 ${x.en}`).join(', '));

  // 分辨率分布
  const es = Object.entries(pick);
  const lo = es.filter(([, v]) => Math.max(v.w, v.h) < 300);
  const mid = es.filter(([, v]) => Math.max(v.w, v.h) >= 300 && Math.max(v.w, v.h) < 800);
  const hi = es.filter(([, v]) => Math.max(v.w, v.h) >= 800);
  console.log(`分辨率：高(≥800px) ${hi.length} | 中(300-800) ${mid.length} | 低(<300) ${lo.length}`);
  console.log('低分辨率剩余:', lo.map(([k, v]) => `${k}(${v.w}x${v.h})`).join(', ') || '无');
  console.log('\n各世代抽样:');
  [1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(g => {
    const first = leaders.find(L => L.gen === g);
    const p = pick[first.en];
    console.log(`  第${g}代 ${first.en.padEnd(22)} ${p ? p.file + ' (' + p.w + 'x' + p.h + ')' : '✗'}`);
  });

  fs.writeFileSync(path.join(__dirname, 'leaderimg2.json'), JSON.stringify({ leaders: pick, _miss: miss.map(x => x.en) }, null, 1));
  console.log('\n已写入 leaderimg2.json');
})();
