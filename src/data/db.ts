import type {
  AcessoSensivel, AjusteDia, AjusteFolha, AnexoMeta, Auditoria, Cargo, Config, ConfigPonto, EscritorioInfo, EscritorioPlataforma, Escala, Feriado,
  Folha, Funcionario, FuncionarioBasico, Ocorrencia, Papel, PapelSessao, RegistroPonto, StatusAnalise, TipoMarcacao, TipoOcorrencia, Usuario,
  Andamento, GoogleStatus, StatusTarefa, SyncGoogle, Tarefa, TarefaFunc,
  ChecklistItem, ChecklistModelo, Cliente, DadosConsultaProcesso, DocumentoArquivo, DriveStatus, EnvioPublicoInfo, LinkEnvio, Movimento, Processo, ResultadoConsulta, ResumoDocumentos,
} from '@/lib/types';
import type { PontoErro } from '@/lib/erros';
import type { CategoriaDoc } from '@/lib/organizacao';

export { PONTO_ERRO_MSG, type PontoErro } from '@/lib/erros';

export interface Crud<T extends { id: string }> {
  list(): Promise<T[]>;
  insert(row: Partial<T>): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<T>;
  remove(id: string): Promise<void>;
}
export interface FolhasRepo extends Crud<Folha> {
  /** Insere ou atualiza pela chave (funcionário, início, fim). Folhas fechadas/pagas são puladas (congeladas). */
  upsertMany(rows: Omit<Folha, 'id' | 'created_at' | 'updated_at'>[]): Promise<void>;
  /** Reabre uma folha fechada/paga. O motivo é obrigatório e fica na auditoria. Só o administrador. */
  reabrir(id: string, motivo: string): Promise<Folha>;
}

/** Quem está logado: administrador/gerência de UM escritório, ou a plataforma (sem escritório). */
export interface Sessao { id: string; email: string; nome: string; papel: PapelSessao; escritorio: EscritorioInfo | null }

export type PeriodoFechado = Pick<Folha, 'funcionario_id' | 'periodo_inicio' | 'periodo_fim' | 'status'>;
export type TipoDocumento = 'folha' | 'holerite' | 'frequencia' | 'espelho';
export interface DocumentoVerificado {
  codigo: string; tipo: TipoDocumento; titulo: string; periodo: string; resumo: Record<string, unknown>; hash: string;
  emitido_por: string; emitido_em: string; escritorio?: string;
}
export interface PessoaPonto { id: string; nome: string; cargo_nome: string | null; escala_id: string | null }
export interface ContextoPonto { ponto: ConfigPonto; escritorio_nome: string; feriado: string | null; fuso: string }

export type PontoResp<T = object> = ({ ok: true } & T) | { ok: false; erro: PontoErro; detalhe?: string | null };

/** Arquivo pronto para envio: conteúdo em base64 (sem o prefixo data:). */
export interface ArquivoAnexo { nome: string; mime: string; tamanho: number; conteudo: string }
/** Resultado de abrir um anexo: endereço temporário (URL assinada de 60 s ou blob local) para visualizar/baixar. */
export interface AnexoAberto { nome: string; mime: string; url: string; revogar?: () => void }
export interface JustificativaFunc {
  id: string; data_inicio: string; data_fim: string; tipo: TipoOcorrencia; status_analise: StatusAnalise;
  motivo_decisao: string | null; observacao: string | null; created_at: string; anexos: number;
}

export interface BaterArgs { funcionario_id: string; pin: string; tipo: TipoMarcacao; justificativa?: string; lat?: number | null; lng?: number | null }
export interface RetroativoArgs { funcionario_id: string; pin: string; data: string; tipo: TipoMarcacao; hora: string; justificativa: string }
export type MarcacaoHistorico = Pick<RegistroPonto,
  'id' | 'data' | 'tipo' | 'horario_previsto' | 'horario_real' | 'diferenca_minutos' | 'status' | 'justificativa' | 'status_aprovacao' | 'retroativo' | 'motivo_rejeicao'>
  & { analise?: StatusAnalise | null; motivo_decisao?: string | null };
export interface JustificarAusenciaArgs { funcionario_id: string; pin: string; inicio: string; fim: string; tipo: TipoOcorrencia; observacao?: string }
export interface AnexarArgs { funcionario_id: string; pin: string; registro_id?: string; ocorrencia_id?: string; arquivo: ArquivoAnexo }

/** API pública do ponto (sem login; protegida por PIN). Sempre presa a UM escritório, pelo endereço /ponto/<slug>. */
export interface PontoApi {
  /** Busca no servidor (mín. 3 letras, no máx. 5 resultados): a lista completa da equipe nunca é exposta. */
  buscar(termo: string): Promise<PessoaPonto[]>;
  escala(escalaId: string): Promise<Escala | null>;
  /** Devolve null se o escritório não existe; `suspenso: true` se o acesso foi suspenso. */
  contexto(): Promise<{ ok: true; ctx: ContextoPonto } | { ok: false; erro: 'ESCRITORIO_NAO_ENCONTRADO' | 'ESCRITORIO_SUSPENSO' }>;
  bater(a: BaterArgs): Promise<PontoResp<{ id: string; status: RegistroPonto['status']; diferenca_minutos: number; horario_real: string; analise?: StatusAnalise | null }>>;
  historico(funcionarioId: string, pin: string, limite?: number): Promise<PontoResp<{ registros: MarcacaoHistorico[]; justificativas: JustificativaFunc[] }>>;
  /** Justificativa de ausência (atestado etc.): fica pendente até o administrador decidir. */
  justificarAusencia(a: JustificarAusenciaArgs): Promise<PontoResp<{ id: string }>>;
  /** Anexa PDF/foto a uma justificativa de falta ou a um atraso do próprio funcionário. */
  anexar(a: AnexarArgs): Promise<PontoResp<{ id: string }>>;
  retroativo(a: RetroativoArgs): Promise<PontoResp>;
  /** Tarefas, prazos e reuniões delegados ao funcionário (consulta por PIN). */
  tarefas(funcionarioId: string, pin: string): Promise<PontoResp<{ tarefas: TarefaFunc[] }>>;
  /** O responsável atualiza o andamento (a fazer, em andamento, em revisão, concluída), com nota opcional. */
  atualizarTarefa(a: { funcionario_id: string; pin: string; id: string; status: Exclude<StatusTarefa, 'cancelada'>; nota?: string }): Promise<PontoResp>;
}

export interface ResumoExpurgo {
  executado: boolean; anexos: number; geolocalizacao: number; tentativas_pin: number; arquivos_a_remover_do_storage: number;
  regras: { anexos_meses: number; geolocalizacao_meses: number; tentativas_dias: number };
}

/** Processos: cadastro + acompanhamento dos andamentos (tribunal) + andamentos registrados à mão. */
export interface ProcessosRepo extends Crud<Processo> {
  /** Andamentos de um processo, do mais novo para o mais antigo. */
  movimentos(processoId: string): Promise<Movimento[]>;
  /** Andamentos ainda não lidos de todos os processos (a "caixa de entrada" do acompanhamento). */
  naoLidos(): Promise<Movimento[]>;
  /** Andamento registrado à mão (ex.: intimação recebida por e-mail ou pelo diário). A categoria define o prazo sugerido. */
  registrarMovimento(processoId: string, m: { nome: string; complemento?: string; data_hora: string; categoria: Movimento['categoria'] }): Promise<Movimento>;
  marcarLidos(processoId: string): Promise<void>;
  /** Preenche o cadastro a partir do número (classe, assunto, órgão...). Null = não encontrado ou tribunal não consultável. */
  buscar(numero: string): Promise<DadosConsultaProcesso | null>;
  /** Consulta o tribunal agora e registra os andamentos novos (cria tarefa para os que exigem ação, se a automação estiver ligada). */
  consultar(processoId: string): Promise<ResultadoConsulta>;
  /** Mesma consulta para todos os processos monitorados do escritório. */
  consultarTodos(): Promise<ResultadoConsulta>;
  /** A fonte automática de andamentos está disponível nesta instalação? (No modo demonstração a consulta é simulada.) */
  fonte(): Promise<{ disponivel: boolean; simulada: boolean }>;
}

export interface ArquivosRepo {
  list(filtro?: { cliente_id?: string; processo_id?: string }): Promise<DocumentoArquivo[]>;
  /** `categoria` define a subpasta no Drive; sem ela o sistema sugere pelo item da lista e pelo nome do arquivo. */
  enviar(a: { cliente_id: string; processo_id?: string | null; item_id?: string | null; categoria?: CategoriaDoc | null; arquivo: ArquivoAnexo }): Promise<DocumentoArquivo>;
  /** Muda a categoria e move o arquivo para a subpasta certa do Drive. */
  reclassificar(id: string, categoria: CategoriaDoc): Promise<void>;
  /** Abre o arquivo (URL assinada de 60 s ou blob local); cada abertura fica registrada. */
  abrir(id: string): Promise<AnexoAberto>;
  conferir(id: string, conferido: boolean): Promise<void>;
  remover(id: string): Promise<void>;
  resumo(): Promise<ResumoDocumentos>;
  /** Link para o cliente enviar documentos sem login. O token só é devolvido nesta chamada. */
  links: {
    list(): Promise<LinkEnvio[]>;
    criar(a: { cliente_id: string; processo_id?: string | null; dias?: number; rotulo?: string }): Promise<{ link: LinkEnvio; token: string }>;
    revogar(id: string): Promise<void>;
  };
  /** Google Drive do escritório: pastas por cliente/processo, criadas e preenchidas sozinhas. */
  drive: {
    status(): Promise<DriveStatus>;
    conectar(): Promise<string>;
    desconectar(): Promise<void>;
    /** Reenvia ao Drive o que ficou pendente ou com erro. */
    sincronizar(): Promise<{ enviados: number; erros: number }>;
    /** Endereço da pasta do cliente (ou do processo) no Drive; cria a pasta se ainda não existir. */
    pasta(alvo: { cliente_id: string; processo_id?: string | null }): Promise<string>;
  };
  /** Página pública do cliente (sem login): confere o token e recebe os arquivos. */
  publico: {
    info(token: string): Promise<EnvioPublicoInfo | { ok: false; erro: string }>;
    enviar(token: string, itemId: string | null, arquivo: ArquivoAnexo): Promise<{ ok: true } | { ok: false; erro: string }>;
  };
}

export interface Db {
  modo: 'local' | 'supabase';
  /** Preparação assíncrona (dados de demonstração no modo local). */
  init?(): Promise<void>;

  // ---- dados do escritório da sessão (o banco filtra por escritório; um escritório nunca vê outro) ----
  cargos: Crud<Cargo>;
  escalas: Crud<Escala>;
  funcionarios: Crud<Funcionario>;
  registros: Crud<RegistroPonto>;
  ocorrencias: Crud<Ocorrencia>;
  feriados: Crud<Feriado>;
  ajustes: Crud<AjusteFolha>;
  ajustesDia: Crud<AjusteDia>;
  folhas: FolhasRepo;
  /** Períodos com folha fechada/paga (a gerência não lê folhas, mas precisa saber o que está congelado). */
  periodosFechados(): Promise<PeriodoFechado[]>;
  /** Versão da última migração aplicada no banco (null se o banco ainda não tem o controle de versões). */
  versaoEsquema(): Promise<number | null>;
  /** Data do último backup externo bem-sucedido (registrado pelo workflow de backup). null = desconhecido. */
  ultimoBackup(): Promise<string | null>;
  usuarios: { list(): Promise<Usuario[]> };
  /** Gestão de acessos ao painel do PRÓPRIO escritório (só administrador). */
  acessos: {
    criar(a: { nome: string; email: string; papel: Papel; senha: string }): Promise<void>;
    atualizar(id: string, a: { nome: string; papel: Papel; ativo: boolean }): Promise<void>;
    redefinirSenha(id: string, senha: string): Promise<void>;
    remover(id: string): Promise<void>;
  };
  auditoria: Crud<Auditoria>;
  /** Delegação: tarefas, prazos, audiências e reuniões do escritório (administrador, gerência e coordenação). */
  tarefas: Crud<Tarefa>;
  clientes: Crud<Cliente>;
  processos: ProcessosRepo;
  checklist: {
    modelos: Crud<ChecklistModelo>;
    itens: Crud<ChecklistItem>;
    /** Copia os itens do modelo para o processo (ou cliente), sem repetir os que já existem. Devolve quantos criou. */
    aplicar(modeloId: string, alvo: { processo_id?: string | null; cliente_id?: string | null }): Promise<number>;
  };
  arquivos: ArquivosRepo;
  andamentos: { list(tarefaId: string): Promise<Andamento[]>; add(tarefaId: string, texto: string): Promise<void> };
  /** Google Agenda: cada pessoa conecta a própria conta; os compromissos vão para a agenda dela e os envolvidos recebem o convite. */
  google: {
    status(): Promise<GoogleStatus>;
    /** Endereço de autorização do Google (a pessoa é levada até lá e volta para o sistema). */
    conectar(): Promise<string>;
    desconectar(): Promise<void>;
    sincronizar(tarefaId: string): Promise<void>;
    remover(tarefaId: string): Promise<void>;
    estados(): Promise<SyncGoogle[]>;
  };
  /** Atestados: o arquivo fica no Storage privado. `listar` traz só metadados; `abrir` (só administrador) registra o acesso e devolve um endereço de 60 s. */
  anexos: {
    listar(): Promise<AnexoMeta[]>;
    abrir(id: string): Promise<AnexoAberto>;
    /** Remove do Storage os arquivos cujo registro foi apagado. Devolve quantos foram removidos. */
    limparLixeira(): Promise<number>;
  };
  /** Quem abriu cada atestado (somente inserção). */
  acessosSensiveis: { list(): Promise<AcessoSensivel[]> };
  /** Retenção de dados (LGPD): prévia do que seria apagado e execução com trilha de auditoria. */
  retencao: { previa(): Promise<ResumoExpurgo>; executar(): Promise<ResumoExpurgo> };
  /** Autenticidade dos PDFs: cada documento emitido recebe um código e um QR Code verificável em /verificar. */
  documentos: {
    /** `codigo` é gerado no navegador; o registro é idempotente (repetir com o mesmo código/hash não duplica). */
    registrar(d: { tipo: TipoDocumento; titulo: string; periodo: string; resumo: Record<string, unknown>; hash: string; codigo?: string }): Promise<string>;
    verificar(codigo: string): Promise<DocumentoVerificado | null>;
  };
  config: { get(): Promise<Config>; save(c: Config): Promise<void> };
  auth: {
    sessao(): Promise<Sessao | null>;
    entrar(email: string, senha: string): Promise<Sessao>;
    sair(): Promise<void>;
  };
  /** Equipe sem dados sensíveis (usada pela gerência). */
  equipe(): Promise<FuncionarioBasico[]>;
  definirPin(funcionarioId: string, pin: string): Promise<void>;
  aprovarPonto(id: string, acao: 'aprovar' | 'rejeitar', motivo?: string): Promise<void>;

  // ---- plataforma (dono do GE Advocacia): cria e suspende escritórios, sem ver os dados deles ----
  plataforma: {
    listar(): Promise<EscritorioPlataforma[]>;
    criar(a: { nome: string; slug: string; fuso: string; adminNome: string; adminEmail: string; adminSenha: string }): Promise<void>;
    atualizar(id: string, a: { nome: string; ativo: boolean; fuso: string }): Promise<void>;
    usuarios(escritorioId: string): Promise<Pick<Usuario, 'id' | 'nome' | 'email' | 'papel' | 'ativo'>[]>;
    criarAdmin(escritorioId: string, a: { nome: string; email: string; senha: string }): Promise<void>;
    redefinirSenha(usuarioId: string, senha: string): Promise<void>;
    excluir(escritorioId: string): Promise<void>;
  };

  /** Ponto público do escritório de endereço `slug` (ex.: /ponto/silva-ribeiro). */
  ponto: { para(slug: string): PontoApi };
}

let promessa: Promise<Db> | null = null;
export function getDb(): Promise<Db> {
  return (promessa ??= (async () => {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    let db: Db;
    if (url && key) {
      const { criarDbSupabase } = await import('./supabase');
      db = criarDbSupabase(url, key);
    } else {
      const { criarDbLocal } = await import('./local');
      db = criarDbLocal();
    }
    await db.init?.();
    return db;
  })());
}
