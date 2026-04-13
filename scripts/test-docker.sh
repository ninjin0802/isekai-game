#!/usr/bin/env bash
# Docker build & startup smoke test
# RED → GREEN verification for Railway deployment
set -euo pipefail

IMAGE="isekai-server-test"
CONTAINER=""
PORT=3099  # avoid conflicts

cleanup() {
  if [ -n "$CONTAINER" ]; then
    echo "[cleanup] stopping container $CONTAINER"
    docker stop "$CONTAINER" >/dev/null 2>&1 || true
    docker rm "$CONTAINER" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo ""
echo "=== [1/4] Docker build ==="
docker build -t "$IMAGE" . 2>&1 | tail -5
echo "PASS: image built"

echo ""
echo "=== [2/4] Start container ==="
CONTAINER=$(docker run -d \
  -e DATABASE_URL="postgresql://testuser:testpass@127.0.0.1:5432/testdb" \
  -e JWT_SECRET="test-jwt-secret-for-ci-only" \
  -e NODE_ENV="production" \
  -e PORT="$PORT" \
  -p "$PORT:$PORT" \
  "$IMAGE")
echo "container: $CONTAINER"

echo ""
echo "=== [3/4] Wait for startup (5s) ==="
sleep 5

STILL_RUNNING=$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null || echo "false")
if [ "$STILL_RUNNING" != "true" ]; then
  echo "FAIL: container exited prematurely"
  echo "--- logs ---"
  docker logs "$CONTAINER" 2>&1 | tail -20
  exit 1
fi
echo "PASS: container still running"

echo ""
echo "=== [4/4] /health endpoint ==="
HTTP_STATUS=$(curl -s -o /tmp/health_resp.json -w "%{http_code}" \
  --max-time 5 \
  "http://localhost:$PORT/health" || echo "000")

echo "HTTP status: $HTTP_STATUS"
cat /tmp/health_resp.json 2>/dev/null && echo ""

if [ "$HTTP_STATUS" = "200" ]; then
  echo ""
  echo "✓ ALL TESTS PASSED — Docker image is deployable"
  exit 0
else
  echo ""
  echo "FAIL: /health returned $HTTP_STATUS (expected 200)"
  echo "--- container logs ---"
  docker logs "$CONTAINER" 2>&1 | tail -30
  exit 1
fi
