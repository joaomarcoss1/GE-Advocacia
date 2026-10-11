# Segurança do GE Advocacia

Apoio técnico: este documento descreve o que o sistema faz e como é testado. Ele não substitui uma auditoria ou um teste de intrusão independentes, que recomendamos antes de operar com dados reais em escala.

## Modelo de ameaças e controles

| Ameaça | Controle | Onde | Teste |
|---|---|---|---|
| Ver dados de outro escritório (IDOR) | Todo dado tem `escritorio_id`; RLS em todas as tabelas; o escritório vem da sessão, nunca do pedido | `0001`…`0014` | `tests_10_isolamento`, `tests_99b` (RLS em tudo), `ataques.test.ts` |
| Subir de nível (escalonamento) | 8 níveis, hierarquia, permissões reservadas, "só concede o que tem", ninguém altera o próprio acesso | `0013` | `tests_99_acessos`, `ataques.test.ts` |
| Forjar a sessão no navegador | O nível é recalculado no servidor a cada leitura; trocar `papel` ou `id` no `localStorage` não vale | `local.ts`, RLS | `ataques.test.ts`, e2e 15 |
| Força bruta de senha | Limite do Supabase Auth por IP (`config.toml`), senha mínima de 10 com letras e números, freio no login (5 erros → espera até 10 min) | `config.toml`, `limiteLogin.ts` | `limiteLogin.test.ts`, e2e 15 |
| Força bruta de PIN | Hash do PIN; 5 erros por origem/pessoa, 15 por origem, 25 por pessoa: bloqueio de 10 min | `_validar_pin` | `tests_20_ponto`, `ataques.test.ts` |
| Varredura de nomes e códigos públicos | Limite por origem em `ponto_buscar`, `ponto_contexto`, `verificar_documento`, `ponto_acesso` (tabela `limite_taxa`); limitador por IP nas Edge Functions | `0014`, `_shared/limite.ts` | `tests_99b` |
| Tomar uma conta pelo PIN | A entrada automática só vale para níveis que dependem do ponto, com a entrada do dia confirmada e senha já trocada; administrador e gerência sempre entram com senha; não vale em quiosque | `ponto_acesso`, `ponto-entrar` | `tests_99b`, `ataques.test.ts`, e2e 15 |
| Injeção de SQL | Só chamadas parametrizadas; funções com `search_path` fixo; entradas hostis testadas | RPCs | `tests_99b` |
| XSS e injeção de conteúdo | React escapa tudo; sem `innerHTML`/`eval`; CSP sem `unsafe-eval` e sem script inline; modelos não herdam do protótipo nem reexpandem campos | `vercel.json`, `modelos.ts` | `codigo.test.ts`, `cabecalhos.test.ts`, `entradas.test.ts`, e2e 15 |
| Clickjacking, sniffing, downgrade | `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, HSTS de 2 anos, COOP, Permissions-Policy | `vercel.json` | `cabecalhos.test.ts` |
| Arquivo malicioso | Tipo conferido pelo conteúdo (não pela extensão), tamanho máximo, nome saneado, bucket privado, URL assinada de 60 s | `_shared/arquivos.ts` | `entradas.test.ts`, `arquivos.test.ts` |
| Vazamento de segredos | `service_role` só nas Edge Functions; tokens do Google cifrados (AES-GCM); nada de chave no código | funções, `cripto.ts` | `codigo.test.ts`, `cripto.test.ts` |
| Fórmulas em planilhas | Texto é gravado como texto | exportações | `entradas.test.ts` |
| Dados pessoais em relatórios de erro | Remoção de CPF, e-mail, PIN, senha, banco antes do envio; monitoramento é opcional | `monitor.ts` | `entradas.test.ts` |
| Adulteração de auditoria | Trilha só de inserção; registro de acessos com retenção de 12 meses | `0001`, `0013`, `0014` | `tests_30`, `tests_99` |
| Dependências vulneráveis | `npm audit` no CI (alta/crítica bloqueia) | `ci.yml` | CI |
| Perda de dados | Backup cifrado, semanal e restauração testada | `docs/RESTAURACAO.md` | `restauracao.yml` |

## Limite de taxa (rate limiting)

* **Banco** (`limite_taxa`, janela fixa por origem): busca de nomes 60/min, contexto do escritório 120/min, verificação de documento 30/min, entrada automática 20/min. Sem origem conhecida (chamadas internas) não limita.
* **Edge Functions**: limitador por IP em memória (`ponto-entrar` 15/min, envio por link e demais ações com limites próprios). É "melhor esforço" e soma-se ao limite do Supabase.
* **Login**: `config.toml` define `[auth.rate_limit]`. **Atenção:** no projeto hospedado, esses números também precisam estar em *Authentication → Rate Limits* no painel do Supabase (o `config.toml` só vale para o CLI local).
* **Cliente**: 5 erros por e-mail em 10 min travam o formulário até a mais antiga sair da janela; 15 erros no aparelho travam qualquer e-mail.

## Cookies, privacidade e LGPD

* O sistema não usa cookies de publicidade nem de rastreamento e não grava cookies próprios. O que fica no aparelho está listado em `/cookies` (tabela mantida igual ao código por teste).
* Aviso discreto de armazenamento na primeira visita (transparência; não bloqueia o uso, pois só há itens necessários e preferências).
* `/privacidade` descreve dados, finalidades, níveis de acesso, registro de acessos, entrada automática, retenção e direitos. **Textos-base para revisão jurídica**: cada escritório deve adaptá-los.

## Entrada automática depois do ponto

`ponto-entrar` (Edge Function) valida o PIN no banco (`ponto_acesso`), gera um link de uso único (`generateLink`) e devolve só o `token_hash`; o navegador troca por uma sessão (`verifyOtp`). Nenhuma senha trafega. O administrador liga/desliga em **Acessos e níveis**.

## O que o sistema não faz (limites honestos)

* Não há autenticação em dois fatores. Recomenda-se ligá-la no Supabase Auth (TOTP) para administradores.
* O limitador das Edge Functions é em memória (reinicia com a função); o do banco é persistente.
* O modo demonstração guarda dados no navegador e não é um ambiente seguro: use só com dados fictícios.
* O PIN é um segredo curto, protegido por bloqueios e limites; por isso ele nunca abre contas de administração.
* Teste de intrusão externo, revisão de configuração do projeto Supabase/Vercel e política de resposta a incidentes continuam por conta de quem opera.

## Como rodar os testes de segurança

```
npm test                                   # inclui src/seguranca/* e src/lib/limiteLogin.test.ts
PGHOST=/tmp PGPORT=5544 PGUSER=postgres bash supabase/run_rpc_tests.sh     # inclui tests_99b_seguranca.sql
npx playwright test e2e/15-seguranca.spec.ts
npm audit --omit=dev --audit-level=high
```
