# 宝可梦图鉴 · Pokémon Pokédex（中文）

第 1~9 世代全形态中文图鉴。**纯静态 HTML，零依赖、零外部请求，可完全离线**。

打开 `site/index.html` 即可使用（图片放在同级 `site/images/`）。

**在线预览：<https://yinminj.github.io/pokemon-pokedex/>**

---

## 收录内容

| 项目 | 数量 |
|---|---|
| 形态记录 | 1351 条 |
| 宝可梦种类 | 1025 种 |
| 特殊形态（Mega / 原始回归 / 地区形态 / 超极巨化 / 其它） | 326 |
| 收录招式 | 937 个（含 Z 招式威力档位） |
| 特性 | 373 个 |
| 道馆馆主 / 队长 | 77 位（跨 10 个世代） |
| 徽章 | 77 枚（官方素材，非重绘） |
| 馆主立绘 | 77 张 |

## 页面功能

**图鉴视图**

- 搜索中文名 / 英文名 / 全国编号（有搜索词时自动跨世代全局搜，不受当前世代筛选限制）
- 世代筛选、属性筛选（支持**双属性交集**，最多选 2 个）、形态筛选（基础 / 特殊）、只看收藏
- 排序：编号 / 种族值合计 / 攻击 / 特攻 / 防御 / 速度 / HP，可切升降序
- 详情面板：种族值条形图 + **雷达图**、**防守相性面板**（×4 / ×2 / ½ / ¼ / 0）、
  特性（含隐藏特性）、完整进化链（含道具 / 地点 / 条件）、可筛选的招式表、其它形态切换
- 收藏、组队（6 只）与**队伍分析**：STAB 打击面覆盖 + 共同弱点诊断
- 属性克制表（18×18）、每日一宠、深色模式、键盘导航（`←` `→` 翻页、`/` 聚焦搜索）、
  可分享链接（`#p/25` 直达皮卡丘、`#g/1/0` 直达小刚）

**道馆视图**

- 按世代排列馆主：姓名、专精属性、队伍宝可梦（含等级与配招）、徽章、官方立绘

## 目录结构

```
├─ index.template.html          ← 页面模板（真源码，含占位符 /*__DATA__*/ 等）
├─ build_site.py                ← 构建：注入 6 份数据 + 立绘/徽章映射 → 两个产物
├─ build_images.py              ← 下载宝可梦图并压成 WebP
├─ build_leaderimg_showdown.py  ← 下载馆主立绘（Pokémon Showdown）并裁剪透明边距
├─ process-badges.py            ← 徽章择优（两路源按世代标签精确匹配）并统一输出
│
├─ fetch-pokedex.js   → pokedex-data.json   形态记录（含中文名）
├─ fetch-extra.js     → extra-data.json     特性 / 种族值 / 进化链基础
├─ fetch-moves.js     → moves.json          招式表
├─ fetch-evo2.js      → evo2.json           完整进化条件（道具 / 地点）
├─ fetch-zmoves.js    → zrules.json         Z 招式威力档位
├─ fetch-leaderimg2.js→ leaderimg2.json     馆主立绘候选
├─ fetch-badge2.js    → badgeimg.json       徽章候选（Bulbagarden）
├─ fetch-badge3.py    → badge-real.json     徽章定案（按世代标签精确匹配，解决重名串代）
├─ fetch-badge-wayback.py                   经 Wayback 存档取 Bulbagarden 原图
├─ download-fandom-badges.py                下载 Fandom 一路的徽章
│
├─ site/
│  ├─ index.html                ← 成品（部署版）
│  └─ images/                   ← 1351 宝可梦图 + badges/ 77 + leaders/ 77
│
├─ final-check.js  shot-ui.js  shot-daily.js  ← Playwright 验收脚本
└─ badge-final.json  gyms.json  leaderimg-final.json  ← 构建时的最终映射
```

## 本地查看

```bash
python -m http.server 8899 --directory site
# 打开 http://127.0.0.1:8899/index.html
```

直接双击 `site/index.html` 也能用，但建议起个静态服务，避免个别浏览器对本地文件的安全限制。

## 重新构建

```bash
# 1) 拉数据（Node.js，访问 PokeAPI）
node fetch-pokedex.js && node fetch-extra.js && node fetch-moves.js
node fetch-evo2.js && node fetch-zmoves.js

# 2) 拉图片（Python + Pillow，从 CDN 下载并压成 WebP）
python build_images.py

# 3) 徽章与立绘
python fetch-badge3.py            # 选定各世代徽章图源
python download-fandom-badges.py  # 下载
python build_leaderimg_showdown.py
python process-badges.py          # 择优 + 输出到 site/images/badges/

# 4) 出成品
python build_site.py              # → site/index.html 与 pokedex-offline.html（单文件版）
```

`build_site.py` 自带断言：占位符必须全部被替换、立绘与徽章注入数量必须与源数据一致、
产物里不允许残留任何外部域名。不通过会直接报错。

> 单文件离线版 `pokedex-offline.html`（约 28MB，图片全部 base64 内嵌）**未入库**，
> 跑一次 `build_site.py` 即可生成。

### 验收

```bash
npm i                      # 只装 playwright-core（用本机已装的 Chrome，不下载浏览器）
node final-check.js        # 离线版加载、分享链接、键盘导航
node shot-ui.js            # 各视图截图 + 控制台报错 / 4xx 请求检查
node shot-daily.js         # 每日一宠卡片行为
```

## 数据与素材来源

| 内容 | 来源 |
|---|---|
| 宝可梦数据（名字、属性、种族值、特性、招式、进化链） | [PokéAPI](https://pokeapi.co/) |
| 宝可梦图片 | [PokeAPI/sprites](https://github.com/PokeAPI/sprites)，经 jsDelivr 下载 |
| 道馆徽章 | [Bulbagarden Archives](https://archives.bulbagarden.net/)（直连被墙时经 Wayback 存档取回）+ [Fandom 宝可梦维基](https://pokemon.fandom.com/) |
| 馆主立绘 | [Pokémon Showdown](https://play.pokemonshowdown.com/sprites/trainers/) |

## 已知限制

- **第 7 世代（阿罗拉）没有道馆**，官方设定是「试炼」，奖励为 Z 纯晶，页面按试炼呈现。
- **第 10 世代《宝可梦 风／浪》定于 2027 年发售**，官方资料尚未公开，道馆视图显示提示卡而非编造数据。
- 合众部分徽章与城都部分徽章源图偏小（40~45px），这已是公开渠道最高清版本；
  代码对 ≤64px 的像素图用最近邻整数倍放大保锐，不做插值以免发糊。
- 阿罗拉 Z 纯晶官方可得的最大图为 80×45 的梦世界版本（横向），在卡片里会比其它徽章显小一圈。
- 卡洛斯妖精徽章造型本身是横展的蝴蝶结（252×62），显示偏扁属正常。

## 版权声明

宝可梦（Pokémon）相关的名称、形象、游戏素材版权归
**Nintendo / Creatures Inc. / GAME FREAK inc. / The Pokémon Company** 所有。

本仓库为个人学习与技术研究所作，不提供任何商业用途，也不声称对上述素材拥有任何权利。
仓库设为**私有**即为此故——请勿公开再分发其中的游戏素材。
