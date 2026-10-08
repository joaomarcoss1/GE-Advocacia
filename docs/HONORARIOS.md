# Precificação de honorários

Tela **Honorários** (menu *Financeiro*, **só o administrador**: são dados financeiros do escritório).

## Como o valor é calculado
1. **Custo de 1 hora**: soma dos custos fixos mensais (aluguel, energia, água, internet, folha com encargos, pró-labore, contabilidade, sistemas, anuidades, seguros…) ÷ horas faturáveis do mês (advogados produtivos × horas por advogado).
2. **Horas do caso**: esforço-padrão do serviço (45 serviços, de consulta a júri) × complexidade (0,8 a 1,8) + 35% por instância de recurso + acompanhamento por mês de duração + horas por audiência + horas extras. Um caso de 4 meses e um de 18 meses do mesmo tipo custam diferente.
3. **Custo do caso** = horas × custo-hora + deslocamento (km × valor) + despesas absorvidas + reserva para imprevistos.
4. **Ponto de equilíbrio** = custo ÷ (1 − tributos − inadimplência). **Valor-alvo** = custo ÷ (1 − tributos − inadimplência − margem de lucro).
5. **Tabela da OAB-MA**: se o escritório preencher o mínimo do serviço, ele vira piso (multiplicado pelo *fator de mercado* da região). O sistema nunca recomenda abaixo dele e avisa quando o cálculo por custo ficaria abaixo.
6. **Faixas**: *mínimo seguro* (cobre custo + tributos + OAB), *recomendado* (com a margem desejada) e *premium* (urgência/complexidade acima do normal).
7. **Parcelamento**: o custo do dinheiro no tempo (% ao mês) entra no valor; entrada + parcelas mensais somam exatamente o total.
8. **Modalidades**: valor fechado à vista ou parcelado, entrada + êxito, somente êxito (quota litis) e por hora técnica. No êxito o percentual sai do valor-alvo ÷ (chance de êxito × proveito econômico).
9. **Sucumbência** esperada pode ser descontada (opcional). **Custas iniciais do TJMA** (3% do valor da causa, entre mínimo e máximo) são exibidas como despesa do cliente, fora dos honorários.

## Avisos automáticos
Custos não cadastrados · valor abaixo do custo ou da margem desejada · abaixo da tabela da OAB · honorários que alcançam o proveito do cliente (CED, art. 50) ou passam de 30% dele (CED, art. 49) · êxito acima de 30% · êxito com chance < 40% · caso que ocupa mais de 40% da capacidade mensal.

## Parâmetros do escritório
Custos fixos (com "Importar folha do sistema" a partir do cadastro de funcionários e "Adicionar contas comuns"), capacidade, regime tributário (Simples Anexo IV com a faixa pela receita dos 12 meses, lucro presumido, autônomo ou alíquota informada pela contabilidade), margem, inadimplência, reserva, custo do dinheiro, faixa premium, **praça** (capital, polo, interior médio/pequeno, com fator de mercado editável), esforço do caso, custas do TJMA e a **tabela de mínimos da OAB-MA**.

> A tabela da OAB-MA não vem preenchida: os valores mudam todo ano e devem vir do documento oficial vigente da Seccional. Os fatores por região e as horas-padrão por serviço são **pontos de partida editáveis**, não normas.

## Propostas
"Salvar proposta" guarda o caso, o cálculo, o cliente/processo, o valor proposto e a situação (rascunho, enviada, aceita, recusada). "Baixar proposta (Word)" gera o documento para o cliente, com escopo, valor, forma de pagamento, o que não está incluído e a ressalva de não haver garantia de resultado. Ao usar o modelo **Contrato de honorários** (tela Modelos), o administrador pode preencher valor, forma de pagamento e êxito direto de uma proposta do cliente.

## Base legal usada (conferir a redação vigente)
Estatuto da Advocacia (Lei 8.906/1994, arts. 22 a 25) · Código de Ética e Disciplina da OAB (arts. 48 a 50) · CPC art. 85 (§ 2º, § 8º, § 8º-A da Lei 14.365/2022) · CLT art. 791-A · Lei 9.099/1995 (juizados) · Lei estadual 12.193/2023 (custas do TJMA) e Lei 9.109/2009 (emolumentos) · LC 123/2006 Anexo IV · Lei 9.249/1995 e LC 116/2003 (presumido e ISS).

## Aviso
Apoio técnico: o valor final é decisão do advogado. Confirme tributos com a contabilidade, a tabela vigente da OAB-MA e as custas do TJMA.

## Banco
Migração `0011_honorarios.sql`: `honorarios_parametros` (uma linha por escritório) e `honorarios_propostas`, ambas com RLS só para o administrador e auditoria. Também corrige a exclusão de escritório vazio para incluir os modelos e os dados de honorários.
