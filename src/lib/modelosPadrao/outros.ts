import { ENCERRAMENTO, modelo } from './tipos';

const CAB = `>> **EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DE DIREITO DA {{processo.vara|[vara/juízo]}}**
~ **Processo nº {{processo.numero|[número do processo]}}**`;

export const EXECUCAO = [
  modelo('Requerimento de cumprimento de sentença (quantia certa)', 'execucao', 'civel', 'Requerimento de cumprimento de sentença que reconhece obrigação de pagar (CPC, arts. 523 e 524), com demonstrativo do débito.', `
${CAB}

~ **{{cliente.nome}}**, {{cliente.qualificacao}}, exequente nos autos em que contende com **{{processo.parte_contraria|[executado]}}**, vem, por seu(sua) advogado(a), com fundamento nos arts. 513 e 523 e seguintes do CPC, requerer o

# CUMPRIMENTO DE SENTENÇA

## DO TÍTULO
A sentença/acórdão [de fls. __ / ID __] transitou em julgado em [data] e condenou o(a) Executado(a) a [obrigação], impondo ainda honorários de [__%].

## DO DEMONSTRATIVO DO DÉBITO (CPC, art. 524)
- Nome e CPF/CNPJ das partes: {{cliente.nome}} e [executado];
- Índice de correção monetária e termo inicial: [índice], desde [data];
- Juros aplicados e termo inicial: [taxa], desde [data];
- Valor principal: R$ [valor];
- Honorários de sucumbência: R$ [valor];
- **Total atualizado em {{data.hoje}}: R$ [valor]** (memória de cálculo anexa – Doc. __).

## DOS PEDIDOS
Requer: a) a intimação do(a) Executado(a), na pessoa de seu advogado ou, se for o caso, pessoalmente, para **pagar o débito no prazo de 15 (quinze) dias úteis**, sob pena de multa de 10% e honorários de 10% (CPC, art. 523, § 1º); b) não efetuado o pagamento, a expedição de mandado de penhora e avaliação e a realização de **penhora on-line (SISBAJUD)** e demais medidas executivas típicas e atípicas (CPC, arts. 523, § 3º, 139, IV, e 854); c) a consulta aos sistemas conveniados para localização de bens.

${ENCERRAMENTO}
`),
  modelo('Embargos à execução de título extrajudicial', 'execucao', 'civel', 'Embargos do executado (CPC, arts. 914 a 920). Prazo-base: 15 dias úteis, contados da juntada do comprovante de citação.', `
${CAB}

~ **{{cliente.nome}}**, {{cliente.qualificacao}}, executado(a) na ação de execução que lhe move **{{processo.parte_contraria|[exequente]}}**, vem, por seu(sua) advogado(a), opor

# EMBARGOS À EXECUÇÃO

com fundamento nos arts. 914 e seguintes do Código de Processo Civil, distribuindo-os por dependência aos autos principais (art. 914, § 1º).

## DA TEMPESTIVIDADE
O prazo de 15 (quinze) dias úteis (CPC, art. 915) teve início com a juntada aos autos do comprovante da citação em [data], e se encerra em [data]. Os embargos independem de penhora, depósito ou caução (art. 914, *caput*).

## DAS MATÉRIAS (CPC, art. 917)
[Selecionar:]
- inexequibilidade do título ou inexigibilidade da obrigação;
- penhora incorreta ou avaliação errônea;
- excesso de execução ou cumulação indevida de execuções (neste caso, **declarar o valor que entende correto e juntar o demonstrativo** – art. 917, §§ 3º e 4º, sob pena de rejeição liminar);
- retenção por benfeitorias necessárias ou úteis;
- incompetência absoluta ou relativa do juízo da execução;
- qualquer matéria que lhe seria lícito deduzir como defesa em processo de conhecimento.

## DO MÉRITO
[Desenvolver as teses, com as provas.]

## DO EFEITO SUSPENSIVO
[Se pretendido] Requer-se a atribuição de efeito suspensivo (CPC, art. 919, § 1º), **garantido o juízo** por penhora, depósito ou caução suficientes, presentes a probabilidade do direito e o perigo de dano.

## DOS PEDIDOS
a) o recebimento dos embargos; b) [o efeito suspensivo]; c) a intimação do embargado para impugnação em 15 dias (art. 920, I); d) a procedência para [extinguir a execução / reduzir o débito a R$ ___]; e) a condenação do embargado em custas e honorários.

${ENCERRAMENTO}
`),
];

export const EXTRAJUDICIAL = [
  modelo('Notificação extrajudicial', 'extrajudicial', null, 'Notificação extrajudicial formal, para constituir em mora, exigir cumprimento ou comunicar fato (Código Civil, art. 397, parágrafo único).', `
# NOTIFICAÇÃO EXTRAJUDICIAL

**NOTIFICANTE:** {{cliente.qualificacao}}, representado(a) por seu(sua) advogado(a), {{advogado.nome}}, {{advogado.oab}}.

**NOTIFICADO(A):** {{processo.parte_contraria|[nome e qualificação do notificado]}}.

Pela presente, **NOTIFICAMOS** V.Sa. do que segue:

## 1. DOS FATOS
[Narrar objetivamente: a relação entre as partes, o contrato ou o fato, as datas, os valores e a conduta que motiva a notificação.]

## 2. DA FUNDAMENTAÇÃO
[Citar as cláusulas contratuais e as normas aplicáveis (ex.: Código Civil, arts. 389, 394, 395 e 397; CDC, quando for o caso).]

## 3. DA EXIGÊNCIA
Fica o(a) NOTIFICADO(A) **constituído(a) em mora** e instado(a) a, **no prazo de [__] dias** contados do recebimento desta, [cumprir a obrigação: pagar R$ valor / entregar ___ / abster-se de ___ / regularizar ___].

## 4. DAS CONSEQUÊNCIAS
Decorrido o prazo sem o atendimento, o NOTIFICANTE adotará as medidas judiciais cabíveis, pleiteando, além do principal, correção monetária, juros, multa contratual, custas e honorários advocatícios, e demais perdas e danos.

A presente deve ser entregue por [cartório de títulos e documentos / carta com aviso de recebimento / meio eletrônico com confirmação], para fins de comprovação da ciência.

<< {{escritorio.cidade|[cidade]}}/MA, {{data.extenso}}.

>> ______________________________________________
>> **{{advogado.nome}}** – {{advogado.oab}}
`),
  modelo('Parecer jurídico', 'extrajudicial', null, 'Estrutura de parecer jurídico escrito: consulta, fatos, análise, conclusão e ressalvas.', `
# PARECER JURÍDICO

**Consulente:** {{cliente.nome}}
**Assunto:** [assunto do parecer]
**Data:** {{data.extenso}}
**Responsável:** {{advogado.nome}} – {{advogado.oab}}

## 1. DA CONSULTA
[Reproduzir, de forma precisa, a(s) pergunta(s) formulada(s) pelo consulente.]

## 2. DOS FATOS E DOCUMENTOS ANALISADOS
Este parecer baseia-se exclusivamente nas informações e nos documentos fornecidos pelo consulente:
- [documento 1];
- [documento 2].
Eventual alteração ou omissão nos fatos informados pode modificar as conclusões.

## 3. DA ANÁLISE JURÍDICA
### 3.1 Enquadramento legal
[Normas aplicáveis: leis, decretos, resoluções, súmulas e precedentes.]
### 3.2 Aplicação ao caso concreto
[Relacionar os fatos às normas, apontando as teses favoráveis e contrárias, o grau de risco e as alternativas.]

## 4. DOS RISCOS E ALTERNATIVAS
- **Alternativa A:** [descrição] – vantagens, riscos e custos;
- **Alternativa B:** [descrição] – vantagens, riscos e custos.

## 5. DA CONCLUSÃO
[Resposta objetiva à consulta, com a recomendação do escritório.]

## 6. RESSALVAS
Este parecer reflete a legislação e a jurisprudência vigentes na data de sua emissão, tem caráter opinativo e orienta a decisão do consulente, que não constitui garantia de resultado. É de uso restrito ao consulente, protegido por sigilo profissional.

<< {{escritorio.cidade|[cidade]}}/MA, {{data.extenso}}.

>> ______________________________________________
>> **{{advogado.nome}}** – {{advogado.oab}}
`),
];

export const ACORDOS = [
  modelo('Termo de acordo extrajudicial (transação)', 'acordos', null, 'Transação extrajudicial com quitação e cláusula penal (Código Civil, arts. 840 a 850); pode ser homologada em juízo (CPC, art. 725, VIII).', `
# TERMO DE ACORDO EXTRAJUDICIAL

**PRIMEIRO(A) TRANSIGENTE:** {{cliente.qualificacao}}, assistido(a) por seu(sua) advogado(a), {{advogado.nome}}, {{advogado.oab}}.

**SEGUNDO(A) TRANSIGENTE:** {{processo.parte_contraria|[nome e qualificação]}}, assistido(a) por [advogado e OAB].

As partes, de livre e espontânea vontade, **transigem** nos seguintes termos (Código Civil, arts. 840 e seguintes):

## CLÁUSULA 1ª – DO OBJETO
O presente acordo tem por finalidade encerrar, de forma amigável, a controvérsia relativa a [descrever o litígio/relação], [sem ajuizamento de ação / pondo fim ao processo nº {{processo.numero|[nº]}}].

## CLÁUSULA 2ª – DAS OBRIGAÇÕES
[O(A) segundo(a) transigente pagará ao(à) primeiro(a) R$ valor / entregará ___ / cumprirá ___ , na forma: ___, no prazo ___.]

## CLÁUSULA 3ª – DA CLÁUSULA PENAL
O descumprimento de qualquer obrigação sujeitará o inadimplente a multa de [__%] sobre o valor do acordo, sem prejuízo de juros e correção monetária, vencendo-se antecipadamente as obrigações vincendas.

## CLÁUSULA 4ª – DA QUITAÇÃO
Cumpridas as obrigações, as partes dão-se **plena, geral e irrevogável quitação** quanto ao objeto deste acordo, renunciando a qualquer outra pretensão a ele relativa.

## CLÁUSULA 5ª – DA CONFIDENCIALIDADE E DAS DESPESAS
[As partes manterão sigilo quanto aos termos do acordo.] Cada parte arcará com os honorários de seus advogados e, quanto às custas, [rateio].

## CLÁUSULA 6ª – DA HOMOLOGAÇÃO E DO TÍTULO EXECUTIVO
O presente termo, assinado pelas partes, pelos advogados e por duas testemunhas, constitui **título executivo extrajudicial** (CPC, art. 784, III e IV), podendo ser levado à homologação judicial (CPC, art. 725, VIII).

<< {{escritorio.cidade|[cidade]}}/MA, {{data.extenso}}.

>> ______________________________  ______________________________
>> **{{cliente.nome}}**              **{{processo.parte_contraria|[segundo transigente]}}**

>> ______________________________  ______________________________
>> **{{advogado.nome}}** – {{advogado.oab}}          **[advogado]** – OAB/[UF] [nº]

~ Testemunha 1: ____________________________  CPF: ________________
~ Testemunha 2: ____________________________  CPF: ________________
`),
];

export const CLIENTE = [
  modelo('Relatório de andamento ao cliente', 'cliente', null, 'Comunicação periódica ao cliente sobre o andamento do processo, em linguagem simples (Código de Ética e Disciplina da OAB, art. 11).', `
# RELATÓRIO DE ANDAMENTO

**Cliente:** {{cliente.nome}}
**Processo:** {{processo.numero|[número do processo]}} – {{processo.vara|[vara/juízo]}}
**Assunto:** {{processo.assunto|[assunto]}}
**Data do relatório:** {{data.extenso}}

## O que aconteceu desde o último contato
[Resumir, em linguagem simples, os fatos recentes: decisões, audiências, petições protocoladas, prazos cumpridos.]

## Situação atual do processo
[Em que fase está: aguardando citação, fase de provas, aguardando sentença, fase de recurso, cumprimento de sentença etc.]

## Próximos passos e prazos
- [próximo ato] – previsão: [data];
- [outro ato] – previsão: [data].

## O que precisamos de você
- [documentos/informações a enviar] até [data];
- [comparecimento a audiência em __, às __, no local ___].

## Estimativa de andamento
[Prazo médio esperado para a próxima decisão. Lembre-se de que os prazos dependem do Judiciário e não são garantia.]

Permanecemos à disposição pelo telefone [telefone] ou pelo e-mail [e-mail].

<< **{{advogado.nome}}** – {{advogado.oab}}
<< {{escritorio.nome}}
`),
  modelo('Carta de solicitação de documentos ao cliente', 'cliente', null, 'Solicitação formal da lista de documentos necessários, com prazo e orientações de envio.', `
# SOLICITAÇÃO DE DOCUMENTOS

{{escritorio.cidade|[cidade]}}/MA, {{data.extenso}}.

Prezado(a) **{{cliente.nome}}**,

Para dar andamento ao seu caso{{processo.numero| – processo nº [número]}}, precisamos que nos envie os documentos abaixo **até [data]**:

- [documento 1];
- [documento 2];
- [documento 3].

**Como enviar:** use o link seguro que lhe encaminhamos, ou entregue cópias legíveis em nosso escritório ({{escritorio.endereco|[endereço]}}). Fotos de celular são aceitas, desde que nítidas, com todas as bordas e sem cortes.

**Importante:** a falta ou o atraso de documentos pode comprometer os prazos do processo e o resultado do caso. Em caso de dúvida, fale conosco.

Atenciosamente,

<< **{{advogado.nome}}** – {{advogado.oab}}
<< {{escritorio.nome}}
`),
  modelo('Ata de reunião com cliente', 'cliente', null, 'Registro de reunião com orientações dadas e decisões do cliente (boa prática de documentação).', `
# ATA DE REUNIÃO

**Data:** {{data.extenso}}   **Local/meio:** [escritório / videoconferência / telefone]
**Cliente:** {{cliente.nome}}
**Participantes:** [nomes e funções]
**Assunto/processo:** {{processo.numero|[assunto ou nº do processo]}}

## Pauta
- [item 1];
- [item 2].

## Resumo do que foi discutido
[Registrar informações relevantes prestadas pelo cliente e as orientações jurídicas dadas.]

## Orientações e riscos informados ao cliente
[Registrar expressamente os riscos e as alternativas explicadas, e a ausência de garantia de resultado.]

## Decisões do cliente
[Ex.: autorizou o ajuizamento / recusou o acordo / pediu prazo para decidir.]

## Providências e responsáveis
| Providência | Responsável | Prazo |
| [ação] | [nome] | [data] |

<< **{{advogado.nome}}** – {{advogado.oab}}
`),
];

export const INTERNO = [
  modelo('Ficha de atendimento (triagem)', 'interno', null, 'Ficha de primeiro atendimento, para qualificar o caso, identificar prazos e conflitos de interesse antes do contrato.', `
# FICHA DE ATENDIMENTO – TRIAGEM

**Data:** {{data.extenso}}   **Atendimento por:** {{advogado.nome}}
**Cliente:** {{cliente.nome}}   **Contato:** {{cliente.telefone|[telefone]}} · {{cliente.email|[e-mail]}}
**Como conheceu o escritório:** [indicação / internet / outro]

## 1. Resumo do caso
[Relato do cliente, em poucas linhas.]

## 2. Dados essenciais
- Parte contrária: {{processo.parte_contraria|[nome]}};
- Existe processo em andamento? [sim/não – número];
- Datas importantes (fato, notificação, citação, decisão): [datas];
- **Há prazo correndo?** [sim/não – qual e até quando];
- Valor envolvido: [estimativa].

## 3. Verificação de conflito de interesses
[Conferir se o escritório já atuou para a parte contrária ou em caso conexo – Código de Ética e Disciplina da OAB.]

## 4. Documentos disponíveis
[lista do que o cliente trouxe e do que falta]

## 5. Avaliação preliminar
- Área: [cível/trabalhista/etc.]; viabilidade: [alta/média/baixa]; risco principal: [descrever];
- Medida recomendada: [ação / defesa / acordo / parecer].

## 6. Honorários
[Proposta apresentada: valor, forma, êxito; resposta do cliente.]

## 7. Próximos passos
[ ] Contrato assinado   [ ] Procuração   [ ] Declaração LGPD   [ ] Checklist de documentos criado   [ ] Prazos lançados na agenda
`),
];
