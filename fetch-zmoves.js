// fetch-zmoves.js —— 从 move 接口补 Z 招式威力（move.z_move_power 不存在时从 move-meta 拉）
// 实际上 PokeAPI 的 /move/{name} 返回里没有 z 威力；Z 威力规律：
//   - 招式威力 0/1 的固定 Z 威力（如 变化招式=100）
//   - 其余 = 威力档位表
// 因此这里只输出固定 Z 威力映射（变化招式）和档位函数，页面运行时计算即可。
// 输出: zrules.json（轻量规则，内嵌页面用）
const fs = require('fs');
// Z 招式固定威力表（变化类一律 100，攻击类按档位）
// 档位表来自官方规则（bulbapedia Z-Power tiers）
const TIERS = [
  [100, 100], [140, 100], [110, 95], [100, 90], [95, 85], [90, 80],
  [85, 75], [80, 70], [75, 65], [70, 60], [65, 55], [60, 50], [55, 45],
  [50, 40], [0, 0],
];
function zPower(power, dmgClass) {
  if (dmgClass === 'status') return null; // 变化类 Z 招式无威力（效果不同）
  const p = power || 0;
  if (p <= 0) return null;
  for (const [k, v] of TIERS) if (p >= k) return v;
  return null;
}
// 输出档位表供页面用（状态招式特判在页面做）
fs.writeFileSync(__dirname + '/zrules.json', JSON.stringify(TIERS));
console.log('zrules.json OK');
