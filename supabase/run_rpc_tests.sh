#!/usr/bin/env bash
# Sobe o schema num Postgres local (com stub do Supabase) e roda TODAS as suítes SQL, com asserções.
# Uso: PGHOST=/tmp PGPORT=5544 PGUSER=postgres ./supabase/run_rpc_tests.sh
# Qualquer asserção que falhe encerra o script com código diferente de zero (o CI quebra).
set -euo pipefail
cd "$(dirname "$0")"
DB="${GE_TEST_DB:-ge_test}"
P="psql -q -X -v ON_ERROR_STOP=1"
QUIET="-c client_min_messages=warning"
$P -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null
$P -d "$DB" -f tests_stub.sql >/dev/null

# Aplica cada migração DUAS vezes: a segunda prova a idempotência.
for f in migrations/*.sql; do
  PGOPTIONS="$QUIET" $P -d "$DB" -f "$f" >/dev/null
  PGOPTIONS="$QUIET" $P -d "$DB" -f "$f" >/dev/null
  echo "migração ok (2x): $f"
done

# O arquivo único gerado precisa rodar de novo por cima, sem erro.
bash ./gerar_atualizacao.sh
PGOPTIONS="$QUIET" $P -d "$DB" -f atualizacao_definitiva.sql >/dev/null
echo "atualizacao_definitiva.sql ok (3ª execução)"

# paridade: os casos do JSON viram asserções SQL
node ./gerar_paridade.mjs

total=0
for f in tests_[0-9]*.sql; do
  out=$($P -d "$DB" -f "$f" 2>&1 >/dev/null) || { echo "$out" | sed 's/^psql:[^ ]* //' | tail -20; echo "✗ $f FALHOU"; exit 1; }
  n=$(echo "$out" | grep -c 'NOTICE:  ok - ' || true)
  total=$((total + n))
  echo "✓ $f ($n asserções)"
done

# Concorrência real: dois processos batendo o ponto ao mesmo tempo
if [ -x ./tests_concorrencia.sh ]; then ./tests_concorrencia.sh "$DB"; fi
echo "Todas as suítes SQL passaram ($total asserções + concorrência)."
