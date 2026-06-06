#!/usr/bin/env bash
# Owner:   devops_developer_agent
# Purpose: Run the same checks locally as CI would, for fast feedback before pushing.
# Requires: node >= 20, depman CLI installed (or auto-installs)
# Usage:   ./scripts/run_local_ci.sh [--track backend|frontend|db|integration|all] [--ci] [--verbose]
#
# Corresponds to: agents/dry_run_sandbox.md — "Pre-PR Local Step"

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
VERBOSE=0
CI_MODE=0
TRACK="all"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPMAN_DIR="$(cd "$SCRIPT_DIR/../tools/dependency-manager" && pwd)"

# ── Argument parsing ──────────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --verbose)  VERBOSE=1 ;;
    --ci)       CI_MODE=1 ;;
    --track=*)  TRACK="${arg#*=}" ;;
    --track)    shift; TRACK="${1:-all}" ;;
    --help)
      echo "Usage: $0 [--track backend|frontend|db|integration|all] [--ci] [--verbose]"
      echo ""
      echo "  --track   Run sandbox for a specific implementation track (default: all)"
      echo "  --ci      Non-interactive mode for CI pipeline use"
      echo "  --verbose Print detailed output for each step"
      exit 0
      ;;
    *) echo "Unknown argument: $arg. Use --help for usage."; exit 1 ;;
  esac
done

# ── Logging ───────────────────────────────────────────────────────────────────
log() { [[ $VERBOSE -eq 1 ]] && echo "[CI] $*"; }
info() { echo "  → $*"; }
fail() { echo ""; echo "FAIL: $*"; exit 1; }
pass() { echo "PASS: $*"; }

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Software Factory — Local CI Runner"
[[ "$TRACK" != "all" ]] && echo "  Track: $TRACK" || echo "  Tracks: all"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Step 1: Install depman ────────────────────────────────────────────────────
log "Installing depman CLI from $DEPMAN_DIR"
if ! command -v depman &>/dev/null; then
  (cd "$DEPMAN_DIR" && npm ci --silent 2>/dev/null || npm install --silent 2>/dev/null)
  (cd "$DEPMAN_DIR" && npm link --silent 2>/dev/null)
  log "depman installed."
else
  log "depman already available: $(depman --version 2>/dev/null || echo 'version unknown')"
fi

# ── Step 2: Canonical lockfile check ─────────────────────────────────────────
echo ""
echo "[1/3] Checking canonical lockfile..."
info "Comparing package-lock.json against canonical-lock.json"

LOCK_PATH="${DEPMAN_LOCK:-package-lock.json}"
CANONICAL="${DEPMAN_CANONICAL_LOCK:-./canonical-lock.json}"

if ! depman check-lock "$LOCK_PATH" "$CANONICAL"; then
  echo ""
  echo "  ✗ Lockfile mismatch detected."
  info "Dependency changed? Have dependency_manager_agent review before proceeding."
  info "If approved, they will update canonical-lock.json."
  fail "Lockfile check failed. See agents/dependency_manager_agent.md."
fi
pass "Lockfile matches canonical."

# ── Step 3: Dry-run sandbox ───────────────────────────────────────────────────
echo ""
echo "[2/3] Running dry-run sandbox..."

run_track() {
  local track="$1"
  info "Track: $track"
  if depman dry-run --track "$track"; then
    pass "Sandbox passed for track: $track  (sandbox_report_${track}.json)"
  else
    echo "  ✗ Sandbox failed for track: $track"
    info "Review sandbox_report_${track}.json for details."
    info "See agents/dry_run_sandbox.md for the error reflection schema."
    fail "Dry-run sandbox failed (track: $track). Fix lint/compile/test issues and re-run."
  fi
}

case "$TRACK" in
  all)
    TRACKS_TO_RUN=("backend" "frontend" "db" "integration")
    ;;
  backend|frontend|db|integration)
    TRACKS_TO_RUN=("$TRACK")
    ;;
  *)
    fail "Unknown track: '$TRACK'. Valid: backend, frontend, db, integration, all"
    ;;
esac

for t in "${TRACKS_TO_RUN[@]}"; do
  run_track "$t"
done

# ── Step 4: Summary ───────────────────────────────────────────────────────────
echo ""
echo "[3/3] Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  All local CI checks passed."
echo ""
echo "  Sandbox reports:"
for t in "${TRACKS_TO_RUN[@]}"; do
  [[ -f "sandbox_report_${t}.json" ]] && echo "    ✓ sandbox_report_${t}.json"
done
echo ""
echo "  Next steps:"
echo "    1. Commit and open a PR using the PR template."
echo "    2. CI will re-run these checks in the containerized sandbox."
echo "    3. Request Tech Lead review once CI passes."
echo "    4. See agents/dual_gate_control_loops.md for gate requirements."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
exit 0
