#!/usr/bin/env bash
# 部署到 GitHub Pages：打包網站，把 dist/ 的內容提交到 gh-pages 分支並推上 GitHub。
# 用法：npm run deploy
set -euo pipefail

cd "$(dirname "$0")/.."
SRC_SHA=$(git rev-parse --short HEAD)

npm run build
# 告訴 GitHub Pages 不要用 Jekyll 處理，否則底線開頭的 _astro 資料夾會被忽略
touch dist/.nojekyll

# 第一次部署時建立空的 gh-pages 分支
if ! git ls-remote --exit-code --heads origin gh-pages >/dev/null 2>&1; then
  EMPTY_TREE=$(git hash-object -t tree /dev/null)
  INIT=$(git commit-tree "$EMPTY_TREE" -m "初始化 gh-pages")
  git push origin "$INIT:refs/heads/gh-pages"
fi
git fetch -q origin gh-pages

WORK=$(mktemp -d)
cleanup() { git worktree remove "$WORK" >/dev/null 2>&1 || true; }
trap cleanup EXIT

git worktree add -q --detach "$WORK" origin/gh-pages
rsync -a --delete --exclude '.git' dist/ "$WORK"/

cd "$WORK"
git add -A
if git diff --cached --quiet; then
  echo "網站內容沒有變更，不需要部署。"
  exit 0
fi
git commit -q -m "部署 ${SRC_SHA}"
git push -q origin HEAD:gh-pages
echo "已部署 ${SRC_SHA} 到 gh-pages。"
