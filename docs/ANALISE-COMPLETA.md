# GE Advocacia — Análise completa do sistema

Data: 08/10/2026 · Escopo: código, estrutura, funções, integrações, segurança, design/UX/mobile e comparação com sistemas do mercado.
Método: leitura do código, execução das suítes (unitárias, SQL, e2e, acessibilidade, auditoria de layout em 7 tamanhos de tela), `npm audit`, varredura de segredos e inspeção do build. Onde não foi possível comprovar algo (integrações com sites do Judiciário e Google, que o ambiente de desenvolvimento não alcança), isto está dito de forma explícita.

> Apoio técnico. Prazos, folha e itens jurídicos do sistema são sugestões a validar com o jurídico/contabilidade do escritório.

---

## 1. Resumo executivo

O GE Advocacia é uma base **sólida e bem testada** de gestão interna de escritório (ponto, escala, folha, delegação de tarefas, agenda, processos, documentos) com **isolamento entre escritórios comprovado por testes de banco**. O ponto forte é a engenharia (segurança, testes, regras de negócio); o ponto fraco, frente a Advbox/Tramitação Inteligente, é o **escopo jurídico-comercial**: faltam recebimento automático de intimações/publicações, financeiro/honorários, modelos de peças, portal do cliente e comunicação (WhatsApp/e-mail).

| Área | Nota | Observação |
|---|---|---|
| Segurança de dados / multi-escritório | **9,0** | 38/38 tabelas com RLS, 63 políticas, 0 funções SECURITY DEFINER sem `search_path` fixo, `anon` sem acesso direto (migração 0008). Falta MFA/política de senha no Supabase (configuração, não código). |
| Qualidade do código | **7,5** | TypeScript estrito, lógica de negócio pura e testada. Dívida: `styles.css` monolítico com blocos empilhados; páginas grandes. |
| Testes | **8,5** | 248 unitários, 467 asserções SQL + concorrência, 11 arquivos e2e com axe (WCAG 2.1 AA), auditoria de layout. Falta teste das integrações contra serviços reais. |
| Regras jurídicas (prazos) | **8,0** | Contagem em dias úteis (CPC), recesso, feriados por escritório, publicação/ciência/portal, prazo em dobro. Precisa de validação jurídica e de feriados forenses por tribunal. |
| Integrações | **5,5** | Escritas e cobertas por testes de unidade, mas **nunca executadas contra DataJud/DJEN/Google reais**. |
| Design / UX | **8,5** | Identidade própria (marfim/azul/dourado, Cormorant + Inter), mobile em dois tons, PWA instalável. |
| Mobile / PWA | **8,0** | Instalável (Android/iOS), offline básico, atualização controlada; sem notificações push. |
| Cobertura funcional vs. mercado | **4,5** | Ver seção 6. |

---

## 2. Inventário

- Front-end: React 19 + TypeScript + Vite; ~11,4 mil linhas em `src/` (+1,7 mil de testes unitários); `styles.css` com ~1.170 linhas.
- Banco: 8 migrações (~2,7 mil linhas SQL), RLS em todas as tabelas, RPCs `SECURITY DEFINER` para o ponto por PIN.
- Servidor: 4 Edge Functions (`anexos`, `google-agenda`, `processos`, `documentos`) e módulos compartilhados em `_shared/` (mesma lógica no app e no servidor).
- Automação: 7 workflows (CI, backup, restauração, deploy Supabase, monitor de processos, verificação de integrações).
- Pacote inicial do app: 790 kB (207 kB comprimido), quase todo React/Router; PDF/Excel/QR carregam só quando usados.
- Dependências: `npm audit` sem vulnerabilidades; nenhum segredo no repositório.

## 3. Funções existentes

Ponto por PIN (3 camadas de bloqueio, geolocalização e justificativas) · escalas · feriados · cargos · ocorrências/atestados (LGPD) · folha com selo verificável (QR) · relatórios PDF/Excel · tarefas e delegação (coordenador) · Google Agenda · clientes e processos (DataJud) · andamentos classificados com prazo sugerido · calculadora de prazos · documentos com checklist, Google Drive, link seguro para o cliente enviar arquivos · backup semanal criptografado · área da plataforma (vários escritórios) · modo demonstração · PWA.

## 4. Código e estrutura

**Pontos fortes**
- Regras de negócio puras e compartilhadas (`_shared/`), reutilizadas em app e servidor → mesmo cálculo nos dois lados.
- Camada de dados com duas implementações (local/demonstração e Supabase) pela mesma interface.
- Testes que protegem decisões críticas (isolamento, bloqueio de PIN, folha, prazos).

**Dívidas e riscos (por prioridade)**
1. `src/styles.css` acumula blocos que se sobrepõem (CLÁSSICO, PREMIUM MOBILE…). Funciona, mas qualquer ajuste exige cuidado com a cascata. *Sugestão:* dividir por módulo (tokens, layout, componentes, mobile) sem mudar o visual.
2. Cálculo de prazo depende de feriados cadastrados por escritório; não existe base oficial de feriados forenses por tribunal.
3. Edge Functions não eram verificadas por tipos no CI. *Sugestão:* passo `deno check` no `ci.yml`.
4. Rate limit das funções é em memória (por instância): bom contra abuso simples, não é barreira forte.
5. Sem monitoramento de erros ativo por padrão (Sentry é opcional via `VITE_SENTRY_DSN`).

## 5. Segurança e LGPD

Comprovado por teste: isolamento entre escritórios (RLS + chaves compostas), `anon` sem privilégio em tabelas, funções internas `_*` inexecutáveis por usuários, PIN com hash (bcrypt), links de envio guardados só como hash, bucket privado.

**Ações que dependem do painel do Supabase (não são código):** desligar cadastro público, senha mínima de 10 caracteres, proteção contra senhas vazadas, MFA para administradores da plataforma, expiração de sessão. Já constam no `docs/CHECKLIST-PRODUCAO.md`.

**Observação de segurança:** a senha do administrador mestre foi compartilhada em conversa. Deve ser trocada no primeiro acesso.

## 6. Integrações — situação real

| Integração | Código | Teste unitário | Executada contra o serviço real? |
|---|---|---|---|
| DataJud (andamentos) | Sim | Sim (leitura/classificação) | **Não** (ambiente sem acesso; exige chave do CNJ) |
| DJEN / Comunicações (intimações) | Não (somente verificação) | — | **Não** — a API não foi validada |
| Google Agenda | Sim | Parcial | **Não** |
| Google Drive | Sim | Parcial | **Não** |
| Supabase (banco/funções) | Sim | Sim (SQL real em Postgres) | Parcial |

Para fechar essa lacuna foi criado o workflow **Verificar integrações** (GitHub → Actions → Run workflow) e o script `scripts/verificar-integracoes.mjs`: ele consulta DataJud, DJEN e as funções publicadas com a internet do GitHub e mostra o resultado e os campos reais retornados. A saída dele é o que permite implementar a captura automática de intimações com segurança.

## 7. Comparação com o mercado

Fontes: materiais públicos dos próprios fornecedores (alegações dos fornecedores, não auditadas por nós).

| Capacidade | Advbox | Tramitação Inteligente | Astrea / Projuris / Legal One (perfil geral) | GE Advocacia |
|---|---|---|---|---|
| Acompanhamento de andamentos | Sim, automático | Sim, automático | Sim | **Sim** (DataJud, por consulta e rotina diária) |
| Intimações/publicações automáticas (DJEN/diários) | Sim | Sim (núcleo do produto) | Sim | **Não** — maior lacuna |
| Prazos | Sim | Sim, com regras por tribunal | Sim | **Sim** (CPC, dobro, recesso, passo a passo), sem regras por tribunal |
| Financeiro / honorários / contas a receber | Sim | Parcial | Sim | **Não** |
| Modelos de documentos e peças | Sim | Sim | Sim | **Não** |
| Assinatura eletrônica | Sim | Via parceiros | Sim | **Não** |
| CRM / funil de clientes | Sim | Parcial | Sim | **Não** (cadastro de clientes) |
| WhatsApp / e-mail ao cliente | Sim | Parcial | Sim | **Não** |
| Portal do cliente | Sim | Sim | Sim | Parcial (link seguro de envio de documentos) |
| Relatórios / BI | Sim | Sim | Sim | Parcial (relatórios de equipe e folha) |
| Gestão de equipe (tarefas, produtividade) | Sim (pontuação) | Parcial | Parcial | **Sim**, com delegação e agenda |
| **Ponto eletrônico + escala + folha** | Não | Não | Não | **Sim — diferencial** |
| **Atestados com cuidado LGPD** | Não | Não | Não | **Sim — diferencial** |
| **Isolamento multi-escritório comprovado por testes** | n/d | n/d | n/d | **Sim — diferencial** |
| App nativo / notificações push | Sim | Sim | Sim | PWA instalável, sem push |
| API pública / importação de dados | Sim | Sim | Sim | Não |

**Leitura estratégica:** GE não precisa copiar tudo. O caminho de maior valor é combinar o que ninguém tem (**gestão de equipe + ponto/folha**) com o que o advogado compra o sistema para ter (**intimações e prazos automáticos**).

## 8. Design, UX e mobile

- Identidade coerente (logo, colunata "Fórum", papel timbrado nas telas de entrada), tipografia clássica, contraste verificado por axe.
- Mobile em dois tons (cabeçalho e navegação azul-marinho/dourado, conteúdo claro) e proteção contra o "modo escuro forçado" do Chrome Android, com teste que falha sem a correção.
- PWA: manifesto, service worker, página offline, instalação guiada (Android e iOS), atualização controlada.
- Pontos a melhorar: notificações push (prazos, tarefas), tela de "intimações do dia", atalhos de teclado no desktop, estado vazio com ações sugeridas em mais telas.

## 9. O que foi corrigido/entregue nesta rodada

| Item | Detalhe | Prova |
|---|---|---|
| Calculadora de prazo completa | Marco (disponibilização/publicação/ciência/portal), dias, dobro, recesso, passo a passo; atalhos CPC 15 / CLT 8 / Juizados 10 / Embargos 5 | Testes unitários + e2e |
| Prazo padrão da Justiça do Trabalho | Processos com segmento 5 sugerem 8 dias em vez de 15 | Testes unitários |
| Classificador | "Cumprimento de sentença" deixou de ser tratado como sentença | Testes unitários |
| Endurecimento do banco (0008) | `anon` sem acesso a tabelas/sequências; funções internas `_*` fechadas; padrão futuro seguro | 11 asserções SQL novas |
| Link público do cliente | Token conferido antes de ler o arquivo; limite por IP; `x-envio-token` | Testes de limitador + revisão |
| QR Code | Carregado só ao gerar PDF | Build + testes |
| Verificação das integrações | Script + workflow manual | Execução local (bloqueada pelo ambiente, comportamento correto) |
| Documentação | Checklist de produção e documento de processos atualizados | — |

## 10. Roteiro priorizado

**P0 — antes de usar com dados reais**
1. Rodar `atualizacao_definitiva.sql` (inclui 0007 e 0008) e o SQL do administrador mestre no Supabase.
2. Configurar Auth do Supabase (cadastro público desligado, senha, MFA) e trocar a senha compartilhada.
3. Rodar o workflow **Verificar integrações** e enviar a saída para ajustar DJEN/DataJud.
4. Cadastrar segredos (DataJud, Google, CRON) e testar um processo real e um upload real.

**P1 — próximo ciclo (maior valor de mercado)**
1. Caixa de **intimações automáticas via DJEN** por OAB, com prazo calculado e tarefa criada (depende do P0.3).
2. **Financeiro/honorários** básico (contratos, parcelas, vencimentos, inadimplência).
3. **Modelos de documentos** com campos do processo/cliente.
4. **Notificações push** para prazos e tarefas.
5. CI: `deno check` das funções e auditoria de layout.

**P2 — diferenciação**
1. Portal do cliente (andamentos resumidos em linguagem simples).
2. WhatsApp/e-mail com modelos.
3. Painel de indicadores (produtividade, prazos cumpridos, carga por advogado).
4. Importação de planilhas/outros sistemas e API.
5. Feriados forenses por tribunal e regras de prazo por rito.
6. Refatoração do CSS em módulos.
