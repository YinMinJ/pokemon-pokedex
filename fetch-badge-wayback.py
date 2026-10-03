# -*- coding: utf-8 -*-
"""
通过 Wayback Machine 取回 Bulbagarden Archives 的官方徽章原图。
Bulbagarden 直连被封（403），但存档可用：https://web.archive.org/web/2id_/<原图URL>
"""
import json, os, ssl, time, urllib.request

OUT = "raw_badges"
os.makedirs(OUT, exist_ok=True)
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE


def fetch(url, retry=2):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for i in range(retry):
        try:
            with urllib.request.urlopen(req, timeout=60, context=CTX) as r:
                return r.read(), r.headers.get("content-type", "")
        except Exception as e:
            if i == retry - 1:
                return None, f"{type(e).__name__}:{str(e)[:60]}"
            time.sleep(2)
    return None, "fail"


def main():
    src = json.load(open("badgeimg.json", encoding="utf-8"))["badges"]
    meta = {}
    ok = miss = 0
    for i, (name, v) in enumerate(src.items(), 1):
        slug = v["file"].replace(" Badge", "").replace(" ", "_").lower()
        dst = os.path.join(OUT, slug + ".png")
        if os.path.exists(dst) and os.path.getsize(dst) > 800:
            print(f"[{i}] 已有 {name}")
            ok += 1
            continue
        wb = "https://web.archive.org/web/2id_/" + v["url"]
        data, ctype = fetch(wb)
        if data and len(data) > 800 and "image" in (ctype or ""):
            with open(dst, "wb") as f:
                f.write(data)
            meta[name] = {"file": v["file"], "slug": slug, "bytes": len(data),
                          "src_w": v["w"], "src_h": v["h"]}
            print(f"[{i}/{len(src)}] ✓ {name:22s} {len(data):>7}B  -> {slug}.png")
            ok += 1
        else:
            print(f"[{i}/{len(src)}] ✗ {name:22s} {ctype}")
            miss += 1
        # 剩余量小可直接跳过已存
        time.sleep(1.2)

    json.dump(meta, open("_wayback_badges.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print(f"\n成功 {ok} / 失败 {miss}")


if __name__ == "__main__":
    main()
