#!/usr/bin/env bash
# 마이그레이션 + RLS/함수 테스트를 임시 Postgres DB 에서 실행한다.
# 테스트 파일마다 새 DB 를 만들어 shim → 마이그레이션 → 테스트 순으로 실행.
# 사용: PGHOST=... PGPORT=... PGUSER=postgres scripts/test-db.sh
#  (로컬 Postgres 15+ 만 있으면 됨. Supabase/Docker 불필요)
set -euo pipefail
cd "$(dirname "$0")/.."

PSQL=(psql -q -X -v ON_ERROR_STOP=1 --set=client_min_messages=error)
DBS=()
cleanup() { for db in "${DBS[@]}"; do psql -q -d postgres -c "drop database if exists $db" >/dev/null 2>&1 || true; done; }
trap cleanup EXIT

prepare_db() {
  local db="$1"
  DBS+=("$db")
  psql -q -d postgres -c "create database $db" >/dev/null
  # 역할은 클러스터 전역이므로 이미 있으면 shim 의 create role 을 건너뛴다
  if psql -tAc "select 1 from pg_roles where rolname='authenticated'" -d postgres | grep -q 1; then
    sed '/^create role /d' supabase/tests/_shim.sql | PGOPTIONS='-c client_min_messages=error' "${PSQL[@]}" -d "$db" >/dev/null
  else
    PGOPTIONS='-c client_min_messages=error' "${PSQL[@]}" -d "$db" -f supabase/tests/_shim.sql >/dev/null
  fi
  for f in supabase/migrations/*.sql; do
    PGOPTIONS='-c client_min_messages=error' "${PSQL[@]}" -d "$db" -f "$f" >/dev/null
  done
}

n=0
for t in supabase/tests/[0-9]*.test.sql; do
  n=$((n + 1))
  db="callsns_test_$$_$n"
  prepare_db "$db"
  echo "▶ $t"
  PGOPTIONS='-c client_min_messages=error' "${PSQL[@]}" -d "$db" -t -A -f "$t" | grep -E 'PASSED|FAIL' || true
done
