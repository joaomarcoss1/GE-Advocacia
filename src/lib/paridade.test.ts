import { describe, expect, it } from 'vitest';
import casos from './__fixtures__/casos-regra.json';
import { hhmmParaMin } from './datetime';
import { calcularFolha } from './folha';
import { classificar, previstoDoTipo, turnoDaData } from './ponto';
import type { Config, Escala, Funcionario, Ocorrencia, RegistroPonto, TipoMarcacao } from './types';

/** Mesmos casos rodam no Postgres (supabase/tests_60_paridade.sql) e no modo demonstração (local.paridade.test.ts). */
describe('paridade · classificar (TypeScript)', () => {
  for (const c of casos.classificar) {
    it(c.rotulo, () => {
      const r = classificar(c.tipo as TipoMarcacao, c.previsto, hhmmParaMin(c.real), { tolerancia_min: c.tol, limite_atraso_min: c.lim });
      expect(r).toEqual({ diferenca: c.diferenca, status: c.status });
    });
  }
});

const escalaDe = (nome: keyof typeof casos.escalas): Escala => ({ id: 'e', nome, ativo: true, dias: casos.escalas[nome] as unknown as Escala['dias'] });
// 2026-06-01 é segunda-feira: dow N cai em 2026-06-(N === 0 ? 7 : N)
const dataDoDow = (dow: number) => `2026-06-${String(dow === 0 ? 7 : dow).padStart(2, '0')}`;

describe('paridade · turno previsto (TypeScript)', () => {
  for (const c of casos.turno) {
    it(c.rotulo, () => {
      const turno = turnoDaData(escalaDe(c.dias as keyof typeof casos.escalas), dataDoDow(c.dow));
      expect(previstoDoTipo(turno, c.tipo as TipoMarcacao)).toBe(c.previsto);
    });
  }
});

const config: Config = {
  escritorio: { nome: '', cnpj: '', endereco: '', cidade: '', telefone: '', email: '', oab_sociedade: '' },
  ponto: { tolerancia_min: 5, limite_atraso_min: 30, geofence_ativo: false, geofence_lat: null, geofence_lng: null, geofence_raio_m: 300, geofence_endereco: '' },
  folha: { periodicidade: 'mensal', descontar_atrasos: false, hora_extra_pct: 50 },
  privacidade: { anexos_meses: 60, geolocalizacao_meses: 12 },
};
const func: Funcionario = {
  id: 'f1', nome: 'Teste', cpf: null, email: null, telefone: null, cargo_id: null, escala_id: 'e', vinculo: 'clt', salario_mensal: 2600,
  data_admissao: '2020-01-01', data_desligamento: null, oab: null, pix: null, banco: null, agencia: null, conta: null, tipo_conta: null,
  tem_pin: true, ativo: true, observacoes: null, created_at: '',
};

describe('paridade · cenários de folha (TypeScript)', () => {
  for (const c of casos.folha as { rotulo: string; feriados?: string[]; faltas_dias: string[]; ocorrencias: { inicio: string; fim: string; status: string; remunerado: boolean }[]; esperado: { faltas: number; valor_final: number; abonados?: number; previstos?: number } }[]) {
    it(c.rotulo, () => {
      const feriados = (c.feriados ?? []).map((d, i) => ({ id: `fer${i}`, data: d, nome: 'Feriado', tipo: 'nacional' as const }));
      const ferSet = new Set(feriados.map(f => f.data));
      // presença em todos os dias seg–sáb de junho, exceto os dias de falta
      const regs: RegistroPonto[] = [];
      for (let d = 1; d <= 30; d++) {
        const data = `2026-06-${String(d).padStart(2, '0')}`;
        if (new Date(`${data}T12:00Z`).getUTCDay() === 0 || c.faltas_dias.includes(data)) continue;
        regs.push({ id: data, funcionario_id: 'f1', data, tipo: 'entrada', horario_previsto: '08:00', horario_real: '', diferenca_minutos: 0, status: 'no_horario', justificativa: null, latitude: null, longitude: null, status_aprovacao: 'aprovado', retroativo: false, motivo_rejeicao: null, aprovado_por: null, aprovado_em: null, created_at: '' });
      }
      const ocs: Ocorrencia[] = c.ocorrencias.map((o, i) => ({ id: `o${i}`, funcionario_id: 'f1', data_inicio: o.inicio, data_fim: o.fim, tipo: 'atestado', remunerado: o.remunerado, observacao: null, created_at: '', status_analise: o.status as Ocorrencia['status_analise'] }));
      void ferSet;
      const r = calcularFolha({ func, escala: escalaDe('COM'), registros: regs, ocorrencias: ocs, feriados, ajustes: [], config, inicio: '2026-06-01', fim: '2026-06-30', hoje: '2026-07-15', agoraMin: 600 });
      expect(r.faltas).toBe(c.esperado.faltas);
      expect(r.valor_final).toBe(c.esperado.valor_final);
      if (c.esperado.abonados != null) expect(r.dias_abonados).toBe(c.esperado.abonados);
      if (c.esperado.previstos != null) expect(r.dias_previstos).toBe(c.esperado.previstos);
    });
  }
});
