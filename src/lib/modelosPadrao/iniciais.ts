import { ENCERRAMENTO, ENDERECAMENTO, PROVAS_E_VALOR, modelo } from './tipos';

export const INICIAIS = [
  modelo('Petição inicial cível (procedimento comum)', 'iniciais', 'civel', 'Estrutura da petição inicial conforme o art. 319 do CPC, com pedidos, provas, valor da causa e opção pela audiência de conciliação.', `
${ENDERECAMENTO}

~ **{{cliente.nome}}**, {{cliente.qualificacao}}, vem, por seu(sua) advogado(a) que esta subscreve (procuração anexa), com escritório profissional em {{escritorio.endereco|[endereço do escritório]}}, onde recebe intimações, propor a presente

# AÇÃO [DE (NATUREZA DA AÇÃO): ex.: INDENIZAÇÃO POR DANOS MORAIS E MATERIAIS] COM PEDIDO DE [TUTELA DE URGÊNCIA, se houver]

em face de **{{processo.parte_contraria|[nome/razão social do réu]}}**, [qualificação do réu: CPF/CNPJ, endereço e, se conhecido, e-mail], pelos fatos e fundamentos a seguir expostos.

## DA GRATUIDADE DA JUSTIÇA
[Usar se aplicável] O(A) Autor(a) não possui condições de arcar com as custas e despesas processuais sem prejuízo do próprio sustento e de sua família, razão pela qual requer a concessão dos benefícios da gratuidade da justiça (CPC, arts. 98 e 99, § 3º), conforme declaração anexa.

## DOS FATOS
[Narrar os fatos em ordem cronológica, de forma clara e objetiva: quem, o quê, quando, onde e como. Identificar os documentos que comprovam cada fato (Doc. 01, Doc. 02…).]

## DO DIREITO
[Fundamentar a pretensão: normas aplicáveis, jurisprudência e doutrina pertinentes, relacionando-as aos fatos. Se houver relação de consumo, invocar a Lei nº 8.078/1990 (CDC), inclusive a inversão do ônus da prova (art. 6º, VIII) e a responsabilidade objetiva (arts. 12 e 14).]

## DA TUTELA DE URGÊNCIA
[Usar se aplicável] Estão presentes a probabilidade do direito e o perigo de dano ou o risco ao resultado útil do processo (CPC, art. 300): [demonstrar]. Requer-se, portanto, [descrever a medida].

## DA AUDIÊNCIA DE CONCILIAÇÃO
Nos termos do art. 319, VII, do CPC, o(a) Autor(a) manifesta seu [interesse / desinteresse] na realização da audiência de conciliação ou de mediação.

## DOS PEDIDOS
Ante o exposto, requer:
- a) [a concessão da gratuidade da justiça];
- b) a citação do(a) Réu(Ré) para, querendo, contestar a presente ação, sob pena de revelia e confissão quanto à matéria de fato;
- c) [a concessão da tutela de urgência, nos termos acima];
- d) [a inversão do ônus da prova];
- e) a procedência dos pedidos para [condenar o(a) Réu(Ré) a: ______ ];
- f) a condenação do(a) Réu(Ré) ao pagamento das custas processuais e dos honorários advocatícios, nos termos do art. 85 do CPC.

${PROVAS_E_VALOR}

${ENCERRAMENTO}
`),
  modelo('Ação de indenização por danos morais e materiais (consumidor)', 'iniciais', 'civel', 'Inicial com base no CDC: falha na prestação de serviço ou defeito do produto, inversão do ônus da prova e dano moral.', `
${ENDERECAMENTO}

~ **{{cliente.nome}}**, {{cliente.qualificacao}}, vem, por seu(sua) advogado(a), propor a presente

# AÇÃO DE INDENIZAÇÃO POR DANOS MORAIS E MATERIAIS

em face de **{{processo.parte_contraria|[razão social do fornecedor]}}**, [CNPJ e endereço], pelas razões de fato e de direito a seguir.

## DA GRATUIDADE DA JUSTIÇA
[Usar se aplicável: CPC, arts. 98 e 99, § 3º.]

## DOS FATOS
O(A) Autor(a) é consumidor(a) final, nos termos do art. 2º do CDC. Em [data], [descrever a contratação/compra do produto ou serviço e o valor pago]. Ocorre que [descrever o defeito, a cobrança indevida, a negativação, o cancelamento ou a falha na prestação do serviço]. O(A) Autor(a) tentou resolver a questão administrativamente, conforme protocolos [números] e comunicações anexas (Docs. __), sem sucesso.

## DO DIREITO
**Da relação de consumo e da responsabilidade objetiva.** O(A) Réu(Ré) é fornecedor(a) (CDC, art. 3º) e responde, independentemente de culpa, pelos danos causados por defeitos na prestação dos serviços ou nos produtos (CDC, arts. 12 e 14).

**Da inversão do ônus da prova.** Presentes a verossimilhança das alegações e a hipossuficiência técnica do consumidor, requer-se a inversão do ônus da prova (CDC, art. 6º, VIII).

**Do dano material.** [Demonstrar os valores efetivamente despendidos ou perdidos, com os comprovantes.] Quando cabível, a repetição do indébito em dobro (CDC, art. 42, parágrafo único).

**Do dano moral.** [Demonstrar a violação a direito da personalidade, a frustração, o tempo despendido e a gravidade da conduta.] Na fixação do valor, requer-se que sejam observados os critérios de razoabilidade, o caráter compensatório e pedagógico da condenação e a capacidade econômica do(a) Réu(Ré).

## DOS PEDIDOS
Requer:
- a) a gratuidade da justiça [se aplicável];
- b) a citação do(a) Réu(Ré) e a inversão do ônus da prova;
- c) a procedência do pedido para condenar o(a) Réu(Ré) a pagar **danos materiais de [valor]**, acrescidos de correção monetária e juros desde o desembolso;
- d) a condenação ao pagamento de **danos morais no valor de [valor]**, com correção monetária desde o arbitramento e juros de mora desde o evento danoso;
- e) a condenação em custas e honorários advocatícios.

${PROVAS_E_VALOR}

${ENCERRAMENTO}
`),
  modelo('Ação de cobrança', 'iniciais', 'civel', 'Inicial de cobrança de dívida sem título executivo (CPC, art. 319), com demonstrativo do débito.', `
${ENDERECAMENTO}

~ **{{cliente.nome}}**, {{cliente.qualificacao}}, vem, por seu(sua) advogado(a), propor a presente

# AÇÃO DE COBRANÇA

em face de **{{processo.parte_contraria|[nome do devedor]}}**, [qualificação e endereço], pelos fatos e fundamentos seguintes.

## DOS FATOS
Em [data], as partes [celebraram contrato / ajustaram verbalmente / ocorreu a prestação do serviço ou venda] de [objeto], pelo valor de [valor], com vencimento em [data(s)]. O(A) Autor(a) cumpriu integralmente a sua parte, conforme [documentos: contrato, notas fiscais, comprovantes, conversas]. O(A) Réu(Ré), contudo, não pagou o valor ajustado, permanecendo inadimplente desde [data], mesmo após [notificação/cobranças em ___].

## DO DIREITO
O inadimplemento da obrigação enseja o pagamento do débito acrescido de correção monetária, juros de mora e [multa contratual] (Código Civil, arts. 389, 395 e 397). [Se houver contrato: cláusula nº __ prevê multa de __% e juros de __% ao mês.]

## DO DEMONSTRATIVO DO DÉBITO
- Valor principal: [valor] (vencimento em [data]);
- Correção monetária: [índice] desde [data];
- Juros de mora: [taxa], desde [data];
- Multa: [percentual], se prevista;
- **Total atualizado em {{data.hoje}}: [valor]** (planilha anexa – Doc. __).

## DA AUDIÊNCIA DE CONCILIAÇÃO
O(A) Autor(a) manifesta seu [interesse / desinteresse] na audiência de conciliação (CPC, art. 319, VII).

## DOS PEDIDOS
Requer: a) a citação do(a) Réu(Ré); b) a procedência do pedido para condená-lo(a) ao pagamento de [valor total], acrescido de correção monetária e juros até o efetivo pagamento; c) a condenação em custas e honorários advocatícios (CPC, art. 85, § 2º).

${PROVAS_E_VALOR}

${ENCERRAMENTO}
`),
  modelo('Reclamação trabalhista', 'iniciais', 'trabalhista', 'Reclamação trabalhista com pedidos líquidos e valor da causa (CLT, art. 840, § 1º), com roteiro de verbas rescisórias, horas extras e FGTS.', `
>> **EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DO TRABALHO DA [número] VARA DO TRABALHO DE [cidade] – TRT DA 16ª REGIÃO**

~ **{{cliente.nome}}**, {{cliente.qualificacao}}, CTPS nº [número] série [série], PIS [número], vem, por seu(sua) advogado(a), com procuração anexa, ajuizar a presente

# RECLAMAÇÃO TRABALHISTA
# (RITO [ORDINÁRIO / SUMARÍSSIMO])

em face de **{{processo.parte_contraria|[razão social da empresa reclamada]}}**, CNPJ [número], com sede em [endereço], pelos motivos a seguir.

## DA GRATUIDADE DA JUSTIÇA
O(A) Reclamante declara que não possui condições de arcar com as custas do processo sem prejuízo do próprio sustento e de sua família, requerendo os benefícios da justiça gratuita (CLT, art. 790, §§ 3º e 4º), conforme declaração anexa.

## DO CONTRATO DE TRABALHO
O(A) Reclamante foi admitido(a) em [data de admissão], na função de [função], com salário de [valor] mensais, [pago em ___], tendo sido [dispensado(a) sem justa causa / pedido de demissão / rescisão indireta] em [data]. Jornada: [descrever horário, intervalos e dias]. [O contrato foi / não foi registrado na CTPS pelo período correto.]

## DOS FATOS E FUNDAMENTOS
**1. [Verba/direito 1: ex.: Horas extras e reflexos].** [Narrar os fatos, a jornada efetivamente cumprida, a ausência de pagamento e os fundamentos (CLT, arts. 58, 59 e 74; CF, art. 7º, XVI). Pedir a exibição dos controles de ponto (CLT, art. 74, § 2º) e a inversão do ônus da prova se não forem apresentados.]

**2. [Verba/direito 2: ex.: Verbas rescisórias e multa do art. 477, § 8º, da CLT].** [Narrar.]

**3. [Verba/direito 3: ex.: Depósitos do FGTS e multa de 40%].** [Narrar.]

**4. [Outros: adicional de insalubridade/periculosidade, equiparação, danos morais, vínculo empregatício, acúmulo de função etc.]**

## DOS PEDIDOS
Com base no art. 840, § 1º, da CLT, indicam-se os pedidos com o respectivo valor, **estimado** por cálculo anexo (Doc. __):
- a) [Pedido 1] – R$ [valor];
- b) [Pedido 2] – R$ [valor];
- c) [Pedido 3] – R$ [valor];
- d) a gratuidade da justiça;
- e) a condenação da Reclamada em honorários de sucumbência (CLT, art. 791-A), custas e demais cominações legais;
- f) a notificação da Reclamada para comparecer à audiência e apresentar defesa, sob pena de revelia e confissão ficta.

## DAS PROVAS
Protesta provar o alegado por todos os meios admitidos, em especial documental, testemunhal e depoimento pessoal do(a) representante da Reclamada, requerendo a juntada dos documentos que sustentam a ação.

## DO VALOR DA CAUSA
Dá-se à causa o valor de **{{processo.valor_causa|[soma dos pedidos]}}** ({{processo.valor_causa_extenso|[valor por extenso]}}).

~ Nestes termos,
~ pede deferimento.
<< {{escritorio.cidade|[cidade]}}/MA, {{data.extenso}}.
<< **{{advogado.nome}}**
<< {{advogado.oab}}
`),
  modelo('Ação de alimentos', 'iniciais', 'familia', 'Ação de alimentos com pedido de alimentos provisórios (Lei 5.478/1968; CPC, arts. 693 e seguintes).', `
>> **EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DE DIREITO DA VARA DE FAMÍLIA DA COMARCA DE [comarca] – ESTADO DO MARANHÃO**

~ **{{cliente.nome}}**, {{cliente.qualificacao}}, [representado(a)/assistido(a) por sua genitora, quando menor], vem, por seu(sua) advogado(a), propor a presente

# AÇÃO DE ALIMENTOS COM PEDIDO DE ALIMENTOS PROVISÓRIOS

em face de **{{processo.parte_contraria|[nome do alimentante]}}**, [qualificação e endereço], pelas razões a seguir.

## DOS FATOS
O(A) Autor(a) é filho(a) do Réu, conforme certidão de nascimento anexa. O Réu [não contribui / contribui de forma insuficiente] para o sustento do(a) Autor(a), que tem [idade] anos e vive sob a guarda de [nome]. As despesas mensais do(a) Autor(a) somam **R$ [valor]**, assim distribuídas: moradia R$ [ ], alimentação R$ [ ], saúde R$ [ ], educação R$ [ ], vestuário R$ [ ], lazer R$ [ ] (documentos anexos).

O Réu exerce a atividade de [profissão/empresa], percebendo, ao que consta, renda de aproximadamente R$ [valor] [ou: o Réu possui os seguintes sinais exteriores de riqueza: ___].

## DO DIREITO
O dever de sustento decorre do poder familiar (Código Civil, art. 1.566, IV, e art. 1.634, I; Constituição Federal, art. 229) e os alimentos devem ser fixados na proporção das necessidades de quem os recebe e dos recursos de quem os presta (Código Civil, art. 1.694, § 1º). A Lei nº 5.478/1968 autoriza a fixação de alimentos provisórios desde o despacho inicial, desde que haja prova do parentesco ou da obrigação de alimentar (arts. 2º e 4º).

## DOS ALIMENTOS PROVISÓRIOS
Requer-se a fixação de alimentos provisórios no valor de **[percentual]% dos rendimentos líquidos do Réu** [ou R$ valor], com desconto em folha de pagamento [ou pagamento até o dia __ de cada mês, mediante depósito na conta nº __].

## DOS PEDIDOS
a) a concessão da gratuidade da justiça; b) a fixação dos alimentos provisórios; c) a citação do Réu para comparecer à audiência de conciliação e apresentar defesa; d) a procedência do pedido, para tornar definitivos os alimentos no patamar de [percentual/valor], incluindo [13º salário, plano de saúde, despesas escolares]; e) a intimação do Ministério Público; f) a condenação do Réu em custas e honorários.

${PROVAS_E_VALOR}

${ENCERRAMENTO}
`),
  modelo('Mandado de segurança', 'iniciais', 'administrativo', 'Mandado de segurança individual (Lei 12.016/2009), com ato coator, direito líquido e certo e pedido de liminar.', `
>> **EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DE DIREITO DA [vara] / DESEMBARGADOR(A) PRESIDENTE DO [órgão competente]**

~ **{{cliente.nome}}**, {{cliente.qualificacao}}, vem, por seu(sua) advogado(a), com fundamento no art. 5º, LXIX, da Constituição Federal e na Lei nº 12.016/2009, impetrar

# MANDADO DE SEGURANÇA COM PEDIDO DE LIMINAR

contra ato do(a) **[autoridade coatora: cargo e nome]**, vinculado(a) a **[pessoa jurídica de direito público]**, pelos fundamentos a seguir.

## DO ATO COATOR E DA TEMPESTIVIDADE
O ato impugnado consiste em [descrever o ato ou omissão ilegal ou abusiva], praticado em [data]. A impetração é tempestiva, pois ajuizada dentro do prazo de 120 (cento e vinte) dias previsto no art. 23 da Lei nº 12.016/2009.

## DOS FATOS
[Narrar objetivamente, com prova documental pré-constituída de cada fato, pois o mandado de segurança não admite dilação probatória.]

## DO DIREITO LÍQUIDO E CERTO
[Demonstrar a norma violada e a plausibilidade jurídica, relacionando-a aos documentos juntados (Docs. __).]

## DA LIMINAR
Presentes o *fumus boni iuris* e o *periculum in mora* (Lei nº 12.016/2009, art. 7º, III): [demonstrar a relevância do fundamento e o risco de ineficácia da medida se concedida apenas ao final]. Requer-se a suspensão dos efeitos do ato coator até o julgamento final.

## DOS PEDIDOS
a) a concessão de liminar, nos termos acima; b) a notificação da autoridade coatora para prestar informações em 10 dias (art. 7º, I); c) a ciência ao órgão de representação judicial da pessoa jurídica (art. 7º, II); d) a oitiva do Ministério Público; e) a concessão definitiva da segurança para [descrever o provimento]. Sem honorários de sucumbência (Lei nº 12.016/2009, art. 25).

Dá-se à causa o valor de **{{processo.valor_causa|[valor da causa]}}**.

${ENCERRAMENTO}
`),
];
