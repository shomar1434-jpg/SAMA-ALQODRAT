#!/usr/bin/env bash
# يطبّق كل الترحيلات على قاعدة PostgreSQL جديدة ثم يشغّل اختبارات SQL. الاستخدام: bash supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${DB:-sama_test}
export PGOPTIONS="-c client_min_messages=warning"
PSQL="psql -v ON_ERROR_STOP=1 -q -X"
$PSQL -d postgres -c "drop database if exists $DB" -c "create database $DB"
$PSQL -d $DB -f tests/_stub.sql
for f in migrations/*.sql; do echo "• $f"; $PSQL -d $DB -f "$f"; done
$PSQL -d $DB -f seed.sql
for f in tests/test_*.sql; do echo "• $f"; $PSQL -d $DB -f "$f"; done
echo "SQL OK"
