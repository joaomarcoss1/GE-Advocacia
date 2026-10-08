import { modelo } from './tipos';

export const PROCURACOES = [
  modelo('Procuração ad judicia et extra', 'procuracoes', null, 'Procuração geral para o foro, com os poderes da cláusula ad judicia (CPC, art. 105).', `
# PROCURAÇÃO AD JUDICIA ET EXTRA

**OUTORGANTE:** {{cliente.qualificacao}}.

**OUTORGADO(A):** {{advogado.nome}}, advogado(a), inscrito(a) na {{advogado.oab}}, integrante de {{escritorio.nome}}, com escritório profissional em {{escritorio.endereco|[endereço do escritório]}}, endereço eletrônico [e-mail do advogado].

**PODERES:** pelo presente instrumento particular, o(a) OUTORGANTE nomeia e constitui o(a) OUTORGADO(A) seu(sua) procurador(a), conferindo-lhe os poderes da cláusula **ad judicia et extra**, para o foro em geral, em qualquer juízo, instância ou tribunal, podendo propor as ações competentes e defender o(a) OUTORGANTE nas contrárias, acompanhando-as até o final, praticar todos os atos do processo e requerer o que for necessário à defesa dos seus direitos e interesses, **exceto** receber citação inicial, confessar, reconhecer a procedência do pedido, transigir, desistir, renunciar ao direito sobre o qual se funda a ação, receber, dar quitação, firmar compromisso e assinar declaração de hipossuficiência econômica, atos que dependem de poderes especiais.

**OBJETO:** [descrever a causa ou o assunto: ex.: ação de indenização contra Empresa X; reclamação trabalhista contra Empresa Y].

Declara o(a) OUTORGANTE estar ciente de que o(a) advogado(a) poderá substabelecer os poderes ora conferidos, com ou sem reserva, e de que o tratamento de seus dados pessoais será realizado exclusivamente para a execução deste mandato, nos termos da Lei nº 13.709/2018 (LGPD).

<< {{escritorio.cidade|[cidade]}}/MA, {{data.extenso}}.

>> ______________________________________________
>> **{{cliente.nome}}**
`),
  modelo('Procuração com poderes especiais', 'procuracoes', null, 'Procuração com poderes especiais: receber citação, transigir, desistir, receber e dar quitação (CPC, art. 105, caput, in fine).', `
# PROCURAÇÃO COM PODERES ESPECIAIS

**OUTORGANTE:** {{cliente.qualificacao}}.

**OUTORGADO(A):** {{advogado.nome}}, advogado(a), inscrito(a) na {{advogado.oab}}, integrante de {{escritorio.nome}}, com escritório profissional em {{escritorio.endereco|[endereço do escritório]}}.

**PODERES:** o(a) OUTORGANTE nomeia e constitui o(a) OUTORGADO(A) seu(sua) procurador(a), com os poderes da cláusula **ad judicia et extra** para o foro em geral e, ainda, **poderes especiais** para **receber citação**, confessar, reconhecer a procedência do pedido, transigir, desistir, renunciar ao direito sobre o qual se funda a ação, **receber e dar quitação**, firmar compromisso, assinar declaração de hipossuficiência econômica, requerer a expedição de alvarás e o levantamento de valores, podendo ainda substabelecer, com ou sem reserva de poderes.

**OBJETO:** [descrever a causa ou o assunto].

[Atenção: os poderes de receber e dar quitação, transigir e desistir devem constar de forma expressa; mantenha-os apenas se o cliente efetivamente os autorizar.]

<< {{escritorio.cidade|[cidade]}}/MA, {{data.extenso}}.

>> ______________________________________________
>> **{{cliente.nome}}**
`),
  modelo('Substabelecimento', 'procuracoes', null, 'Substabelecimento com ou sem reserva de poderes (Lei 8.906/94, art. 26; Código de Ética e Disciplina da OAB, art. 24).', `
# SUBSTABELECIMENTO [COM / SEM] RESERVA DE PODERES

**SUBSTABELECENTE:** {{advogado.nome}}, advogado(a), inscrito(a) na {{advogado.oab}}.

**SUBSTABELECIDO(A):** [nome do advogado substabelecido], advogado(a), inscrito(a) na OAB/[UF] sob o nº [número].

Substabeleço, **[com / sem] reserva de iguais poderes**, ao(à) advogado(a) acima qualificado(a), os poderes que me foram conferidos por **{{cliente.nome}}**, nos autos do processo nº **{{processo.numero|[número do processo]}}**, em trâmite perante {{processo.vara|[vara/juízo]}}, em que contende com {{processo.parte_contraria|[parte contrária]}}.

[Se o substabelecimento for COM reserva, o advogado substabelecente permanece constituído. Se for SEM reserva, o substabelecente deixa de representar a parte e deve ser informado ao cliente (Código de Ética e Disciplina da OAB, art. 24).]

<< {{escritorio.cidade|[cidade]}}/MA, {{data.extenso}}.

>> ______________________________________________
>> **{{advogado.nome}}**
>> {{advogado.oab}}
`),
  modelo('Declaração de hipossuficiência econômica', 'procuracoes', null, 'Declaração para pedido de gratuidade da justiça (CPC, arts. 98 e 99, §§ 2º e 3º).', `
# DECLARAÇÃO DE HIPOSSUFICIÊNCIA ECONÔMICA

Eu, {{cliente.qualificacao}}, **DECLARO**, para os fins de concessão dos benefícios da gratuidade da justiça previstos nos arts. 98 e seguintes da Lei nº 13.105/2015 (Código de Processo Civil), que não possuo condições de arcar com as custas processuais, as despesas do processo e os honorários advocatícios sem prejuízo do meu sustento e de minha família.

Declaro, ainda, estar ciente de que a afirmação falsa sujeita o declarante às sanções previstas em lei, inclusive multa por litigância de má-fé e as penas do crime de falsidade ideológica, e de que o benefício pode ser revogado caso desapareçam os requisitos que o ensejaram.

<< {{escritorio.cidade|[cidade]}}/MA, {{data.extenso}}.

>> ______________________________________________
>> **{{cliente.nome}}**
`),
  modelo('Termo de consentimento para tratamento de dados (LGPD)', 'procuracoes', null, 'Termo de ciência e consentimento do cliente sobre o tratamento de dados pessoais (Lei 13.709/2018).', `
# TERMO DE CIÊNCIA E CONSENTIMENTO PARA TRATAMENTO DE DADOS PESSOAIS

**TITULAR:** {{cliente.qualificacao}}.

**CONTROLADOR:** {{escritorio.nome}}, com sede em {{escritorio.endereco|[endereço]}}.

O(A) TITULAR declara ter sido informado(a), de forma clara e prévia, de que o ESCRITÓRIO tratará seus dados pessoais (identificação, contato, documentos, informações do caso e, quando necessário ao serviço, dados sensíveis) para as seguintes finalidades: (i) prestar os serviços advocatícios contratados; (ii) cumprir obrigações legais e regulatórias, inclusive as impostas pelo Estatuto da Advocacia e pelo Código de Ética e Disciplina da OAB; (iii) exercer direitos em processos judiciais, administrativos e arbitrais; (iv) comunicar-se com o(a) TITULAR sobre o andamento do caso.

**Compartilhamento:** os dados poderão ser compartilhados apenas com o Poder Judiciário, órgãos públicos, peritos, correspondentes e prestadores de serviço estritamente necessários à execução do mandato, sempre sob dever de sigilo.

**Armazenamento e segurança:** os documentos são guardados em ambiente com controle de acesso e cópia de segurança, pelo prazo necessário ao cumprimento das finalidades e das obrigações legais.

**Direitos do titular:** o(a) TITULAR poderá solicitar, a qualquer tempo, confirmação do tratamento, acesso, correção, anonimização, portabilidade, informação sobre o compartilhamento e revogação do consentimento, observadas as hipóteses de conservação previstas em lei, pelo contato [e-mail do encarregado/responsável].

Por estar de acordo, firma o presente termo.

<< {{escritorio.cidade|[cidade]}}/MA, {{data.extenso}}.

>> ______________________________________________
>> **{{cliente.nome}}**
`),
];
