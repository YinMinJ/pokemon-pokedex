// fetch-moves.js —— 只补招式数据（上一版 move_meta 占位代码 bug 导致 0 条）
// 输出 moves.json: { en: { zh, power, type, cls, acc, pp } }
// Z 招式威力按官方档位表在页面运行时计算（zrules.json）
const fs = require('fs');
const POKEAPI = 'https://pokeapi.co/api/v2';
const CONCURRENCY = 30;

async function pool(items, worker, c) {
  const out = new Array(items.length); let i = 0; let done = 0;
  await Promise.all(Array.from({ length: c }, async () => {
    while (i < items.length) { const k = i++; try { out[k] = await worker(items[k]); } catch (e) { out[k] = null; } done++; if (done % 100 === 0) console.log('进度', done, '/', items.length); }
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
  const mList = (await getJSON(`${POKEAPI}/move?limit=10000`)).results;
  console.log('招式总数:', mList.length);
  const moves = {};
  let fail = 0;
  await pool(mList, async m => {
    try {
      const d = await getJSON(m.url);
      const zh = (d.names || []).find(n => n.language.name === 'zh-hans')
        || (d.names || []).find(n => n.language.name === 'zh-hant');
      moves[d.name] = {
        zh: zh ? zh.name : null,
        power: d.power,
        type: d.type?.name,
        cls: d.damage_class?.name,
        acc: d.accuracy,
        pp: d.pp,
      };
    } catch (e) { fail++; }
    return null;
  }, CONCURRENCY);
  console.log('招式完成:', Object.keys(moves).length, '失败:', fail);
  const missZh = Object.values(moves).filter(x => !x.zh).length;
  console.log('缺中文名:', missZh);
  fs.writeFileSync(__dirname + '/moves.json', JSON.stringify(moves));
  console.log('写入 moves.json,', (fs.statSync(__dirname + '/moves.json').size / 1024).toFixed(0) + 'KB');
})();
