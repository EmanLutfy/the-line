#!/usr/bin/env bash
#
# Everything that must be true about $LINE before it is configured, checked in
# one place. Run it the moment the token has an address.
#
#   ./tools/preflight.sh 0xTOKEN [rpc-url]
#
# It reads the token, works out the price in base units, and prints the exact
# `configure` call to run. It changes nothing on chain.

set -euo pipefail

TOKEN="${1:-}"
RPC="${2:-${ROBINHOOD_RPC_URL:-${ROBINHOOD_TESTNET_RPC_URL:-}}}"
WHOLE_TOKENS=150000

if [[ -z "$TOKEN" ]]; then
  echo "usage: $0 0xTOKEN [rpc-url]" >&2
  exit 1
fi
if [[ -z "$RPC" ]]; then
  echo "No RPC. Pass one, or 'source .env' first." >&2
  exit 1
fi

say() { printf '%-22s %s\n' "$1" "$2"; }
warn() { printf '\n  !! %s\n' "$1"; }

echo
echo "=== $TOKEN"
echo

CODE=$(cast code "$TOKEN" --rpc-url "$RPC")
if [[ "$CODE" == "0x" || -z "$CODE" ]]; then
  warn "No code at this address. Wrong address, or wrong network."
  exit 1
fi

NAME=$(cast call "$TOKEN" "name()(string)" --rpc-url "$RPC" 2>/dev/null || echo "?")
SYMBOL=$(cast call "$TOKEN" "symbol()(string)" --rpc-url "$RPC" 2>/dev/null || echo "?")
DECIMALS=$(cast call "$TOKEN" "decimals()(uint8)" --rpc-url "$RPC" 2>/dev/null || echo "")
SUPPLY=$(cast call "$TOKEN" "totalSupply()(uint256)" --rpc-url "$RPC" 2>/dev/null || echo "0")

say "Name"   "$NAME"
say "Symbol" "$SYMBOL"

if [[ -z "$DECIMALS" ]]; then
  warn "No decimals(). Unusual for an ERC-20 — confirm this is the right contract."
  exit 1
fi
say "Decimals" "$DECIMALS"

# The price is derived, never typed. A hand-written exponent is the single most
# expensive typo available at configure time, and lockConfig makes it permanent.
PRICE=$(python3 -c "print($WHOLE_TOKENS * 10**$DECIMALS)")
say "Price (base units)" "$PRICE"

HUMAN_SUPPLY=$(python3 -c "print(f'{int(\"${SUPPLY%% *}\") / 10**$DECIMALS:,.0f}')" 2>/dev/null || echo "?")
say "Total supply" "$HUMAN_SUPPLY $SYMBOL"
say "Burned if sold out" "$(python3 -c "print(f'{$WHOLE_TOKENS * 3333:,}')") $SYMBOL"
python3 - "$SUPPLY" "$DECIMALS" <<'PY' || true
import sys
supply = int(sys.argv[1].split()[0]) / 10 ** int(sys.argv[2])
needed = 150000 * 3333
if supply and needed / supply > 0.9:
    print(f"\n  !! A sold-out mint burns {needed/supply:.0%} of total supply.")
    print("     Check that is intended before locking the price.")
PY

# burnFrom(address,uint256) is 0x79cc6790. Finding the selector in the runtime
# code is a strong hint, not proof: a proxy hides its implementation, and a
# function can exist while doing nothing useful. The definitive test is the real
# mint that lockConfig already refuses to run without.
echo
if [[ "$CODE" == *"79cc6790"* ]]; then
  say "burnFrom" "found in bytecode  ->  useBurnFrom = true"
  BURN=true
else
  say "burnFrom" "NOT found  ->  useBurnFrom = false (sends to 0x...dEaD)"
  BURN=false
fi

if [[ "$DECIMALS" != "18" ]]; then
  warn "Decimals is $DECIMALS, not 18. The price above is already correct for it —"
  echo "     do not fall back to any 150000e18 written down elsewhere."
fi

cat <<EOF

--- run, in this order -------------------------------------------------------

  sale.setSaleOpen(false)                       # configure refuses while open
  sale.configure($TOKEN, $PRICE, $BURN)
  sale.setSaleOpen(true)
  ... mint one with your own wallet ...
  sale.setSaleOpen(false)
  sale.lockConfig()                             # refuses until that mint exists
  sale.setSaleOpen(true)

The test mint is the only proof this token's burn path actually completes.
A proxy can hide burnFrom from the scan above, and a burnFrom can exist and be
a no-op. The mint cannot be faked.
EOF
echo
