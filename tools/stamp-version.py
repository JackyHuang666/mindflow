#!/usr/bin/env python3
"""每次部署新版前執行：把 index.html 的 <meta name="app-version"> 和 version.json 改成同一個新版本號。
玩家的網頁發現 version.json 和自己的版本不同，就會自動重新載入（見 update.js）。
用法：python3 tools/stamp-version.py
"""
import json, os, re, time
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
v = time.strftime("%Y%m%d-%H%M%S", time.gmtime())
p = os.path.join(root, "index.html"); s = open(p, encoding="utf-8").read()
s2, n = re.subn(r'<meta name="app-version" content="[^"]*">', '<meta name="app-version" content="%s">' % v, s, count=1)
if n != 1: raise SystemExit("index.html 找不到 app-version")
open(p, "w", encoding="utf-8").write(s2)
json.dump({"v": v}, open(os.path.join(root, "version.json"), "w"))
print("版本號：", v)
