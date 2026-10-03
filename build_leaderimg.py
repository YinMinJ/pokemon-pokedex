# -*- coding: utf-8 -*-
"""
下载并处理道馆馆主立绘 + 徽章图片
- 馆主立绘：Bulbagarden Archives 官方立绘 → 最长边 512px WebP
- 徽章：官方徽章图 → 最长边 256px WebP
输出：
  site/images/leaders/<slug>.webp
  site/images/badges/<slug>.webp
  leaderimg-final.json（slug 映射表，供页面使用）
"""
import json
import os
import re
import time
import requests
from io import BytesIO
from PIL import Image

BASE = os.path.dirname(os.path.abspath(__file__))
API = 'https://archives.bulbagarden.net/w/api.php'
UA = {'User-Agent': 'Mozilla/5.0 PokedexBuilder/1.0 (personal offline project)'}
OUT_LEADER = os.path.join(BASE, 'site', 'images', 'leaders')
OUT_BADGE = os.path.join(BASE, 'site', 'images', 'badges')
os.makedirs(OUT_LEADER, exist_ok=True)
os.makedirs(OUT_BADGE, exist_ok=True)


def slug(s):
    """文件名安全化"""
    s = re.sub(r'[^A-Za-z0-9]+', '-', s).strip('-').lower()
    return s or 'x'


def fetch_thumb_urls(files, width):
    """批量查询缩略图 URL（MediaWiki iiurlwidth）"""
    out = {}
    for i in range(0, len(files), 40):
        chunk = files[i:i + 40]
        titles = '|'.join('File:' + f for f in chunk)
        params = {
            'action': 'query', 'titles': titles, 'prop': 'imageinfo',
            'iiprop': 'url|size', 'iiurlwidth': width, 'format': 'json', 'redirects': 1,
        }
        try:
            r = requests.get(API, params=params, headers=UA, timeout=30)
            j = r.json()
        except Exception as e:
            print('  查询失败:', e)
            continue
        for p in j.get('query', {}).get('pages', {}).values():
            if 'missing' in p:
                continue
            inf = (p.get('imageinfo') or [{}])[0]
            if not inf.get('url'):
                continue
            title = p['title'].replace('File:', '')
            # 优先用缩略图（更小更快），失败则回退原图
            out[title] = inf.get('thumburl') or inf['url']
        time.sleep(0.15)
    return out


def download_and_save(url, dest, max_side, quality=82):
    """下载 → 缩放 → 存 WebP"""
    try:
        r = requests.get(url, headers=UA, timeout=45)
        r.raise_for_status()
        im = Image.open(BytesIO(r.content))
        im = im.convert('RGBA')
        w, h = im.size
        scale = max_side / max(w, h)
        if scale < 1:
            im = im.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)
        im.save(dest, 'WEBP', quality=quality, method=5)
        return True, os.path.getsize(dest)
    except Exception as e:
        return False, str(e)[:80]


def main():
    leaders = json.load(open(os.path.join(BASE, 'leaderimg2.json'), encoding='utf-8'))['leaders']
    badges = json.load(open(os.path.join(BASE, 'badgeimg.json'), encoding='utf-8'))['badges']

    # ---------- 馆主立绘 ----------
    print('=== 馆主立绘 ===')
    lfiles = [v['file'] for v in leaders.values()]
    lurls = fetch_thumb_urls(lfiles, 620)
    print(f'拿到 {len(lurls)}/{len(lfiles)} 个缩略图 URL')

    lmap = {}
    fail = []
    for en, v in leaders.items():
        url = lurls.get(v['file'])
        if not url:
            # 回退原图 URL
            url = v.get('url')
        s = slug(en)
        dest = os.path.join(OUT_LEADER, s + '.webp')
        ok, info = download_and_save(url, dest, 512)
        if ok:
            lmap[en] = {'slug': s, 'file': v['file'], 'w': v['w'], 'h': v['h'], 'kb': round(info / 1024, 1)}
        else:
            fail.append((en, info))
            print('  ✗', en, info)
    print(f'成功 {len(lmap)}/{len(leaders)}，失败 {len(fail)}')
    if lmap:
        tot = sum(x['kb'] for x in lmap.values())
        print(f'总体积 {tot/1024:.1f}MB，平均 {tot/len(lmap):.1f}KB')

    # ---------- 徽章 ----------
    print('\n=== 徽章 ===')
    bfiles = [v['file'] for v in badges.values()]
    burls = fetch_thumb_urls(bfiles, 320)
    print(f'拿到 {len(burls)}/{len(bfiles)} 个缩略图 URL')

    bmap = {}
    bfail = []
    for name, v in badges.items():
        url = burls.get(v['file']) or v.get('url')
        s = slug(name)
        dest = os.path.join(OUT_BADGE, s + '.webp')
        ok, info = download_and_save(url, dest, 256)
        if ok:
            bmap[name] = {'slug': s, 'file': v['file'], 'w': v['w'], 'h': v['h'], 'kb': round(info / 1024, 1)}
        else:
            bfail.append((name, info))
            print('  ✗', name, info)
    print(f'成功 {len(bmap)}/{len(badges)}，失败 {len(bfail)}')
    if bmap:
        tot = sum(x['kb'] for x in bmap.values())
        print(f'总体积 {tot/1024:.1f}MB，平均 {tot/len(bmap):.1f}KB')

    json.dump({'leaders': lmap, 'badges': bmap},
              open(os.path.join(BASE, 'leaderimg-final.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    print('\n已写入 leaderimg-final.json')


if __name__ == '__main__':
    main()
