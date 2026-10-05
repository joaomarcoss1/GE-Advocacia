# Checklist de produção — GE Advocacia

## Antes do primeiro escritório real
- [ ] Criar o **repositório** e o **projeto Supabase** do GE (separados do Almeida).
- [ ] Rodar `supabase/atualizacao_definitiva.sql` (ou as migrações 0001–0005 em ordem). Rodar duas vezes é seguro.
- [ ] Criar o primeiro usuário em *Authentication* e promovê-lo a administrador da plataforma:
  `insert into public.plataforma_admins (id, nome, email) values ('<uuid do usuário>', 'Nome', 'email');`
- [ ] Publicar a Edge Function: `supabase functions deploy anexos`. A `service_role` fica **só** nos segredos da função.
- [ ] (Opcional) Google Agenda automático: seguir `docs/GOOGLE-AGENDA.md` (credenciais OAuth, segredos `GOOGLE_*` e `ALLOWED_ORIGINS`, `supabase functions deploy google-agenda`).
- [ ] Criar o bucket **privado** `anexos` (nunca público) e conferir a política de acesso.
- [ ] Habilitar a extensão **pg_cron** (Database → Extensions) e rodar a migração 0005 de novo: ela agenda sozinha a limpeza diária de tentativas de PIN. O expurgo de anexos/geolocalização é executado pelo administrador em Configurações → Privacidade (com prévia).
- [ ] Variáveis do front-end (Vercel): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, opcional `VITE_SENTRY_DSN`. **Nunca** a `service_role`.
- [ ] Segredos do backup e da restauração (ver `docs/RESTAURACAO.md`); rodar o backup uma vez manualmente.
- [ ] Proteção de branch no GitHub: exigir os checks `Tipos, testes e build`, `Banco (RLS, regras e concorrência)` e `Telas (Playwright + acessibilidade)`; sem push direto na `main`.
- [ ] Revisar em Supabase: *Advisors* (segurança e desempenho), MFA para os administradores da plataforma, política de senhas.

## Por escritório novo
- [ ] Entrar como plataforma → Escritórios → Novo (nome, endereço `/ponto/<slug>`, fuso, administrador).
- [ ] Entregar ao administrador o link do ponto e orientá-lo a trocar a senha.
- [ ] Cadastrar equipe e PINs (nunca em planilha compartilhada).
- [ ] Revisar com o jurídico/contabilidade do escritório: política de retenção, textos de privacidade (LGPD), regras de folha.

## Provas de isolamento a repetir após qualquer mudança de schema
`npm run test:sql` (RLS, 300+ asserções, concorrência), `npm test`, `npm run test:e2e`.
