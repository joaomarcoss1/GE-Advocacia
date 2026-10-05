#!/usr/bin/env bash
# Duas (ou mais) batidas SIMULTÂNEAS do mesmo funcionário/dia/tipo geram exatamente uma marcação.
set -euo pipefail
DB="${1:-ge_test}"
Q="psql -q -X -At -d $DB"
ESC=$($Q -c "select v from t.ctx where k='escA'")
FID=00000000-0000-0000-0000-00000000c0c1
$Q <<SQL >/dev/null
delete from public.registros_ponto where funcionario_id = '$FID';
delete from public.funcionario_pins where funcionario_id = '$FID';
delete from public.pin_tentativas where funcionario_id = '$FID';
delete from public.funcionarios where id = '$FID';
insert into public.funcionarios (id, escritorio_id, nome, vinculo, escala_id, data_admissao)
  values ('$FID', '$ESC', 'Corrida Concorrente', 'clt', (select id from public.escalas where escritorio_id = '$ESC' and nome = 'T-agora'), current_date - 10);
insert into public.funcionario_pins (funcionario_id, escritorio_id, pin_hash) values ('$FID', '$ESC', extensions.crypt('483926', extensions.gen_salt('bf')));
update public.funcionarios set tem_pin = true where id = '$FID';
SQL
N=10
for i in $(seq 1 $N); do
  ( $Q -c "set role anon" -c "select ponto_bater('$FID', '483926', 'entrada')" > /tmp/ge_conc_$i.out 2>&1 ) &
done
wait
OKS=$(cat /tmp/ge_conc_*.out | grep -c '"ok": true' || true)
JA=$(cat /tmp/ge_conc_*.out | grep -c 'JA_REGISTRADO' || true)
LINHAS=$($Q -c "select count(*) from public.registros_ponto where funcionario_id = '$FID' and tipo = 'entrada' and status_aprovacao <> 'rejeitado'")
rm -f /tmp/ge_conc_*.out
if [ "$LINHAS" != "1" ] || [ "$OKS" != "1" ]; then echo "✗ concorrência: $N chamadas -> $OKS ok, $JA duplicadas, $LINHAS linhas (esperado 1 ok e 1 linha)"; exit 1; fi
echo "✓ concorrência: $N batidas simultâneas -> 1 marcação ($JA recusadas como duplicadas)"
$Q <<SQL >/dev/null
delete from public.registros_ponto where funcionario_id = '$FID';
delete from public.funcionario_pins where funcionario_id = '$FID';
delete from public.pin_tentativas where funcionario_id = '$FID';
delete from public.funcionarios where id = '$FID';
SQL
