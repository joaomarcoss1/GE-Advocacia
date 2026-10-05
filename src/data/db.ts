import type {
  AcessoSensivel, AjusteDia, AjusteFolha, AnexoMeta, Auditoria, Cargo, Config, ConfigPonto, EscritorioInfo, EscritorioPlataforma, Escala, Feriado,
  Folha, Funcionario, FuncionarioBasico, Ocorrencia, Papel, PapelSessao, RegistroPonto, StatusAnalise, TipoMarcacao, TipoOcorrencia, Usuario,
} from '@/lib/types';
import type { PontoErro } from '@/lib/erros';

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
}

export interface ResumoExpurgo {
  executado: boolean; anexos: number; geolocalizacao: number; tentativas_pin: number; arquivos_a_remover_do_storage: number;
  regras: { anexos_meses: number; geolocalizacao_meses: number; tentativas_dias: number };
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
