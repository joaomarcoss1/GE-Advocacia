/**
 * Regras de integridade (espelho do banco: migração 0003). O Postgres é quem decide no modo real;
 * estas funções puras são usadas pelo modo demonstração e pela interface (para desabilitar botões com a dica certa).
 */
import { erro } from './erros';
import type { AjusteDia, AjusteFolha, Folha, Ocorrencia, RegistroPonto } from './types';

/** Versão da última migração SQL que este app espera encontrar no banco (supabase/migrations). */
export const SCHEMA_ESPERADO = 9;
/** Versão do app mostrada em Diagnóstico. */
export const APP_VERSAO = '1.0.0';

type FolhaFechavel = Pick<Folha, 'funcionario_id' | 'periodo_inicio' | 'periodo_fim' | 'status'>;

/** A data (ou o intervalo) cai num período com folha fechada/paga para esse funcionário? */
export function periodoFechado(folhas: FolhaFechavel[], funcionarioId: string, ini: string, fim: string = ini): boolean {
  return folhas.some(f => f.funcionario_id === funcionarioId && (f.status === 'fechada' || f.status === 'paga')
    && f.periodo_inicio <= fim && f.periodo_fim >= ini);
}

/** Dica padrão para botões desabilitados em período fechado. */
export const DICA_PERIODO_FECHADO = 'Período com folha fechada. Reabra a folha para editar.';

interface Historico {
  registros: Pick<RegistroPonto, 'funcionario_id'>[];
  ocorrencias: Pick<Ocorrencia, 'funcionario_id'>[];
  ajustes: Pick<AjusteFolha, 'funcionario_id'>[];
  ajustesDia: Pick<AjusteDia, 'funcionario_id'>[];
  folhas: Pick<Folha, 'funcionario_id'>[];
  anexos?: { funcionario_id: string }[];
}
/** O funcionário tem qualquer histórico (ponto, ocorrências, ajustes, folhas, anexos)? Então não pode ser excluído, só desligado. */
export function temHistorico(funcionarioId: string, h: Historico): boolean {
  const meu = (x: { funcionario_id: string }) => x.funcionario_id === funcionarioId;
  return h.registros.some(meu) || h.ocorrencias.some(meu) || h.ajustes.some(meu) || h.ajustesDia.some(meu) || h.folhas.some(meu) || !!h.anexos?.some(meu);
}

/** Há atestado ou atraso ainda em análise dentro do período? (impede fechar a folha) */
export function temAnaliseCom(
  funcionarioId: string, ini: string, fim: string,
  ocorrencias: Pick<Ocorrencia, 'funcionario_id' | 'status_analise' | 'data_inicio' | 'data_fim'>[],
  registros: Pick<RegistroPonto, 'funcionario_id' | 'analise' | 'status_aprovacao' | 'data'>[],
): boolean {
  return ocorrencias.some(o => o.funcionario_id === funcionarioId && o.status_analise === 'pendente' && o.data_inicio <= fim && o.data_fim >= ini)
    || registros.some(r => r.funcionario_id === funcionarioId && r.analise === 'pendente' && r.status_aprovacao !== 'rejeitado' && r.data >= ini && r.data <= fim);
}

/** Campos que mudam sozinhos ou ao mudar de status e, por isso, não contam como "edição" de uma folha fechada. */
const CAMPOS_LIVRES = new Set(['status', 'updated_at', 'motivo_reabertura', 'reaberta_em']);

/**
 * Valida uma alteração de folha (espelho do gatilho `_trg_folha_regras`).
 *  - fechar: não pode haver análise pendente;
 *  - fechada/paga: só o status muda; reabrir exige administrador e motivo (≥ 5 caracteres);
 *  - folha fechada/paga não pode ser excluída.
 * Lança ErroNegocio quando a regra é violada.
 */
export function validarMudancaFolha(
  antes: Folha | null, depois: Partial<Folha> & Pick<Folha, 'funcionario_id' | 'periodo_inicio' | 'periodo_fim' | 'status'>,
  ctx: { admin: boolean; ocorrencias: Ocorrencia[]; registros: RegistroPonto[] },
): void {
  const fechando = (depois.status === 'fechada' || depois.status === 'paga') && (!antes || antes.status === 'aberta');
  if (fechando && temAnaliseCom(depois.funcionario_id, depois.periodo_inicio, depois.periodo_fim, ctx.ocorrencias, ctx.registros)) throw erro('ANALISES_PENDENTES');
  if (!antes || antes.status === 'aberta') return;
  if (depois.status === 'aberta') {
    if (!ctx.admin) throw erro('SO_ADMINISTRADOR');
    const m = (depois.motivo_reabertura ?? '').trim();
    if (m.length < 5 || m === (antes.motivo_reabertura ?? '')) throw erro('MOTIVO_REABERTURA');
    return;
  }
  for (const k of Object.keys(depois) as (keyof Folha)[]) {
    if (CAMPOS_LIVRES.has(k)) continue;
    if (JSON.stringify(depois[k]) !== JSON.stringify(antes[k])) throw erro('FOLHA_FECHADA');
  }
}

/** Prazo padrão de guarda das tentativas de PIN (dias). */
export const RETENCAO_TENTATIVAS_DIAS = 90;
