/**
 * 抓取道馆馆主立绘 + 徽章图片的 URL 信息（不下载，只解析）
 * 数据源：Bulbagarden Archives (MediaWiki API)
 *
 * 命名规则（实测）：
 *   馆主立绘：`<英文名> <游戏缩写>.png`，如 `Brock DP.png` / `Brock SM.png`
 *   兜底：   `VS<英文名>.png`（96x64 对战立绘，全世代统一）
 *   徽章：   `<徽章英文名> Badge.png` 或 `<游戏缩写> <徽章英文名> Badge.png`
 *
 * 输出：leaderimg.json  { leaders: {en: {url,w,h,file}}, badges: {name: {...}} }
 */
const fs = require('fs');
const path = require('path');

const BASE = __dirname;
const API = 'https://archives.bulbagarden.net/w/api.php';
const CONCURRENCY = 4;

async function getJSON(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'PokedexBuilder/1.0 (personal offline dex project)' },
      });
      if (!r.ok) throw new Error(r.status);
      return await r.json();
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(s => setTimeout(s, 600 * (i + 1)));
    }
  }
}

/** 批量查询标题（MediaWiki 单次上限 50 个），返回 title -> imageinfo */
async function queryTitles(titles) {
  const out = {};
  for (let i = 0; i < titles.length; i += 45) {
    const chunk = titles.slice(i, i + 45);
    // 注意：必须带 File: 前缀，否则查的是主命名空间（会全部 missing）
    const url = `${API}?action=query&titles=${encodeURIComponent(chunk.map(t => 'File:' + t).join('|'))}` +
      `&prop=imageinfo&iiprop=url|size&format=json&redirects=1`;
    try {
      const j = await getJSON(url);
      const pages = (j.query && j.query.pages) || {};
      if (i === 0) {
        const ks = Object.keys(pages);
        console.log('  [调试] 第1批返回 pages:', ks.length, '| 示例:', JSON.stringify(pages[ks[0]]).slice(0, 200));
        console.log('  [调试] 顶层键:', Object.keys(j).join(','));
      }
      Object.values(pages).forEach(p => {
        if (p.missing !== undefined) return;
        const info = p.imageinfo && p.imageinfo[0];
        if (!info || !info.url) return;
        // 规范化标题做 key（去 File: 前缀、空格转下划线）
        const key = p.title.replace(/^File:/, '').replace(/_/g, ' ');
        out[key] = { file: key, url: info.url, w: info.width, h: info.height, size: info.size };
      });
    } catch (e) {
      console.error('  查询失败:', e.message);
    }
  }
  return out;
}

// ---- 游戏缩写：按「高清现代优先」排序 ----
const GAME_ABBRS = [
  'LGPE', 'PE', 'SwSh', 'SV', 'SM', 'USUM', 'XY', 'ORAS',
  'B2W2', 'BW', 'HGSS', 'BDSP', 'Pt', 'DP', 'FRLG',
  'RSE', 'RS', 'E', 'GS', 'Crystal', 'RB', 'RG', 'Y',
];

/** 英文名 → 可能的文件名基名（处理特殊字符 / 多人组合） */
function nameVariants(en) {
  const v = new Set();
  const clean = en.replace(/\./g, '').replace(/\s+/g, ' ').trim();
  v.add(clean);
  v.add(en);
  // 多人组合：Tate & Liza / Cilan / Chili / Cress
  if (/&/.test(en)) en.split('&').forEach(x => { const t = x.replace(/\./g, '').trim(); if (t) v.add(t); });
  if (/\//.test(en)) en.split('/').forEach(x => { const t = x.replace(/\./g, '').trim(); if (t) v.add(t); });
  return [...v];
}

(async () => {
  const gyms = JSON.parse(fs.readFileSync(path.join(BASE, 'gyms.json'), 'utf8'));

  // 收集馆主与徽章
  const leaders = [];
  const badgeSet = new Set();
  gyms.gens.forEach(g => g.leaders.forEach(L => {
    if (!leaders.some(x => x.en === L.en)) leaders.push({ en: L.en, zh: L.name, gen: g.gen });
    badgeSet.add(L.badgeEn);
  }));
  const badges = [...badgeSet];

  console.log(`馆主 ${leaders.length} 位，徽章 ${badges.length} 个，开始解析图片文件名...\n`);

  // ---- 1. 构造馆主候选标题 ----
  const leaderCand = {}; // title -> {en, priority}
  leaders.forEach(L => {
    nameVariants(L.en).forEach((nm, vi) => {
      GAME_ABBRS.forEach((ab, ai) => {
        const t = `${nm} ${ab}.png`;
        if (!leaderCand[t]) leaderCand[t] = { en: L.en, prio: vi * 100 + ai };
      });
    });
  });
  // VS 立绘兜底
  leaders.forEach(L => {
    nameVariants(L.en).forEach((nm, vi) => {
      const t = `VS${nm}.png`;
      if (!leaderCand[t]) leaderCand[t] = { en: L.en, prio: 9000 + vi };
    });
  });
  const leaderTitles = Object.keys(leaderCand);
  console.log(`馆主候选标题 ${leaderTitles.length} 个，开始批量查询...`);
  const leaderHits = await queryTitles(leaderTitles);
  console.log(`命中 ${Object.keys(leaderHits).length} 个\n`);

  // ---- 2. 构造徽章候选标题 ----
  const badgeCand = {}; // title -> {badge, prio}
  badges.forEach(b => {
    // Z 纯晶命名不同：Normalium Z（无 Badge 后缀）
    const isZ = /\sZ$/.test(b);
    const stems = isZ ? [b] : [`${b}`, `${b.replace(/ Badge$/, '')} Badge`];
    stems.forEach((stem, si) => {
      const base = isZ ? `${stem}.png` : `${stem}.png`;
      if (!badgeCand[base]) badgeCand[base] = { badge: b, prio: si * 100 };
      GAME_ABBRS.forEach((ab, ai) => {
        const t = isZ ? `${ab} ${stem}.png` : `${ab} ${stem}.png`;
        if (!badgeCand[t]) badgeCand[t] = { badge: b, prio: si * 100 + 10 + ai };
      });
    });
  });
  const badgeTitles = Object.keys(badgeCand);
  console.log(`徽章候选标题 ${badgeTitles.length} 个，开始批量查询...`);
  const badgeHits = await queryTitles(badgeTitles);
  console.log(`命中 ${Object.keys(badgeHits).length} 个\n`);

  // ---- 3. 挑选最优 ----
  const pickLeader = {};
  Object.entries(leaderHits).forEach(([title, info]) => {
    const meta = leaderCand[title];
    if (!meta) return;
    const cur = pickLeader[meta.en];
    // VS 立绘优先度最低；同优先度选面积大的
    if (!cur || meta.prio < cur.prio || (meta.prio === cur.prio && info.w * info.h > cur.w * cur.h)) {
      pickLeader[meta.en] = { ...info, prio: meta.prio };
    }
  });
  const pickBadge = {};
  Object.entries(badgeHits).forEach(([title, info]) => {
    const meta = badgeCand[title];
    if (!meta) return;
    const cur = pickBadge[meta.badge];
    if (!cur || meta.prio < cur.prio || (meta.prio === cur.prio && info.size > cur.size)) {
      pickBadge[meta.badge] = { ...info, prio: meta.prio };
    }
  });

  // ---- 4. 报告 ----
  const missLeader = leaders.filter(L => !pickLeader[L.en]);
  const missBadge = badges.filter(b => !pickBadge[b]);
  console.log('===== 馆主立绘 =====');
  console.log(`命中 ${leaders.length - missLeader.length} / ${leaders.length}`);
  if (missLeader.length) console.log('缺失:', missLeader.map(x => x.en).join(', '));
  const vsCount = Object.values(pickLeader).filter(x => /^VS/.test(x.file)).length;
  console.log(`其中用 VS 立绘兜底的: ${vsCount} 位`);
  console.log('\n抽样:');
  ['Brock', 'Misty', 'Milo', 'Katy', 'Nanu', 'Ilima', 'Tate & Liza', 'Cilan / Chili / Cress'].forEach(en => {
    const p = pickLeader[en];
    console.log(' ', en.padEnd(26), p ? `${p.file} (${p.w}x${p.h})` : '✗ 无');
  });

  console.log('\n===== 徽章 =====');
  console.log(`命中 ${badges.length - missBadge.length} / ${badges.length}`);
  if (missBadge.length) console.log('缺失:', missBadge.join(', '));
  console.log('抽样:');
  ['Boulder Badge', 'Rising Badge', 'Stone Badge', 'Coal Badge', 'Trio Badge', 'Wave Badge', 'Grass Badge', 'Normalium Z'].forEach(b => {
    const p = pickBadge[b];
    console.log(' ', b.padEnd(26), p ? `${p.file} (${p.w}x${p.h})` : '✗ 无');
  });

  fs.writeFileSync(path.join(BASE, 'leaderimg.json'), JSON.stringify({
    leaders: pickLeader,
    badges: pickBadge,
    _miss: { leaders: missLeader.map(x => x.en), badges: missBadge },
  }, null, 1));
  console.log('\n已写入 leaderimg.json');
})();
