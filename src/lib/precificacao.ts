import type { AreaJuridica, Funcionario } from './types';
import { plural } from './format';

/**
 * Motor de precificação de honorários: parte do que o escritório REALMENTE custa (aluguel, energia, folha, impostos…), do esforço do caso
 * (horas, duração, complexidade, audiências, deslocamentos), da margem de lucro e da região, e confronta o resultado com a tabela da OAB e com o
 * proveito econômico do cliente. Tudo é apoio técnico: o advogado decide o valor e deve conferir tributos com a contabilidade e a tabela vigente da OAB.
 */
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const pct = (n: number) => n / 100;
export const arredondar = (v: number, passo = 10) => (v <= 0 ? 0 : Math.ceil(v / passo - 1e-9) * passo);

// ---------------------------------------------------------------- parâmetros do escritório
export type CategoriaCusto = 'aluguel' | 'energia' | 'agua' | 'internet' | 'folha' | 'prolabore' | 'contabilidade' | 'software' | 'oab' | 'seguros' | 'marketing' | 'material' | 'depreciacao' | 'capacitacao' | 'outros';
export const CATEGORIAS_CUSTO: readonly { id: CategoriaCusto; rotulo: string }[] = [
  { id: 'aluguel', rotulo: 'Aluguel / condomínio / IPTU' }, { id: 'energia', rotulo: 'Energia elétrica' }, { id: 'agua', rotulo: 'Água e esgoto' },
  { id: 'internet', rotulo: 'Internet e telefonia' }, { id: 'folha', rotulo: 'Folha de funcionários e encargos' }, { id: 'prolabore', rotulo: 'Pró-labore / retirada dos sócios' },
  { id: 'contabilidade', rotulo: 'Contabilidade' }, { id: 'software', rotulo: 'Sistemas, certificado digital e assinaturas' }, { id: 'oab', rotulo: 'Anuidades OAB / CAA / taxas' },
  { id: 'seguros', rotulo: 'Seguros' }, { id: 'marketing', rotulo: 'Marketing e captação' }, { id: 'material', rotulo: 'Material, limpeza e copa' },
  { id: 'depreciacao', rotulo: 'Equipamentos e depreciação' }, { id: 'capacitacao', rotulo: 'Cursos e livros' }, { id: 'outros', rotulo: 'Outros custos fixos' },
];
export interface CustoFixo { id: string; categoria: CategoriaCusto; descricao: string; valor_mensal: number }

export type Regime = 'simples_iv' | 'presumido' | 'autonomo' | 'manual';
export const REGIMES: readonly { id: Regime; rotulo: string }[] = [
  { id: 'simples_iv', rotulo: 'Simples Nacional (Anexo IV)' }, { id: 'presumido', rotulo: 'Lucro presumido' },
  { id: 'autonomo', rotulo: 'Advogado autônomo (pessoa física)' }, { id: 'manual', rotulo: 'Alíquota informada pela contabilidade' },
];
export type Regiao = 'capital' | 'polo' | 'interior' | 'pequeno' | 'outra';
/** Ponto de partida do ajuste de mercado por região: o escritório altera conforme o que a sua praça aceita pagar. */
export const REGIOES: readonly { id: Regiao; rotulo: string; fator: number }[] = [
  { id: 'capital', rotulo: 'Capital e região metropolitana', fator: 1 }, { id: 'polo', rotulo: 'Cidade polo regional', fator: 0.9 },
  { id: 'interior', rotulo: 'Interior (médio porte)', fator: 0.8 }, { id: 'pequeno', rotulo: 'Interior (pequeno porte)', fator: 0.7 }, { id: 'outra', rotulo: 'Outra / definir fator', fator: 1 },
];

export interface ParametrosHonorarios {
  custos: CustoFixo[];
  /** Encargos sobre salários de CLT (INSS patronal, FGTS, 13º, férias…), em %. */
  encargos_pct: number;
  advogados_produtivos: number;
  horas_faturaveis_mes: number;
  regime: Regime;
  rbt12: number;
  aliquota_manual_pct: number;
  iss_pct: number;
  margem_pct: number;
  inadimplencia_pct: number;
  reserva_pct: number;
  desconto_mensal_pct: number;
  premium_pct: number;
  regiao: Regiao;
  fator_regional: number;
  acompanhamento_h_mes: number;
  horas_por_audiencia: number;
  valor_km: number;
  custas_pct: number;
  custas_piso: number;
  custas_teto: number;
  /** Mínimos da tabela de honorários da OAB do Estado (preenchidos pelo escritório a partir do documento oficial vigente). */
  tabela_oab: Record<string, number>;
}
export const PARAMETROS_PADRAO: ParametrosHonorarios = {
  custos: [], encargos_pct: 35, advogados_produtivos: 1, horas_faturaveis_mes: 100,
  regime: 'simples_iv', rbt12: 360000, aliquota_manual_pct: 16, iss_pct: 3,
  margem_pct: 25, inadimplencia_pct: 5, reserva_pct: 5, desconto_mensal_pct: 1, premium_pct: 25,
  regiao: 'capital', fator_regional: 1, acompanhamento_h_mes: 0.75, horas_por_audiencia: 4, valor_km: 1.2,
  // TJMA — Lei estadual 12.193/2023: custas iniciais de 1º grau = 3% do valor da causa, com mínimo e máximo corrigidos todo ano (conferir a tabela vigente).
  custas_pct: 3, custas_piso: 182, custas_teto: 15835,
  tabela_oab: {},
};

/** Mescla o que veio do banco com o padrão (campos novos nunca quebram parâmetros antigos). */
export function normalizarParametros(x: Partial<ParametrosHonorarios> | null | undefined): ParametrosHonorarios {
  const base = { ...PARAMETROS_PADRAO, ...(x ?? {}) };
  const n = (v: unknown, min: number, max: number, pad: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : pad);
  return {
    ...base,
    custos: Array.isArray(base.custos) ? base.custos.filter(c => c && typeof c.valor_mensal === 'number' && c.valor_mensal >= 0).slice(0, 80) : [],
    encargos_pct: n(base.encargos_pct, 0, 100, 35), advogados_produtivos: n(base.advogados_produtivos, 0.5, 200, 1), horas_faturaveis_mes: n(base.horas_faturaveis_mes, 10, 250, 100),
    rbt12: n(base.rbt12, 0, 4_800_000, 360000), aliquota_manual_pct: n(base.aliquota_manual_pct, 0, 60, 16), iss_pct: n(base.iss_pct, 0, 5, 3),
    margem_pct: n(base.margem_pct, 0, 80, 25), inadimplencia_pct: n(base.inadimplencia_pct, 0, 40, 5), reserva_pct: n(base.reserva_pct, 0, 40, 5),
    desconto_mensal_pct: n(base.desconto_mensal_pct, 0, 10, 1), premium_pct: n(base.premium_pct, 0, 200, 25), fator_regional: n(base.fator_regional, 0.3, 2, 1),
    acompanhamento_h_mes: n(base.acompanhamento_h_mes, 0, 20, 0.75), horas_por_audiencia: n(base.horas_por_audiencia, 0, 40, 4), valor_km: n(base.valor_km, 0, 20, 1.2),
    custas_pct: n(base.custas_pct, 0, 10, 3), custas_piso: n(base.custas_piso, 0, 1e7, 182), custas_teto: n(base.custas_teto, 0, 1e8, 15835),
    tabela_oab: Object.fromEntries(Object.entries(base.tabela_oab ?? {}).filter(([, v]) => typeof v === 'number' && v >= 0)),
  };
}

// ---------------------------------------------------------------- custos do escritório
/** Custo mensal da equipe a partir do cadastro de funcionários: CLT paga encargos; estágio e PJ, não. */
export function custoMensalEquipe(funcionarios: Pick<Funcionario, 'salario_mensal' | 'vinculo' | 'data_desligamento'>[], encargosPct: number): number {
  let total = 0;
  for (const f of funcionarios) {
    if (f.data_desligamento) continue;
    total += f.salario_mensal * (f.vinculo === 'clt' ? 1 + pct(encargosPct) : 1);
  }
  return r2(total);
}
export const totalCustosFixos = (p: ParametrosHonorarios) => r2(p.custos.reduce((s, c) => s + c.valor_mensal, 0));
export const horasMensais = (p: ParametrosHonorarios) => p.advogados_produtivos * p.horas_faturaveis_mes;
/** Quanto custa 1 hora de trabalho faturável (custos fixos ÷ horas que o escritório realmente consegue cobrar). */
export const custoHora = (p: ParametrosHonorarios) => (horasMensais(p) > 0 ? r2(totalCustosFixos(p) / horasMensais(p)) : 0);

// ---------------------------------------------------------------- tributos
/** Anexo IV do Simples (LC 123/2006): alíquota nominal e parcela a deduzir por faixa da receita bruta dos últimos 12 meses. CPP patronal é paga à parte. */
const ANEXO_IV: readonly [number, number, number][] = [[180000, 4.5, 0], [360000, 9, 8100], [720000, 10.2, 12000], [1800000, 14, 39000], [3600000, 22, 183780], [4800000, 33, 828000]];
export function aliquotaSimplesIV(rbt12: number): number {
  const faixa = ANEXO_IV.find(([teto]) => rbt12 <= teto) ?? ANEXO_IV[ANEXO_IV.length - 1];
  const base = Math.max(rbt12, 1);
  return Math.max(0, ((base * faixa[1] / 100 - faixa[2]) / base) * 100);
}
/** Carga tributária efetiva sobre a receita, em %. Presumido: IRPJ 4,8% + CSLL 2,88% (base de 32% dos serviços) + PIS 0,65% + COFINS 3% + ISS; sem o adicional de IRPJ. */
export function aliquotaEfetiva(p: ParametrosHonorarios): number {
  switch (p.regime) {
    case 'simples_iv': return r2(aliquotaSimplesIV(p.rbt12));
    case 'presumido': return r2(4.8 + 2.88 + 0.65 + 3 + p.iss_pct);
    default: return r2(p.aliquota_manual_pct);
  }
}

// ---------------------------------------------------------------- catálogo de serviços
export interface Servico { id: string; nome: string; area: AreaJuridica | null; grupo: string; horas: number; meses: number }
const s = (id: string, nome: string, area: AreaJuridica | null, grupo: string, horas: number, meses: number): Servico => ({ id, nome, area, grupo, horas, meses });
/** Esforço-padrão em horas por serviço (estimativa inicial de prática forense, ajustável no caso pela complexidade e por horas extras). */
export const SERVICOS: readonly Servico[] = [
  s('consulta', 'Consulta jurídica', null, 'Consultivo', 1.5, 1), s('parecer', 'Parecer jurídico', null, 'Consultivo', 8, 1), s('contrato_elab', 'Elaboração de contrato', null, 'Consultivo', 6, 1),
  s('contrato_rev', 'Revisão de contrato', null, 'Consultivo', 4, 1), s('notificacao', 'Notificação extrajudicial', null, 'Consultivo', 3, 1), s('acordo_extra', 'Acordo extrajudicial / mediação', 'civel', 'Consultivo', 8, 2),
  s('abertura_empresa', 'Abertura / alteração de empresa', 'empresarial', 'Consultivo', 10, 2), s('consultoria_mensal', 'Consultoria jurídica mensal (partido)', 'empresarial', 'Consultivo', 12, 1),
  s('civel_cobranca', 'Ação de cobrança', 'civel', 'Cível', 22, 8), s('civel_indeniz', 'Ação de indenização', 'civel', 'Cível', 30, 12), s('civel_consumidor', 'Ação de consumidor (juizado)', 'civel', 'Cível', 14, 4),
  s('civel_execucao', 'Execução de título extrajudicial', 'civel', 'Cível', 20, 12), s('civel_despejo', 'Ação de despejo / locação', 'civel', 'Cível', 18, 8), s('civel_possessoria', 'Ação possessória', 'civel', 'Cível', 28, 10),
  s('civel_usucapiao_j', 'Usucapião judicial', 'civel', 'Cível', 40, 18), s('civel_usucapiao_e', 'Usucapião extrajudicial', 'civel', 'Cível', 25, 8), s('civel_defesa', 'Contestação e defesa cível', 'civel', 'Cível', 18, 8),
  s('civel_cumprimento', 'Cumprimento de sentença', 'civel', 'Cível', 12, 6), s('recurso_apelacao', 'Apelação / recurso cível', 'civel', 'Cível', 16, 8),
  s('familia_div_extra', 'Divórcio consensual (cartório)', 'familia', 'Família', 10, 2), s('familia_div_cons', 'Divórcio consensual (judicial)', 'familia', 'Família', 14, 4), s('familia_div_lit', 'Divórcio litigioso', 'familia', 'Família', 32, 14),
  s('familia_alimentos', 'Ação de alimentos', 'familia', 'Família', 20, 8), s('familia_guarda', 'Guarda e convivência', 'familia', 'Família', 24, 10), s('familia_paternidade', 'Investigação de paternidade', 'familia', 'Família', 22, 10),
  s('inv_extra', 'Inventário extrajudicial', 'familia', 'Família', 20, 4), s('inv_judicial', 'Inventário judicial', 'familia', 'Família', 45, 18),
  s('trab_reclamacao', 'Reclamação trabalhista (empregado)', 'trabalhista', 'Trabalhista', 28, 10), s('trab_defesa', 'Defesa trabalhista (empregador)', 'trabalhista', 'Trabalhista', 24, 10),
  s('trab_acordo', 'Acordo extrajudicial trabalhista', 'trabalhista', 'Trabalhista', 6, 2), s('trab_recurso', 'Recurso ordinário trabalhista', 'trabalhista', 'Trabalhista', 14, 6), s('trab_execucao', 'Execução trabalhista', 'trabalhista', 'Trabalhista', 16, 8),
  s('prev_adm', 'Requerimento administrativo (INSS)', 'previdenciario', 'Previdenciário', 10, 3), s('prev_judicial', 'Ação judicial de benefício', 'previdenciario', 'Previdenciário', 24, 12),
  s('prev_bpc', 'BPC / LOAS', 'previdenciario', 'Previdenciário', 22, 10), s('prev_revisao', 'Revisão de benefício', 'previdenciario', 'Previdenciário', 24, 14),
  s('crim_inquerito', 'Acompanhamento de inquérito', 'criminal', 'Criminal', 14, 6), s('crim_acao', 'Defesa em ação penal (até a sentença)', 'criminal', 'Criminal', 40, 14),
  s('crim_hc', 'Habeas corpus / liberdade provisória', 'criminal', 'Criminal', 10, 1), s('crim_juri', 'Tribunal do júri', 'criminal', 'Criminal', 80, 12), s('crim_execucao', 'Execução penal', 'criminal', 'Criminal', 12, 12),
  s('emp_credito', 'Recuperação de crédito empresarial', 'empresarial', 'Empresarial e tributário', 18, 6), s('trib_execfiscal', 'Defesa em execução fiscal', 'tributario', 'Empresarial e tributário', 22, 12),
  s('adm_ms', 'Mandado de segurança', 'administrativo', 'Administrativo', 20, 6), s('adm_concurso', 'Ação de concurso público', 'administrativo', 'Administrativo', 24, 10),
];
export const servicoPorId = (id: string) => SERVICOS.find(x => x.id === id);

export type Complexidade = 'baixa' | 'media' | 'alta' | 'muito_alta';
export const COMPLEXIDADES: readonly { id: Complexidade; rotulo: string; fator: number }[] = [
  { id: 'baixa', rotulo: 'Baixa (matéria pacífica, poucos documentos)', fator: 0.8 }, { id: 'media', rotulo: 'Média', fator: 1 },
  { id: 'alta', rotulo: 'Alta (prova extensa, perícia, várias partes)', fator: 1.35 }, { id: 'muito_alta', rotulo: 'Muito alta (tese nova, grande volume)', fator: 1.8 },
];
export type Modalidade = 'fixo' | 'parcelado' | 'misto' | 'exito' | 'hora';
export const MODALIDADES: readonly { id: Modalidade; rotulo: string; dica: string }[] = [
  { id: 'fixo', rotulo: 'Valor fechado (à vista)', dica: 'Um valor único, pago no início ou em poucos dias.' },
  { id: 'parcelado', rotulo: 'Valor fechado parcelado', dica: 'Entrada e parcelas mensais durante o andamento do caso.' },
  { id: 'misto', rotulo: 'Entrada + êxito', dica: 'Entrada que cobre os custos e percentual sobre o proveito ao final.' },
  { id: 'exito', rotulo: 'Somente êxito (quota litis)', dica: 'Nada antes do resultado. O escritório assume o risco: só para casos com bom prognóstico.' },
  { id: 'hora', rotulo: 'Por hora técnica', dica: 'Valor da hora e estimativa de horas; para consultoria e casos de escopo aberto.' },
];

// ---------------------------------------------------------------- caso
export interface CasoEntrada {
  servico_id: string; complexidade: Complexidade; duracao_meses: number;
  horas_extras: number; audiencias: number; instancias_recursais: number;
  km_total: number; despesas_absorvidas: number;
  valor_causa: number; proveito_estimado: number; probabilidade_exito_pct: number;
  modalidade: Modalidade; entrada_pct: number; parcelas: number; exito_pct: number;
  /** Se verdadeiro, o valor esperado de honorários de sucumbência (10%, CPC art. 85 § 2º) é descontado do que se cobra do cliente. */
  abater_sucumbencia: boolean; sucumbencia_pct: number;
}
export const CASO_PADRAO: CasoEntrada = {
  servico_id: 'civel_cobranca', complexidade: 'media', duracao_meses: 4, horas_extras: 0, audiencias: 1, instancias_recursais: 0, km_total: 0, despesas_absorvidas: 0,
  valor_causa: 0, proveito_estimado: 0, probabilidade_exito_pct: 70, modalidade: 'parcelado', entrada_pct: 30, parcelas: 4, exito_pct: 10, abater_sucumbencia: false, sucumbencia_pct: 10,
};

export type NivelAlerta = 'bad' | 'warn' | 'info' | 'ok';
export interface Alerta { nivel: NivelAlerta; texto: string }
export interface Parcela { rotulo: string; valor: number; mes: number }
export interface Resultado {
  horas: number; custoHora: number; custoTrabalho: number; despesas: number; reserva: number; custoTotal: number;
  tributoPct: number; inadimplenciaPct: number; margemPct: number;
  piso: number; alvo: number; oab: number | null; oabAjustada: number | null;
  minimo: number; recomendado: number; premium: number;
  /** Valor presente das parcelas ÷ valor nominal (1 = à vista). */
  fatorFinanceiro: number;
  /** Valor total que o escritório propõe cobrar em honorários fixos (já com ajuste do parcelamento). */
  fixo: number;
  exitoPct: number; exitoEsperado: number;
  parcelas: Parcela[];
  lucroEsperado: number; margemEsperadaPct: number;
  custasEstimadas: number;
  ocupacaoPct: number;
  valorHora: number | null;
  alertas: Alerta[];
}

/** Custas judiciais iniciais de 1º grau (TJMA): percentual do valor da causa entre piso e teto. É despesa do cliente, não entra nos honorários. */
export function custasEstimadas(valorCausa: number, p: ParametrosHonorarios): number {
  if (valorCausa <= 0) return 0;
  return r2(Math.min(p.custas_teto, Math.max(p.custas_piso, valorCausa * pct(p.custas_pct))));
}
/** Fator de valor presente das parcelas (entrada no mês 0 e demais nos meses 1..n), taxa em % a.m. */
export function fatorValorPresente(entradaPct: number, parcelas: number, taxaMensalPct: number): number {
  const i = pct(taxaMensalPct), n = Math.max(0, Math.floor(parcelas));
  const e = Math.min(1, Math.max(0, pct(entradaPct)));
  if (n === 0) return 1;
  let vp = e;
  for (let k = 1; k <= n; k++) vp += ((1 - e) / n) / Math.pow(1 + i, k);
  return vp;
}

export function calcular(p: ParametrosHonorarios, c: CasoEntrada): Resultado {
  const sv = servicoPorId(c.servico_id) ?? SERVICOS[0];
  const cx = COMPLEXIDADES.find(x => x.id === c.complexidade) ?? COMPLEXIDADES[1];
  const duracao = Math.max(1, Math.min(120, Math.round(c.duracao_meses)));
  const alertas: Alerta[] = [];

  const chora = custoHora(p);
  const horasBase = sv.horas * cx.fator * (1 + 0.35 * Math.max(0, c.instancias_recursais));
  const horas = r2(horasBase + p.acompanhamento_h_mes * Math.max(0, duracao - 1) + c.audiencias * p.horas_por_audiencia + Math.max(0, c.horas_extras));
  const custoTrabalho = r2(horas * chora);
  const despesas = r2(Math.max(0, c.km_total) * p.valor_km + Math.max(0, c.despesas_absorvidas));
  const reserva = r2((custoTrabalho + despesas) * pct(p.reserva_pct));
  const custoTotal = r2(custoTrabalho + despesas + reserva);

  const tributoPct = aliquotaEfetiva(p);
  const retencao = pct(tributoPct) + pct(p.inadimplencia_pct);
  const fatorFin = c.modalidade === 'parcelado' || c.modalidade === 'misto' ? fatorValorPresente(c.entrada_pct, c.parcelas, p.desconto_mensal_pct) : 1;
  const denomMin = Math.max(0.05, 1 - retencao);
  const denomAlvo = Math.max(0.05, 1 - retencao - pct(p.margem_pct));
  const sucumbEsperada = c.abater_sucumbencia && c.valor_causa > 0 ? r2(c.valor_causa * pct(c.sucumbencia_pct) * pct(c.probabilidade_exito_pct)) : 0;

  const piso = r2(custoTotal / denomMin);                         // empata: cobre custos, tributos e inadimplência, sem lucro
  const alvoBruto = r2(custoTotal / denomAlvo);                   // com a margem de lucro desejada
  const alvo = r2(Math.max(0, alvoBruto - sucumbEsperada));
  const oab = p.tabela_oab[sv.id] ?? null;
  const oabAjustada = oab != null && oab > 0 ? r2(oab * p.fator_regional) : null;

  const minimo = arredondar(Math.max(piso, oab ?? 0) / fatorFin);
  const recomendado = arredondar(Math.max(alvo, minimo * fatorFin) / fatorFin);
  const premium = arredondar(recomendado * (1 + pct(p.premium_pct)));

  const prob = Math.min(1, Math.max(0, pct(c.probabilidade_exito_pct)));
  const proveito = Math.max(0, c.proveito_estimado);
  let fixo = recomendado, exitoPct = 0;
  const parcelas: Parcela[] = [];
  let valorHora: number | null = null;

  if (c.modalidade === 'hora') {
    valorHora = arredondar(r2(chora * (1 + pct(p.reserva_pct)) / denomAlvo), 5);
    if (oab != null) valorHora = Math.max(valorHora, 0);
    fixo = r2(valorHora * horas);
    parcelas.push({ rotulo: 'Faturamento mensal estimado', valor: r2(fixo / duracao), mes: 1 });
  } else if (c.modalidade === 'exito') {
    fixo = 0;
    if (proveito > 0 && prob > 0) exitoPct = Math.ceil((alvo / (prob * proveito)) * 200) / 2; else exitoPct = 0;
  } else if (c.modalidade === 'misto') {
    fixo = arredondar(Math.max(piso, oab ?? 0) / fatorFin);
    if (proveito > 0 && prob > 0) exitoPct = Math.max(0, Math.ceil(((alvo - fixo * fatorFin) / (prob * proveito)) * 200) / 2);
    const nParc = Math.max(0, Math.floor(c.parcelas)), ent = pct(c.entrada_pct);
    if (nParc > 0 && fixo > 0) {
      const e = r2(fixo * ent); parcelas.push({ rotulo: 'Entrada', valor: e, mes: 0 });
      const resto = r2(fixo - e), cada = r2(resto / nParc);
      for (let k = 1; k <= nParc; k++) parcelas.push({ rotulo: `Parcela ${k}/${nParc}`, valor: k === nParc ? r2(resto - cada * (nParc - 1)) : cada, mes: k });
    } else if (fixo > 0) parcelas.push({ rotulo: 'À vista', valor: fixo, mes: 0 });
  } else if (c.modalidade === 'parcelado') {
    const nParc = Math.max(1, Math.floor(c.parcelas)), ent = pct(c.entrada_pct);
    const e = r2(recomendado * ent); parcelas.push({ rotulo: 'Entrada', valor: e, mes: 0 });
    const resto = r2(recomendado - e), cada = r2(resto / nParc);
    for (let k = 1; k <= nParc; k++) parcelas.push({ rotulo: `Parcela ${k}/${nParc}`, valor: k === nParc ? r2(resto - cada * (nParc - 1)) : cada, mes: k });
  } else {
    parcelas.push({ rotulo: 'À vista', valor: recomendado, mes: 0 });
  }
  if (c.modalidade === 'fixo') fixo = recomendado;

  const exitoEsperado = exitoPct > 0 ? r2(prob * proveito * pct(exitoPct)) : 0;
  const recebidoEsperado = (c.modalidade === 'exito' ? 0 : fixo * fatorFin) + exitoEsperado + sucumbEsperada;
  const liquido = recebidoEsperado * (1 - retencao);
  const lucroEsperado = r2(liquido - custoTotal);
  const margemEsperadaPct = recebidoEsperado > 0 ? r2((lucroEsperado / recebidoEsperado) * 100) : 0;
  const custas = custasEstimadas(c.valor_causa, p);
  const ocupacaoPct = horasMensais(p) > 0 ? r2(((horas / duracao) / horasMensais(p)) * 100) : 0;

  // ---- avisos
  if (totalCustosFixos(p) <= 0) alertas.push({ nivel: 'bad', texto: 'Nenhum custo fixo cadastrado: o cálculo parte de custo zero. Cadastre aluguel, folha, impostos e demais contas em Parâmetros.' });
  if (horasMensais(p) <= 0) alertas.push({ nivel: 'bad', texto: 'Informe os advogados produtivos e as horas faturáveis por mês.' });
  if (p.regime === 'presumido' || p.regime === 'simples_iv') alertas.push({ nivel: 'info', texto: `Tributação estimada em ${tributoPct.toFixed(2).replace('.', ',')}% da receita. Confirme com a contabilidade (adicional de IRPJ, ISS fixo de sociedade uniprofissional e CPP patronal não entram na estimativa).` });
  if (oab == null && c.modalidade !== 'hora') alertas.push({ nivel: 'info', texto: 'Sem valor da tabela da OAB para este serviço. Preencha em Parâmetros para o sistema nunca sugerir abaixo do mínimo da Seccional.' });
  if (oab != null && c.modalidade !== 'exito' && c.modalidade !== 'hora' && alvo < oab) alertas.push({ nivel: 'info', texto: `O cálculo por custo ficou abaixo da tabela da OAB (R$ ${oab.toFixed(2).replace('.', ',')}); o sistema usa a tabela como piso.` });
  if (c.modalidade === 'exito') {
    if (proveito <= 0) alertas.push({ nivel: 'warn', texto: 'Informe o proveito econômico esperado para calcular o percentual de êxito.' });
    alertas.push({ nivel: 'warn', texto: 'Somente êxito: o escritório banca todo o custo do caso e só recebe se vencer. Use com bom prognóstico e documentação sólida.' });
  }
  if (c.modalidade === 'misto' && proveito <= 0) alertas.push({ nivel: 'warn', texto: 'Informe o proveito econômico esperado para calcular o percentual de êxito.' });
  if (exitoPct > 30) alertas.push({ nivel: 'warn', texto: `Êxito de ${exitoPct}% é alto para o cliente e pode ser questionado; considere aumentar a parte fixa ou rever o prognóstico.` });
  const maxCobrado = fixo + (exitoPct > 0 ? proveito * pct(exitoPct) : 0);
  if (proveito > 0 && c.modalidade !== 'hora' && maxCobrado > 0) {
    const part = (maxCobrado / proveito) * 100;
    if (maxCobrado >= proveito) alertas.push({ nivel: 'bad', texto: 'Os honorários chegam ao proveito do cliente. Cláusula de êxito deve ser em dinheiro e, somada à sucumbência, não pode superar as vantagens do cliente (CED, art. 50).' });
    else if (part > 30) alertas.push({ nivel: 'warn', texto: `Os honorários correspondem a ${part.toFixed(0)}% do proveito esperado do cliente: avalie a proporcionalidade (CED, art. 49).` });
  }
  if (prob < 0.4 && (c.modalidade === 'exito' || c.modalidade === 'misto')) alertas.push({ nivel: 'warn', texto: 'Probabilidade de êxito abaixo de 40%: risco elevado para uma remuneração dependente do resultado.' });
  if (ocupacaoPct > 40) alertas.push({ nivel: 'warn', texto: `Este caso consome cerca de ${ocupacaoPct.toFixed(0)}% da capacidade mensal de horas do escritório.` });
  if (c.modalidade !== 'exito' && c.modalidade !== 'hora' && fixo > 0 && fixo * fatorFin * (1 - retencao) < custoTotal) alertas.push({ nivel: 'bad', texto: 'O valor proposto não cobre o custo do caso. Aumente o valor ou reduza o parcelamento.' });
  else if (c.modalidade !== 'exito' && margemEsperadaPct + 0.5 < p.margem_pct) alertas.push({ nivel: 'warn', texto: `A margem esperada (${margemEsperadaPct.toFixed(1).replace('.', ',')}%) fica abaixo da margem desejada (${p.margem_pct}%).` });
  if (c.valor_causa > 0) alertas.push({ nivel: 'info', texto: `Custas judiciais iniciais estimadas no TJMA: R$ ${custas.toFixed(2).replace('.', ',')} (${p.custas_pct}% do valor da causa, entre o piso e o teto). São despesa do cliente e não fazem parte dos honorários.` });
  if (c.abater_sucumbencia && sucumbEsperada > 0) alertas.push({ nivel: 'info', texto: 'A sucumbência esperada foi descontada do valor cobrado; ela só existe se houver condenação da parte contrária (CPC, art. 85) e pertence ao advogado (Estatuto, art. 23).' });
  if (alertas.every(a => a.nivel === 'info') && c.modalidade !== 'exito') alertas.unshift({ nivel: 'ok', texto: 'Proposta cobre custos, tributos e a margem desejada.' });

  return {
    horas, custoHora: chora, custoTrabalho, despesas, reserva, custoTotal, tributoPct, inadimplenciaPct: p.inadimplencia_pct, margemPct: p.margem_pct,
    piso, alvo, oab, oabAjustada, minimo, recomendado, premium, fatorFinanceiro: fatorFin, fixo: r2(fixo), exitoPct, exitoEsperado, parcelas,
    lucroEsperado, margemEsperadaPct, custasEstimadas: custas, ocupacaoPct, valorHora, alertas,
  };
}

/** Texto da forma de pagamento para o contrato de honorários ({{honorarios.forma}}). */
export function formaDePagamento(r: Resultado, c: CasoEntrada, fmt: (v: number) => string): string {
  if (c.modalidade === 'exito') return `sem pagamento antecipado, mediante êxito de ${String(r.exitoPct).replace('.', ',')}% sobre o proveito econômico obtido`;
  if (c.modalidade === 'hora') return `${r.valorHora != null ? fmt(r.valorHora) : ''} por hora técnica, faturadas mensalmente`;
  const par = r.parcelas.filter(p => p.mes > 0);
  const ent = r.parcelas.find(p => p.mes === 0);
  let t = !par.length ? 'à vista' : `${ent && ent.valor > 0 ? `entrada de ${fmt(ent.valor)} e ` : ''}${plural(par.length, 'parcela mensal', 'parcelas mensais')} de ${fmt(par[0].valor)}`;
  if (c.modalidade === 'misto' && r.exitoPct > 0) t += `, mais êxito de ${String(r.exitoPct).replace('.', ',')}% sobre o proveito econômico obtido`;
  return t;
}

// ---------------------------------------------------------------- propostas salvas
export type StatusProposta = 'rascunho' | 'enviada' | 'aceita' | 'recusada';
export const STATUS_PROPOSTA: readonly { id: StatusProposta; rotulo: string }[] = [
  { id: 'rascunho', rotulo: 'Rascunho' }, { id: 'enviada', rotulo: 'Enviada ao cliente' }, { id: 'aceita', rotulo: 'Aceita' }, { id: 'recusada', rotulo: 'Recusada' },
];
export interface PropostaHonorarios {
  id: string; cliente_id: string | null; processo_id: string | null; titulo: string; servico: string; modalidade: Modalidade; status: StatusProposta;
  valor_recomendado: number; valor_proposto: number; exito_pct: number; forma_pagamento: string | null;
  entrada: CasoEntrada; resultado: Resultado; observacoes: string | null; created_at: string; updated_at: string;
}

// ---------------------------------------------------------------- fundamentos (apoio técnico: confirmar a redação vigente)
export interface Norma { ambito: 'OAB' | 'Federal' | 'TJMA' | 'Tributário'; titulo: string; texto: string }
export const BASE_LEGAL: readonly Norma[] = [
  { ambito: 'OAB', titulo: 'Estatuto da Advocacia (Lei 8.906/1994), art. 22', texto: 'Honorários convencionados, fixados por arbitramento e de sucumbência. Sem estipulação, o arbitramento judicial segue o CPC, art. 85 (redação da Lei 14.365/2022); na falta de convenção, metade é devida no início e o restante no final do serviço.' },
  { ambito: 'OAB', titulo: 'Estatuto, arts. 23 a 25', texto: 'Honorários de sucumbência pertencem ao advogado (art. 23); o contrato escrito é título executivo (art. 24); a cobrança prescreve em 5 anos (art. 25).' },
  { ambito: 'OAB', titulo: 'Estatuto, art. 22, § 4º', texto: 'Se o contrato escrito for juntado antes da expedição do precatório ou RPV, o juiz determina o pagamento direto da parte dos honorários contratuais ao advogado, deduzida do crédito do cliente.' },
  { ambito: 'OAB', titulo: 'Código de Ética e Disciplina da OAB, arts. 48 a 50', texto: 'Contrato preferencialmente escrito, com objeto, valor, forma de pagamento e extensão do patrocínio (art. 48); critérios de moderação: relevância, complexidade, tempo, valor da causa, condição do cliente, local, renome e praxe do foro (art. 49); cláusula de êxito em dinheiro, que somada à sucumbência não pode superar as vantagens do cliente (art. 50).' },
  { ambito: 'OAB', titulo: 'Tabela de honorários da OAB-MA', texto: 'A Seccional publica valores mínimos de referência por serviço. A tabela não vincula o juiz, mas é parâmetro ético e serve de base na equidade (CPC, art. 85, § 8º-A). Preencha os valores vigentes em Parâmetros.' },
  { ambito: 'Federal', titulo: 'CPC, art. 85', texto: 'Sucumbência de 10% a 20% sobre a condenação, o proveito econômico ou o valor da causa (§ 2º); faixas especiais contra a Fazenda (§ 3º); equidade apenas nos casos do § 8º, observando o maior entre a tabela da Seccional e o piso de 10% (§ 8º-A, Lei 14.365/2022).' },
  { ambito: 'Federal', titulo: 'CLT, art. 791-A', texto: 'Na Justiça do Trabalho, honorários de sucumbência de 5% a 15% sobre o valor da condenação, do proveito econômico ou do valor da causa.' },
  { ambito: 'Federal', titulo: 'Lei 9.099/1995, arts. 54 e 55', texto: 'Nos juizados especiais não há custas no 1º grau; honorários de sucumbência só no recurso inominado (10% a 20%). Considere isso ao precificar causas de menor valor.' },
  { ambito: 'TJMA', titulo: 'Lei estadual 12.193/2023 (custas judiciais)', texto: 'Custas iniciais de 1º grau de 3% do valor da causa, com mínimo e máximo corrigidos anualmente (Resolução-GP do TJMA). Emolumentos seguem a Lei 9.109/2009. Atualize os limites em Parâmetros a cada ano.' },
  { ambito: 'Tributário', titulo: 'Simples Nacional (LC 123/2006), Anexo IV', texto: 'Sociedades de advogados no Simples recolhem pelo Anexo IV (faixas de 4,5% a 33%) e pagam a contribuição previdenciária patronal à parte, sobre a folha.' },
  { ambito: 'Tributário', titulo: 'Lucro presumido', texto: 'Para serviços, a base de IRPJ e CSLL é 32% da receita (Lei 9.249/1995, arts. 15 e 20), com PIS 0,65% e COFINS 3% cumulativos e ISS de 2% a 5% (LC 116/2003). Sociedades uniprofissionais podem ter ISS fixo por profissional.' },
];

// ---------------------------------------------------------------- proposta ao cliente
export interface DadosProposta {
  titulo: string; cliente: string; escritorio: string; advogado?: string | null; servico: string; modalidade: Modalidade;
  valor: number; exitoPct: number; forma: string; duracaoMeses: number; custas: number; dataExtenso: string; observacoes?: string | null;
}
/** Texto da proposta comercial entregue ao cliente (vai para Word pelo mesmo gerador das peças). */
export function textoProposta(d: DadosProposta, fmt: (v: number) => string): string {
  const linhas: string[] = [
    '# PROPOSTA DE HONORÁRIOS ADVOCATÍCIOS', '',
    `**Cliente:** ${d.cliente}`, `**Serviço:** ${d.servico}`, `**Referência:** ${d.titulo}`, `**Data:** ${d.dataExtenso}`, '',
    '## 1. Escopo',
    `Patrocínio e acompanhamento de: ${d.servico}, com prazo estimado de ${d.duracaoMeses} mês(es), que pode variar conforme a tramitação e as decisões do Judiciário. Estão incluídos o estudo do caso, a elaboração e o protocolo das peças, a prática dos atos do processo e o acompanhamento até a decisão da instância contratada. Recursos a instâncias superiores ${d.modalidade === 'exito' ? 'dependem de novo ajuste' : 'serão objeto de ajuste próprio'}.`,
    '', '## 2. Honorários',
  ];
  if (d.modalidade === 'exito') linhas.push(`Não há pagamento antecipado. Os honorários correspondem a **${String(d.exitoPct).replace('.', ',')}%** do proveito econômico efetivamente obtido, devidos somente em caso de êxito, em dinheiro.`);
  else if (d.modalidade === 'hora') linhas.push(`Honorários por hora técnica: ${d.forma}.`);
  else {
    linhas.push(`Valor total: **${fmt(d.valor)}**, a ser pago ${d.forma}.`);
    if (d.exitoPct > 0 && d.modalidade === 'misto') linhas.push(`Além disso, êxito de **${String(d.exitoPct).replace('.', ',')}%** sobre o proveito econômico obtido, em dinheiro.`);
  }
  linhas.push('', '## 3. Não estão incluídos',
    `Custas judiciais, taxas, emolumentos, honorários periciais, diligências e deslocamentos, que são de responsabilidade do cliente${d.custas > 0 ? ` (custas iniciais estimadas em ${fmt(d.custas)}, sujeitas à tabela vigente do tribunal)` : ''}. Os honorários de sucumbência, se fixados pelo juiz, pertencem ao advogado (Lei 8.906/1994, art. 23).`,
    '', '## 4. Condições',
    'O resultado do processo depende de decisão judicial; o escritório empenha seus melhores esforços técnicos, sem garantia de êxito. Esta proposta tem validade de 15 (quinze) dias e será formalizada em contrato escrito de honorários, conforme o Código de Ética e Disciplina da OAB.',
  );
  if (d.observacoes?.trim()) linhas.push('', '## 5. Observações', d.observacoes.trim());
  linhas.push('', `<< ${d.dataExtenso}.`, '', `>> **${d.advogado || d.escritorio}**`, d.advogado ? `>> ${d.escritorio}` : '');
  return linhas.join('\n');
}
