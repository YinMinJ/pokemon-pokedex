# -*- coding: utf-8 -*-
"""
从 Fandom 宝可梦维基抓取「真实游戏徽章图」，按世代标签精确匹配，避免跨世代串位。
- 搜索候选缓存到 _badge_cand.json（删掉该文件可强制重搜）
- 世代标签：卡洛斯=XY、伽勒尔=SwSh、帕底亚=SV；其他世代重名则用无后缀版
输出 badge-real.json
"""
import json, os, ssl, time, urllib.parse, urllib.request

API = "https://pokemon.fandom.com/api.php"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

# 各世代在文件名里的标签
GEN_TAGS = {6: ["XY", "X Y"], 8: ["SwSh", "Sword", "Shield"], 9: ["SV", "Scarlet", "Violet"]}
CAND_CACHE = "_badge_cand.json"


def api(params, retry=3):
    p = dict(params)
    p["format"] = "json"
    url = API + "?" + urllib.parse.urlencode(p)
    req = urllib.request.Request(url, headers={
        "User-Agent": UA, "Accept": "application/json",
        "Referer": "https://pokemon.fandom.com/"})
    for i in range(retry):
        try:
            with urllib.request.urlopen(req, timeout=45, context=CTX) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:
            if i == retry - 1:
                print("   ! API失败", type(e).__name__, e)
                return None
            time.sleep(1.5 * (i + 1))


def search_files(term, limit=25):
    d = api({"action": "query", "list": "search", "srsearch": term,
             "srnamespace": 6, "srlimit": limit})
    return [x["title"] for x in (d or {}).get("query", {}).get("search", [])]


def imageinfo(titles):
    out = {}
    for i in range(0, len(titles), 40):
        d = api({"action": "query", "titles": "|".join(titles[i:i + 40]),
                 "prop": "imageinfo", "iiprop": "url|size"})
        if not d:
            continue
        for pg in d.get("query", {}).get("pages", {}).values():
            ii = pg.get("imageinfo")
            if ii:
                out[pg["title"]] = {"file": pg["title"].replace("File:", ""),
                                    "url": ii[0]["url"], "w": ii[0].get("width"),
                                    "h": ii[0].get("height"), "size": ii[0].get("size")}
        time.sleep(0.25)
    return out


def area(o):
    """像素面积，用于在同优先级候选中挑最清晰的"""
    return (o.get("w") or 0) * (o.get("h") or 0)


# 动画截图 / 同框图 / 设定图，不是干净的徽章单体图，一律排除
BAD_SUBSTR = [" and ", "anime", "concept art", "screenshot", "Ash ", "Ash's",
              "Kiawe ", "Lana ", "Mallow ", "Ida ", "James ", "Rumble World"]


def is_clean(o):
    f = o["file"]
    return not any(b.lower() in f.lower() for b in BAD_SUBSTR)


def pick_for_gen(gen, bn, opts):
    """按世代标签选图，返回 (选项, 依据说明)"""
    opts = [o for o in opts if is_clean(o)] or opts
    tags = GEN_TAGS.get(gen, [])
    # 1) 命中本世代的专属标签
    for t in tags:
        hits = [o for o in opts if f" {t}" in o["file"]]
        if hits:
            return max(hits, key=area), f"标签 {t}"
    # 2) 排除属于其他世代的（带别代标签的）
    other = [t for g2, ts in GEN_TAGS.items() if g2 != gen for t in ts]
    clean = [o for o in opts if not any(f" {t}" in o["file"] for t in other)]
    # 3) 优先与徽章名完全同名的（同名可能有多个版本，取最大的）
    plain = [o for o in clean if o["file"].lower() == (bn + ".png").lower()]
    if plain:
        return max(plain, key=area), "同名主图"
    if clean:
        return max(clean, key=area), "排除他代后首选"
    return (max(opts, key=area) if opts else None), "兜底"


def main():
    gyms = json.load(open("gyms.json", encoding="utf-8"))
    plan = {}
    for g in gyms["gens"]:
        if g["gen"] == 10:
            continue
        plan[g["gen"]] = [(L.get("name"), L.get("badgeEn"), L.get("badge"))
                          for L in g["leaders"] if L.get("badgeEn")]

    names = []
    for items in plan.values():
        for _, bn, _cn in items:
            if bn and bn not in names:
                names.append(bn)

    # ---- 候选搜索（带缓存） ----
    if os.path.exists(CAND_CACHE):
        cand = json.load(open(CAND_CACHE, encoding="utf-8"))
        print(f"复用候选缓存 {CAND_CACHE}（{len(cand)} 个名字）")
    else:
        cand = {}
        for i, n in enumerate(names, 1):
            res = search_files(n, limit=25)
            res = [t for t in res
                   if t.lower().startswith("file:" + n.lower()) and t.lower().endswith(".png")]
            if "File:" + n + ".png" not in res:
                res.append("File:" + n + ".png")
            cand[n] = res
            print(f"[搜索 {i}/{len(names)}] {n} -> {len(res)} 个候选")
            time.sleep(0.35)
        allf = sorted({t for v in cand.values() for t in v})
        inf = imageinfo(allf)
        cand = {n: [inf[t] for t in v if t in inf] for n, v in cand.items()}
        json.dump(cand, open(CAND_CACHE, "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)
        print(f"已缓存候选到 {CAND_CACHE}")

    # ---- 选择 ----
    picked = {}
    warn = []
    for gen, items in plan.items():
        picked[str(gen)] = {}
        for lname, bn, cn in items:
            opts = cand.get(bn, [])
            if not opts:
                warn.append(f"  ✗ g{gen} {lname} {bn} 无候选")
                continue
            sel, how = pick_for_gen(gen, bn, opts)
            picked[str(gen)][lname] = dict(sel, badgeEn=bn, badgeCn=cn, pick=how)
            print(f"  g{gen} {lname:14s} {bn:18s} -> {sel['file']:26s} "
                  f"{sel['w']}x{sel['h']:<5} [{how}]")
            if len(opts) > 1:
                alt = ", ".join(f"{o['file']}({o['w']}x{o['h']})" for o in opts if o is not sel)
                print(f"        其他候选: {alt}")

    for w in warn:
        print(w)
    json.dump({"badges": picked}, open("badge-real.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print(f"\n已写入 badge-real.json，共 {sum(len(v) for v in picked.values())} 条")


if __name__ == "__main__":
    main()
