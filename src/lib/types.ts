import type { CategoriaDoc } from './organizacao';
/** Dias da semana como no JS Date: 0 = domingo … 6 = sábado. A escala cobre de segunda (1) a sábado (6). */
export const DIAS_ESCALA = [1, 2, 3, 4, 5, 6] as const;
export const DIA_LABEL: Record<number, string> = {
  0: 'Domingo', 1: 'Segunda', 2: 'Terça', 3: 'Quarta', 4: 'Quinta', 5: 'Sexta', 6: 'Sábado',
};
export const DIA_CURTO: Record<number, string> = { 0: 'Dom', 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb' };

export type CategoriaCargo = 'juridico' | 'gerencia' | 'administrativo' | 'estagio' | 'apoio';
export const CATEGORIA_LABEL: Record<CategoriaCargo, string> = {
  juridico: 'Jurídico',
  gerencia: 'Gerência',
  administrativo: 'Administrativo',
  estagio: 'Estágio',
  apoio: 'Apoio',
};

export interface Cargo {
  id: string;
  nome: string;
  categoria: CategoriaCargo;
  descricao: string | null;
  ativo: boolean;
}

/** Expediente de um dia da escala. Sem intervalo (campos vazios) = jornada contínua. */
export interface TurnoDia {
  ativo: boolean;
  entrada: string;
  saida_intervalo: string;
  retorno_intervalo: string;
  saida: string;
}

export interface Escala {
  id: string;
  nome: string;
  /** Chaves 1..6 (segunda a sábado). */
  dias: Record<number, TurnoDia>;
  ativo: boolean;
}

export type Vinculo = 'clt' | 'estagio' | 'pj' | 'socio';
export const VINCULO_LABEL: Record<Vinculo, string> = { clt: 'CLT', estagio: 'Estágio', pj: 'PJ / Autônomo', socio: 'Sócio' };

export interface Funcionario {
  id: string;
  nome: string;
  cpf: string | null;
  email: string | null;
  telefone: string | null;
  cargo_id: string | null;
  escala_id: string | null;
  vinculo: Vinculo;
  /** Salário mensal bruto (ou bolsa, no caso de estágio). É a base da diária. */
  salario_mensal: number;
  data_admissao: string;
  data_desligamento: string | null;
  oab: string | null;
  pix: string | null;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  tipo_conta: string | null;
  /** Diária fixa (opcional). Se preenchida, substitui o cálculo salário ÷ dias previstos. */
  diaria_fixa?: number | null;
  tem_pin: boolean;
  /** PIN antigo de 4 a 5 dígitos (redefinir). */
  pin_curto?: boolean;
  /** Somente no modo local. No Supabase o hash fica em tabela separada, nunca vai ao navegador. */
  pin_hash?: string | null;
  ativo: boolean;
  observacoes: string | null;
  created_at: string;
}

/** Visão sem dados sensíveis (salário, CPF, banco) usada pela gerência e pela tela de ponto. */
export type FuncionarioBasico = Pick<Funcionario, 'id' | 'nome' | 'cargo_id' | 'escala_id' | 'ativo' | 'data_admissao' | 'data_desligamento' | 'vinculo' | 'tem_pin'>;

export type TipoMarcacao = 'entrada' | 'saida_intervalo' | 'retorno_intervalo' | 'saida';
export const TIPO_MARCACAO_LABEL: Record<TipoMarcacao, string> = {
  entrada: 'Entrada',
  saida_intervalo: 'Saída para intervalo',
  retorno_intervalo: 'Retorno do intervalo',
  saida: 'Encerrar expediente',
};
export type StatusMarcacao = 'no_horario' | 'tolerancia' | 'atraso' | 'saida_antecipada' | 'extra' | 'manual' | 'pendente';
export type StatusAprovacao = 'aprovado' | 'pendente' | 'rejeitado';

/** Análise do administrador sobre uma justificativa (atestado) ou um atraso. */
export type StatusAnalise = 'pendente' | 'aceita' | 'recusada';
export const ANALISE_LABEL: Record<StatusAnalise, string> = { pendente: 'Em análise', aceita: 'Aceita', recusada: 'Recusada' };

export interface RegistroPonto {
  id: string;
  funcionario_id: string;
  data: string;
  tipo: TipoMarcacao;
  horario_previsto: string | null;
  /** Instante real (ISO/UTC). */
  horario_real: string;
  diferenca_minutos: number | null;
  status: StatusMarcacao;
  justificativa: string | null;
  latitude: number | null;
  longitude: number | null;
  status_aprovacao: StatusAprovacao;
  retroativo: boolean;
  motivo_rejeicao: string | null;
  aprovado_por: string | null;
  aprovado_em: string | null;
  created_at: string;
  /** Atraso / saída antecipada acima do limite: null = não precisa de análise. */
  analise?: StatusAnalise | null;
  motivo_decisao?: string | null;
  decidido_por?: string | null;
  decidido_em?: string | null;
}

export type TipoOcorrencia = 'atestado' | 'declaracao' | 'audiencia_externa' | 'folga_compensacao' | 'ferias' | 'licenca' | 'outro';
export const OCORRENCIA_LABEL: Record<TipoOcorrencia, string> = {
  atestado: 'Atestado médico',
  declaracao: 'Declaração de comparecimento',
  audiencia_externa: 'Audiência / diligência externa',
  folga_compensacao: 'Folga / banco de horas',
  ferias: 'Férias',
  licenca: 'Licença',
  outro: 'Outro',
};

/** Justifica dias sem ponto. Se `remunerado`, o dia é pago; se não, é descontado como falta. */
export interface Ocorrencia {
  id: string;
  funcionario_id: string;
  data_inicio: string;
  data_fim: string;
  tipo: TipoOcorrencia;
  remunerado: boolean;
  observacao: string | null;
  created_at: string;
  /** 'pendente' = enviada pelo funcionário, aguardando o administrador. Ausente/'aceita' = vale como abono. */
  status_analise?: StatusAnalise;
  origem?: 'painel' | 'funcionario';
  motivo_decisao?: string | null;
  decidido_em?: string | null;
}

/** Metadados de um arquivo anexado (PDF/foto). O conteúdo é buscado só quando o administrador abre. */
export interface AnexoMeta {
  id: string;
  funcionario_id: string;
  ocorrencia_id: string | null;
  registro_id: string | null;
  nome: string;
  mime: string;
  tamanho: number;
  created_at: string;
}

export type TipoFeriado = 'nacional' | 'estadual' | 'municipal' | 'facultativo' | 'recesso';
export const FERIADO_LABEL: Record<TipoFeriado, string> = {
  nacional: 'Nacional',
  estadual: 'Estadual',
  municipal: 'Municipal',
  facultativo: 'Ponto facultativo',
  recesso: 'Recesso / fechamento',
};
export interface Feriado {
  id: string;
  data: string;
  nome: string;
  tipo: TipoFeriado;
}

/** Ajuste manual da situação de um dia na folha (substitui a apuração automática do ponto). */
export type SituacaoManual = 'presente' | 'abonado' | 'falta';
export interface AjusteDia {
  id: string;
  funcionario_id: string;
  data: string;
  situacao: SituacaoManual;
  observacao: string | null;
  created_at: string;
}

export type TipoAjuste = 'adicional' | 'hora_extra' | 'desconto' | 'adiantamento';
export const AJUSTE_LABEL: Record<TipoAjuste, string> = {
  adicional: 'Adicional / bônus',
  hora_extra: 'Hora extra',
  desconto: 'Desconto',
  adiantamento: 'Adiantamento / vale',
};
export const AJUSTE_POSITIVO: Record<TipoAjuste, boolean> = { adicional: true, hora_extra: true, desconto: false, adiantamento: false };

export interface AjusteFolha {
  id: string;
  funcionario_id: string;
  /** Data de competência (define em qual folha entra). */
  data: string;
  tipo: TipoAjuste;
  valor: number;
  quantidade_horas: number | null;
  motivo: string;
  observacao: string | null;
  created_at: string;
}

export type SituacaoDia = 'presente' | 'abonado' | 'falta' | 'feriado' | 'folga' | 'futuro' | 'hoje' | 'extra' | 'fora_contrato';
export interface DetalheDia {
  data: string;
  situacao: SituacaoDia;
  /** Observação curta exibida no espelho (ex.: tipo de abono). */
  nota?: string;
  incompleto?: boolean;
  /** Situação definida manualmente (ajuste de dia). */
  manual?: boolean;
  /** Falta que veio de um atestado ainda em análise (provisória) ou recusado. */
  analise?: StatusAnalise;
  /** Atraso/saída antecipada do dia: minutos, análise e minutos efetivamente descontados. */
  atraso_min?: number;
  atraso_analise?: StatusAnalise | null;
  descontado_min?: number;
}

export type StatusFolha = 'aberta' | 'fechada' | 'paga';
export interface Folha {
  id: string;
  funcionario_id: string;
  periodo_inicio: string;
  periodo_fim: string;
  salario_mensal: number;
  valor_diaria: number;
  dias_previstos: number;
  dias_trabalhados: number;
  dias_abonados: number;
  faltas: number;
  atrasos: number;
  saidas_antecipadas: number;
  minutos_atraso: number;
  dias_extras: number;
  pendencias: number;
  horas_extras: number;
  valor_bruto: number;
  desconto_faltas: number;
  desconto_atrasos: number;
  adicionais: number;
  descontos: number;
  valor_final: number;
  status: StatusFolha;
  detalhe: DetalheDia[];
  observacoes: string | null;
  /** Obrigatório para reabrir uma folha fechada/paga; fica na auditoria. */
  motivo_reabertura?: string | null;
  reaberta_em?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConfigEscritorio {
  nome: string;
  cnpj: string;
  endereco: string;
  cidade: string;
  telefone: string;
  email: string;
  oab_sociedade: string;
}
export interface ConfigPonto {
  tolerancia_min: number;
  limite_atraso_min: number;
  geofence_ativo: boolean;
  /** Nulos até o escritório definir a localização (a cerca só pode ser ligada com local definido). */
  geofence_lat: number | null;
  geofence_lng: number | null;
  geofence_raio_m: number;
  /** Endereço do ponto central da cerca (informativo). */
  geofence_endereco: string;
}
export interface ConfigFolha {
  periodicidade: 'mensal' | 'quinzenal';
  descontar_atrasos: boolean;
  hora_extra_pct: number;
}
/** Prazos de guarda (LGPD). Valores-padrão: CONFIRMAR COM O JURÍDICO/CONTABILIDADE do escritório. */
export interface ConfigPrivacidade {
  anexos_meses: number;
  geolocalizacao_meses: number;
}
/** Automações de processos e documentos (o administrador liga e desliga em Configurações). */
export interface ConfigAutomacao {
  /** Cada andamento que exige ação (sentença, intimação, citação...) vira uma tarefa para o responsável pelo processo. */
  tarefa_andamento: boolean;
  /** Documentos recebidos são enviados sozinhos para a pasta do cliente/processo no Google Drive do escritório. */
  enviar_drive: boolean;
}
export interface Config {
  escritorio: ConfigEscritorio;
  ponto: ConfigPonto;
  folha: ConfigFolha;
  privacidade: ConfigPrivacidade;
  automacao: ConfigAutomacao;
}

/** Escritório (cliente do GE Advocacia). Cada um tem dados, usuários e fuso próprios e isolados. */
export interface EscritorioInfo { id: string; nome: string; slug: string; fuso: string }
/** Linha da lista de escritórios na área da plataforma: só contagens, nunca dados de pessoas. */
export interface EscritorioPlataforma extends EscritorioInfo {
  ativo: boolean; created_at: string; usuarios: number; admins: number; funcionarios: number;
}
export interface AcessoSensivel {
  id: string; usuario: string; anexo_id: string; funcionario_id: string | null; acao: string; origem: string | null; created_at: string;
}

export type Papel = 'admin' | 'gerente' | 'coordenador';
/** Perfil de quem entra no sistema: administrador, gerência ou coordenação de um escritório, ou a plataforma (dono do GE Advocacia). */
export type PapelSessao = Papel | 'plataforma';
export interface Usuario {
  id: string;
  email: string;
  nome: string;
  papel: Papel;
  /** Somente no modo local. */
  senha_hash?: string;
  ativo: boolean;
}

export interface Auditoria {
  id: string;
  usuario: string;
  acao: string;
  detalhe: string;
  created_at: string;
  /** Preenchidos pelos gatilhos do banco. */
  usuario_id?: string | null;
  tabela?: string | null;
  registro_id?: string | null;
  antes?: Record<string, unknown> | null;
  depois?: Record<string, unknown> | null;
}

// ---------------------------------------------------------------- delegação (tarefas, prazos, audiências, reuniões)
export type TipoTarefa = 'tarefa' | 'prazo' | 'audiencia' | 'reuniao' | 'diligencia' | 'protocolo' | 'atendimento';
export type StatusTarefa = 'a_fazer' | 'em_andamento' | 'em_revisao' | 'concluida' | 'cancelada';
export type PrioridadeTarefa = 'baixa' | 'normal' | 'alta' | 'urgente';
export type AreaJuridica = 'civel' | 'trabalhista' | 'tributario' | 'criminal' | 'familia' | 'empresarial' | 'previdenciario' | 'administrativo' | 'outro';
export interface Tarefa {
  id: string;
  tipo: TipoTarefa;
  titulo: string;
  descricao: string | null;
  prioridade: PrioridadeTarefa;
  status: StatusTarefa;
  area: AreaJuridica | null;
  /** Número CNJ já normalizado (NNNNNNN-DD.AAAA.J.TR.OOOO). */
  processo_numero: string | null;
  cliente: string | null;
  /** Instantes ISO (UTC). Em compromisso de dia inteiro, `inicio` é o começo do dia no fuso do escritório. */
  inicio: string | null;
  fim: string | null;
  dia_inteiro: boolean;
  prazo_fatal: boolean;
  lembrete_min: number;
  local: string | null;
  responsavel_id: string | null;
  revisor_id: string | null;
  participantes: string[];
  /** Processo cadastrado a que a tarefa pertence (traz número, cliente e área) e o andamento que a originou, se foi criada sozinha. */
  processo_id: string | null;
  origem_movimento_id: string | null;
  criado_por: string | null;
  criado_por_nome: string | null;
  concluida_em: string | null;
  created_at: string;
  updated_at: string;
}
export interface Andamento {
  id: string; tarefa_id: string; tipo: 'comentario' | 'status' | 'sistema'; texto: string; autor_nome: string; created_at: string;
}
/** Estado da sincronização de uma tarefa com o Google Agenda (preenchido só pela Edge Function). */
export interface SyncGoogle { tarefa_id: string; event_id: string | null; sync_em: string | null; erro: string | null }
export interface GoogleStatus {
  /** O Google Agenda está disponível nesta instalação (modo Supabase com a função publicada). */
  disponivel: boolean; conectado: boolean; email?: string | null;
}
/** Tarefa vista pelo funcionário (PIN): sem dados internos além do necessário. */
export interface TarefaFunc extends Pick<Tarefa, 'id' | 'tipo' | 'titulo' | 'descricao' | 'prioridade' | 'status' | 'area' | 'processo_numero' | 'cliente' | 'inicio' | 'fim' | 'dia_inteiro' | 'prazo_fatal' | 'local'> {
  delegado_por: string | null;
  papel: 'responsavel' | 'revisor' | 'participante';
  andamentos: { texto: string; autor: string; em: string; tipo: string }[];
}

// ---------------------------------------------------------------- clientes, processos e documentos
export type TipoPessoa = 'pf' | 'pj';
export interface Cliente {
  id: string; nome: string; tipo: TipoPessoa; documento: string | null; email: string | null; telefone: string | null; observacoes: string | null;
  /** Qualificação para procurações e peças. */
  rg?: string | null; estado_civil?: string | null; profissao?: string | null; nacionalidade?: string | null; endereco?: string | null;
  ativo: boolean; drive_folder_id?: string | null; created_at: string; updated_at: string;
}
export type SituacaoProcesso = 'ativo' | 'suspenso' | 'arquivado' | 'encerrado';
export type FaseProcesso = 'conhecimento' | 'recursal' | 'execucao' | 'encerramento';
export type PoloProcesso = 'ativo' | 'passivo' | 'terceiro';
export interface Processo {
  id: string;
  /** Número CNJ já normalizado (NNNNNNN-DD.AAAA.J.TR.OOOO). */
  numero: string;
  cliente_id: string | null; titulo: string | null; polo: PoloProcesso; parte_contraria: string | null; area: AreaJuridica | null;
  classe: string | null; assunto: string | null; orgao_julgador: string | null; tribunal: string | null; grau: string | null;
  data_ajuizamento: string | null; valor_causa: number | null; situacao: SituacaoProcesso; fase: FaseProcesso; responsavel_id: string | null;
  monitorar: boolean; sigiloso: boolean; ultima_consulta: string | null; ultima_consulta_erro: string | null; ultima_movimentacao_em: string | null;
  observacoes: string | null; created_at: string; updated_at: string;
}
export type CategoriaMovimento = 'sentenca' | 'decisao' | 'despacho' | 'intimacao' | 'citacao' | 'audiencia' | 'juntada' | 'peticao' | 'recurso' | 'transito' | 'arquivamento' | 'distribuicao' | 'conclusao' | 'outros';
export interface Movimento {
  id: string; processo_id: string; origem: 'datajud' | 'manual' | 'simulada'; codigo: number | null; nome: string; complemento: string | null; data_hora: string;
  categoria: CategoriaMovimento; exige_acao: boolean; prazo_sugerido_dias: number | null; lido: boolean; tarefa_id: string | null; criado_por_nome: string | null; created_at: string;
}
export interface ChecklistModelo {
  id: string; nome: string; area: AreaJuridica | null; itens: { nome: string; obrigatorio?: boolean }[]; ativo: boolean; created_at: string;
  /** Tipo de processo a que a lista se destina (ex.: "Reclamação trabalhista"). */
  tipo?: string | null; descricao?: string | null;
}
export type StatusItem = 'pendente' | 'recebido' | 'conferido' | 'dispensado';
export interface ChecklistItem {
  id: string; cliente_id: string | null; processo_id: string | null; nome: string; obrigatorio: boolean; status: StatusItem; observacao: string | null;
  ordem: number; recebido_em: string | null; created_at: string;
}
export type StatusIntimacao = 'nova' | 'lida' | 'tratada' | 'descartada';
/** Comunicação publicada no DJEN (CNJ) para um advogado do escritório. O conteúdo vem do tribunal e não muda; só o tratamento. */
export interface Intimacao {
  id: string; djen_id: number; hash: string | null; tribunal: string; tipo_comunicacao: string; tipo_documento: string | null; orgao: string | null; classe: string | null;
  numero_processo: string | null; processo_id: string | null; texto: string; link: string | null; data_disponibilizacao: string; meio: string | null; cancelada: boolean;
  destinatarios: { nome: string; polo: string | null }[]; advogados: { nome: string; oab: string | null; uf: string | null }[]; oab_busca: string | null;
  exige_providencia: boolean; prazo_dias: number | null; prazo_regime: 'uteis' | 'corridos' | null; prazo_fim: string | null;
  status: StatusIntimacao; responsavel_id: string | null; tarefa_id: string | null; tratada_em: string | null; tratada_por_nome: string | null; created_at: string; updated_at: string;
}
export interface IntimacoesSync { executada_em: string; oabs: string[]; novas: number; erros: number; mensagem: string | null }
export interface ResultadoIntimacoes { oabs: number; novas: number; tarefas: number; erros: number; mensagem: string }
export type StatusDrive = 'desligado' | 'pendente' | 'enviado' | 'erro';
export interface DocumentoArquivo {
  id: string; cliente_id: string; processo_id: string | null; item_id: string | null; nome: string; mime: string; tamanho: number; sha256: string | null;
  origem: 'painel' | 'link_cliente'; enviado_por_nome: string | null; conferido: boolean; conferido_em: string | null;
  drive_status: StatusDrive; drive_link: string | null; drive_erro: string | null; categoria: CategoriaDoc; created_at: string;
}
export interface LinkEnvio {
  id: string; cliente_id: string; processo_id: string | null; rotulo: string | null; expira_em: string; ativo: boolean; max_arquivos: number; usos: number; ultimo_uso: string | null; created_at: string;
}
export interface DriveStatus { disponivel: boolean; conectado: boolean; email?: string | null }
export interface ResumoDocumentos { total: number; sem_conferir: number; drive_pendente: number }
/** O que o cliente vê na página pública de envio (sem login): só a lista do que falta, nada dos demais documentos. */
export interface EnvioPublicoInfo {
  ok: true; escritorio: string; cliente: string; processo: string | null; expira_em: string; restantes: number;
  itens: { id: string; nome: string; obrigatorio: boolean; status: StatusItem }[];
}
export interface DadosConsultaProcesso {
  classe: string | null; assunto: string | null; orgao_julgador: string | null; tribunal: string | null; grau: string | null; data_ajuizamento: string | null; sigiloso: boolean;
}
export interface ResultadoConsulta { processos: number; novos: number; tarefas: number; erros: number; mensagem?: string }
