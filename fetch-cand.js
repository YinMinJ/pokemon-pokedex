/**
 * 下载候选立绘 → 检测是否透明背景干净立绘 → 拼图预览
 * 判断标准：PNG 有 alpha 通道，且四角透明（官方立绘特征）
 */
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '_preview2');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

const up = JSON.parse(fs.readFileSync(path.join(__dirname, 'leaderimg-upgrade.json'), 'utf8'));

(async () => {
  const list = [];
  for (const [en, v] of Object.entries(up)) list.push({ en, ...v });
  const meta = [];
  for (const it of list) {
    const safe = it.file.replace(/[^A-Za-z0-9]/g, '_').slice(0, 60) + '.png';
    try {
      const r = await fetch(it.url, { headers: { 'User-Agent': 'Mozilla/5.0 PokedexBuilder/1.0' } });
      if (!r.ok) { console.log('下载失败', it.en, r.status); continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      fs.writeFileSync(path.join(OUT, safe), buf);
      meta.push({ en: it.en, file: safe, orig: it.file, w: it.w, h: it.h });
      console.log('下载', it.en.padEnd(24), it.file);
    } catch (e) { console.log('异常', it.en, e.message); }
  }
  fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta, null, 1));
  console.log('\n共下载', meta.length, '张');
})();
