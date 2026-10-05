# Backup e restauração

## O que é copiado
- **Banco** (`pg_dump` formato custom, todos os escritórios) → criptografado com **age** → bucket S3 compatível (Cloudflare R2, Backblaze B2 ou S3) **fora do Supabase**.
- **Atestados** (bucket privado `anexos`) → `tar` criptografado com age, no mesmo destino.
- Retenção: 30 diários + 12 mensais (dia 1). Roda às 03:17 (Brasília) em `.github/workflows/backup.yml`.
- Ao fim, o workflow chama `select public.backup_registrar(...)`; a data aparece em **Diagnóstico**.

## Chaves
Gere um par age: `age-keygen -o chave.txt`. A linha `public key:` vai no segredo `BACKUP_AGE_RECIPIENT`. A **chave privada** fica guardada por quem for responsável (gerenciador de senhas + cópia offline) e, para o teste semanal, no segredo `BACKUP_AGE_IDENTITY` (idealmente num *environment* protegido). Sem a privada, o backup é irrecuperável: guarde-a em dois lugares.

## Restaurar (manual)
```bash
aws --endpoint-url "$EP" s3 cp s3://$BUCKET/diario/db-AAAA-MM-DD.dump.age .
age -d -i chave.txt db-AAAA-MM-DD.dump.age > restore.dump
createdb restaurado
pg_restore -d restaurado --no-owner --no-privileges restore.dump
```
Para atestados: `age -d -i chave.txt anexos-AAAA-MM-DD.tar.age | tar -xf -` e reenvie ao bucket `anexos` mantendo os caminhos `<escritorio_id>/...`.
Para voltar a um **projeto Supabase novo**: crie o projeto, rode as migrações (`supabase/atualizacao_definitiva.sql`), restaure só os dados (`pg_restore --data-only`) e reaponte as variáveis do front-end.

## Teste semanal
`.github/workflows/restauracao.yml` restaura o último dump num Postgres descartável e confere que há escritórios e funcionários. Se falhar, o GitHub avisa por e-mail: trate como incidente.

## Limitações
Os workflows foram escritos mas **não executados contra um Supabase real** (o projeto do GE ainda não existe). Valide-os no primeiro dia de produção com `workflow_dispatch`.
