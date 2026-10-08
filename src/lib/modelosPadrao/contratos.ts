import { modelo } from './tipos';

export const CONTRATOS = [
  modelo('Contrato de honorários advocatícios', 'contratos', null, 'Contrato de prestação de serviços advocatícios com honorários fixos, de êxito ou mistos (Lei 8.906/94, art. 22; Código de Ética e Disciplina da OAB, arts. 48 a 50).', `
# CONTRATO DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS E HONORÁRIOS

**CONTRATANTE:** {{cliente.qualificacao}}.

**CONTRATADO(A):** {{escritorio.nome}}, com sede em {{escritorio.endereco|[endereço do escritório]}}, neste ato representado(a) por {{advogado.nome}}, advogado(a) inscrito(a) na {{advogado.oab}}.

Têm entre si justo e contratado o que segue, com fundamento na Lei nº 8.906/1994 (Estatuto da Advocacia e da OAB) e no Código de Ética e Disciplina da OAB.

## CLÁUSULA 1ª – DO OBJETO
O CONTRATADO prestará ao CONTRATANTE serviços advocatícios consistentes em [descrever com precisão o serviço: ex.: patrocínio da ação de ____ contra ____, em primeira instância, incluindo a fase de conhecimento e o cumprimento de sentença]. 
**Parágrafo único.** Não estão incluídos no objeto, devendo ser objeto de novo ajuste: recursos aos tribunais superiores, ações autônomas conexas, execução de sentença [salvo se incluída acima] e demais demandas não descritas.

## CLÁUSULA 2ª – DOS HONORÁRIOS
Pelos serviços descritos, o CONTRATANTE pagará ao CONTRATADO honorários no valor de **{{honorarios.valor|[valor]}}** ({{honorarios.extenso|[valor por extenso]}}), da seguinte forma: {{honorarios.forma|[entrada e parcelas, com datas e meio de pagamento]}}.
**§ 1º** Havendo cláusula de êxito, o CONTRATADO fará jus, além do valor acima, a **{{honorarios.exito|[percentual]}}** do proveito econômico efetivamente obtido pelo CONTRATANTE, devidos quando do recebimento. A soma dos honorários contratuais não ultrapassará o proveito econômico obtido pelo CONTRATANTE (Código de Ética e Disciplina da OAB, art. 50).
**§ 2º** Os valores serão atualizados anualmente pelo [índice, ex.: IPCA], e o atraso no pagamento implicará multa de [2%] e juros de [1%] ao mês, além de correção monetária.
**§ 3º** Os honorários de sucumbência, fixados judicialmente, pertencem ao advogado (Lei nº 8.906/1994, art. 23) e **não se confundem** nem se compensam com os honorários contratuais, salvo ajuste expresso em sentido diverso.
**§ 4º** O presente contrato constitui título executivo extrajudicial (Lei nº 8.906/1994, art. 24) e poderá ser apresentado ao juízo para fins de destaque dos honorários contratuais no momento do levantamento de valores (art. 22, § 4º).

## CLÁUSULA 3ª – DAS DESPESAS
As despesas necessárias ao serviço (custas, taxas judiciárias, emolumentos, certidões, perícias, diligências, deslocamentos e cópias) **não estão incluídas** nos honorários e serão adiantadas ou reembolsadas pelo CONTRATANTE em até [5] dias após a comunicação, mediante comprovação.

## CLÁUSULA 4ª – DAS OBRIGAÇÕES DO CONTRATADO
Empregar a melhor técnica e a diligência devidas; informar o CONTRATANTE sobre o andamento do caso e sobre decisões relevantes; guardar sigilo profissional; prestar contas dos valores recebidos em seu nome; e esclarecer que **não há garantia de resultado**, por ser a advocacia atividade de meio.

## CLÁUSULA 5ª – DAS OBRIGAÇÕES DO CONTRATANTE
Fornecer, com veracidade e no prazo solicitado, as informações e os documentos necessários; comparecer aos atos do processo quando exigido; manter atualizados seus dados de contato; e pagar os honorários e as despesas nas datas ajustadas.

## CLÁUSULA 6ª – DA RESCISÃO
Qualquer das partes poderá rescindir o contrato mediante comunicação por escrito. Rescindido o contrato por iniciativa do CONTRATANTE ou por justa causa atribuída a ele, serão devidos os honorários proporcionais ao trabalho já realizado, sem prejuízo do disposto sobre honorários de êxito, que permanecem devidos sobre o resultado obtido nos atos praticados pelo CONTRATADO. O CONTRATADO que renunciar ao mandato continuará responsável pelos atos necessários a evitar prejuízo ao CONTRATANTE nos dez dias seguintes à notificação da renúncia (Lei nº 8.906/1994, art. 5º, § 3º).

## CLÁUSULA 7ª – DA PROTEÇÃO DE DADOS
As partes observarão a Lei nº 13.709/2018 (LGPD). Os dados pessoais do CONTRATANTE serão tratados apenas para a execução deste contrato e o cumprimento de obrigações legais.

## CLÁUSULA 8ª – DO FORO
Fica eleito o foro da Comarca de [comarca], Estado do Maranhão, para dirimir quaisquer controvérsias deste contrato, com renúncia a qualquer outro.

E, por estarem justos e contratados, firmam o presente em duas vias de igual teor, na presença de duas testemunhas.

<< {{escritorio.cidade|[cidade]}}/MA, {{data.extenso}}.

>> ______________________________________________
>> **CONTRATANTE – {{cliente.nome}}**

>> ______________________________________________
>> **CONTRATADO(A) – {{advogado.nome}} – {{advogado.oab}}**

~ Testemunha 1: ____________________________  CPF: ________________
~ Testemunha 2: ____________________________  CPF: ________________
`),
  modelo('Contrato de assessoria jurídica mensal (consultivo)', 'contratos', 'empresarial', 'Contrato de assessoria e consultoria jurídica contínua, com honorários mensais e escopo definido.', `
# CONTRATO DE ASSESSORIA E CONSULTORIA JURÍDICA CONTINUADA

**CONTRATANTE:** {{cliente.qualificacao}}.

**CONTRATADO(A):** {{escritorio.nome}}, com sede em {{escritorio.endereco|[endereço do escritório]}}, representado(a) por {{advogado.nome}}, {{advogado.oab}}.

## CLÁUSULA 1ª – DO OBJETO
Prestação de serviços de assessoria e consultoria jurídica preventiva e consultiva nas áreas de [áreas: ex.: contratual, trabalhista, tributária, societária], compreendendo: (a) atendimento a consultas por [telefone, e-mail e reuniões]; (b) análise e elaboração de contratos e documentos até o limite de [número] por mês; (c) acompanhamento de [rotinas/prazos]; (d) emissão de pareceres escritos até o limite de [número] por mês.
**Parágrafo único.** Não estão incluídos o patrocínio de ações judiciais, defesas administrativas e demais serviços contenciosos, que serão contratados à parte.

## CLÁUSULA 2ª – DOS HONORÁRIOS
O CONTRATANTE pagará honorários mensais de **{{honorarios.valor|[valor mensal]}}** ({{honorarios.extenso|[valor por extenso]}}), até o dia [dia] de cada mês, mediante [PIX/boleto/transferência]. As horas excedentes ao limite contratado serão cobradas a [valor] por hora, mediante prévia aprovação do CONTRATANTE. O valor será reajustado a cada 12 meses pelo [índice].

## CLÁUSULA 3ª – DAS DESPESAS
Custas, taxas, emolumentos, deslocamentos fora da comarca e outras despesas não integram os honorários e serão reembolsadas mediante comprovação.

## CLÁUSULA 4ª – DO PRAZO E DA RESCISÃO
O contrato vigora por [12] meses, a contar de {{data.hoje}}, renovando-se automaticamente por igual período, salvo denúncia por escrito com antecedência mínima de [30] dias.

## CLÁUSULA 5ª – DO SIGILO E DA PROTEÇÃO DE DADOS
O CONTRATADO guardará sigilo sobre todas as informações do CONTRATANTE, mesmo após o término do contrato, e observará a Lei nº 13.709/2018 (LGPD).

## CLÁUSULA 6ª – DO FORO
Foro da Comarca de [comarca], Estado do Maranhão.

<< {{escritorio.cidade|[cidade]}}/MA, {{data.extenso}}.

>> ______________________________________________
>> **CONTRATANTE – {{cliente.nome}}**

>> ______________________________________________
>> **CONTRATADO(A) – {{advogado.nome}} – {{advogado.oab}}**
`),
  modelo('Distrato de contrato de honorários', 'contratos', null, 'Rescisão amigável do contrato de honorários, com acerto dos valores devidos e prestação de contas.', `
# DISTRATO DE CONTRATO DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS

**CONTRATANTE:** {{cliente.qualificacao}}.
**CONTRATADO(A):** {{escritorio.nome}}, representado(a) por {{advogado.nome}}, {{advogado.oab}}.

As partes, de comum acordo, resolvem **rescindir** o contrato de prestação de serviços advocatícios firmado em [data do contrato], relativo a [objeto], nos seguintes termos:

## CLÁUSULA 1ª – DA RESCISÃO
O contrato fica rescindido a partir de {{data.hoje}}, comprometendo-se o CONTRATADO a [renunciar ao mandato / substabelecer sem reserva ao novo advogado] e a praticar, nos dez dias seguintes, os atos necessários a evitar prejuízo ao CONTRATANTE.

## CLÁUSULA 2ª – DOS HONORÁRIOS E DA PRESTAÇÃO DE CONTAS
Os honorários devidos pelo trabalho já realizado são de {{honorarios.valor|[valor]}}, a serem pagos [forma e prazo]. [Mantêm-se devidos os honorários de êxito de {{honorarios.exito|[percentual]}} sobre o proveito econômico obtido em razão dos atos praticados pelo CONTRATADO até a data deste distrato.] O CONTRATADO apresenta, neste ato, a prestação de contas dos valores recebidos em nome do CONTRATANTE: [valores ou "nada há a prestar"].

## CLÁUSULA 3ª – DA DEVOLUÇÃO DE DOCUMENTOS
O CONTRATADO devolve ao CONTRATANTE os documentos originais que lhe foram confiados, mantendo cópia pelo prazo legal.

## CLÁUSULA 4ª – DA QUITAÇÃO
Cumpridas as obrigações acima, as partes dão-se mútua quitação, nada mais tendo a reclamar uma da outra quanto ao contrato rescindido.

<< {{escritorio.cidade|[cidade]}}/MA, {{data.extenso}}.

>> ______________________________________________
>> **CONTRATANTE – {{cliente.nome}}**

>> ______________________________________________
>> **CONTRATADO(A) – {{advogado.nome}} – {{advogado.oab}}**
`),
  modelo('Recibo de honorários advocatícios', 'contratos', null, 'Recibo de pagamento de honorários (entrada, parcela ou quitação).', `
# RECIBO DE HONORÁRIOS ADVOCATÍCIOS

Recebi de **{{cliente.nome}}**, CPF/CNPJ {{cliente.documento|[CPF/CNPJ]}}, a importância de **{{honorarios.valor|[valor]}}** ({{honorarios.extenso|[valor por extenso]}}), referente a [entrada / parcela nº __ de __ / quitação] dos honorários advocatícios pactuados para [descrição do serviço / processo {{processo.numero|[nº]}}], pelo que dou plena e geral quitação do valor recebido.

~ Forma de pagamento: [PIX / transferência / dinheiro / cartão].

<< {{escritorio.cidade|[cidade]}}/MA, {{data.extenso}}.

>> ______________________________________________
>> **{{advogado.nome}}** – {{advogado.oab}}
>> {{escritorio.nome}}
`),
  modelo('Notificação de cobrança de honorários', 'contratos', null, 'Notificação extrajudicial de cobrança de honorários em atraso, com prazo para pagamento.', `
# NOTIFICAÇÃO EXTRAJUDICIAL – COBRANÇA DE HONORÁRIOS ADVOCATÍCIOS

**NOTIFICANTE:** {{escritorio.nome}}, representado(a) por {{advogado.nome}}, {{advogado.oab}}.

**NOTIFICADO(A):** {{cliente.qualificacao}}.

Pela presente, **NOTIFICAMOS** V.Sa. de que se encontra em aberto o pagamento dos honorários advocatícios pactuados no contrato firmado em [data], relativos a [serviço], no valor total de **{{honorarios.valor|[valor]}}**, referente a [parcelas em aberto, com vencimentos], acrescido de multa e juros previstos contratualmente.

Fica V.Sa. **notificado(a) a efetuar o pagamento no prazo de [5] dias** contados do recebimento desta, por [PIX/transferência — dados bancários].

Decorrido o prazo sem pagamento, adotaremos as medidas cabíveis, inclusive a execução do contrato, que constitui título executivo extrajudicial (Lei nº 8.906/1994, art. 24), sem prejuízo de requerermos os efeitos do art. 22, § 4º do mesmo diploma.

Colocamo-nos à disposição para esclarecimentos e para a formalização de eventual acordo de parcelamento.

<< {{escritorio.cidade|[cidade]}}/MA, {{data.extenso}}.

>> ______________________________________________
>> **{{advogado.nome}}** – {{advogado.oab}}
`),
];
