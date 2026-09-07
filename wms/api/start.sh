#!/usr/bin/env bash
# 启动批注同步 API（宿主机 Python，不依赖 Docker 拉镜像）
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
export PORT="${PORT:-3000}"
export WMS_DATA_DIR="${WMS_DATA_DIR:-$DIR/../data}"
mkdir -p "$WMS_DATA_DIR"
# 兼容旧变量名；若仍指向 api/data，由 server.py 自动改到 ../data
export ANNO_DATA_DIR="${WMS_DATA_DIR}"
cd "$DIR"
exec python3 "$DIR/server.py"
