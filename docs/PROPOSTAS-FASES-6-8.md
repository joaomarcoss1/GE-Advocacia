# Propostas das Fases 6, 7 e 8 (para aprovação antes de codar)

> Tudo aqui é **apoio técnico**. Pontos trabalhistas, previdenciários, fiscais e da Portaria MTP 671/2021 devem ser **validados com o jurídico e a contabilidade** de cada escritório antes de uso oficial. Nada abaixo foi implementado: aguarda o seu "pode seguir".

Todas as tabelas novas seguem o padrão do GE: `escritorio_id` com default `meu_escritorio()`, RLS por escritório, FKs compostas `(escritorio_id, id)`, auditoria pelo gatilho existente, suíte SQL própria (`tests_NN_*.sql`) e, quando houver regra de cálculo, caso novo em `src/lib/__fixtures__/casos-regra.json` (paridade TS × local × SQL).

## Fase 6 — Folha mais completa

**Escopo:** folha de conferência por diária continua sendo a base; nada é apresentado como folha oficial.

1. **DSR (opcional, padrão desligado)** — chave em `config` por escritório. Se ligada, falta injustificada na semana desconta também o DSR. Texto fixo na tela: "confirmar com a contabilidade". Casos de fixture: semana sem falta, 1 falta, falta com feriado, falta abonada.
2. **Encargos (módulo separado, rótulo "Estimativa, não substitui a folha da contabilidade")**
   - `tabelas_encargos` (tipo INSS/IRRF, vigência início/fim, faixas em JSON, fonte/ato normativo): cadastradas pelo administrador, **sem valores fixos no código**.
   - FGTS com percentual configurável; provisões de férias + 1/3 e 13º por avo.
   - Só `vinculo = 'clt'` calcula encargos; `estagio`, `pj` e `socio` não geram encargos CLT (estágio: bolsa e recesso).
3. **Exportação para a contabilidade** — CSV/Excel com mapeamento de colunas configurável por escritório (dias, faltas, horas extras, adicionais, ocorrências por funcionário e competência).
4. **Testes:** vitest por regra + fixture quando houver espelho SQL.

**Decisões que preciso de você:** se os vínculos já existentes no cadastro (`clt`, `estagio`, `pj`, `socio`) bastam, e o layout de exportação que a contabilidade de cada escritório aceita.

## Fase 7 — Ponto eletrônico, preparação para a Portaria 671/2021

1. **Comprovante de marcação** com NSR por escritório, sem lacunas (sequência própria por empregador, alocada na mesma transação da batida), data, hora, nome, CPF parcial e hash. Tela/PDF e no histórico do funcionário.
2. **Marcações imutáveis** — o original nunca é alterado nem apagado; correção vira registro de **tratamento/ajuste** ligado ao original. O lápis atual passa a criar tratamento. Gatilho no banco bloqueia `update`/`delete` em marcações.
3. **Espelho de ponto mensal** com ciência/assinatura do funcionário (PIN).
4. **AFD/AEJ** — somente depois de conferir o leiaute vigente na Portaria e anexos. Sem acesso ao texto oficial, cria-se a estrutura com `TODO: validar leiaute com a fonte oficial`; **nenhum campo será inventado**.
5. **Tela "Conformidade do ponto"** listando o que o sistema cobre e o que depende da contabilidade (REP-P, registro do programa, atestado técnico).

**Risco:** NSR sem lacunas exige sequência por escritório com bloqueio; impacto de desempenho desprezível, mas é migração delicada em base com dados (será idempotente e testada com concorrência).

## Fase 8 — Aproximação com sistemas jurídicos (opcional)

1. **Apontamento de horas** — `clientes`, `processos` (número CNJ validado por dígito verificador, área, cliente, responsável) e `apontamentos` (funcionário, processo, data, minutos, descrição); pode partir das marcações do dia. Relatório por processo e por cliente. A gerência vê horas, **não valores**.
2. **Agenda de audiências e diligências** ligada às ocorrências `audiencia_externa`: lançar a audiência já abona o dia do responsável; calendário semanal.
3. **Integração com a contabilidade** (exportação da Fase 6) como terceiro passo.

**Ordem sugerida:** 6 → 7 → 8. A Fase 7 é a mais sensível e merece revisão jurídica antes de ir à produção.
