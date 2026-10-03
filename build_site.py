# -*- coding: utf-8 -*-
"""build_site.py —— 生成最终产物（v2：注入种族值/特性/进化链/招式/Z规则五份数据）
1) site/index.html      部署版：图片走同目录 images/ 相对路径
2) pokedex-offline.html 离线版：图片 base64 内嵌，单文件发给别人即可
"""
import json, os, base64

BASE = os.path.dirname(os.path.abspath(__file__))
IMG_DIR = os.path.join(BASE, 'site', 'images')

with open(os.path.join(BASE, 'pokedex-data.json'), encoding='utf-8') as f:
    data = json.load(f)
with open(os.path.join(BASE, 'extra-data.json'), encoding='utf-8') as f:
    extra = json.load(f)
with open(os.path.join(BASE, 'moves.json'), encoding='utf-8') as f:
    moves = json.load(f)
with open(os.path.join(BASE, 'zrules.json'), encoding='utf-8') as f:
    tiers = json.load(f)
with open(os.path.join(BASE, 'evo2.json'), encoding='utf-8') as f:
    evo2 = json.load(f)
with open(os.path.join(BASE, 'gyms.json'), encoding='utf-8') as f:
    gyms = json.load(f)
with open(os.path.join(BASE, 'leaderimg-final.json'), encoding='utf-8') as f:
    leaderimg = json.load(f)
with open(os.path.join(BASE, 'badge-final.json'), encoding='utf-8') as f:
    badgef = json.load(f)
with open(os.path.join(BASE, 'index.template.html'), encoding='utf-8') as f:
    tpl = f.read()

# ---------- 馆主立绘 / 徽章：文件名 → 游戏中文标签 ----------
GAME_LABEL = {
    'FireRed LeafGreen': '火红/叶绿', 'HeartGold SoulSilver': '心金/魂银',
    'Omega Ruby Alpha Sapphire': 'OR/AS', 'Diamond Pearl': '钻石/珍珠', 'Platinum': '白金',
    'Brilliant Diamond Shining Pearl': '晶灿钻石/明亮珍珠', 'Black White': '黑/白',
    'Black 2 White 2': '黑2/白2', 'X Y': 'X/Y', 'XY': 'X/Y', 'Sun Moon': '太阳/月亮',
    'Ultra Sun Ultra Moon': '究极日/月', 'Sword Shield': '剑/盾', 'Scarlet Violet': '朱/紫',
    'Crystal': '水晶', 'Gold Silver': '金/银', 'Ruby Sapphire Emerald': '宝石版',
    'Emerald': '绿宝石', 'Ruby Sapphire': '红蓝宝石', 'Red Blue': '红/绿', 'Yellow': '皮卡丘',
    "Lets Go Pikachu and Eevee": "Let's Go",
}


def game_label(fname):
    """从立绘文件名解析出所属游戏的中文标签"""
    for g, label in GAME_LABEL.items():
        if fname.startswith(g + ' '):
            return label
    if fname.startswith('VS'):
        return '对战立绘'
    return ''


LIMG_DIR = os.path.join(BASE, 'site', 'images', 'leaders')
BIMG_DIR = os.path.join(BASE, 'site', 'images', 'badges')

# EVO2：完整进化链条件 + 道具/地点中文（构建时只保留被引用的链，压缩体积）
used_chains = set(evo2['speciesChain'].values())
evo2_slim = {
    'evoChains': {k: v for k, v in evo2['evoChains'].items() if k in used_chains},
    'speciesChain': evo2['speciesChain'],
    'items': evo2['items'],
    'locations': evo2['locations'],
}
evo2_json = json.dumps(evo2_slim, ensure_ascii=False, separators=(',', ':'))
gyms_json = json.dumps(gyms, ensure_ascii=False, separators=(',', ':'))

# 精简 extra：evoChains 只保留用到的链
used_chains = set(extra['speciesChain'].values())
extra_slim = {
    'abilities': extra['abilities'],
    'evoChains': {k: v for k, v in extra['evoChains'].items() if k in used_chains},
    'speciesChain': extra['speciesChain'],
    'pokemon': extra['pokemon'],
}
extra_json = json.dumps(extra_slim, ensure_ascii=False, separators=(',', ':'))
moves_json = json.dumps(moves, ensure_ascii=False, separators=(',', ':'))
tiers_json = json.dumps(tiers, separators=(',', ':'))

def slim(p):
    return {
        'id': p['id'], 'name': p['name'], 'zh': p['zh'], 'species': p['species'],
        'types': p['types'], 'height': p['height'], 'weight': p['weight'],
        'default': p['default'],
    }

def render(img_of, leader_of, badge_of):
    out = tpl.replace('/*__DATA__*/[]', json.dumps(
        [{**slim(p), 'img': img_of(p)} for p in data], ensure_ascii=False, separators=(',', ':')))
    out = out.replace('/*__EXTRA__*/{}', extra_json)
    out = out.replace('/*__EVO2__*/{}', evo2_json)
    out = out.replace('/*__GYMS__*/{}', gyms_json)
    out = out.replace('/*__LIMG__*/{}', json.dumps(leader_of, ensure_ascii=False, separators=(',', ':')))
    out = out.replace('/*__BIMG__*/{}', json.dumps(badge_of, ensure_ascii=False, separators=(',', ':')))
    out = out.replace('/*__MOVES__*/{}', moves_json)
    out = out.replace('/*__TIERS__*/[]', tiers_json)
    return out


def build_limg(url_of):
    """馆主立绘映射：{英文名: {u:图片地址, g:游戏标签}}，只保留图片实际存在的"""
    out = {}
    for en, meta in leaderimg['leaders'].items():
        f = os.path.join(LIMG_DIR, meta['slug'] + '.webp')
        if not os.path.exists(f):
            continue
        out[en] = {'u': url_of(f, meta['slug'], 'leaders'), 'g': game_label(meta['file'])}
    return out


def build_bimg(url_of):
    """徽章映射：{"世代|徽章英文名": {u:地址, px:尺寸, src:来源}}，
    同时写入无重名的英文名键，兼容旧查询。只保留图片实际存在的。"""
    out = {}
    for key, meta in badgef['badges'].items():
        f = os.path.join(BIMG_DIR, meta['slug'] + '.webp')
        if not os.path.exists(f):
            continue
        out[key] = {'u': url_of(f, meta['slug'], 'badges'), 'px': meta.get('px', ''),
                    'src': meta.get('src', ''), 'from': meta.get('from', '')}
    for name, slug in badgef.get('plain', {}).items():
        k = f'{_gen_of(slug)}|{name}'
        if k in out:
            out[name] = out[k]
    return out


def _gen_of(slug):
    """从 g{世代}_{名称} 形式的 slug 里取出世代号"""
    return slug.split('_', 1)[0][1:] if slug.startswith('g') else ''


# ---------- 部署版：相对路径 ----------
os.makedirs(os.path.join(BASE, 'site'), exist_ok=True)
html = render(
    lambda p: f"images/{p['id']}.webp" if os.path.exists(os.path.join(IMG_DIR, f"{p['id']}.webp")) else '',
    build_limg(lambda f, slug, kind: f"images/{kind}/{slug}.webp"),
    build_bimg(lambda f, slug, kind: f"images/{kind}/{slug}.webp"),
)
with open(os.path.join(BASE, 'site', 'index.html'), 'w', encoding='utf-8') as f:
    f.write(html)
print(f"site/index.html: {os.path.getsize(os.path.join(BASE,'site','index.html'))/1048576:.2f}MB")

# ---------- 离线版：base64 内嵌 ----------
def b64p(fpath):
    with open(fpath, 'rb') as f:
        return 'data:image/webp;base64,' + base64.b64encode(f.read()).decode('ascii')


def b64(p):
    fpath = os.path.join(IMG_DIR, f"{p['id']}.webp")
    return b64p(fpath) if os.path.exists(fpath) else ''


html2 = render(
    b64,
    build_limg(lambda f, slug, kind: b64p(f)),
    build_bimg(lambda f, slug, kind: b64p(f)),
)
with open(os.path.join(BASE, 'pokedex-offline.html'), 'w', encoding='utf-8') as f:
    f.write(html2)
print(f"pokedex-offline.html: {os.path.getsize(os.path.join(BASE,'pokedex-offline.html'))/1048576:.2f}MB")

# 校验：注入完整 + 无外链残留
assert 'raw.githubusercontent' not in html, '部署版仍有外链!'
assert 'archives.bulbagarden.net' not in html and 'archives.bulbagarden.net' not in html2, '仍有外部图片源!'
for tag in ['/*__DATA__*/', '/*__EXTRA__*/', '/*__EVO2__*/', '/*__GYMS__*/',
            '/*__LIMG__*/', '/*__BIMG__*/', '/*__MOVES__*/', '/*__TIERS__*/']:
    assert tag not in html and tag not in html2, f'{tag} 未注入!'
assert '"pokemon"' in html, 'extra 数据缺失!'
n_local = sum(1 for p in data if os.path.exists(os.path.join(IMG_DIR, f"{p['id']}.webp")))
print(f'本地图片引用: {n_local}/{len(data)}')
n_limg = len(build_limg(lambda f, s, k: 'x'))
n_bimg = len(build_bimg(lambda f, s, k: 'x'))
n_badge_expect = len(badgef['badges'])
print(f"馆主立绘: {n_limg}/{len(leaderimg['leaders'])} | "
      f"徽章: {sum(1 for k in build_bimg(lambda f,s,k:'x') if '|' in k)}/{n_badge_expect}，注入校验通过")
assert sum(1 for k in build_bimg(lambda f, s, k: 'x') if '|' in k) == n_badge_expect, \
    '有徽章图未注入（文件缺失？）'
