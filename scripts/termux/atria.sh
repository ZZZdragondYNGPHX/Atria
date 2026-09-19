#!/usr/bin/env bash
set -euo pipefail

resolve_self() {
  local source="${BASH_SOURCE[0]}"
  local dir
  while [[ -L "${source}" ]]; do
    dir="$(cd -P -- "$(dirname -- "${source}")" && pwd)"
    source="$(readlink -- "${source}")"
    [[ "${source}" != /* ]] && source="${dir}/${source}"
  done
  cd -P -- "$(dirname -- "${source}")" && pwd
}

SCRIPT_DIR="$(resolve_self)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
STATE_DIR="${ATRIA_TERMUX_STATE_DIR:-${HOME}/.local/state/atria-termux}"
PID_FILE="${STATE_DIR}/server.pid"
LOG_FILE="${STATE_DIR}/server.log"
PORT="${ATRIA_TERMUX_PORT:-8000}"
URL="http://127.0.0.1:${PORT}"

mkdir -p "${STATE_DIR}"

log() {
  printf '[atria-termux] %s\n' "$*"
}

fail() {
  printf '[atria-termux] ERROR: %s\n' "$*" >&2
  exit 1
}

validate_port() {
  [[ "${PORT}" =~ ^[0-9]+$ ]] || fail "ATRIA_TERMUX_PORT must be an integer."
  (( PORT >= 1 && PORT <= 65535 )) || fail "ATRIA_TERMUX_PORT must be between 1 and 65535."
}

read_pid() {
  [[ -f "${PID_FILE}" ]] || return 1
  local pid
  pid="$(cat "${PID_FILE}" 2>/dev/null || true)"
  [[ "${pid}" =~ ^[0-9]+$ ]] || return 1
  printf '%s\n' "${pid}"
}

managed_process_alive() {
  local pid
  pid="$(read_pid)" || return 1
  kill -0 "${pid}" 2>/dev/null
}

http_ready() {
  curl -fsS --max-time 3 "${URL}/" >/dev/null 2>&1
}

open_browser() {
  if command -v termux-open-url >/dev/null 2>&1; then
    termux-open-url "${URL}" >/dev/null 2>&1 || true
    return
  fi
  if command -v am >/dev/null 2>&1; then
    am start -a android.intent.action.VIEW -d "${URL}" >/dev/null 2>&1 || true
    return
  fi
  log "Open ${URL} in Chrome/Edge."
}

assert_install_ready() {
  command -v node >/dev/null 2>&1 || fail "Node.js is missing. Run scripts/termux/setup.sh first."
  command -v npm >/dev/null 2>&1 || fail "npm is missing. Run scripts/termux/setup.sh first."
  command -v curl >/dev/null 2>&1 || fail "curl is missing. Run scripts/termux/setup.sh first."
  [[ -f "${REPO_ROOT}/server.js" ]] || fail "Cannot find Atria server.js at ${REPO_ROOT}."
  [[ -d "${REPO_ROOT}/node_modules" ]] || fail "node_modules is missing. Run scripts/termux/setup.sh first."
}

start_server() {
  validate_port
  assert_install_ready

  if managed_process_alive; then
    if http_ready; then
      log "Atria is already running at ${URL}."
      open_browser
      return
    fi
    fail "A managed Atria process exists but is not ready. Run: atria-termux logs"
  fi

  rm -f "${PID_FILE}"
  if http_ready; then
    fail "Port ${PORT} is already serving HTTP but is not managed by atria-termux. Choose another port with ATRIA_TERMUX_PORT."
  fi

  : > "${LOG_FILE}"
  cd "${REPO_ROOT}"

  if [[ "${ATRIA_TERMUX_WAKE_LOCK:-0}" == "1" ]] && command -v termux-wake-lock >/dev/null 2>&1; then
    termux-wake-lock >/dev/null 2>&1 || true
  fi

  log "Starting Atria on ${URL}..."
  nohup node server.js \
    --port "${PORT}" \
    --listen false \
    --enableIPv4 true \
    --enableIPv6 false \
    --disableCsrf false \
    --browserLaunchEnabled false \
    >>"${LOG_FILE}" 2>&1 &
  local pid=$!
  printf '%s\n' "${pid}" > "${PID_FILE}"

  local attempt
  for attempt in $(seq 1 120); do
    if ! kill -0 "${pid}" 2>/dev/null; then
      rm -f "${PID_FILE}"
      log "Atria exited during startup. Last log lines:"
      tail -n 80 "${LOG_FILE}" >&2 || true
      exit 1
    fi
    if http_ready; then
      log "Ready: ${URL}"
      open_browser
      return
    fi
    sleep 1
  done

  log "Startup timed out after 120 seconds. Last log lines:"
  tail -n 80 "${LOG_FILE}" >&2 || true
  exit 1
}

stop_server() {
  local pid
  if ! pid="$(read_pid)"; then
    log "No managed Atria process is recorded."
    return
  fi

  if ! kill -0 "${pid}" 2>/dev/null; then
    rm -f "${PID_FILE}"
    log "Removed stale PID file."
    return
  fi

  log "Stopping Atria (PID ${pid})..."
  kill "${pid}" 2>/dev/null || true
  local i
  for i in $(seq 1 10); do
    if ! kill -0 "${pid}" 2>/dev/null; then
      rm -f "${PID_FILE}"
      if [[ "${ATRIA_TERMUX_WAKE_LOCK:-0}" == "1" ]] && command -v termux-wake-unlock >/dev/null 2>&1; then
        termux-wake-unlock >/dev/null 2>&1 || true
      fi
      log "Stopped."
      return
    fi
    sleep 1
  done

  log "Graceful stop timed out; forcing termination."
  kill -9 "${pid}" 2>/dev/null || true
  rm -f "${PID_FILE}"
}

status_server() {
  validate_port
  if managed_process_alive; then
    local pid
    pid="$(read_pid)"
    if http_ready; then
      log "RUNNING pid=${pid} url=${URL}"
      return 0
    fi
    log "STARTING/UNHEALTHY pid=${pid} url=${URL}"
    return 1
  fi

  if http_ready; then
    log "HTTP is reachable on ${URL}, but it is not managed by atria-termux."
    return 1
  fi

  log "STOPPED url=${URL}"
  return 1
}

show_logs() {
  if [[ ! -f "${LOG_FILE}" ]]; then
    log "No log file yet: ${LOG_FILE}"
    return
  fi
  if [[ "${1:-}" == "-f" || "${1:-}" == "--follow" ]]; then
    tail -n 200 -f "${LOG_FILE}"
  else
    tail -n 200 "${LOG_FILE}"
  fi
}

doctor() {
  local failed=0
  local node_major=0

  log "Repository: ${REPO_ROOT}"
  log "URL: ${URL}"

  if command -v pkg >/dev/null 2>&1 && [[ "${PREFIX:-}" == *com.termux* ]]; then
    log "Termux environment: OK"
  else
    log "Termux environment: NOT DETECTED"
    failed=1
  fi

  if command -v node >/dev/null 2>&1; then
    node_major="$(node -p 'Number(process.versions.node.split(".")[0])')"
    if (( node_major >= 20 )); then
      log "Node.js: $(node --version) (OK)"
    else
      log "Node.js: $(node --version) (requires >= 20)"
      failed=1
    fi
  else
    log "Node.js: MISSING"
    failed=1
  fi

  for cmd in npm git curl; do
    if command -v "${cmd}" >/dev/null 2>&1; then
      log "${cmd}: OK"
    else
      log "${cmd}: MISSING"
      failed=1
    fi
  done

  if [[ -d "${REPO_ROOT}/node_modules" ]]; then
    log "node_modules: present"
    if command -v node >/dev/null 2>&1; then
      if (cd "${REPO_ROOT}" && node --input-type=module -e "const {default: Database}=await import('better-sqlite3'); const db=new Database(':memory:'); db.prepare('select 1').get(); db.close();") >/dev/null 2>&1; then
        log "better-sqlite3: OK"
      else
        log "better-sqlite3: FAILED TO LOAD"
        failed=1
      fi
    fi
  else
    log "node_modules: MISSING"
    failed=1
  fi

  if managed_process_alive && http_ready; then
    log "Server: RUNNING"
  elif managed_process_alive; then
    log "Server: PROCESS EXISTS, HTTP NOT READY"
  else
    log "Server: stopped"
  fi

  if (( failed != 0 )); then
    log "Doctor found setup problems. Re-run: bash scripts/termux/setup.sh"
    return 1
  fi
  log "Doctor: OK"
}

update_repo() {
  assert_install_ready
  command -v git >/dev/null 2>&1 || fail "git is missing."

  cd "${REPO_ROOT}"
  local restore_sentinel="public/scripts/extensions/third-party/.gitkeep"
  local restore_sentinel_status
  restore_sentinel_status="$(git status --porcelain -- "${restore_sentinel}" 2>/dev/null || true)"
  if [[ "${restore_sentinel_status}" == " D ${restore_sentinel}" ]] && git cat-file -e "HEAD:${restore_sentinel}" 2>/dev/null; then
    git restore --worktree -- "${restore_sentinel}"
    log "Restored repository sentinel removed by an interrupted full restore: ${restore_sentinel}"
  fi

  if [[ -n "$(git status --porcelain)" ]]; then
    fail "Repository has local tracked/untracked changes. Clean or commit them before update."
  fi

  local was_running=0
  if managed_process_alive; then
    was_running=1
    stop_server
  fi

  log "Refreshing origin/main..."
  git fetch origin main --prune

  if git show-ref --verify --quiet refs/heads/main; then
    git switch main
  else
    git switch -c main --track origin/main
  fi

  log "Updating main with fast-forward only..."
  git merge --ff-only origin/main
  log "Refreshing production dependencies..."
  npm_package_config_node_gyp_nodedir="${PREFIX:-}" npm ci --omit=dev --no-audit --no-fund
  bash "${SCRIPT_DIR}/fix-better-sqlite3.sh"
  npm run init
  log "Prebuilding frontend bundles for the updated revision..."
  npm run frontend:prebuild-cache
  doctor

  if (( was_running == 1 )); then
    start_server
  else
    log "Update complete. Start with: atria-termux start"
  fi
}

usage() {
  cat <<EOF2
Usage: atria-termux <command>

Commands:
  start        Start Atria in background and open ${URL}
  stop         Stop the managed Atria server
  restart      Restart the managed server
  status       Show server status
  open         Open ${URL} in the default browser
  url          Print the local browser URL
  logs [-f]    Show recent logs; -f follows them
  doctor       Check Termux, Node/npm and native SQLite
  update       Switch to/follow main, npm ci, repair native SQLite, and restart if needed

Environment:
  ATRIA_TERMUX_PORT=8000
  ATRIA_TERMUX_STATE_DIR=~/.local/state/atria-termux
  ATRIA_TERMUX_WAKE_LOCK=1   # optional; may increase battery use
EOF2
}

command_name="${1:-help}"
shift || true
case "${command_name}" in
  start) start_server ;;
  stop) stop_server ;;
  restart) stop_server; start_server ;;
  status) status_server ;;
  open) validate_port; open_browser ;;
  url) validate_port; printf '%s\n' "${URL}" ;;
  logs) show_logs "${1:-}" ;;
  doctor) validate_port; doctor ;;
  update) update_repo ;;
  help|-h|--help) usage ;;
  *) usage >&2; exit 2 ;;
esac
