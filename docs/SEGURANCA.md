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

## Um escritório nunca enxerga o outro

Cada escritório (inquilino) é identificado por `escritorio_id`; toda tabela de dados tem RLS ligado e as políticas só enxergam o escritório do usuário logado (`meu_escritorio()`). Funções `SECURITY DEFINER` fixam o `search_path` e conferem o escritório do chamador; as Edge Functions confirmam a posse de qualquer id vindo do cliente com um cliente RLS (`sbUser`) antes de usar a chave de serviço.

A suíte `supabase/tests_99c_isolamento_total.sql` varre **todas** as tabelas com `escritorio_id` (hoje 42), sem lista escrita à mão — uma tabela nova sem política correta derruba os testes:

* estrutura: RLS ligado em todo o schema `public`; `escritorio_id` NOT NULL; nenhuma política aberta (`using (true)`) nem válida para anônimo; todas as funções `SECURITY DEFINER` com `search_path` fixo; anônimo sem privilégio direto;
* ataque: o administrador e a gerência de A tentam ler, alterar, apagar e inserir (clonando linhas reais) no escritório B, e o administrador de B faz o mesmo em A — nada pode passar;
* anônimo e plataforma não leem tabela de escritório nenhuma; ao final, os dados de A e de B continuam idênticos.

O teste foi validado "por mutação": uma política `using (escritorio_id is not null)` colocada de propósito é detectada (leitura, alteração e inserção).

Tabelas só do servidor (PINs, tentativas, tokens do Google/Drive, lixeiras) têm RLS e nenhuma política: ficam fechadas para qualquer usuário. Cada escritório tem a própria configuração (inclusive a cerca de GPS), o próprio endereço de ponto (`/ponto/<slug>`) e os próprios acessos.

## GPS do ponto

* **Leitura**: o aparelho é acompanhado por alguns segundos e vale a melhor leitura (a primeira costuma vir de antena/Wi-Fi, com centenas de metros de erro). A leitura verificada na tela é reaproveitada ao registrar (até 45 s), em vez de uma segunda leitura pior.
* **Tolerância**: a cerca aceita *raio + tolerância do GPS* (padrão 30 m, 0 a 150 m, configurável por escritório). O servidor aplica a mesma regra (`ponto_bater`, migração 0015) e recalcula a distância a cada registro; a precisão informada pelo aparelho nunca é confiada pelo servidor.
* **Configuração**: em *Configurações → Ponto* — "calibrar pelo GPS" (média ponderada de ~15 s de leituras, de dentro do escritório), colar coordenadas ou o link do Google Maps, atalhos de raio e a tolerância. Tudo isso é auditado.
* O GPS vem do aparelho e pode ser falsificado por quem tem controle dele; a cerca reduz fraude comum e a auditoria e a aprovação de ajustes cobrem o resto.

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
