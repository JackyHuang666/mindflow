#!/bin/sh
# 把 noise.glsl 填進 film2.src.js，產生 film2.js（film2.html 載入它）
cd "$(dirname "$0")" && python3 -c "
open('film2.js','w').write(open('film2.src.js').read().replace('/*NOISE*/',open('noise.glsl').read()))"
