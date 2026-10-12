/**
 * Níveis de acesso e permissões do escritório.
 *
 * Cada pessoa tem UM nível (a hierarquia) e, opcionalmente, permissões a mais ou a menos que o nível.
 * O banco (migração 0013) repete estes mesmos padrões; o teste `permissoes.test.ts` confere que os dois batem.
 * Apoio técnico: quem define o que cada nível pode é o sócio-administrador do escritório.
 */

export type PapelId = 'admin' | 'gerente' | 'coordenador' | 'advogado' | 'financeiro' | 'secretaria' | 'estagiario' | 'colaborador';

export interface DefPapel {
  id: PapelId;
  rotulo: string;
  /** Posição na hierarquia: quem tem nível mais alto gerencia quem tem nível mais baixo. */
  nivel: number;
  descricao: string;
  /** Se o acesso ao sistema só abre depois de bater o ponto (a menos que o escritório desligue a regra). */
  exigePonto: boolean;
}

export const PAPEIS: Record<PapelId, DefPapel> = {
  admin: { id: 'admin', rotulo: 'Sócio-administrador', nivel: 100, exigePonto: false, descricao: 'Direção do escritório: tudo, inclusive folha, cadastro de pessoas, configurações e auditoria.' },
  gerente: { id: 'gerente', rotulo: 'Gerência', nivel: 80, exigePonto: false, descricao: 'Gestão da equipe e das rotinas: ponto, escalas, ocorrências, relatórios e todos os casos.' },
  coordenador: { id: 'coordenador', rotulo: 'Coordenação', nivel: 60, exigePonto: false, descricao: 'Delega e acompanha tarefas, prazos e casos, sem ver ponto, folha ou dados pessoais.' },
  advogado: { id: 'advogado', rotulo: 'Advogado(a)', nivel: 50, exigePonto: true, descricao: 'Atua nos seus casos: processos, intimações, documentos, modelos, tarefas e honorários.' },
  financeiro: { id: 'financeiro', rotulo: 'Financeiro', nivel: 40, exigePonto: true, descricao: 'Honorários, propostas e dados de clientes para cobrança. Não vê processos nem documentos.' },
  secretaria: { id: 'secretaria', rotulo: 'Secretaria e atendimento', nivel: 30, exigePonto: true, descricao: 'Agenda, cadastro de clientes e processos, documentos e atendimento.' },
  estagiario: { id: 'estagiario', rotulo: 'Estágio e assistência', nivel: 20, exigePonto: true, descricao: 'Apoia os casos em que foi incluído: vê só o que lhe foi delegado.' },
  colaborador: { id: 'colaborador', rotulo: 'Colaborador (acesso básico)', nivel: 10, exigePonto: true, descricao: 'Só o próprio espaço: ponto, tarefas e agenda pessoais.' },
};
export const ORDEM_PAPEIS: PapelId[] = ['admin', 'gerente', 'coordenador', 'advogado', 'financeiro', 'secretaria', 'estagiario', 'colaborador'];
export const ehPapel = (v: unknown): v is PapelId => typeof v === 'string' && v in PAPEIS;

export type GrupoPermissao = 'dia' | 'casos' | 'financeiro' | 'pessoas' | 'admin';
export const GRUPOS: Record<GrupoPermissao, string> = {
  dia: 'Tarefas e agenda', casos: 'Casos e documentos', financeiro: 'Honorários', pessoas: 'Equipe e ponto', admin: 'Administração',
};

export interface DefPermissao {
  id: string;
  rotulo: string;
  ajuda: string;
  grupo: GrupoPermissao;
  /** Concedê-la concede também estas (ex.: "ver todos" inclui "ver"). */
  implica?: string[];
  /** Só o sócio-administrador tem; não pode ser dada a outro nível. */
  reservada?: boolean;
}

export const PERMISSOES: DefPermissao[] = [
  { id: 'tarefas.ver', rotulo: 'Ver todas as tarefas e a agenda', ajuda: 'Sem isto, a pessoa só vê as tarefas em que é responsável, revisora ou participante.', grupo: 'dia' },
  { id: 'tarefas.criar', rotulo: 'Criar tarefas, prazos e audiências', ajuda: 'Pode editar e excluir o que ela mesma criou.', grupo: 'dia' },
  { id: 'tarefas.delegar', rotulo: 'Atribuir tarefas a outras pessoas', ajuda: 'Escolher o responsável, o revisor e os participantes.', grupo: 'dia', implica: ['tarefas.criar', 'equipe.ver'] },
  { id: 'tarefas.editar_todas', rotulo: 'Editar e excluir tarefas de qualquer pessoa', ajuda: '', grupo: 'dia', implica: ['tarefas.ver', 'tarefas.criar'] },

  { id: 'casos.acessar', rotulo: 'Entrar na área de casos', ajuda: 'Base para processos, clientes, documentos, intimações e modelos.', grupo: 'casos' },
  { id: 'processos.ver', rotulo: 'Ver os processos em que atua', ajuda: 'Os que a pessoa responde ou que lhe foram delegados em tarefa.', grupo: 'casos', implica: ['casos.acessar'] },
  { id: 'processos.ver_todos', rotulo: 'Ver todos os processos do escritório', ajuda: 'Exceto os sigilosos, que têm permissão própria.', grupo: 'casos', implica: ['processos.ver'] },
  { id: 'processos.sigilosos', rotulo: 'Ver processos sigilosos', ajuda: 'Segredo de justiça e casos marcados como restritos. O responsável sempre vê o seu.', grupo: 'casos', implica: ['processos.ver_todos'] },
  { id: 'processos.editar', rotulo: 'Cadastrar e editar processos', ajuda: '', grupo: 'casos', implica: ['processos.ver'] },
  { id: 'processos.excluir', rotulo: 'Excluir processos', ajuda: '', grupo: 'casos', implica: ['processos.editar'] },
  { id: 'clientes.ver', rotulo: 'Ver clientes', ajuda: '', grupo: 'casos', implica: ['casos.acessar'] },
  { id: 'clientes.editar', rotulo: 'Cadastrar e editar clientes', ajuda: '', grupo: 'casos', implica: ['clientes.ver'] },
  { id: 'documentos.ver', rotulo: 'Ver documentos', ajuda: 'Respeita o acesso ao processo a que o documento pertence.', grupo: 'casos', implica: ['casos.acessar'] },
  { id: 'documentos.enviar', rotulo: 'Enviar e conferir documentos', ajuda: 'Inclui o link de envio para o cliente.', grupo: 'casos', implica: ['documentos.ver'] },
  { id: 'documentos.excluir', rotulo: 'Excluir documentos', ajuda: '', grupo: 'casos', implica: ['documentos.ver'] },
  { id: 'intimacoes.ver', rotulo: 'Ver intimações', ajuda: '', grupo: 'casos', implica: ['casos.acessar'] },
  { id: 'intimacoes.tratar', rotulo: 'Tratar intimações', ajuda: 'Marcar como tratada, descartar e gerar tarefa de prazo.', grupo: 'casos', implica: ['intimacoes.ver'] },
  { id: 'modelos.usar', rotulo: 'Usar modelos de peças', ajuda: '', grupo: 'casos', implica: ['casos.acessar'] },
  { id: 'modelos.editar', rotulo: 'Editar modelos e listas de documentos', ajuda: '', grupo: 'casos', implica: ['modelos.usar'] },

  { id: 'honorarios.ver', rotulo: 'Ver propostas de honorários', ajuda: '', grupo: 'financeiro' },
  { id: 'honorarios.editar', rotulo: 'Criar e editar propostas', ajuda: '', grupo: 'financeiro', implica: ['honorarios.ver'] },
  { id: 'honorarios.parametros', rotulo: 'Definir custos, margem e tabelas', ajuda: 'Os parâmetros da precificação do escritório.', grupo: 'financeiro', implica: ['honorarios.ver'] },

  { id: 'equipe.ver', rotulo: 'Ver a equipe (nomes e cargos)', ajuda: 'Necessário para escolher responsáveis. Não mostra salário nem dados pessoais.', grupo: 'pessoas' },
  { id: 'ponto.gerir', rotulo: 'Gerir ponto, escalas e ocorrências', ajuda: 'Aprovar marcações, decidir ocorrências, escalas, feriados e liberar acessos fora do horário.', grupo: 'pessoas', implica: ['equipe.ver'] },
  { id: 'relatorios.ver', rotulo: 'Ver relatórios de presença', ajuda: '', grupo: 'pessoas', implica: ['equipe.ver'] },

  { id: 'acessos.gerenciar', rotulo: 'Gerenciar acessos de níveis abaixo do seu', ajuda: 'Criar acessos, trocar nível e redefinir senha, sempre só para quem tem nível mais baixo.', grupo: 'admin' },
  { id: 'folha.ver', rotulo: 'Folha de pagamento', ajuda: 'Reservada ao sócio-administrador.', grupo: 'admin', reservada: true },
  { id: 'funcionarios.gerir', rotulo: 'Cadastro de pessoas (salário, CPF, banco)', ajuda: 'Reservada ao sócio-administrador.', grupo: 'admin', reservada: true },
  { id: 'config.editar', rotulo: 'Configurações do escritório', ajuda: 'Reservada ao sócio-administrador.', grupo: 'admin', reservada: true },
  { id: 'auditoria.ver', rotulo: 'Auditoria e registros de acesso', ajuda: 'Reservada ao sócio-administrador.', grupo: 'admin', reservada: true },
  { id: 'backup.gerir', rotulo: 'Cópias de segurança e privacidade', ajuda: 'Reservada ao sócio-administrador.', grupo: 'admin', reservada: true },
];

export type Permissao = string;
const POR_ID = new Map(PERMISSOES.map(p => [p.id, p]));
export const ehPermissao = (id: string) => POR_ID.has(id);
export const TODAS = PERMISSOES.map(p => p.id);
export const RESERVADAS = PERMISSOES.filter(p => p.reservada).map(p => p.id);
export const DELEGAVEIS = PERMISSOES.filter(p => !p.reservada).map(p => p.id);

/** Padrão de cada nível (o escritório pode ajustar). O sócio-administrador sempre tem tudo. */
export const PADRAO: Record<PapelId, string[]> = {
  admin: TODAS,
  gerente: [
    'tarefas.ver', 'tarefas.criar', 'tarefas.delegar', 'tarefas.editar_todas', 'casos.acessar',
    'processos.ver_todos', 'processos.sigilosos', 'processos.editar', 'processos.excluir', 'clientes.ver', 'clientes.editar',
    'documentos.ver', 'documentos.enviar', 'documentos.excluir', 'intimacoes.ver', 'intimacoes.tratar', 'modelos.usar', 'modelos.editar',
    'equipe.ver', 'ponto.gerir', 'relatorios.ver',
  ],
  coordenador: [
    'tarefas.ver', 'tarefas.criar', 'tarefas.delegar', 'casos.acessar', 'processos.ver_todos', 'processos.sigilosos', 'processos.editar',
    'clientes.ver', 'clientes.editar', 'documentos.ver', 'documentos.enviar', 'intimacoes.ver', 'intimacoes.tratar', 'modelos.usar', 'equipe.ver',
  ],
  advogado: [
    'tarefas.ver', 'tarefas.criar', 'tarefas.delegar', 'casos.acessar', 'processos.ver', 'processos.editar', 'clientes.ver', 'clientes.editar',
    'documentos.ver', 'documentos.enviar', 'intimacoes.ver', 'intimacoes.tratar', 'modelos.usar', 'equipe.ver', 'honorarios.ver', 'honorarios.editar',
  ],
  financeiro: ['casos.acessar', 'clientes.ver', 'tarefas.criar', 'honorarios.ver', 'honorarios.editar', 'honorarios.parametros'],
  secretaria: [
    'tarefas.ver', 'tarefas.criar', 'casos.acessar', 'processos.ver_todos', 'processos.editar', 'clientes.ver', 'clientes.editar',
    'documentos.ver', 'documentos.enviar', 'intimacoes.ver', 'modelos.usar', 'equipe.ver',
  ],
  estagiario: ['tarefas.criar', 'casos.acessar', 'processos.ver', 'clientes.ver', 'documentos.ver', 'documentos.enviar', 'intimacoes.ver', 'modelos.usar'],
  colaborador: [],
};

/** Inclui as permissões que as escolhidas implicam (fecho transitivo). */
export function expandir(ids: Iterable<string>): Set<string> {
  const saida = new Set<string>();
  const pilha = [...ids];
  while (pilha.length) {
    const id = pilha.pop()!;
    if (saida.has(id) || !POR_ID.has(id)) continue;
    saida.add(id);
    for (const i of POR_ID.get(id)!.implica ?? []) pilha.push(i);
  }
  return saida;
}

export interface EntradaPermissoes {
  papel: PapelId;
  /** Padrão do nível ajustado pelo escritório; sem isto vale `PADRAO[papel]`. */
  base?: string[] | null;
  conceder?: string[];
  negar?: string[];
}

/**
 * Permissões de quem entra: (padrão do nível + concedidas) − negadas. O administrador tem tudo; as reservadas só ele tem.
 * "Negar" tem a última palavra, inclusive sobre o que uma permissão implicaria.
 */
export function permissoesEfetivas({ papel, base, conceder = [], negar = [] }: EntradaPermissoes): Set<string> {
  if (papel === 'admin') return new Set(TODAS);
  const negadas = new Set(negar);
  const dadas = expandir([...(base ?? PADRAO[papel]), ...conceder].filter(id => !RESERVADAS.includes(id)));
  for (const n of negadas) dadas.delete(n);
  return dadas;
}

export const nivelDe = (p: PapelId) => PAPEIS[p].nivel;
/** Atribuir um nível: o administrador qualquer um; os demais, só níveis abaixo do seu. */
export const podeAtribuirPapel = (ator: PapelId, novo: PapelId) => ator === 'admin' || nivelDe(novo) < nivelDe(ator);
/** Gerenciar o acesso de alguém (criar, mudar nível, redefinir senha, remover): só quem tem nível maior; o administrador, qualquer um. */
export const podeGerirAlvo = (ator: PapelId, alvo: PapelId) => ator === 'admin' || nivelDe(alvo) < nivelDe(ator);
/** Dar uma permissão a alguém: só se o próprio ator a tem e ela não é reservada. */
export const podeConceder = (permsDoAtor: ReadonlySet<string>, perm: string) => ehPermissao(perm) && !RESERVADAS.includes(perm) && permsDoAtor.has(perm);

export type EstadoAcesso = 'liberado' | 'aguardando_ponto' | 'encerrado';
export interface EntradaEstadoAcesso {
  /** O escritório exige ponto para o acesso? */
  politicaAtiva: boolean;
  /** Esta pessoa precisa bater ponto para entrar? */
  exigePonto: boolean;
  /** Marcações do dia que valem (não rejeitadas). */
  marcacoes: ReadonlyArray<'entrada' | 'saida_intervalo' | 'retorno_intervalo' | 'saida'>;
  /** A gerência liberou o acesso até este instante (ISO). */
  liberadoAte?: string | null;
  agora: string;
}
/**
 * Porta do ponto: o acesso abre com a entrada e fecha com a saída do dia.
 * A gerência pode liberar por um período (audiência externa, plantão, hora extra).
 */
export function estadoAcesso(e: EntradaEstadoAcesso): EstadoAcesso {
  if (!e.politicaAtiva || !e.exigePonto) return 'liberado';
  if (e.liberadoAte && e.liberadoAte > e.agora) return 'liberado';
  if (e.marcacoes.includes('saida')) return 'encerrado';
  if (e.marcacoes.includes('entrada')) return 'liberado';
  return 'aguardando_ponto';
}

/** Permissão exigida por tela do painel. Quem não a tem não vê o item no menu nem abre a rota. */
export const PERMISSAO_DA_ROTA: Record<string, string | null> = {
  '/painel/tarefas': null,
  '/painel/agenda': null,
  '/painel/processos': 'processos.ver',
  '/painel/intimacoes': 'intimacoes.ver',
  '/painel/documentos': 'documentos.ver',
  '/painel/modelos': 'modelos.usar',
  '/painel/honorarios': 'honorarios.ver',
  '/painel/gerencia': 'ponto.gerir',
  '/painel/escalas': 'ponto.gerir',
  '/painel/ponto': 'ponto.gerir',
  '/painel/ocorrencias': 'ponto.gerir',
  '/painel/feriados': 'ponto.gerir',
  '/painel/relatorios': 'relatorios.ver',
  '/painel/funcionarios': 'funcionarios.gerir',
  '/painel/cargos': 'funcionarios.gerir',
  '/painel/folha': 'folha.ver',
  '/painel/acessos': 'acessos.gerenciar|ponto.gerir',
  '/painel/configuracoes': 'config.editar',
};

/** Texto curto de uma permissão para telas e relatórios. */
export const rotuloPermissao = (id: string) => POR_ID.get(id)?.rotulo ?? id;
export const defPermissao = (id: string) => POR_ID.get(id);

/** Sugere o nível de acesso pelo nome do cargo, para o cadastro do funcionário já vir preenchido (quem cadastra pode trocar). */
export function sugerirNivel(cargo: string | null | undefined): PapelId {
  const c = (cargo ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/estagi/.test(c)) return 'estagiario';
  if (/coordena|gerent/.test(c)) return 'coordenador';          // nunca sugere Gerência/administrador pelo nome do cargo: poder maior é escolha consciente
  if (/financ|contab|contador/.test(c)) return 'financeiro';
  if (/secret|recepc|assistente administrativ|auxiliar administrativ/.test(c)) return 'secretaria';
  if (/advog|jurid|paralegal|socio/.test(c)) return 'advogado';
  return 'colaborador';
}
