#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
OPENMONTAGE_REF="${OPENMONTAGE_REF:-9327439db69021ab4b0e2776729bf3b58fdb5a87}"
OPENMONTAGE_URL="https://github.com/calesthio/OpenMontage.git"
OPENMONTAGE_DIR="${OPENMONTAGE_DIR:-${ROOT_DIR}/.local/openmontage}"

if [[ "${OPENMONTAGE_DIR}" != /* ]]; then
  OPENMONTAGE_DIR="${ROOT_DIR}/${OPENMONTAGE_DIR}"
fi

fail() {
  printf 'OpenMontage 整合：%s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
用法：scripts/openmontage.sh <命令>

命令：
  install    以固定版本取得 OpenMontage，並執行上游 make setup
  open       開啟 OpenMontage 的本機 Backlot 專案看板
  simulate   執行上游示範產線（不需要先建立正式製作）
  path       印出 OpenMontage 工作目錄，供 AI coding assistant 開啟
  help       顯示這份說明

可選環境變數：
  OPENMONTAGE_DIR  安裝目錄（預設：專案根目錄/.local/openmontage）
  OPENMONTAGE_REF  OpenMontage Git commit/tag（預設固定的已驗證 commit）
EOF
}

check_dependencies() {
  local missing=()
  command -v git >/dev/null 2>&1 || missing+=(git)
  command -v make >/dev/null 2>&1 || missing+=(make)
  command -v python3 >/dev/null 2>&1 || missing+=(python3)
  command -v node >/dev/null 2>&1 || missing+=(node)
  command -v npm >/dev/null 2>&1 || missing+=(npm)
  command -v ffmpeg >/dev/null 2>&1 || missing+=(ffmpeg)
  ((${#missing[@]} == 0)) || fail "安裝前請先安裝以下依賴：${missing[*]}（Python 3.10+、Node.js 18+、FFmpeg、Git、make）。"
  python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' || fail 'OpenMontage 需要 Python 3.10 或更新版本。'
  node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 18 ? 0 : 1)' || fail 'OpenMontage 需要 Node.js 18 或更新版本。'
}

ensure_checkout() {
  if [[ -d "${OPENMONTAGE_DIR}/.git" ]]; then
    local current_ref
    current_ref="$(git -C "${OPENMONTAGE_DIR}" rev-parse HEAD 2>/dev/null || true)"
    if [[ "${current_ref}" == "${OPENMONTAGE_REF}" ]]; then
      printf '已存在 OpenMontage 固定版本：%s\n' "${OPENMONTAGE_DIR}"
      return
    fi
    [[ -z "$(git -C "${OPENMONTAGE_DIR}" status --porcelain 2>/dev/null || true)" ]] || fail "${OPENMONTAGE_DIR} 有未提交的本機變更；為避免覆寫，已停止更新。請先備份並整理該目錄。"
    git -C "${OPENMONTAGE_DIR}" fetch --depth 1 origin "${OPENMONTAGE_REF}" || fail '無法取得指定的 OpenMontage 版本。'
    git -C "${OPENMONTAGE_DIR}" checkout --detach FETCH_HEAD || fail '無法切換至指定的 OpenMontage 版本。'
    return
  fi

  [[ ! -e "${OPENMONTAGE_DIR}" ]] || fail "安裝目錄已存在但不是 Git checkout：${OPENMONTAGE_DIR}。請先自行備份並移開該目錄。"
  mkdir -p "$(dirname -- "${OPENMONTAGE_DIR}")"
  git init -q "${OPENMONTAGE_DIR}"
  git -C "${OPENMONTAGE_DIR}" remote add origin "${OPENMONTAGE_URL}"
  if ! git -C "${OPENMONTAGE_DIR}" fetch --depth 1 origin "${OPENMONTAGE_REF}"; then
    rm -rf -- "${OPENMONTAGE_DIR}"
    fail '下載 OpenMontage 失敗；請檢查網路後重試。'
  fi
  git -C "${OPENMONTAGE_DIR}" checkout --detach FETCH_HEAD
}

require_checkout() {
  [[ -d "${OPENMONTAGE_DIR}/.git" ]] || fail "尚未安裝。請先執行：${ROOT_DIR}/scripts/openmontage.sh install"
}

command_name="${1:-help}"
shift || true
case "${command_name}" in
  install)
    check_dependencies
    ensure_checkout
    printf '\n正在依照上游流程安裝 Python、Remotion、Piper 與 HyperFrames 依賴。\n'
    (cd "${OPENMONTAGE_DIR}" && make setup)
    ;;
  open)
    require_checkout
    cd "${OPENMONTAGE_DIR}"
    if [[ -x .venv/bin/python ]]; then
      exec .venv/bin/python -m backlot open "$@"
    elif [[ -x .venv/Scripts/python.exe ]]; then
      exec .venv/Scripts/python.exe -m backlot open "$@"
    else
      exec python3 -m backlot open "$@"
    fi
    ;;
  simulate)
    require_checkout
    cd "${OPENMONTAGE_DIR}"
    if [[ -x .venv/bin/python ]]; then
      exec .venv/bin/python scripts/backlot_simulate_run.py "$@"
    elif [[ -x .venv/Scripts/python.exe ]]; then
      exec .venv/Scripts/python.exe scripts/backlot_simulate_run.py "$@"
    else
      exec python3 scripts/backlot_simulate_run.py "$@"
    fi
    ;;
  path)
    require_checkout
    printf '%s\n' "${OPENMONTAGE_DIR}"
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    usage >&2
    fail "未知命令：${command_name}"
    ;;
esac
