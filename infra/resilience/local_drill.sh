#!/usr/bin/env bash
# Finite fake-contract + real authenticated encryption drill. Never starts a DB/daemon.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
export PYTHONDONTWRITEBYTECODE=1
node --test api/tests/resilienceHealth.test.mjs infra/resilience/tests/service_checks.test.mjs
python3 -m unittest discover -s infra/resilience/tests -p 'test_*.py' -v
printf '%s\n' 'Local contracts/encryption verified. MySQL roundtrip, live email/storage/billing/webhook and off-host S3 acceptance are NOT implied.'
