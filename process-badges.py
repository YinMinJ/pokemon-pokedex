# -*- coding: utf-8 -*-
"""
徽章图统一处理：
源 A = Bulbagarden 原图（经 Wayback 取回，raw_badges/）
源 B = Fandom 图（raw_fandom/）
择优规则：Fandom 版长边 >= Bulbagarden 版 85% 时用 Fandom（RGBA 规范、色彩保真），
          否则用 Bulbagarden（城都/神奥的大图优势）。
输出：site/images/badges/g{世代}_{slug}.webp（最长边 160px，保留透明通道）
"""
import json, os, re
from PIL import Image, ImageFilter

BASE = os.path.dirname(os.path.abspath(__file__))
RAW_B = os.path.join(BASE, "raw_badges")
RAW_F = os.path.join(BASE, "raw_fandom")
OUT_DIR = os.path.join(BASE, "site", "images", "badges")
TARGET = 160          # 目标最长边（详情页显示 96px 的 1.6 倍，足够清晰）
os.makedirs(OUT_DIR, exist_ok=True)


def slugify(name):
    """徽章英文名 -> 文件 slug（与 badgeimg 的命名一致）"""
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def white_to_alpha(im, thr=238):
    """RGB 白底图转透明（合众世代的图标没有 alpha 通道）"""
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if r >= thr and g >= thr and b >= thr:
                px[x, y] = (r, g, b, 0)
    return im


def trim(im, pad=2):
    """裁掉四周全透明边距"""
    bbox = im.getbbox()
    if not bbox:
        return im
    x0, y0, x1, y1 = bbox
    x0 = max(0, x0 - pad); y0 = max(0, y0 - pad)
    x1 = min(im.width, x1 + pad); y1 = min(im.height, y1 + pad)
    return im.crop((x0, y0, x1, y1))


def resize_best(im, target=TARGET):
    """小图（像素风）用最近邻整数倍放大保锐，大图用 LANCZOS 缩放"""
    w, h = im.size
    long_side = max(w, h)
    if long_side <= 64:
        k = max(2, round(target / long_side))
        out = im.resize((w * k, h * k), Image.NEAREST)
        return out
    if long_side <= target:
        k = target / long_side
        out = im.resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)
        return out.filter(ImageFilter.UnsharpMask(radius=1.2, percent=60, threshold=2))
    k = target / long_side
    return im.resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)


def load(path):
    try:
        im = Image.open(path)
        im.load()
        return im
    except Exception:
        return None


def main():
    real = json.load(open(os.path.join(BASE, "badge-real.json"), encoding="utf-8"))["badges"]
    bulb = json.load(open(os.path.join(BASE, "badgeimg.json"), encoding="utf-8"))["badges"]

    # Bulbagarden：徽章英文名 -> 本地文件（注意 wayback 落盘时 slug 已含 .png，再加一个 .png）
    bulba_local = {}
    for name, v in bulb.items():
        slug = v["file"].replace(" Badge", "").replace(" ", "_").lower()
        p = os.path.join(RAW_B, slug + ".png")
        if os.path.exists(p):
            bulba_local[name] = p

    mapping = {}          # "gen|badgeEn" -> {slug, src, w, h}
    plain = {}            # badgeEn -> slug（无重名时给旧接口兜底）
    stats = {"bulba": 0, "fandom": 0}
    rows = []

    for gen, leaders in real.items():
        for lname, v in leaders.items():
            badge_en = v["badgeEn"]
            f_path = os.path.join(RAW_F, f"g{gen}_{badge_en.replace(' ', '_').lower()}.png")
            # 帕底亚（第9世代）不用 Bulbagarden：那边同名文件是伽勒尔徽章，会串世代
            b_path = None if str(gen) == "9" else bulba_local.get(badge_en)

            im_f = load(f_path) if os.path.exists(f_path) else None
            im_b = load(b_path) if b_path else None

            # 择优
            src = None
            if im_f and im_b:
                wf, wb = max(im_f.size), max(im_b.size)
                src, im = ("fandom", im_f) if wf >= wb * 0.85 else ("bulba", im_b)
            elif im_f:
                src, im = "fandom", im_f
            elif im_b:
                src, im = "bulba", im_b
            if not im:
                rows.append(f"  ✗ g{gen} {lname} {badge_en} 无可用源")
                continue

            stats[src] += 1
            orig = im.size
            if im.mode in ("RGB", "L", "P"):
                im = white_to_alpha(im)
            else:
                im = im.convert("RGBA")
            im = trim(im)
            im = resize_best(im)

            slug = f"g{gen}_{slugify(badge_en)}"
            out = os.path.join(OUT_DIR, slug + ".webp")
            im.save(out, "WEBP", quality=92, method=6)

            mapping[f"{gen}|{badge_en}"] = {
                "slug": slug, "src": src, "badgeCn": v.get("badgeCn"),
                "px": f"{im.width}x{im.height}", "from": f"{orig[0]}x{orig[1]}",
                "kb": round(os.path.getsize(out) / 1024, 1)}
            # 无重名的英文名做全局兜底键
            if sum(1 for g2, ls in real.items() for x in ls.values()
                   if x["badgeEn"] == badge_en) == 1:
                plain[badge_en] = slug
            rows.append(f"  ✓ g{gen} {lname:12s} {badge_en:18s} [{src:6s}] "
                        f"{orig[0]}x{orig[1]} -> {im.width}x{im.height} "
                        f"{mapping[f'{gen}|{badge_en}']['kb']}KB")

    print("\n".join(rows))
    print(f"\n源统计: Bulbagarden {stats['bulba']} 张 / Fandom {stats['fandom']} 张")
    print(f"输出 {len(mapping)} 张到 site/images/badges/")

    json.dump({"badges": mapping, "plain": plain},
              open(os.path.join(BASE, "badge-final.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print("已写入 badge-final.json")


if __name__ == "__main__":
    main()
