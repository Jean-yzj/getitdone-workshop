#!/usr/bin/env bash
# deploy.sh — 一鍵把 getitdone-website 推上 GitHub
# 用法：bash deploy.sh

set -e

# ── 顏色 ──
B='\033[1m'; D='\033[0m'; G='\033[32m'; Y='\033[33m'; R='\033[31m'; C='\033[36m'

cd "$(dirname "$0")"

echo ""
echo -e "${B}📦  今天一定要把事情解決工作坊 — 部署助手${D}"
echo -e "${C}═══════════════════════════════════════════════════${D}"
echo ""

# 1) 檢查 git
if ! command -v git >/dev/null 2>&1; then
  echo -e "${R}✘  你的電腦沒有安裝 git。${D}"
  echo "   到 https://git-scm.com/download/mac 安裝後再來。"
  exit 1
fi

# 2) 詢問 repo 名稱
DEFAULT_NAME="getitdone-workshop"
read -p "$(echo -e ${B}Repo 名稱${D}「按 Enter 用預設」: )" REPO_NAME
REPO_NAME=${REPO_NAME:-$DEFAULT_NAME}

# 3) 詢問 GitHub 帳號
read -p "$(echo -e ${B}你的 GitHub 帳號${D}: )" GH_USER
if [ -z "$GH_USER" ]; then
  echo -e "${R}✘  GitHub 帳號不能空白${D}"
  exit 1
fi

REMOTE_URL="https://github.com/${GH_USER}/${REPO_NAME}.git"
echo ""
echo -e "${C}→ Repo 將會是: ${REMOTE_URL}${D}"
echo ""

# 4) 初始化 git
if [ -d ".git" ]; then
  echo -e "${Y}・git repo 已存在,跳過 init${D}"
else
  echo -e "${G}・初始化 git${D}"
  git init -q
  git branch -M main
fi

# 5) 設定 git 使用者(若尚未設定)
if ! git config user.email >/dev/null 2>&1; then
  git config user.email "${GH_USER}@users.noreply.github.com"
  git config user.name  "${GH_USER}"
fi

# 6) Stage 與 commit
echo -e "${G}・Stage + commit 所有檔案${D}"
git add -A
if git diff --cached --quiet; then
  echo -e "${Y}・沒有新變更需要 commit${D}"
else
  git commit -q -m "feat: 第一版網站 — 今天一定要把事情解決工作坊"
fi

# 7) 設定 remote
if git remote get-url origin >/dev/null 2>&1; then
  CURRENT_REMOTE=$(git remote get-url origin)
  if [ "$CURRENT_REMOTE" != "$REMOTE_URL" ]; then
    git remote set-url origin "$REMOTE_URL"
    echo -e "${Y}・更新 remote → ${REMOTE_URL}${D}"
  fi
else
  git remote add origin "$REMOTE_URL"
  echo -e "${G}・加入 remote ${REMOTE_URL}${D}"
fi

# 8) 嘗試用 gh CLI 一次完成
if command -v gh >/dev/null 2>&1; then
  echo ""
  echo -e "${G}✓ 偵測到 GitHub CLI,直接幫你建 repo + push${D}"
  if gh auth status >/dev/null 2>&1; then
    # 已經登入
    gh repo create "${GH_USER}/${REPO_NAME}" --public --source=. --remote=origin --push 2>/dev/null || \
      git push -u origin main
    echo ""
    echo -e "${G}🎉  完成!${D}"
    echo -e "   ${C}https://github.com/${GH_USER}/${REPO_NAME}${D}"
    NEXT_STEP_ZEABUR=true
  else
    echo -e "${Y}・gh 尚未登入,正在開啟登入流程⋯⋯${D}"
    gh auth login --web --git-protocol https
    gh repo create "${GH_USER}/${REPO_NAME}" --public --source=. --remote=origin --push
    NEXT_STEP_ZEABUR=true
  fi
else
  # 沒有 gh CLI,給手動步驟
  echo ""
  echo -e "${Y}⚠  你的電腦沒有 GitHub CLI(${B}gh${D}${Y})。${D}"
  echo ""
  echo -e "${B}剩下兩件事自己做${D}(複製貼上即可):"
  echo ""
  echo -e "${C}1️⃣   到這個網址,輸入 repo 名稱「${REPO_NAME}」按 ${B}Create${D}${C}:${D}"
  echo "      https://github.com/new"
  echo "      ⚠ 不要勾「Add a README」「Add .gitignore」「Choose a license」"
  echo ""
  echo -e "${C}2️⃣   回 Terminal 跑這行 push 上去:${D}"
  echo -e "      ${B}git push -u origin main${D}"
  echo ""
  echo -e "${Y}(或者 ${B}brew install gh${D}${Y} 之後再執行 bash deploy.sh,我幫你一次完成)${D}"
  NEXT_STEP_ZEABUR=true
fi

# 9) Zeabur 引導
if [ "$NEXT_STEP_ZEABUR" = true ]; then
  echo ""
  echo -e "${C}═══════════════════════════════════════════════════${D}"
  echo -e "${B}☁️   Zeabur 部署 — 30 秒 4 點擊${D}"
  echo -e "${C}═══════════════════════════════════════════════════${D}"
  echo ""
  echo "   ① 開 https://zeabur.com → 點右上 ${B}Sign in with GitHub${D}"
  echo "   ② 點 ${B}+ Create Project${D} → 取個名字"
  echo "   ③ 點 ${B}Deploy New Service${D} → 選 ${B}Git${D} → 選 ${REPO_NAME}"
  echo "   ④ Zeabur 會自動偵測為靜態站,等 30 秒就好"
  echo ""
  echo -e "   完成後 Dashboard → Domain → ${B}Generate Domain${D},拿到 *.zeabur.app 網址"
  echo ""
  echo -e "${G}祝部署順利。今天一定要把事情解決。${D}"
  echo ""
fi
