# GE Advocacia

Plataforma administrativa **multiescritório** para escritórios de advocacia: equipe, escalas, ponto por PIN, ocorrências/atestados, folha de conferência por diária **delegação de tarefas, prazos, audiências e reuniões com Google Agenda**, **acompanhamento de processos**, **documentos com checklist e Google Drive** e **backup semanal**. Cada escritório é um espaço totalmente separado dos demais.

> Projeto independente do "Almeida Advocacia": outro repositório e outro Supabase. Nada daqui toca o sistema do Almeida.

## Como o isolamento funciona
- **Um banco Postgres, vários escritórios, isolamento forçado pelo próprio banco.** Toda tabela de negócio tem `escritorio_id` (preenchido por `meu_escritorio()`), políticas **RLS** que só liberam linhas do escritório do usuário, **chaves estrangeiras compostas** `(escritorio_id, id)` (impossível ligar dados de escritórios diferentes) e gatilho que impede mudar o escritório de uma linha.
- **A plataforma** (dono do GE) cria, suspende e exclui escritórios e redefine acessos, mas **não tem política de leitura** sobre dados de negócio (funcionários, ponto, folha, atestados).
- **Funcionários** não têm login: batem ponto em `/ponto/<slug-do-escritório>` com PIN pessoal, via funções que só enxergam aquele escritório.
- **Atestados** ficam em Storage privado, com URL assinada de 60 s e registro de quem abriu.
- **Ressalva honesta:** é isolamento **lógico** (RLS) num único banco, não bancos físicos separados. É o padrão de SaaS multi-tenant e foi provado por testes (abaixo). Se um cliente exigir banco físico próprio, a alternativa é um projeto Supabase por escritório (mais custo e operação); o front-end já fala com um único endpoint por implantação.

## Delegação e Google Agenda
Administrador, gerência e **coordenação** delegam tarefas, prazos processuais (com número CNJ validado), audiências, diligências, protocolos e reuniões, com responsável, revisor, participantes, prioridade, andamentos e quadro de acompanhamento. O funcionário vê e atualiza as dele pelo PIN. Cada compromisso vai ao Google Agenda por link, arquivo .ics ou, conectando a conta, de forma automática com convite por e-mail. Detalhes e configuração em `docs/GOOGLE-AGENDA.md`.

## Processos, documentos e backup
Cadastro de clientes e processos (número CNJ validado) com consulta automática de andamentos (DataJud), que viram tarefas com prazo sugerido em dias úteis. Cada cliente/processo tem uma checklist de documentos; os arquivos entram pelo painel ou por um link de envio do cliente, ficam em Storage privado e são organizados no Google Drive (Cliente/Processo). Backup semanal do sistema, criptografado. Detalhes, configuração e limites em `docs/PROCESSOS-E-DOCUMENTOS.md`.

## Rodar localmente (modo demonstração)
```bash
npm ci
npm run dev          # sem variáveis do Supabase = dados fictícios só no navegador
```
Cada escritório demo tem o próprio conjunto de dados no navegador (`ge.v1.e.<slug>.*`).

| Acesso | Login | Senha |
|---|---|---|
| Plataforma (GE) | plataforma@geadvocacia.com.br | GEplataforma2026 |
| Admin — Silva & Ribeiro | admin@silvaribeiro.adv.br | silva2026admin |
| Gerência — Silva & Ribeiro | gerencia@silvaribeiro.adv.br | silva2026gerencia |
| Coordenação — Silva & Ribeiro | coordenacao@silvaribeiro.adv.br | silva2026coord |
| Admin — Monteiro & Costa | admin@monteirocosta.adv.br | monteiro2026admin |

Ponto: `/ponto/silva-ribeiro` (PINs de demonstração: 482913, 739105, 561847, 902716, 357951). Todos fictícios; não use dados reais no modo demonstração.

## Modo real (Supabase)
Veja `docs/CHECKLIST-PRODUCAO.md`. Resumo: criar projeto → rodar `supabase/atualizacao_definitiva.sql` → promover o primeiro administrador da plataforma (`plataforma_admins`) → publicar a Edge Function `anexos` → definir `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. **A `service_role` nunca vai ao front-end.**

## Testes
```bash
npm run typecheck
npm test              # vitest (regras, paridade, isolamento no modo local)
npm run test:cov      # com cobertura
npm run test:sql      # Postgres: migrações 2x, RLS, ponto, folha, privacidade, concorrência (PGHOST/PGUSER...)
npm run test:e2e      # Playwright + axe (acessibilidade WCAG 2.1 AA)
```
**Regra nova = caso novo** em `src/lib/__fixtures__/casos-regra.json`: o mesmo fixture alimenta vitest, o modo local e as asserções SQL (`supabase/gerar_paridade.mjs`), garantindo que TypeScript e SQL calculem igual.
Rode `npm run sql:gerar` após alterar migrações para regenerar `atualizacao_definitiva.sql`.

## Documentação
- `docs/CHECKLIST-PRODUCAO.md` — preparação do Supabase, segredos, proteção de branch
- `docs/GOOGLE-AGENDA.md` — integração com o Google Agenda (credenciais, segredos e limites)
- `docs/PROCESSOS-E-DOCUMENTOS.md` — processos, documentos, Google Drive e backup semanal
- `docs/RESTAURACAO.md` — backup criptografado e restauração
- `docs/PROPOSTAS-FASES-6-8.md` — folha/encargos, Portaria 671 e integração jurídica (aguardam aprovação)

## Limitações conhecidas
- Edge Functions `anexos`, `google-agenda`, `processos` e `documentos` (dependem de credenciais Google e da chave do DataJud), Storage privado, `pg_cron` e os workflows de backup/restauração foram escritos, mas **não executados contra um Supabase real** (o projeto do GE ainda não existe). Valide-os no primeiro dia de produção.
- Fase 5 (tipagem): o acesso a dados usa a interface `Crud` genérica; os tipos gerados do Supabase (`supabase gen types`) ainda não foram integrados.
- Fases 6, 7 e 8 estão apenas **propostas** em `docs/PROPOSTAS-FASES-6-8.md`, aguardando aprovação.

## Avisos
Cálculos de folha, textos de privacidade (LGPD) e itens da Portaria 671/2021 são **apoio técnico**: valide com o jurídico e a contabilidade de cada escritório antes de uso oficial.
