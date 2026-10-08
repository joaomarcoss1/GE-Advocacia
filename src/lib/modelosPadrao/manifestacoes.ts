import { ENCERRAMENTO, modelo } from './tipos';

const CAB = `>> **EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DE DIREITO DA {{processo.vara|[vara/juízo]}}**
~ **Processo nº {{processo.numero|[número do processo]}}**`;
const ABERTURA = (acao: string) => `~ **{{cliente.nome}}**, {{cliente.qualificacao}}, nos autos do processo em epígrafe que ${acao} **{{processo.parte_contraria|[parte contrária]}}**, vem, por seu(sua) advogado(a), à presença de Vossa Excelência`;

export const MANIFESTACOES = [
  modelo('Pedido de gratuidade da justiça', 'manifestacoes', null, 'Requerimento de gratuidade (CPC, arts. 98 a 102), a ser apresentado na inicial, na contestação ou a qualquer tempo.', `
${CAB}

${ABERTURA('tem relação com')}, requerer

# CONCESSÃO DOS BENEFÍCIOS DA GRATUIDADE DA JUSTIÇA

com fundamento nos arts. 98 e 99 do Código de Processo Civil.

O(A) Requerente é [profissão/situação], percebe renda mensal de aproximadamente R$ [valor], tem [número] dependentes e despesas fixas de R$ [valor] com [moradia, saúde, alimentação, educação], de modo que não possui condições de arcar com as custas, despesas processuais e honorários advocatícios sem prejuízo do sustento próprio e da família.

Presume-se verdadeira a alegação de insuficiência deduzida exclusivamente por pessoa natural (CPC, art. 99, § 3º), e o juiz somente poderá indeferir o pedido se houver nos autos elementos que evidenciem a falta dos pressupostos legais, devendo antes determinar que a parte comprove o preenchimento deles (art. 99, § 2º).

**Pedido:** a concessão da gratuidade da justiça, com a isenção de custas, taxas, emolumentos, honorários periciais e demais despesas do processo (art. 98, § 1º). Junta-se declaração de hipossuficiência [e comprovantes: contracheque, extrato do CNIS, declaração de imposto de renda, comprovante de benefício, Cadastro Único].

${ENCERRAMENTO}
`),
  modelo('Requerimento de juntada de documentos', 'manifestacoes', null, 'Petição simples de juntada de documentos e provas novos.', `
${CAB}

${ABERTURA('contende com')}, requerer a

# JUNTADA DE DOCUMENTOS

Requer a juntada aos autos dos documentos anexos, a saber:
- Doc. 01 – [descrição];
- Doc. 02 – [descrição];
- Doc. 03 – [descrição].

Os documentos [comprovam o fato ___ / respondem à manifestação de fls. __ / são novos, por terem sido obtidos apenas em ___ (CPC, art. 435, parágrafo único)], devendo-se garantir à parte contrária a oportunidade de manifestação (CPC, art. 437, § 1º).

${ENCERRAMENTO}
`),
  modelo('Pedido de dilação de prazo', 'manifestacoes', null, 'Requerimento de prorrogação de prazo processual (CPC, art. 139, VI, e art. 222, § 1º).', `
${CAB}

${ABERTURA('contende com')}, requerer a

# DILAÇÃO DO PRAZO

para [praticar o ato: ex.: apresentar contestação / manifestar-se sobre o laudo / juntar documentos], que se encerra em [data].

O pedido se justifica por [motivo concreto: ex.: necessidade de obter documentos em poder de terceiros, complexidade da matéria, impossibilidade de contato com a parte], circunstância que não decorre de desídia, conforme [documento anexo, se houver].

Requer-se a concessão de **mais [dias] dias úteis**, a contar do término do prazo originário, com fundamento no art. 139, VI, do Código de Processo Civil.

${ENCERRAMENTO}
`),
  modelo('Manifestação sobre laudo pericial', 'manifestacoes', null, 'Manifestação da parte sobre o laudo (CPC, art. 477, § 1º). Prazo-base: 15 dias úteis.', `
${CAB}

${ABERTURA('contende com')}, manifestar-se sobre o

# LAUDO PERICIAL

nos termos do art. 477, § 1º, do CPC.

## DA TEMPESTIVIDADE
A manifestação é apresentada dentro do prazo comum de 15 (quinze) dias úteis, contados da intimação em [data].

## DA ANÁLISE DO LAUDO
[Apontar, de forma objetiva: (i) a concordância com as conclusões, se houver; (ii) as inconsistências técnicas, premissas equivocadas, documentos desconsiderados ou quesitos não respondidos; (iii) a necessidade de esclarecimentos.]

## DO PARECER DO ASSISTENTE TÉCNICO
[Se houver assistente técnico, juntar o parecer – CPC, art. 477, § 1º.]

## DOS PEDIDOS
a) a intimação do perito para prestar os esclarecimentos requeridos [quesitos complementares em anexo] (CPC, art. 477, § 2º); b) [se necessário] a realização de nova perícia (CPC, art. 480); c) a homologação do laudo, quanto aos pontos incontroversos.

${ENCERRAMENTO}
`),
  modelo('Petição de acordo para homologação', 'manifestacoes', null, 'Petição conjunta de acordo, para homologação judicial (CPC, art. 487, III, "b", e art. 515, II).', `
${CAB}

~ **{{cliente.nome}}**, {{cliente.qualificacao}}, e **{{processo.parte_contraria|[parte contrária]}}**, [qualificação], partes nos autos do processo em epígrafe, vêm, por seus advogados, informar que **transigiram**, requerendo a homologação do acordo nos termos a seguir:

## CLÁUSULA 1ª – DO OBJETO
As partes ajustam que [descrever a obrigação: ex.: o(a) Réu(Ré) pagará ao(à) Autor(a) a quantia de R$ valor, a título de ___].

## CLÁUSULA 2ª – DA FORMA DE PAGAMENTO / CUMPRIMENTO
[Pagamento em __ parcelas de R$ __, vencendo-se a primeira em __ e as demais nos dias __, mediante depósito na conta __ / entrega de ___ até __.]

## CLÁUSULA 3ª – DO INADIMPLEMENTO
O atraso no pagamento de qualquer parcela implicará o vencimento antecipado das demais, multa de [__%] e juros de [__%] ao mês, podendo o credor executar o acordo.

## CLÁUSULA 4ª – DAS CUSTAS E HONORÁRIOS
[Custas divididas igualmente / pagas por ___. Cada parte arcará com os honorários de seu advogado / honorários de R$ __ a serem pagos por ___.]

## CLÁUSULA 5ª – DA QUITAÇÃO
Cumprido o acordo, as partes dão-se plena, geral e irrevogável quitação quanto ao objeto da presente ação, nada mais tendo a reclamar uma da outra.

**Requerem** a homologação do acordo, com a extinção do processo com resolução do mérito (CPC, art. 487, III, "b"), servindo a decisão homologatória como título executivo judicial (art. 515, II).

<< {{escritorio.cidade|[cidade]}}/MA, {{data.extenso}}.

>> ______________________________  ______________________________
>> **{{cliente.nome}}**              **{{processo.parte_contraria|[parte contrária]}}**

>> ______________________________  ______________________________
>> **{{advogado.nome}}** – {{advogado.oab}}          **[advogado da outra parte]** – OAB/[UF] [nº]
`),
  modelo('Manifestação sobre documentos da parte contrária', 'manifestacoes', null, 'Manifestação sobre a juntada de documentos pela parte contrária (CPC, art. 437, § 1º). Prazo-base: 15 dias úteis.', `
${CAB}

${ABERTURA('contende com')}, manifestar-se sobre os

# DOCUMENTOS JUNTADOS PELA PARTE CONTRÁRIA

nos termos do art. 437, § 1º, do CPC.

## DA TEMPESTIVIDADE
Manifestação apresentada no prazo de 15 (quinze) dias úteis, contados da intimação em [data].

## DA ANÁLISE
- **Doc. [__]:** [impugnar a autenticidade (CPC, arts. 430 e 431), a idoneidade, a pertinência ou a eficácia probatória; ou reconhecer o que é incontroverso];
- **Doc. [__]:** [idem].

## DOS PEDIDOS
Requer: a) o desentranhamento dos documentos impertinentes ou a sua desconsideração; b) [se arguida falsidade, a instauração do incidente – CPC, art. 430]; c) a produção de prova em contrário, se necessária.

${ENCERRAMENTO}
`),
];
