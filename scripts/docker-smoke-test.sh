#!/usr/bin/env bash
set -euo pipefail

COMPOSE="docker compose"
TIMEOUT=60

declare -A PORT=( [api]=4000 [verifier]=4100 [generator]=4300 [orchestrator]=4200 )

echo "==> Building images..."
$COMPOSE build

echo "==> Starting services..."
$COMPOSE up -d

cleanup() {
  echo "==> Stopping services..."
  $COMPOSE down
}
trap cleanup EXIT

echo "==> Waiting for services (up to ${TIMEOUT}s)..."
elapsed=0
while [ $elapsed -lt $TIMEOUT ]; do
  all_up=true
  for svc in api verifier generator orchestrator; do
    if ! curl -sf "http://localhost:${PORT[$svc]}/health" >/dev/null 2>&1; then
      all_up=false
      break
    fi
  done
  if $all_up; then break; fi
  sleep 3
  elapsed=$((elapsed + 3))
done

fail=0
for svc in api verifier generator orchestrator; do
  url="http://localhost:${PORT[$svc]}/health"
  echo -n "  $svc ($url): "
  if response=$(curl -sf --max-time 5 "$url" 2>&1); then
    echo "OK — $response"
  else
    echo "FAIL"
    fail=1
  fi
done

if [ $fail -ne 0 ]; then
  echo ""
  echo "==> Some health checks failed. Container logs:"
  $COMPOSE logs --tail=30
  exit 1
fi

echo ""
echo "==> All services healthy."
