#!/usr/bin/env bash
# 마이그레이션 + RLS 테스트를 임시 Postgres DB 에서 실행한다.
# 사용: PGHOST=... PGPORT=... PGUSER=postgres scripts/test-db.sh
#  (로컬 Postgres 16 이 있으면 됨. Supabase/Docker 불필요)
set -euo pipefail
cd "$(dirname "$0")/.."

DB="callsns_test_$$"
psql -q -v ON_ERROR_STOP=1 -d postgres -c "create database $DB" >/dev/null
trap 'psql -q -d postgres -c "drop database if exists $DB" >/dev/null' EXIT

run() { psql -q -X -v ON_ERROR_STOP=1 -d "$DB" -f "$1"; }

# 역할은 클러스터 전역이므로 이미 있으면 shim 의 create role 을 건너뛴다
if psql -tAc "select 1 from pg_roles where rolname='authenticated'" -d postgres | grep -q 1; then
  sed '/^create role /d' supabase/tests/_shim.sql | psql -q -X -v ON_ERROR_STOP=1 -d "$DB"
else
  run supabase/tests/_shim.sql
fi

for f in supabase/migrations/*.sql; do
  echo "migrate: $f"; run "$f"
done
for f in supabase/tests/[0-9]*.test.sql; do
  echo "test: $f"; run "$f"
done
