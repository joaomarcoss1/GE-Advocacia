import { ACORDOS, CLIENTE, EXECUCAO, EXTRAJUDICIAL, INTERNO } from './outros';
import { CONTRATOS } from './contratos';
import { DEFESAS } from './defesas';
import { INICIAIS } from './iniciais';
import { MANIFESTACOES } from './manifestacoes';
import { PROCURACOES } from './procuracoes';
import { RECURSOS } from './recursos';
import type { ModeloPadrao } from './tipos';

export type { ModeloPadrao } from './tipos';
/**
 * Biblioteca padrão de modelos do GE Advocacia: ponto de partida para o escritório adaptar à sua realidade e à praxe do foro.
 * São MODELOS-BASE e exigem revisão do advogado responsável antes do uso (não constituem parecer nem garantem o resultado).
 */
export const MODELOS_PADRAO: readonly ModeloPadrao[] = [
  ...PROCURACOES, ...CONTRATOS, ...INICIAIS, ...DEFESAS, ...RECURSOS, ...MANIFESTACOES, ...EXECUCAO, ...EXTRAJUDICIAL, ...ACORDOS, ...CLIENTE, ...INTERNO,
];
