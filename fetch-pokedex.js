// fetch-pokedex.js —— 从 PokeAPI 抓取全量宝可梦数据（含所有形态 + 中文名）
// 输出: pokedex-data.json
const fs = require('fs');

const POKEAPI = 'https://pokeapi.co/api/v2';
const CONCURRENCY = 40;

// 简易并发池
async function pool(items, worker, concurrency) {
  const results = new Array(items.length);
  let idx = 0, done = 0;
  async function run() {
    while (idx < items.length) {
      const i = idx++;
      try { results[i] = await worker(items[i]); }
      catch (e) { results[i] = null; console.error('FAIL', items[i], e.message); }
      done++;
      if (done % 200 === 0) console.log(`进度 ${done}/${items.length}`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, run));
  return results;
}

// 带重试的 GET
async function getJSON(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: { 'Accept-Encoding': 'gzip' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
}

(async () => {
  // 1. 拿全量列表
  const pList = (await getJSON(`${POKEAPI}/pokemon?limit=100000`)).results;
  const sList = (await getJSON(`${POKEAPI}/pokemon-species?limit=100000`)).results;
  console.log(`pokemon 条目: ${pList.length}, species 条目: ${sList.length}`);

  // 2. 中文名映射（species -> zh-Hans）
  const zhNames = {};
  await pool(sList, async (s) => {
    const data = await getJSON(s.url);
    const n = (data.names || []).find(x => x.language.name === 'zh-hans')
      || (data.names || []).find(x => x.language.name === 'zh-hant')
      || (data.names || []).find(x => x.language.name === 'ja');
    zhNames[data.name] = n ? n.name : null;
  }, CONCURRENCY);
  console.log(`中文名获取完成: ${Object.keys(zhNames).length}`);

  // 3. 逐条抓 pokemon 详情
  const entries = await pool(pList, async (p) => {
    const d = await getJSON(p.url);
    // 图片优先级：官方美术图 > 默认正面 > HOME
    const art = d.sprites?.other?.['official-artwork']?.front_default
      || d.sprites?.front_default
      || d.sprites?.other?.home?.front_default
      || null;
    return {
      id: d.id,
      name: d.name,
      zh: zhNames[d.species?.name] || null,
      species: d.species?.name || d.name,
      types: d.types.map(t => t.type.name),
      height: d.height,
      weight: d.weight,
      img: art,
      default: d.is_default,
    };
  }, CONCURRENCY);

  const ok = entries.filter(Boolean);
  const missingImg = ok.filter(e => !e.img).length;
  const missingZh = ok.filter(e => !e.zh).length;
  console.log(`完成: ${ok.length} 条, 缺图 ${missingImg}, 缺中文名 ${missingZh}`);
  fs.writeFileSync(__dirname + '/pokedex-data.json', JSON.stringify(ok));
  console.log('已写入 pokedex-data.json');
})();
