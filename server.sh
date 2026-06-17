#!/bin/sh

# ローカルサーバー起動
python -m http.server 8888 &
sleep 0.5
open http://localhost:8888/
wait
