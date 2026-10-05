#!/usr/bin/env bash
# Regera supabase/atualizacao_definitiva.sql: TODAS as migrações em ordem, para quem usa o SQL Editor do Supabase.
set -euo pipefail
cd "$(dirname "$0")"
{
cat <<'HDR'
-- =====================================================================
-- GE ADVOCACIA · INSTALAÇÃO / ATUALIZAÇÃO DEFINITIVA (gerado por supabase/gerar_atualizacao.sh)
-- Rode no Supabase → SQL Editor → New query → Run. Seguro e repetível (idempotente):
-- não apaga dados, não mexe em PINs nem senhas. Contém todas as migrações em ordem.
-- =====================================================================
HDR
for f in migrations/*.sql; do
  echo
  echo "-- >>>>>>>>>> $(basename "$f") <<<<<<<<<<"
  cat "$f"
done
cat <<'FTR'

-- Atualiza o cache da API do Supabase para reconhecer as novas funções/tabelas
notify pgrst, 'reload schema';
select versao, nome, aplicada_em from public.schema_versao order by versao;
FTR
} > atualizacao_definitiva.sql
