/**
 * Mapa ÚNICO de mensagens de erro, usado pelos dois modos (demonstração e Supabase).
 * O banco devolve códigos (SEM_PERMISSAO, PERIODO_FECHADO…); aqui eles viram texto para o usuário.
 */

export type PontoErro =
  | 'PIN_INVALIDO' | 'PIN_BLOQUEADO' | 'TIPO_INVALIDO' | 'GPS_OBRIGATORIO' | 'FORA_DA_AREA' | 'LOCAL_NAO_CONFIGURADO'
  | 'JA_REGISTRADO' | 'JUSTIFICATIVA_OBRIGATORIA' | 'HORA_INVALIDA' | 'USE_PONTO_NORMAL' | 'DATA_MUITO_ANTIGA'
  | 'ARQUIVO_INVALIDO' | 'LIMITE_ANEXOS' | 'NAO_ENCONTRADO' | 'PERIODO_INVALIDO' | 'PERIODO_FECHADO'
  | 'ESCRITORIO_SUSPENSO' | 'ESCRITORIO_NAO_ENCONTRADO' | 'STATUS_INVALIDO';

export const PONTO_ERRO_MSG: Record<PontoErro, string> = {
  PIN_INVALIDO: 'PIN incorreto.',
  PIN_BLOQUEADO: 'Muitas tentativas incorretas. Aguarde 10 minutos ou peça ao administrador para redefinir seu PIN.',
  TIPO_INVALIDO: 'Tipo de marcação inválido.',
  GPS_OBRIGATORIO: 'Ative a localização (GPS) para registrar o ponto.',
  FORA_DA_AREA: 'Você está fora da área do escritório.',
  LOCAL_NAO_CONFIGURADO: 'O escritório ligou a cerca de GPS, mas ainda não definiu a localização. Avise o administrador.',
  JA_REGISTRADO: 'Essa marcação já foi registrada hoje.',
  JUSTIFICATIVA_OBRIGATORIA: 'Informe uma justificativa.',
  HORA_INVALIDA: 'Horário inválido.',
  USE_PONTO_NORMAL: 'Para hoje, use o registro normal de ponto.',
  DATA_MUITO_ANTIGA: 'Só é possível solicitar ajustes dos últimos 45 dias.',
  ARQUIVO_INVALIDO: 'Arquivo não aceito. Envie PDF ou foto (JPG, PNG) de até 2 MB.',
  LIMITE_ANEXOS: 'Limite de 4 arquivos por envio.',
  NAO_ENCONTRADO: 'Envio não encontrado ou já analisado pelo administrador.',
  PERIODO_INVALIDO: 'Período inválido. Informe datas dos últimos 45 dias (ou até 30 dias à frente), com no máximo 30 dias.',
  PERIODO_FECHADO: 'Esse período já foi fechado na folha. Fale com o administrador.',
  ESCRITORIO_SUSPENSO: 'O acesso deste escritório está suspenso. Fale com o administrador.',
  ESCRITORIO_NAO_ENCONTRADO: 'Escritório não encontrado. Confira o endereço do ponto com o administrador.',
  STATUS_INVALIDO: 'Situação inválida para esta tarefa.',
};

/** Erros de gestão (painel): códigos lançados pelo banco ou pelo modo demonstração. */
export const ERRO_MSG: Record<string, string> = {
  SEM_PERMISSAO: 'Você não tem permissão para esta ação.',
  SO_ADMINISTRADOR: 'Só o administrador pode tomar essa decisão.',
  MOTIVO_OBRIGATORIO: 'Informe o motivo.',
  MOTIVO_REABERTURA: 'Para reabrir uma folha fechada, informe o motivo (mínimo de 5 caracteres).',
  PIN_FORMATO: 'O PIN deve ter de 6 a 8 números.',
  PIN_FRACO: 'PIN fácil de adivinhar (sequência ou repetição). Escolha outro.',
  NAO_ENCONTRADO: 'Registro não encontrado.',
  EMAIL_EXISTE: 'Este e-mail já está em uso.',
  EMAIL_INVALIDO: 'Informe um e-mail válido.',
  SENHA_CURTA: 'A senha deve ter pelo menos 10 caracteres.',
  SENHA_FRACA: 'A senha deve ter letras e números.',
  REGISTRO_IMUTAVEL: 'Este registro não pode ser alterado nem apagado.',
  PAPEL_INVALIDO: 'Perfil inválido.',
  NOME_OBRIGATORIO: 'Informe o nome.',
  ULTIMO_ADMIN: 'Precisa existir pelo menos um administrador ativo.',
  NAO_REMOVER_A_SI: 'Você não pode remover o seu próprio acesso.',
  FUNCIONARIO_COM_HISTORICO: 'Este funcionário tem histórico (ponto, ocorrências, folha ou anexos) e não pode ser excluído. Use "Desligar" para encerrar o vínculo e manter o histórico.',
  PERIODO_FECHADO: 'Esse período já foi fechado na folha. Reabra a folha (com o motivo) para editar.',
  FOLHA_FECHADA: 'Folha fechada: os valores estão congelados. Reabra a folha, informando o motivo, para alterar.',
  ANALISES_PENDENTES: 'Ainda há atestados ou atrasos em análise neste período. Decida-os antes de fechar a folha.',
  ESCRITORIO_IMUTAVEL: 'Não é possível mover um registro para outro escritório.',
  SLUG_INVALIDO: 'O endereço (slug) deve ter de 3 a 40 letras minúsculas, números ou hífens, sem começar ou terminar com hífen.',
  SLUG_EXISTE: 'Já existe um escritório com esse endereço.',
  FUSO_INVALIDO: 'Fuso horário inválido.',
  ESCRITORIO_COM_DADOS: 'Este escritório já tem funcionários cadastrados e não pode ser excluído. Suspenda o acesso.',
  HASH_INVALIDO: 'Documento inválido.',
  CODIGO_INVALIDO: 'Código de documento inválido.',
  CODIGO_EXISTE: 'Código de documento já utilizado.',
  ESCRITORIO_SUSPENSO: 'O acesso deste escritório está suspenso.',
  ACESSO_INATIVO: 'Este acesso está desativado. Fale com o administrador do escritório.',
  DATAS_INVALIDAS: 'Confira as datas: prazos, audiências e reuniões exigem data, e o término não pode ser antes do início.',
  PROCESSO_INVALIDO: 'Número de processo inválido. Confira os 20 dígitos (formato CNJ: 0000000-00.0000.0.00.0000).',
  RESPONSAVEL_INVALIDO: 'O responsável precisa ser da equipe deste escritório.',
  PARTICIPANTE_INVALIDO: 'Todos os participantes precisam ser da equipe deste escritório.',
  ANDAMENTO_IMUTAVEL: 'Andamentos não podem ser alterados nem apagados.',
  GOOGLE_INDISPONIVEL: 'A integração com o Google Agenda não está disponível nesta instalação.',
  GOOGLE_NAO_CONECTADO: 'Conecte a sua conta Google para sincronizar com a agenda.',
  SEM_PERFIL: 'Este usuário existe, mas não tem acesso a nenhum escritório. Peça ao administrador para cadastrá-lo.',
};

/** Erro de negócio com código estável (o texto sai do mapa acima). */
export class ErroNegocio extends Error {
  constructor(public codigo: string, mensagem?: string) {
    super(mensagem ?? ERRO_MSG[codigo] ?? PONTO_ERRO_MSG[codigo as PontoErro] ?? codigo);
    this.name = 'ErroNegocio';
  }
}
export const erro = (codigo: string, mensagem?: string) => new ErroNegocio(codigo, mensagem);

/** Traduz a mensagem crua do Postgres/PostgREST para texto amigável. */
export function traduzirErroBanco(bruto: string | undefined | null): string {
  const m = bruto ?? 'Erro inesperado';
  const baixo = m.toLowerCase();
  if (baixo.includes('gen_salt') || baixo.includes('crypt(') || baixo.includes('digest(')) {
    return 'O banco ainda não recebeu a correção do pgcrypto. Rode o arquivo atualizacao_definitiva.sql no SQL Editor do Supabase (uma vez) e tente de novo.';
  }
  if (baixo.includes('could not find the function') || baixo.includes('schema cache') || (baixo.includes('does not exist') && (baixo.includes('relation') || baixo.includes('function')))) {
    return 'O banco precisa da atualização mais recente. Rode o arquivo atualizacao_definitiva.sql no SQL Editor do Supabase (uma vez) e tente de novo.';
  }
  if (baixo.includes('tarefas_check')) return ERRO_MSG.DATAS_INVALIDAS;
  if (baixo.includes('row-level security')) return ERRO_MSG.SEM_PERMISSAO;
  if (baixo.includes('permission denied')) return ERRO_MSG.SEM_PERMISSAO;
  if (baixo.includes('violates foreign key') && baixo.includes('delete')) return ERRO_MSG.FUNCIONARIO_COM_HISTORICO;
  if (baixo.includes('registros_ponto_unico_idx') || baixo.includes('duplicate key')) return PONTO_ERRO_MSG.JA_REGISTRADO;
  // o Postgres devolve "ERROR: CODIGO"; o PostgREST devolve só "CODIGO"
  const codigo = Object.keys(ERRO_MSG).find(c => m === c || m.includes(c));
  return codigo ? ERRO_MSG[codigo] : m;
}
