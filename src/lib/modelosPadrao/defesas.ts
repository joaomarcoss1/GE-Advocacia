import { ENCERRAMENTO, modelo } from './tipos';

const CABECALHO_PROCESSO = `>> **EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DE DIREITO DA {{processo.vara|[vara/juízo]}}**
~ **Processo nº {{processo.numero|[número do processo]}}**`;

export const DEFESAS = [
  modelo('Contestação cível', 'defesas', 'civel', 'Contestação com preliminares, impugnação específica dos fatos (CPC, arts. 335 a 342) e pedidos. Prazo-base: 15 dias úteis.', `
${CABECALHO_PROCESSO}

~ **{{cliente.nome}}**, {{cliente.qualificacao}}, já qualificado(a) nos autos da ação que lhe move **{{processo.parte_contraria|[nome do autor]}}**, vem, por seu(sua) advogado(a), apresentar

# CONTESTAÇÃO

pelos fundamentos de fato e de direito a seguir.

## DA TEMPESTIVIDADE
A presente contestação é tempestiva, pois o prazo de 15 (quinze) dias úteis (CPC, arts. 335 e 219) teve início em [data da juntada do mandado de citação / ciência] e se encerra em [data].

## DA GRATUIDADE DA JUSTIÇA
[Usar se aplicável. A pessoa natural pode requerer a gratuidade na própria contestação – CPC, art. 99.]

## SÍNTESE DA INICIAL
O(A) Autor(a) alega, em suma, que [resumir objetivamente a causa de pedir e os pedidos].

## PRELIMINARES
[Verificar, nesta ordem, as matérias do art. 337 do CPC e deixar apenas as pertinentes:]
- **Inexistência ou nulidade da citação;** incompetência absoluta e relativa; incorreção do valor da causa; inépcia da petição inicial; perempção, litispendência ou coisa julgada; conexão; incapacidade, defeito de representação ou falta de autorização; convenção de arbitragem; ausência de legitimidade ou de interesse processual; falta de caução ou de outra prestação exigida por lei; indevida concessão do benefício de gratuidade de justiça.
[Desenvolver cada preliminar suscitada, com fundamento e pedido.]

## DA PRESCRIÇÃO E DA DECADÊNCIA
[Se cabível: demonstrar o termo inicial, o prazo aplicável e o decurso. Lembrar que a prescrição é matéria de mérito.]

## DO MÉRITO
**Do ônus da impugnação especificada (CPC, art. 341).** Impugnam-se especificamente as alegações da inicial, nos seguintes termos:
- Quanto ao fato [1]: [admitir / negar / explicar];
- Quanto ao fato [2]: [admitir / negar / explicar].

[Desenvolver a tese de defesa: fatos impeditivos, modificativos ou extintivos do direito do autor; fundamentos jurídicos; jurisprudência pertinente.]

**Subsidiariamente, quanto aos valores:** [impugnar o quantum pretendido, os índices de correção e juros e a base de cálculo].

## DOS PEDIDOS
Requer: a) o acolhimento das preliminares, com a extinção do processo sem resolução do mérito (CPC, art. 485); b) no mérito, a **improcedência total** dos pedidos; c) subsidiariamente, a redução do valor pretendido nos limites acima; d) a condenação do(a) Autor(a) em custas e honorários advocatícios (CPC, art. 85); e) a produção de todas as provas em direito admitidas, em especial [documental, testemunhal, depoimento pessoal, pericial].

${ENCERRAMENTO}
`),
  modelo('Defesa trabalhista (contestação)', 'defesas', 'trabalhista', 'Defesa escrita do reclamado na Justiça do Trabalho (CLT, arts. 336 a 337 e 847), com preliminares, prescrição e impugnação dos pedidos.', `
>> **EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DA [número] VARA DO TRABALHO DE [cidade] – TRT DA 16ª REGIÃO**
~ **Processo nº {{processo.numero|[número do processo]}}**

~ **{{cliente.nome}}**, {{cliente.qualificacao}}, reclamada nos autos da reclamação trabalhista proposta por **{{processo.parte_contraria|[nome do reclamante]}}**, vem, por seu(sua) advogado(a), apresentar

# CONTESTAÇÃO

na forma e pelos fundamentos a seguir.

## PRELIMINARES
**1. [Inépcia / pedidos sem indicação de valor – CLT, art. 840, § 1º].** [Se os pedidos não foram liquidados ou estão ilíquidos, requerer a extinção sem resolução do mérito dos itens indicados – CLT, art. 840, § 3º.]
**2. [Ilegitimidade, incompetência, litispendência, coisa julgada etc.].** [Se cabível.]

## DA PRESCRIÇÃO
Argui-se a prescrição **bienal** (extinção do contrato há mais de dois anos do ajuizamento) e, sucessivamente, a **quinquenal**, para atingir as parcelas anteriores a cinco anos da data do ajuizamento (CF, art. 7º, XXIX; CLT, art. 11), [conforme datas: ajuizamento em ___; extinção em ___].

## DO CONTRATO DE TRABALHO
A Reclamada admite que o(a) Reclamante foi contratado(a) em [data], para a função de [função], com salário de [valor], rescindido em [data] por [motivo]. Nega, porém, [os demais fatos: jornada alegada, funções, valores].

## DO MÉRITO
**1. [Pedido 1: ex.: Horas extras].** [Impugnar: a jornada real, a existência de controle de ponto (CLT, art. 74, § 2º), o cumprimento de compensação ou banco de horas, os cartões de ponto anexos – Docs. __.]
**2. [Pedido 2: ex.: Verbas rescisórias].** [Demonstrar o pagamento: TRCT e comprovantes – Docs. __.]
**3. [Pedido 3: ex.: FGTS].** [Extratos – Docs. __.]
**4. [Demais pedidos].**
**Da impugnação dos cálculos.** Impugnam-se os valores indicados na inicial por não refletirem a realidade do contrato, requerendo que eventual condenação se limite aos valores efetivamente devidos e comprovados.

## DOS DOCUMENTOS
Seguem os documentos que embasam a defesa: contrato de trabalho, cartões de ponto, recibos de pagamento, TRCT, comprovantes de depósitos do FGTS, [outros].

## DOS PEDIDOS
Requer: a) o acolhimento das preliminares; b) a declaração da prescrição; c) no mérito, a **improcedência** dos pedidos; d) a condenação do(a) Reclamante em honorários de sucumbência (CLT, art. 791-A), inclusive quanto aos pedidos julgados improcedentes; e) a produção de todos os meios de prova admitidos, em especial depoimento pessoal do(a) Reclamante e prova testemunhal.

${ENCERRAMENTO}
`),
  modelo('Réplica à contestação', 'defesas', 'civel', 'Réplica do autor às defesas e preliminares (CPC, arts. 350 e 351). Prazo-base: 15 dias úteis.', `
${CABECALHO_PROCESSO}

~ **{{cliente.nome}}**, {{cliente.qualificacao}}, autor(a) nos autos da ação em epígrafe movida em face de **{{processo.parte_contraria|[nome do réu]}}**, vem, por seu(sua) advogado(a), apresentar

# RÉPLICA À CONTESTAÇÃO

pelos fundamentos a seguir.

## DA TEMPESTIVIDADE
A réplica é apresentada no prazo de 15 (quinze) dias úteis, contados da intimação para manifestação sobre a contestação (CPC, arts. 350 e 351).

## DAS PRELIMINARES
[Rebater, uma a uma, as preliminares do art. 337 do CPC suscitadas pelo réu, demonstrando por que não procedem.]

## DO MÉRITO
[Reafirmar a tese da inicial e responder aos argumentos da defesa; indicar os fatos que o réu **não impugnou especificamente** e que, por isso, se presumem verdadeiros (CPC, art. 341); apontar a contradição entre a defesa e os documentos dos autos.]

## DOS DOCUMENTOS NOVOS
[Se houver, juntar documentos em resposta aos apresentados pela defesa – CPC, art. 437, § 1º.]

## DOS PEDIDOS
Requer: a) o afastamento das preliminares; b) a procedência integral dos pedidos da inicial; c) a produção das provas já requeridas e das que se mostrarem necessárias.

${ENCERRAMENTO}
`),
  modelo('Impugnação ao cumprimento de sentença', 'defesas', 'civel', 'Impugnação do executado ao cumprimento de sentença por quantia certa (CPC, art. 525). Prazo-base: 15 dias úteis após o prazo de pagamento voluntário.', `
${CABECALHO_PROCESSO}

~ **{{cliente.nome}}**, {{cliente.qualificacao}}, executado(a) nos autos do cumprimento de sentença movido por **{{processo.parte_contraria|[nome do exequente]}}**, vem, por seu(sua) advogado(a), apresentar

# IMPUGNAÇÃO AO CUMPRIMENTO DE SENTENÇA

com fundamento no art. 525 do Código de Processo Civil.

## DA TEMPESTIVIDADE
Transcorrido o prazo de 15 (quinze) dias úteis para pagamento voluntário (CPC, art. 523), a impugnação é apresentada no prazo de mais 15 (quinze) dias úteis, independentemente de penhora ou nova intimação (CPC, art. 525, *caput*). A impugnação independe de garantia do juízo (a garantia só é exigida para o pedido de efeito suspensivo, abaixo).

## DAS MATÉRIAS ARGUIDAS (CPC, art. 525, § 1º)
[Manter apenas as pertinentes:]
- falta ou nulidade de citação, se o processo correu à revelia;
- ilegitimidade de parte;
- inexequibilidade do título ou inexigibilidade da obrigação;
- penhora incorreta ou avaliação errônea;
- **excesso de execução ou cumulação indevida de execuções**;
- incompetência absoluta ou relativa do juízo da execução;
- causa modificativa ou extintiva da obrigação, como pagamento, novação, compensação, transação ou prescrição, desde que superveniente à sentença.

## DO EXCESSO DE EXECUÇÃO
Nos termos do art. 525, §§ 4º e 5º, do CPC, o(a) Executado(a) declara que o valor correto é de **R$ [valor]**, apresentando o demonstrativo discriminado e atualizado do cálculo (Doc. __). O exequente cobra R$ [valor], diferença decorrente de [índice/juros/base de cálculo indevidos].

## DO EFEITO SUSPENSIVO
[Se pretendido] Requer-se a atribuição de efeito suspensivo, com fundamento no art. 525, § 6º, do CPC, **garantido o juízo** por [penhora / caução / depósito de R$ valor], por estarem presentes a relevância dos fundamentos e o risco de dano grave de difícil ou incerta reparação.

## DOS PEDIDOS
Requer: a) o recebimento da impugnação; b) [o efeito suspensivo]; c) a procedência da impugnação para [reconhecer o excesso e fixar o débito em R$ valor / extinguir a execução]; d) a condenação do(a) Exequente em honorários advocatícios (CPC, art. 85, § 1º).

${ENCERRAMENTO}
`),
];
