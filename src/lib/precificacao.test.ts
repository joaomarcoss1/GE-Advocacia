import { describe, expect, it } from 'vitest';
import {
  BASE_LEGAL, CASO_PADRAO, PARAMETROS_PADRAO, SERVICOS, aliquotaEfetiva, aliquotaSimplesIV, arredondar, calcular, custasEstimadas, custoHora, custoMensalEquipe, fatorValorPresente,
  formaDePagamento, normalizarParametros, totalCustosFixos, type CasoEntrada, type ParametrosHonorarios,
} from './precificacao';

const P = (o: Partial<ParametrosHonorarios> = {}): ParametrosHonorarios => normalizarParametros({
  custos: [{ id: '1', categoria: 'aluguel', descricao: 'Sala', valor_mensal: 3000 }, { id: '2', categoria: 'folha', descricao: 'Equipe', valor_mensal: 9000 }, { id: '3', categoria: 'energia', descricao: 'Luz', valor_mensal: 600 }, { id: '4', categoria: 'prolabore', descricao: 'Sócios', valor_mensal: 12000 }],
  advogados_produtivos: 2, horas_faturaveis_mes: 100, regime: 'manual', aliquota_manual_pct: 10, inadimplencia_pct: 5, reserva_pct: 0, margem_pct: 25, ...o,
});
const C = (o: Partial<CasoEntrada> = {}): CasoEntrada => ({ ...CASO_PADRAO, audiencias: 0, duracao_meses: 1, ...o });

describe('custos do escritório', () => {
  it('soma os custos e calcula o custo da hora', () => {
    expect(totalCustosFixos(P())).toBe(24600);
    expect(custoHora(P())).toBe(123);                                   // 24.600 ÷ 200 h
  });
  it('sem horas não divide por zero', () => {
    expect(custoHora(normalizarParametros({ ...P(), horas_faturaveis_mes: 10, advogados_produtivos: 0.5 }))).toBe(4920);
  });
  it('custo da equipe: CLT paga encargos, estágio não, desligado fora', () => {
    expect(custoMensalEquipe([{ salario_mensal: 2000, vinculo: 'clt', data_desligamento: null }, { salario_mensal: 1000, vinculo: 'estagio', data_desligamento: null }, { salario_mensal: 5000, vinculo: 'clt', data_desligamento: '2026-01-01' }], 35)).toBe(3700);
  });
});

describe('tributos', () => {
  it('Simples Anexo IV: alíquota efetiva pela faixa e dedução', () => {
    expect(aliquotaSimplesIV(100000)).toBeCloseTo(4.5, 5);
    expect(aliquotaSimplesIV(360000)).toBeCloseTo(((360000 * 0.09 - 8100) / 360000) * 100, 5);       // 6,75%
    expect(aliquotaSimplesIV(1000000)).toBeCloseTo(((1000000 * 0.14 - 39000) / 1000000) * 100, 5);
  });
  it('presumido soma IRPJ, CSLL, PIS, COFINS e ISS', () => {
    expect(aliquotaEfetiva(P({ regime: 'presumido', iss_pct: 3 }))).toBe(14.33);
    expect(aliquotaEfetiva(P({ regime: 'manual', aliquota_manual_pct: 12.5 }))).toBe(12.5);
  });
});

describe('cálculo de honorários', () => {
  it('o piso cobre custo, tributo e inadimplência; o alvo acrescenta a margem', () => {
    const r = calcular(P(), C({ servico_id: 'consulta', modalidade: 'fixo' }));
    expect(r.horas).toBe(1.5);
    expect(r.custoTotal).toBeCloseTo(184.5, 2);
    expect(r.piso).toBeCloseTo(184.5 / 0.85, 1);                         // 1 − 10% − 5%
    expect(r.alvo).toBeCloseTo(184.5 / 0.6, 1);                          // − 25% de margem
    expect(r.recomendado).toBeGreaterThanOrEqual(r.alvo);
    expect(r.recomendado - r.alvo).toBeLessThan(10);
    expect(r.premium).toBeGreaterThan(r.recomendado);
  });
  it('um caso de 4 meses: mais complexo e mais longo custa mais', () => {
    const base = calcular(P(), C({ duracao_meses: 4, audiencias: 1 }));
    const longo = calcular(P(), C({ duracao_meses: 18, audiencias: 1 }));
    const alta = calcular(P(), C({ duracao_meses: 4, audiencias: 1, complexidade: 'alta' }));
    expect(longo.recomendado).toBeGreaterThan(base.recomendado);
    expect(alta.recomendado).toBeGreaterThan(base.recomendado);
    expect(base.horas).toBeCloseTo(22 + 0.75 * 3 + 4, 5);
  });
  it('a tabela da OAB é piso: nunca sugere abaixo dela', () => {
    const baixo = calcular(P(), C({ servico_id: 'consulta', modalidade: 'fixo' }));
    const comTabela = calcular(P({ tabela_oab: { consulta: 800 } }), C({ servico_id: 'consulta', modalidade: 'fixo' }));
    expect(comTabela.recomendado).toBeGreaterThanOrEqual(800);
    expect(comTabela.recomendado).toBeGreaterThan(baixo.recomendado);
    expect(comTabela.alertas.some(a => /abaixo da tabela/.test(a.texto))).toBe(true);
  });
  it('o parcelamento embute o custo do dinheiro no tempo', () => {
    expect(fatorValorPresente(30, 4, 1)).toBeLessThan(1);
    expect(fatorValorPresente(100, 4, 1)).toBe(1);
    expect(fatorValorPresente(30, 0, 1)).toBe(1);
    const vista = calcular(P(), C({ modalidade: 'fixo' }));
    const parc = calcular(P(), C({ modalidade: 'parcelado', entrada_pct: 20, parcelas: 6 }));
    expect(parc.recomendado).toBeGreaterThan(vista.recomendado - 1);
    expect(parc.parcelas).toHaveLength(7);
    expect(parc.parcelas.reduce((s, x) => s + x.valor, 0)).toBeCloseTo(parc.recomendado, 1);
  });
  it('parcelas somam exatamente o total (sem sobra de centavos)', () => {
    const r = calcular(P(), C({ modalidade: 'parcelado', entrada_pct: 33, parcelas: 7 }));
    expect(Math.round(r.parcelas.reduce((s, x) => s + x.valor, 0) * 100)).toBe(Math.round(r.recomendado * 100));
  });
  it('êxito puro pede percentual alto e avisa do risco; misto reduz o percentual', () => {
    const exito = calcular(P(), C({ modalidade: 'exito', proveito_estimado: 100000, probabilidade_exito_pct: 70 }));
    const misto = calcular(P(), C({ modalidade: 'misto', proveito_estimado: 100000, probabilidade_exito_pct: 70, entrada_pct: 30, parcelas: 2 }));
    expect(exito.fixo).toBe(0);
    expect(exito.exitoPct).toBeGreaterThan(0);
    expect(misto.exitoPct).toBeLessThan(exito.exitoPct);
    expect(exito.alertas.some(a => /banca todo o custo/.test(a.texto))).toBe(true);
    expect(exito.exitoEsperado + misto.fixo * 0).toBeGreaterThan(0);
  });
  it('sem proveito informado, pede o dado em vez de inventar percentual', () => {
    const r = calcular(P(), C({ modalidade: 'exito', proveito_estimado: 0 }));
    expect(r.exitoPct).toBe(0);
    expect(r.alertas.some(a => /proveito econômico/.test(a.texto))).toBe(true);
  });
  it('avisa quando os honorários chegam ao proveito do cliente (CED, art. 50)', () => {
    const r = calcular(P(), C({ servico_id: 'civel_indeniz', modalidade: 'fixo', proveito_estimado: 2000 }));
    expect(r.alertas.some(a => a.nivel === 'bad' && /art\. 50/.test(a.texto))).toBe(true);
  });
  it('sem custos cadastrados, alerta forte', () => {
    const r = calcular(normalizarParametros({}), C());
    expect(r.alertas.some(a => a.nivel === 'bad' && /custo fixo/.test(a.texto))).toBe(true);
  });
  it('por hora: valor da hora cobre o custo-hora com margem e impostos', () => {
    const r = calcular(P(), C({ modalidade: 'hora' }));
    expect(r.valorHora).not.toBeNull();
    expect(r.valorHora!).toBeGreaterThan(123 / 0.6 - 5);
  });
  it('a sucumbência esperada pode abater o valor cobrado, nunca abaixo de zero', () => {
    const sem = calcular(P(), C({ valor_causa: 50000, probabilidade_exito_pct: 80 }));
    const com = calcular(P(), C({ valor_causa: 50000, probabilidade_exito_pct: 80, abater_sucumbencia: true }));
    expect(com.alvo).toBeLessThan(sem.alvo);
    expect(com.alvo).toBeGreaterThanOrEqual(0);
  });
  it('é determinístico e nunca devolve NaN/Infinity', () => {
    for (const s of SERVICOS) for (const m of ['fixo', 'parcelado', 'misto', 'exito', 'hora'] as const) {
      const r = calcular(P(), C({ servico_id: s.id, modalidade: m, proveito_estimado: 80000, valor_causa: 80000 }));
      for (const v of [r.horas, r.piso, r.alvo, r.recomendado, r.premium, r.fixo, r.lucroEsperado]) expect(Number.isFinite(v), `${s.id}/${m}`).toBe(true);
    }
  });
  it('margem esperada bate com a desejada em valor fechado', () => {
    const r = calcular(P({ margem_pct: 30 }), C({ modalidade: 'fixo', servico_id: 'civel_defesa', duracao_meses: 4 }));
    expect(r.margemEsperadaPct).toBeGreaterThanOrEqual(29.5);
  });
});

describe('custas e utilitários', () => {
  it('custas do TJMA: 3% do valor da causa entre piso e teto', () => {
    const p = P();
    expect(custasEstimadas(100000, p)).toBe(3000);
    expect(custasEstimadas(1000, p)).toBe(p.custas_piso);
    expect(custasEstimadas(5_000_000, p)).toBe(p.custas_teto);
    expect(custasEstimadas(0, p)).toBe(0);
  });
  it('arredonda para cima no passo', () => {
    expect(arredondar(1234.01)).toBe(1240);
    expect(arredondar(1230)).toBe(1230);
    expect(arredondar(0)).toBe(0);
  });
  it('normaliza parâmetros antigos e inválidos', () => {
    const p = normalizarParametros({ margem_pct: 999, horas_faturaveis_mes: -5, custos: 'x' as never });
    expect(p.margem_pct).toBe(80);
    expect(p.horas_faturaveis_mes).toBe(10);
    expect(p.custos).toEqual([]);
    expect(PARAMETROS_PADRAO.custas_pct).toBe(3);
  });
  it('texto da forma de pagamento', () => {
    const fmt = (v: number) => `R$ ${v.toFixed(2)}`;
    const c = C({ modalidade: 'parcelado', entrada_pct: 30, parcelas: 4 });
    const r = calcular(P(), c);
    expect(formaDePagamento(r, c, fmt)).toMatch(/^entrada de R\$ .* e 4 parcelas mensais de R\$/);
    const c2 = C({ modalidade: 'exito', proveito_estimado: 50000 });
    expect(formaDePagamento(calcular(P(), c2), c2, fmt)).toMatch(/êxito de/);
  });
  it('catálogo e base legal bem formados', () => {
    expect(new Set(SERVICOS.map(s => s.id)).size).toBe(SERVICOS.length);
    for (const s of SERVICOS) { expect(s.horas).toBeGreaterThan(0); expect(s.meses).toBeGreaterThanOrEqual(1); }
    expect(BASE_LEGAL.some(n => n.ambito === 'TJMA')).toBe(true);
    expect(BASE_LEGAL.some(n => n.ambito === 'OAB')).toBe(true);
    expect(BASE_LEGAL.some(n => n.ambito === 'Federal')).toBe(true);
  });
});

import { textoProposta } from './precificacao';
describe('proposta ao cliente', () => {
  const fmt = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;
  const base = { titulo: 'Cobrança X', cliente: 'Maria', escritorio: 'Silva Adv.', servico: 'Ação de cobrança', modalidade: 'parcelado' as const, valor: 4000, exitoPct: 0, forma: 'entrada de R$ 1.200,00 e 4 parcelas', duracaoMeses: 4, custas: 300, dataExtenso: '8 de outubro de 2026' };
  it('traz valor, forma, o que não está incluído e a ressalva de não garantir resultado', () => {
    const t = textoProposta(base, fmt);
    expect(t).toContain('**R$ 4000,00**');
    expect(t).toContain('entrada de R$ 1.200,00 e 4 parcelas');
    expect(t).toContain('Custas judiciais');
    expect(t).toContain('sem garantia de êxito');
    expect(t).toContain('R$ 300,00');
  });
  it('êxito puro não cobra nada antes', () => {
    const t = textoProposta({ ...base, modalidade: 'exito', exitoPct: 20, valor: 0 }, fmt);
    expect(t).toContain('Não há pagamento antecipado');
    expect(t).toContain('20%');
    expect(t).not.toContain('Valor total');
  });
});
