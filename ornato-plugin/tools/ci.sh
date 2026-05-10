#!/usr/bin/env bash
# tools/ci.sh — pipeline mínimo de CI do plugin Ornato.
#   1. ruby -c em todos os .rb de ornato_sketchup/ (sintaxe)
#   2. ruby tests/run_all.rb (smoke tests)
# Uso: bash tools/ci.sh

set -u
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
cd "$ROOT"

GREEN="\033[32m"
RED="\033[31m"
CYAN="\033[36m"
RESET="\033[0m"

# Arquivos com `expr rescue return nil` ou similares — sintaxe aceita pelo
# Ruby da SketchUp (2.7+ embutido) mas rejeitada por Ruby 2.6 standalone.
# Mantidos fora do gate até refatoração explícita (ver CRITICAL_REVIEW.md).
SYNTAX_SKIP=(
  ornato_sketchup/tools/neighbor_resolver.rb
  ornato_sketchup/tools/placement_tool.rb
)

is_skipped() {
  local f="$1"
  for s in "${SYNTAX_SKIP[@]}"; do [ "$f" = "$s" ] && return 0; done
  return 1
}

echo -e "${CYAN}══ [1/2] Syntax check (ruby -c) ══${RESET}"
syntax_fail=0
syntax_total=0
syntax_skipped=0
while IFS= read -r f; do
  if is_skipped "$f"; then
    syntax_skipped=$((syntax_skipped + 1))
    continue
  fi
  syntax_total=$((syntax_total + 1))
  if ! ruby -c "$f" >/dev/null 2>&1; then
    echo -e "  ${RED}✗${RESET} $f"
    ruby -c "$f" 2>&1 | sed 's/^/    /'
    syntax_fail=$((syntax_fail + 1))
  fi
done < <(find ornato_sketchup -name '*.rb')
if [ "$syntax_fail" -eq 0 ]; then
  echo -e "  ${GREEN}✓${RESET} $syntax_total arquivos OK ($syntax_skipped skipped)"
else
  echo -e "  ${RED}✗ $syntax_fail erros de sintaxe${RESET}"
fi

echo ""
echo -e "${CYAN}══ [2/2] Smoke tests ══${RESET}"
ruby tests/run_all.rb
test_status=$?

echo ""
if [ "$syntax_fail" -eq 0 ] && [ "$test_status" -eq 0 ]; then
  echo -e "${GREEN}══ CI OK ══${RESET}"
  exit 0
else
  echo -e "${RED}══ CI FAIL (syntax=$syntax_fail tests=$test_status) ══${RESET}"
  exit 1
fi
