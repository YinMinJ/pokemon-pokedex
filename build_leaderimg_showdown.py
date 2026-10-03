# -*- coding: utf-8 -*-
"""
从 Pokémon Showdown 下载馆主立绘（Bulbagarden 被限流时的可靠备用源）
命名规则：英文名小写、去点去空格（Lt. Surge -> ltsurge，Crasher Wake -> crasherwake）
输出：site/images/leaders/<slug>.webp  + leaderimg-final.json
"""
import json
import os
import re
import time
import requests
from io import BytesIO
from PIL import Image

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, 'site', 'images', 'leaders')
os.makedirs(OUT, exist_ok=True)
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36'}
BASE_URL = 'https://play.pokemonshowdown.com/sprites/trainers/'


def slug(s):
    return re.sub(r'[^A-Za-z0-9]+', '-', s).strip('-').lower() or 'x'


def showdown_names(en):
    """英文名 -> Showdown 文件名候选"""
    cands = []
    base = en.lower().replace('.', '').replace('&', '').replace('/', '')
    cands.append(re.sub(r'[^a-z0-9]+', '', base))            # crasherwake / ltsurge
    cands.append(re.sub(r'[^a-z0-9]+', '-', base).strip('-'))  # crasher-wake
    if '&' in en or '/' in en:
        parts = [p.strip().lower().replace('.', '') for p in re.split(r'[&/]', en) if p.strip()]
        cands += [re.sub(r'[^a-z0-9]+', '', p) for p in parts]
        cands.append('and'.join(re.sub(r'[^a-z0-9]+', '', p) for p in parts))
        if len(parts) == 2:
            cands.append(re.sub(r'[^a-z0-9]+', '', parts[1] + parts[0]))
    seen, out = set(), []
    for c in cands:
        if c and c not in seen:
            seen.add(c)
            out.append(c)
    return out


def fetch(name):
    for cand in showdown_names(name):
        url = BASE_URL + cand + '.png'
        try:
            r = requests.get(url, headers=UA, timeout=20)
            if r.status_code == 200 and len(r.content) > 200:
                return cand, r.content
        except Exception:
            continue
    return None, None


def main():
    gyms = json.load(open(os.path.join(BASE, 'gyms.json'), encoding='utf-8'))
    leaders = []
    for g in gyms['gens']:
        for L in g['leaders']:
            if not any(x['en'] == L['en'] for x in leaders):
                leaders.append({'en': L['en'], 'zh': L['name'], 'gen': g['gen']})

    started = time.time()
    out, miss = {}, []
    for L in leaders:
        cand, blob = fetch(L['en'])
        if not blob:
            miss.append(L['en'])
            print(f'  ✗ {L["en"]}')
            continue
        try:
            im = Image.open(BytesIO(blob)).convert('RGBA')
        except Exception as e:
            miss.append(L['en'])
            print(f'  ✗ {L["en"]} 图像解析失败 {e}')
            continue
        w0, h0 = im.size
        # 裁掉透明边距，让立绘填满画面（留 3% 呼吸空间）
        bbox = im.getbbox()
        if bbox:
            im = im.crop(bbox)
            pad = max(2, int(max(im.size) * 0.03))
            canvas = Image.new('RGBA', (im.width + pad * 2, im.height + pad * 2), (0, 0, 0, 0))
            canvas.paste(im, (pad, pad), im)
            im = canvas
        w, h = im.size
        # 最长边放大到 256px（Showdown 原图 80x80，适度放大后 WebP 依然清晰）
        scale = 256 / max(w, h)
        if scale > 1:
            im = im.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.NEAREST)
        s = slug(L['en'])
        dest = os.path.join(OUT, s + '.webp')
        im.save(dest, 'WEBP', quality=88, method=6)
        out[L['en']] = {'slug': s, 'file': f'showdown/{cand}.png', 'w': w0, 'h': h0,
                        'kb': round(os.path.getsize(dest) / 1024, 1)}
        print(f'  ✓ {L["en"]:<24} {cand:<16} {w0}x{h0} -> 裁切 {w}x{h}')

    print(f'\n成功 {len(out)}/{len(leaders)}，失败 {len(miss)}：{", ".join(miss) if miss else "无"}')
    if out:
        tot = sum(v['kb'] for v in out.values())
        print(f'总体积 {tot/1024:.2f}MB，平均 {tot/len(out):.1f}KB，耗时 {time.time()-started:.0f}s')

    # 徽章：Showdown 无徽章目录，保留矢量重绘方案，这里只写空表占位
    final_path = os.path.join(BASE, 'leaderimg-final.json')
    prev = {}
    if os.path.exists(final_path):
        try:
            prev = json.load(open(final_path, encoding='utf-8'))
        except Exception:
            prev = {}
    json.dump({'leaders': out, 'badges': prev.get('badges', {})},
              open(final_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('已写入 leaderimg-final.json')


if __name__ == '__main__':
    main()
