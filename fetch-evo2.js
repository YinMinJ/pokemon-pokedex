// fetch-evo2.js —— 重抓 541 条进化链，保留完整条件 + 补道具/携带物/地点中文名
// 输出 evo2.json: { evoChains, items: {en: zh}, locations: {en: zh}, knownMoveTypes 已有 TYPE_ZH 无需抓 }
const fs = require('fs');
const POKEAPI = 'https://pokeapi.co/api/v2';
const CONCURRENCY = 30;

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
const zhOf = (names) => {
  const n = (names || []).find(x => x.language.name === 'zh-Hans' || x.language.name === 'zh-hans')
    || (names || []).find(x => x.language.name === 'zh-Hant');
  return n ? n.name : null;
};

(async () => {
  // 1. 重抓全部进化链（完整条件字段）
  const chainList = [];
  const maxId = 541;
  for (let id = 1; id <= maxId; id++) chainList.push(id);
  const evoChains = {};
  await pool(chainList, async id => {
    try {
      const d = await getJSON(`${POKEAPI}/evolution-chain/${id}/`);
      const walk = n => ({
        sp: n.species.name,
        kids: (n.evolves_to || []).map(walk),
        cond: (n.evolution_details || []).map(e => ({
          trigger: e.trigger?.name || null,
          minLevel: e.min_level,
          item: e.item?.name || null,
          heldItem: e.held_item?.name || null,
          knownMove: e.known_move?.name || null,
          knownMoveType: e.known_move_type?.name || null,
          location: e.location?.name || null,
          minHappiness: e.min_happiness,
          minBeauty: e.min_beauty,
          minAffection: e.min_affection,
          gender: e.gender,                 // 1=女 2=男
          relativePhysicalStats: e.relative_physical_stats, // 1=攻>防 -1=攻<防 0=相等
          timeOfDay: e.time_of_day || null,
          needsOverworldRain: e.needs_overworld_rain || false,
          turnUpsideDown: e.turn_upside_down || false,
          tradeSpecies: e.trade_species?.name || null,
          partySpecies: e.party_species?.name || null,
          partyType: e.party_type?.name || null,
        })),
      });
      evoChains[id] = walk(d.chain);
    } catch (e) { console.error('链失败', id, e.message); }
    return null;
  }, CONCURRENCY);
  console.log('进化链:', Object.keys(evoChains).length);

  // 2. 收集用到的道具/地点，抓中文名
  const itemSet = new Set(), locSet = new Set();
  Object.values(evoChains).forEach(chain => {
    (function walk(n) {
      (n.cond || []).forEach(c => {
        if (c.item) itemSet.add(c.item);
        if (c.heldItem) itemSet.add(c.heldItem);
        if (c.location) locSet.add(c.location);
        if (c.tradeSpecies) itemSet.add(c.tradeSpecies);
        if (c.partySpecies) itemSet.add(c.partySpecies);
      });
      (n.kids || []).forEach(walk);
    })(chain);
  });
  console.log('道具:', itemSet.size, '地点:', locSet.size);

  const items = {}, locations = {};
  await pool([...itemSet], async name => {
    try { const d = await getJSON(`${POKEAPI}/item/${name}/`); items[name] = zhOf(d.names) || name; } catch { items[name] = name; }
    return null;
  }, CONCURRENCY);
  await pool([...locSet], async name => {
    try { const d = await getJSON(`${POKEAPI}/location/${name}/`); locations[name] = zhOf(d.names) || name; } catch { locations[name] = name; }
    return null;
  }, CONCURRENCY);
  console.log('道具中文:', Object.keys(items).length, '地点中文:', Object.keys(locations).length);
  console.log('样例 water-stone:', items['water-stone'], '| eterna-forest:', locations['eterna-forest']);

  // 3. species→链 映射沿用已有的（从 extra-data.json）
  const extra = JSON.parse(fs.readFileSync(__dirname + '/extra-data.json', 'utf8'));
  fs.writeFileSync(__dirname + '/evo2.json', JSON.stringify({
    evoChains,
    speciesChain: extra.speciesChain,
    items, locations,
  }));
  console.log('写入 evo2.json,', (fs.statSync(__dirname + '/evo2.json').size / 1024).toFixed(0) + 'KB');
})();
