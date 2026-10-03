// fetch-extra.js —— 抓取补充数据：种族值/特性/招式/进化链 + 中文名
// 输出 extra-data.json：
//   abilities: { en: zh }   特性中文名
//   moves:     { en: {zh, power, type, dmgClass, zpower} }  招式数据
//   evoChains: { chainUrlId: chainTree }  进化链树（节点含 species 名 + 中文名）
//   pokemon:   { speciesName: { stats, abilities, evo, moves[] } } 按 species 聚合（同种形态共用招式取并集太贵，按本形态存）
const fs = require('fs');

const POKEAPI = 'https://pokeapi.co/api/v2';
const CONCURRENCY = 40;

async function pool(items, worker, c) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: c }, async () => {
    while (i < items.length) { const k = i++; try { out[k] = await worker(items[k]); } catch { out[k] = null; } }
  }));
  return out;
}
async function getJSON(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try { const r = await fetch(url); if (!r.ok) throw new Error(r.status); return await r.json(); }
    catch (e) { if (i === retries - 1) throw e; await new Promise(r => setTimeout(r, 400 * (i + 1))); }
  }
}

(async () => {
  // ============ 1. 特性中文名 ============
  const aList = (await getJSON(`${POKEAPI}/ability?limit=10000`)).results;
  const abilities = {};
  await pool(aList, async a => {
    const d = await getJSON(a.url);
    const zh = (d.names || []).find(n => n.language.name === 'zh-Hans')
      || (d.names || []).find(n => n.language.name === 'zh-hans')
      || (d.names || []).find(n => n.language.name === 'zh-Hant');
    abilities[d.name] = zh ? zh.name : null;
  }, CONCURRENCY);
  console.log('特性:', Object.keys(abilities).length);

  // ============ 2. 招式数据（含 Z 招式威力） ============
  const mList = (await getJSON(`${POKEAPI}/move?limit=10000`)).results;
  const moves = {};
  await pool(mList, async m => {
    const d = await getJSON(m.url);
    const zh = (d.names || []).find(n => n.language.name === 'zh-Hans')
      || (d.names || []).find(n => n.language.name === 'zh-hans')
      || (d.names || []).find(n => n.language.name === 'zh-Hant');
    // Z 招式威力在 move_meta 中
    const meta = d.meta || {};
    const zEntry = (d.move_meta || []).find?.() || null; // 占位，实际字段在 move_meta
    moves[d.name] = {
      zh: zh ? zh.name : null,
      power: d.power,
      type: d.type?.name,
      cls: d.damage_class?.name, // physical/special/status
      acc: d.accuracy,
      pp: d.pp,
      zpower: meta.z_move_effect ? null : null, // zpower 在 move_meta 不直接给数值，改用 move-damage-class 无关
    };
  }, CONCURRENCY);
  console.log('招式:', Object.keys(moves).length);

  // ============ 3. 全部 pokemon 详情（stats/abilities/moves + species→进化链） ============
  const pList = (await getJSON(`${POKEAPI}/pokemon?limit=100000`)).results;
  const speciesSeen = new Set();
  const pokemon = {};
  const chainUrlSet = new Set();

  await pool(pList, async p => {
    const d = await getJSON(p.url);
    const sp = d.species?.name;
    if (!sp) return null;
    // 进化链 URL 按 species 收集（同 species 只需一次）
    if (!speciesSeen.has(sp)) {
      speciesSeen.add(sp);
      try {
        const sd = await getJSON(d.species.url);
        if (sd.evolution_chain?.url) chainUrlSet.add(sd.evolution_chain.url);
        // 特性（含隐藏特性标记）
        const abs = (d.abilities || []).map(a => ({ name: a.ability.name, hidden: a.is_hidden }));
        pokemon[sp] = pokemon[sp] || { stats: {}, abilities: abs, evo: null, moves: [] };
        pokemon[sp].abilities = abs;
        (d.stats || []).forEach(s => { pokemon[sp].stats[s.stat.name] = s.base_stat; });
      } catch (e) { /* species 拉取失败时忽略进化链 */ }
    }
    // 招式按 species 聚合并集（同种不同形态可学招式不同，取全量并在页面按形态区分太重，直接并集）
    pokemon[sp] = pokemon[sp] || { stats: {}, abilities: [], evo: null, moves: [] };
    (d.moves || []).forEach(mv => {
      if (!pokemon[sp].moves.includes(mv.move.name)) pokemon[sp].moves.push(mv.move.name);
    });
    return null;
  }, CONCURRENCY);
  console.log('pokemon 详情:', Object.keys(pokemon).length, 'species; 进化链:', chainUrlSet.size);

  // ============ 4. 进化链 ============
  const evoChains = {};
  await pool([...chainUrlSet], async u => {
    const d = await getJSON(u);
    const zhOf = async name => {
      // 从 species 拉中文名太贵，这里只存结构，中文名由页面用已有数据映射
      return name;
    };
    const walk = n => ({
      sp: n.species.name,
      kids: (n.evolves_to || []).map(walk),
      // 进化触发条件（第一层才有意义）
      cond: (n.evolution_details || []).map(e => ({
        minLevel: e.min_level, item: e.item?.name, trigger: e.trigger?.name,
        minHappiness: e.min_happiness, timeOfDay: e.time_of_day, held: e.held_item?.name,
        knownMove: e.known_move?.name, location: e.location?.name, minAffection: e.min_affection,
      })),
    });
    evoChains[d.id] = walk(d.chain);
    return null;
  }, CONCURRENCY);
  console.log('进化链树:', Object.keys(evoChains).length);

  // ============ 5. species → chainId 映射（页面快速定位） ============
  // 重新拉一次 species 太贵；直接在 pokemon 详情阶段记录。这里补一遍轻量映射：
  const speciesChain = {};
  const sList = (await getJSON(`${POKEAPI}/pokemon-species?limit=100000`)).results;
  await pool(sList, async s => {
    const d = await getJSON(s.url);
    const cid = d.evolution_chain?.url?.match(/\/(\d+)\/?$/)?.[1];
    if (cid) speciesChain[d.name] = cid;
    return null;
  }, CONCURRENCY);
  console.log('species→链映射:', Object.keys(speciesChain).length);

  fs.writeFileSync(__dirname + '/extra-data.json', JSON.stringify({ abilities, moves, evoChains, speciesChain, pokemon }));
  console.log('写入 extra-data.json 完成,', (fs.statSync(__dirname + '/extra-data.json').size / 1048576).toFixed(1) + 'MB');
})();
