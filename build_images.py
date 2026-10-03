# -*- coding: utf-8 -*-
"""build_images.py —— 下载全部宝可梦图片并压缩为本地 WebP（流式版）
- raw.githubusercontent.com 改写为 jsDelivr CDN（cdn -> gcore -> raw 回退）
- 边下边转边落盘，不囤内存；已存在文件跳过（断点续传）
"""
import json, io, os
from concurrent.futures import ThreadPoolExecutor
import requests
from PIL import Image

BASE = os.path.dirname(os.path.abspath(__file__))
IMG_DIR = os.path.join(BASE, 'site', 'images')
os.makedirs(IMG_DIR, exist_ok=True)

with open(os.path.join(BASE, 'pokedex-data.json'), encoding='utf-8') as f:
    data = json.load(f)

S = requests.Session()

def to_jsdelivr(url):
    if 'raw.githubusercontent.com/PokeAPI/sprites/master/' in url:
        path = url.split('raw.githubusercontent.com/PokeAPI/sprites/master/')[1]
        return [
            f'https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/{path}',
            f'https://gcore.jsdelivr.net/gh/PokeAPI/sprites@master/{path}',
            url,
        ]
    return [url]

def fetch(url):
    """下载原始字节，三级镜像回退"""
    for candidate in to_jsdelivr(url):
        for _ in range(2):
            try:
                r = S.get(candidate, timeout=25)
                r.raise_for_status()
                return url, r.content
            except Exception:
                continue
    return url, None

def convert_save(pid, content):
    """压缩转 WebP 并落盘"""
    im = Image.open(io.BytesIO(content)).convert('RGBA')
    w, h = im.size
    m = max(w, h)
    if m > 288:
        s = 288 / m
        im = im.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
    fpath = os.path.join(IMG_DIR, f'{pid}.webp')
    with open(fpath, 'wb') as f:
        im.save(f, 'WEBP', quality=80, method=6)

def worker(item):
    pid, url = item
    try:
        fpath = os.path.join(IMG_DIR, f'{pid}.webp')
        if os.path.exists(fpath):
            return pid, 'skip'
        url, content = fetch(url)
        if not content:
            return pid, 'dl-fail'
        convert_save(pid, content)
        return pid, 'ok'
    except Exception as e:
        return pid, f'err:{type(e).__name__}'

def main():
    # 待处理：无本地 webp 的条目（同 URL 借图条目各自落盘）
    todo = [(p['id'], p['img']) for p in data if p.get('img') and not os.path.exists(os.path.join(IMG_DIR, f"{p['id']}.webp"))]
    print(f'待处理条目: {len(todo)}', flush=True)

    stats = {'ok': 0, 'skip': 0}
    fails = []
    done = 0
    with ThreadPoolExecutor(12) as ex:
        for pid, status in ex.map(worker, todo):
            done += 1
            if status in stats:
                stats[status] += 1
            else:
                fails.append((pid, status))
            if done % 200 == 0:
                print(f'进度 {done}/{len(todo)}', flush=True)
    print(f'完成: {stats}, 失败: {len(fails)}', flush=True)
    for pid, s in fails[:20]:
        print('  失败条目', pid, s, flush=True)

    # 汇总映射
    id_map, missing = {}, []
    for p in data:
        fpath = os.path.join(IMG_DIR, f"{p['id']}.webp")
        if os.path.exists(fpath):
            p['imgLocal'] = f"images/{p['id']}.webp"
            id_map[str(p['id'])] = f"{p['id']}.webp"
        else:
            missing.append(p['name'])
    with open(os.path.join(BASE, 'images-map.json'), 'w', encoding='utf-8') as f:
        json.dump(id_map, f)
    size_mb = sum(os.path.getsize(os.path.join(IMG_DIR, n)) for n in os.listdir(IMG_DIR)) / 1048576
    print(f'本地图片: {len(id_map)} 张, 合计 {size_mb:.1f}MB, 平均 {size_mb*1024/max(1,len(id_map)):.1f}KB/张', flush=True)
    print(f'仍缺图: {len(missing)} {missing[:10]}', flush=True)

if __name__ == '__main__':
    main()
