import { ENCERRAMENTO, modelo } from './tipos';

const CAB = `>> **EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DE DIREITO DA {{processo.vara|[vara/juízo]}}**
~ **Processo nº {{processo.numero|[número do processo]}}**`;

export const RECURSOS = [
  modelo('Apelação cível', 'recursos', 'civel', 'Apelação contra sentença (CPC, arts. 1.009 a 1.014). Prazo-base: 15 dias úteis. Razões dirigidas ao tribunal.', `
${CAB}

~ **{{cliente.nome}}**, {{cliente.qualificacao}}, nos autos da ação em que contende com **{{processo.parte_contraria|[parte contrária]}}**, inconformado(a) com a r. sentença de fls. [__] / ID [__], vem, por seu(sua) advogado(a), interpor

# RECURSO DE APELAÇÃO

com fundamento nos arts. 1.009 e seguintes do Código de Processo Civil, requerendo seja recebido, **intimada a parte contrária para apresentar contrarrazões** e, após, **remetidos os autos ao Egrégio Tribunal de Justiça do Estado do Maranhão**, com as razões anexas.

## DA TEMPESTIVIDADE E DO PREPARO
O recurso é tempestivo: a intimação da sentença ocorreu em [data] e o prazo de 15 (quinze) dias úteis (CPC, arts. 1.003, § 5º, e 219) se encerra em [data]. Preparo: [recolhido, conforme guia anexa (Doc. __) / dispensado por ser o(a) Apelante beneficiário(a) da gratuidade da justiça].

~ Nestes termos, pede deferimento.
<< {{escritorio.cidade|[cidade]}}/MA, {{data.extenso}}.
<< **{{advogado.nome}}** – {{advogado.oab}}

[[quebra]]
>> **RAZÕES DE APELAÇÃO**
>> **EGRÉGIO TRIBUNAL DE JUSTIÇA DO ESTADO DO MARANHÃO**
>> **COLENDA CÂMARA / EMINENTES DESEMBARGADORES**

~ **Apelante:** {{cliente.nome}}   **Apelado:** {{processo.parte_contraria|[parte contrária]}}   **Origem:** {{processo.vara|[vara]}}

## I – SÍNTESE DOS FATOS E DA SENTENÇA
[Resumir o processo e o dispositivo da sentença.]

## II – PRELIMINARES
[Nulidades, cerceamento de defesa, ausência de fundamentação (CPC, art. 489, § 1º) etc., se houver. As decisões interlocutórias não agraváveis, não impugnadas anteriormente, devem ser arguidas aqui – CPC, art. 1.009, § 1º.]

## III – DAS RAZÕES PARA A REFORMA
[Desenvolver cada fundamento do erro de julgamento (*error in judicando*) ou de procedimento (*error in procedendo*), com apoio nos autos, na lei e na jurisprudência, demonstrando como a sentença viola o direito.]

## IV – DOS PEDIDOS
Requer-se o **conhecimento e o provimento** do recurso para [reformar a sentença e julgar procedentes/improcedentes os pedidos / anular a sentença, determinando o retorno dos autos à origem], com a inversão dos ônus de sucumbência e a majoração, se for o caso, dos honorários (CPC, art. 85, § 11).

${ENCERRAMENTO}
`),
  modelo('Agravo de instrumento', 'recursos', 'civel', 'Agravo de instrumento contra decisão interlocutória do rol do art. 1.015 do CPC. Prazo-base: 15 dias úteis; interposto diretamente no tribunal.', `
>> **EXCELENTÍSSIMO(A) SENHOR(A) DESEMBARGADOR(A) PRESIDENTE DO EGRÉGIO TRIBUNAL DE JUSTIÇA DO ESTADO DO MARANHÃO**

~ **Agravante:** {{cliente.nome}}, {{cliente.qualificacao}}.
~ **Agravado:** {{processo.parte_contraria|[parte contrária]}}.
~ **Processo de origem nº** {{processo.numero|[número do processo]}} – {{processo.vara|[vara/juízo]}}.

~ **{{cliente.nome}}**, por seu(sua) advogado(a), inconformado(a) com a r. decisão interlocutória proferida em [data], que [resumir o que foi decidido], vem interpor

# AGRAVO DE INSTRUMENTO [COM PEDIDO DE EFEITO SUSPENSIVO / TUTELA ANTECIPADA RECURSAL]

com fundamento nos arts. 1.015 e seguintes do CPC.

## DO CABIMENTO E DA TEMPESTIVIDADE
A decisão agravada trata de matéria prevista no art. 1.015, inciso [__], do CPC. O recurso é tempestivo: a intimação ocorreu em [data] e o prazo de 15 (quinze) dias úteis se encerra em [data]. Preparo: [guia anexa / gratuidade deferida].

## DO ATENDIMENTO AO ART. 1.016 E AO ART. 1.017 DO CPC
**Nomes e endereços dos advogados:** Agravante – {{advogado.nome}}, {{advogado.oab}}, {{escritorio.endereco|[endereço]}}; Agravado – [nome, OAB e endereço].
**Peças obrigatórias (art. 1.017, I):** cópia da petição inicial, da contestação, da petição que ensejou a decisão agravada, da decisão agravada, da certidão da respectiva intimação e das procurações outorgadas aos advogados do agravante e do agravado. [Se algum documento obrigatório for inexistente, declarar essa circunstância – art. 1.017, II.]

## DOS FATOS E DA DECISÃO AGRAVADA
[Resumir.]

## DO DIREITO
[Demonstrar o erro da decisão com fundamentos jurídicos e jurisprudência.]

## DO EFEITO SUSPENSIVO / TUTELA ANTECIPADA RECURSAL
Presentes a probabilidade de provimento do recurso e o risco de dano grave, de difícil ou impossível reparação (CPC, art. 1.019, I): [demonstrar]. Requer-se, portanto, [a suspensão da decisão / a antecipação da tutela recursal para ___].

## DOS PEDIDOS
a) o recebimento do agravo e a concessão do efeito suspensivo/tutela antecipada recursal; b) a intimação do agravado para contrarrazões (art. 1.019, II); c) o provimento do recurso para reformar a decisão agravada, [determinar ___].

${ENCERRAMENTO}
`),
  modelo('Embargos de declaração', 'recursos', null, 'Embargos de declaração contra decisão com omissão, contradição, obscuridade ou erro material (CPC, arts. 1.022 a 1.026). Prazo-base: 5 dias úteis.', `
${CAB}

~ **{{cliente.nome}}**, {{cliente.qualificacao}}, nos autos do processo em epígrafe, vem, por seu(sua) advogado(a), com fundamento no art. 1.022 do Código de Processo Civil, opor

# EMBARGOS DE DECLARAÇÃO

em face da r. [sentença/decisão/acórdão] de [data / ID], pelas razões a seguir.

## DA TEMPESTIVIDADE
Os embargos são opostos no prazo de 5 (cinco) dias úteis (CPC, art. 1.023), contados da intimação, ocorrida em [data].

## DO CABIMENTO E DOS VÍCIOS
[Indicar apenas os vícios existentes, demonstrando-os com precisão:]
- **Omissão** (CPC, art. 1.022, II, e art. 1.022, parágrafo único): a decisão deixou de se manifestar sobre [ponto/tese/pedido suscitado], [ou incorreu em qualquer das hipóteses do art. 489, § 1º];
- **Contradição** (art. 1.022, I): [apontar os trechos que se contradizem];
- **Obscuridade** (art. 1.022, I): [apontar o trecho ininteligível];
- **Erro material** (art. 1.022, III): [apontar o erro: nome, número, cálculo].

## DOS PEDIDOS
Requer: a) o conhecimento e o acolhimento dos embargos, para [sanar a omissão/contradição/obscuridade/erro e, se for o caso, atribuir efeitos modificativos ao julgado – com prévia intimação da parte contrária (CPC, art. 1.023, § 2º)]; b) o reconhecimento de que a oposição dos embargos **interrompe o prazo** para a interposição de outros recursos (CPC, art. 1.026).

${ENCERRAMENTO}
`),
  modelo('Recurso ordinário trabalhista', 'recursos', 'trabalhista', 'Recurso ordinário contra sentença na Justiça do Trabalho (CLT, art. 895). Prazo-base: 8 dias úteis.', `
>> **EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DA [número] VARA DO TRABALHO DE [cidade]**
~ **Processo nº {{processo.numero|[número do processo]}}**

~ **{{cliente.nome}}**, {{cliente.qualificacao}}, [Reclamante/Reclamada] nos autos da reclamação trabalhista movida por/em face de **{{processo.parte_contraria|[parte contrária]}}**, inconformado(a) com a r. sentença, vem, por seu(sua) advogado(a), interpor

# RECURSO ORDINÁRIO

com fundamento no art. 895, I, da CLT, requerendo seja recebido e remetido ao Egrégio Tribunal Regional do Trabalho da 16ª Região, **após a intimação da parte contrária para contrarrazões**, com as razões anexas.

## DA TEMPESTIVIDADE E DO PREPARO
O recurso é tempestivo: o prazo é de 8 (oito) dias úteis (Lei nº 5.584/1970, art. 6º; CLT, art. 775), contados da intimação em [data]. [Se Reclamada:] **Preparo:** custas de R$ [valor] (guia anexa – Doc. __) e **depósito recursal** de R$ [valor] (CLT, art. 899, §§ 1º e 4º; guia anexa – Doc. __) [ou: isenção/gratuidade/benefício da justiça gratuita – CLT, art. 899, § 10]. [Se Reclamante beneficiário da justiça gratuita: dispensado de custas e depósito.]

~ Nestes termos, pede deferimento.
<< {{escritorio.cidade|[cidade]}}/MA, {{data.extenso}}.
<< **{{advogado.nome}}** – {{advogado.oab}}

[[quebra]]
>> **RAZÕES DE RECURSO ORDINÁRIO**
>> **EGRÉGIO TRIBUNAL REGIONAL DO TRABALHO DA 16ª REGIÃO**

## I – SÍNTESE DA SENTENÇA
[Resumir os pedidos e o dispositivo.]

## II – PRELIMINARES
[Nulidade por cerceamento de defesa, negativa de prestação jurisdicional etc., se houver.]

## III – MÉRITO RECURSAL
**1. [Capítulo da sentença impugnado].** [Demonstrar o erro, com remissão às provas dos autos (depoimentos, documentos), à lei e à jurisprudência/súmulas do TST aplicáveis.]
**2. [Capítulo 2].**
**Dos honorários de sucumbência (CLT, art. 791-A).** [Impugnar a fixação, o percentual ou a condenação do beneficiário da justiça gratuita, se for o caso.]

## IV – PEDIDOS
Requer-se o conhecimento e o provimento do recurso para [reformar a sentença no(s) capítulo(s) ___ e julgar ___].

${ENCERRAMENTO}
`),
  modelo('Contrarrazões de apelação', 'recursos', 'civel', 'Contrarrazões ao recurso de apelação (CPC, art. 1.010, § 1º). Prazo-base: 15 dias úteis.', `
${CAB}

~ **{{cliente.nome}}**, {{cliente.qualificacao}}, apelado(a) nos autos da ação em que contende com **{{processo.parte_contraria|[apelante]}}**, vem, por seu(sua) advogado(a), apresentar

# CONTRARRAZÕES AO RECURSO DE APELAÇÃO

pelos motivos a seguir (CPC, art. 1.010, § 1º).

## DA TEMPESTIVIDADE
As contrarrazões são apresentadas no prazo de 15 (quinze) dias úteis, contado da intimação para esse fim (CPC, arts. 1.003, § 5º, e 219).

## PRELIMINAR DE NÃO CONHECIMENTO
[Se cabível: intempestividade, ausência de preparo, ausência de dialeticidade (o recurso não impugna os fundamentos da sentença), falta de interesse etc.]

## NO MÉRITO
[Rebater, ponto a ponto, as razões do apelante, defendendo a correção da sentença e apontando as provas e os fundamentos que a sustentam.]

## DO PEDIDO
Requer o **não conhecimento** do recurso ou, se conhecido, o seu **desprovimento**, mantendo-se integralmente a sentença, com a majoração dos honorários advocatícios recursais (CPC, art. 85, § 11).

${ENCERRAMENTO}
`),
  modelo('Agravo interno', 'recursos', null, 'Agravo interno contra decisão monocrática de relator (CPC, art. 1.021). Prazo-base: 15 dias úteis.', `
>> **EXCELENTÍSSIMO(A) SENHOR(A) DESEMBARGADOR(A) RELATOR(A)**
~ **Recurso nº [número do recurso]** – Processo de origem nº {{processo.numero|[número]}}

~ **{{cliente.nome}}**, {{cliente.qualificacao}}, por seu(sua) advogado(a), inconformado(a) com a r. decisão monocrática de [data], vem interpor

# AGRAVO INTERNO

com fundamento no art. 1.021 do Código de Processo Civil.

## DA TEMPESTIVIDADE
O recurso é tempestivo: o prazo de 15 (quinze) dias úteis (CPC, art. 1.070; art. 1.003, § 5º) teve início em [data] e se encerra em [data].

## DA DECISÃO AGRAVADA
[Resumir o que foi decidido monocraticamente.]

## DAS RAZÕES
Nos termos do art. 1.021, § 1º, do CPC, impugnam-se **especificamente os fundamentos** da decisão agravada: [demonstrar o erro, a inaplicabilidade do precedente invocado, ou a existência de questão que exige julgamento colegiado].

## DOS PEDIDOS
Requer: a) a retratação do(a) Relator(a) (art. 1.021, § 2º); b) caso mantida a decisão, a submissão do recurso ao órgão colegiado, para que seja provido, reformando-se a decisão agravada.

${ENCERRAMENTO}
`),
];
