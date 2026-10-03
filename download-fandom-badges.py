# -*- coding: utf-8 -*-
"""
下载 Fandom 的徽章图到 raw_fandom/。
Z 纯晶（第7世代）在 Fandom 上没有主图，只有 80x45 的 Dream 版，
对尺寸过小(<64px)的条目自动改用 Dream 版。
"""
import json, os, ssl, time, urllib.parse, urllib.request

API = "https://pokemon.fandom.com/api.php"
OUT = "raw_fandom"
os.makedirs(OUT, exist_ok=True)
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE


def http(url, retry=3, binary=True):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA, "Referer": "https://pokemon.fandom.com/"})
    for i in range(retry):
        try:
            with urllib.request.urlopen(req, timeout=60, context=CTX) as r:
                d = r.read()
                return d if binary else d.decode("utf-8", "ignore")
        except Exception as e:
            if i == retry - 1:
                return None
            time.sleep(1.5 * (i + 1))


def api(p):
    p = dict(p)
    p["format"] = "json"
    txt = http(API + "?" + urllib.parse.urlencode(p), binary=False)
    return json.loads(txt) if txt else None


def dream_url(name):
    """找 {name} Dream.png（Z 纯晶的大图版本）"""
    d = api({"action": "query", "titles": f"File:{name} Dream.png",
             "prop": "imageinfo", "iiprop": "url|size"})
    if not d:
        return None
    for pg in d.get("query", {}).get("pages", {}).values():
        ii = pg.get("imageinfo")
        if ii:
            return ii[0]
    return None


def main():
    real = json.load(open("badge-real.json", encoding="utf-8"))["badges"]
    manifest = {}
    n_ok = n_fail = 0

    for gen, leaders in real.items():
        for lname, v in leaders.items():
            url, w, h = v["url"], v["w"], v["h"]
            note = ""
            # 太小且是 Z 纯晶 → 换 Dream 版
            if " Z" in v["badgeEn"] and (w or 0) < 64:
                dr = dream_url(v["badgeEn"])
                if dr and (dr.get("width") or 0) > (w or 0):
                    url, w, h = dr["url"], dr["width"], dr["height"]
                    note = " (Dream版)"
            slug = f"g{gen}_{v['badgeEn'].replace(' ', '_').lower()}"
            dst = os.path.join(OUT, slug + ".png")
            if os.path.exists(dst) and os.path.getsize(dst) > 400:
                n_ok += 1
                continue
            data = http(url)
            if data and len(data) > 400:
                with open(dst, "wb") as f:
                    f.write(data)
                manifest[slug] = {"gen": gen, "leader": lname, "badgeEn": v["badgeEn"],
                                  "badgeCn": v.get("badgeCn"), "src": "fandom",
                                  "w": w, "h": h, "bytes": len(data)}
                print(f"  ✓ g{gen} {lname:12s} {v['badgeEn']:18s} {w}x{h}{note}")
                n_ok += 1
            else:
                print(f"  ✗ g{gen} {lname:12s} {v['badgeEn']} 下载失败")
                n_fail += 1
            time.sleep(0.5)

    json.dump(manifest, open("_fandom_manifest.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print(f"\n成功 {n_ok} / 失败 {n_fail}")


if __name__ == "__main__":
    main()
