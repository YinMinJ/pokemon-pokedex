/**
 * 补搜缺失的图片文件（Tate & Liza 立绘、11 个 Z 纯晶、2 个朱紫徽章）
 * 用 MediaWiki 搜索 API 在 File 命名空间找候选
 */
const API = 'https://archives.bulbagarden.net/w/api.php';

async function search(term, limit = 12) {
  const url = `${API}?action=query&list=search&srsearch=${encodeURIComponent(term)}` +
    `&srnamespace=6&srlimit=${limit}&format=json`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 PokedexBuilder/1.0' } });
  const j = await r.json();
  return (j.query && j.query.search || []).map(x => x.title.replace(/^File:/, ''));
}

async function info(titles) {
  const url = `${API}?action=query&titles=${encodeURIComponent(titles.map(t => 'File:' + t).join('|'))}` +
    `&prop=imageinfo&iiprop=url|size&format=json`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 PokedexBuilder/1.0' } });
  const j = await r.json();
  const out = {};
  Object.values((j.query && j.query.pages) || {}).forEach(p => {
    if (p.missing !== undefined) return;
    const i = p.imageinfo && p.imageinfo[0];
    if (i) out[p.title.replace(/^File:/, '')] = { w: i.width, h: i.height, size: i.size, url: i.url };
  });
  return out;
}

(async () => {
  const queries = [
    ['Tate & Liza 立绘', 'Tate Liza ORAS'],
    ['Z 纯晶', 'Normalium Z'],
    ['Z 纯晶2', 'Ghostium Z'],
    ['朱紫电徽章', 'Electric Badge SV'],
    ['朱紫一般徽章', 'Normal Badge SV'],
    ['朱紫徽章命名', 'SV Electric Badge'],
  ];
  for (const [label, q] of queries) {
    console.log(`\n=== ${label}  [搜: ${q}] ===`);
    const hits = await search(q, 10);
    hits.slice(0, 10).forEach(h => console.log('  ', h));
  }

  // 直接试探一批候选名
  console.log('\n=== 直接试探候选 ===');
  const cands = [
    'Tate & Liza ORAS.png', 'Tate and Liza ORAS.png', 'Tate ORAS.png', 'Liza ORAS.png',
    'VSTate & Liza.png', 'Tate & Liza RSE.png', 'Tate & Liza SM.png', 'Tate & Liza.png',
    'Normalium Z.png', 'Normalium-Z.png', 'Normalium Z SM.png', 'Normalium Z USUM.png',
    'Z-Ring Normalium Z.png', 'Electric Badge SV.png', 'SV Electric Badge.png',
    'Normal Badge SV.png', 'SV Normal Badge.png', 'Galar Electric Badge.png',
  ];
  const inf = await info(cands);
  cands.forEach(c => console.log(' ', c.padEnd(30), inf[c] ? `✓ ${inf[c].w}x${inf[c].h}` : '✗'));
})();
