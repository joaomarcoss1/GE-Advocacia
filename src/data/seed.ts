/**
 * Dados fictícios do modo demonstração: uma PLATAFORMA e DOIS escritórios independentes.
 * Nada aqui é real: nomes, valores e PINs servem só para testar o sistema (inclusive o isolamento entre escritórios).
 */
import { CARGOS_PADRAO, ESCALAS_MODELO, mesclarConfig } from '@/lib/config';
import { addDays, agoraBR, brParaIso, definirFuso, eachDay, hhmmParaMin, primeiroDoMes, ultimoDoMes } from '@/lib/datetime';
import { feriadosPadrao } from '@/lib/feriados';
import { calcularFolha } from '@/lib/folha';
import { classificar, previstoDoTipo, sequenciaDoDia, turnoDaData } from '@/lib/ponto';
import { validarMudancaFolha } from '@/lib/regras';
import type {
  AjusteFolha, Cargo, Config, Escala, Feriado, Folha, Funcionario, Ocorrencia, RegistroPonto, Usuario,
} from '@/lib/types';

export const DEMO_PLATAFORMA = { email: 'plataforma@geadvocacia.com.br', senha: 'GEplataforma2026', nome: 'Equipe GE Advocacia' };

interface DefFunc { nome: string; cargo: string; escala: number; vinculo: Funcionario['vinculo']; sal: number; pin: string; oab?: string; pix?: string }
export interface DemoEscritorio {
  slug: string; nome: string; fuso: string; cidade: string;
  admin: { nome: string; email: string; senha: string };
  gerente: { nome: string; email: string; senha: string };
  equipe: DefFunc[];
}

export const DEMO_ESCRITORIOS: DemoEscritorio[] = [
  {
    slug: 'silva-ribeiro', nome: 'Silva & Ribeiro Advogados', fuso: 'America/Fortaleza', cidade: 'São Luís - MA',
    admin: { nome: 'Carlos Eduardo Silva', email: 'admin@silvaribeiro.adv.br', senha: 'silva2026admin' },
    gerente: { nome: 'Mariana Sousa Lima', email: 'gerencia@silvaribeiro.adv.br', senha: 'silva2026gerencia' },
    equipe: [
      { nome: 'Carlos Eduardo Silva', cargo: 'Sócio', escala: 0, vinculo: 'socio', sal: 9000, pin: '482913', oab: 'OAB/MA 10.001', pix: 'carlos@exemplo.com' },
      { nome: 'Mariana Sousa Lima', cargo: 'Gerente Administrativo', escala: 0, vinculo: 'clt', sal: 4500, pin: '739105', pix: '(98) 90000-0002' },
      { nome: 'Rafael Costa Ribeiro', cargo: 'Advogado', escala: 0, vinculo: 'clt', sal: 5200, pin: '561847', oab: 'OAB/MA 15.432', pix: '000.000.000-03' },
      { nome: 'Juliana Ferreira Nunes', cargo: 'Advogado', escala: 0, vinculo: 'clt', sal: 5200, pin: '902716', oab: 'OAB/MA 16.210', pix: 'juliana@exemplo.com' },
      { nome: 'Pedro Henrique Araújo', cargo: 'Estagiário', escala: 1, vinculo: 'estagio', sal: 1200, pin: '357951', pix: '(98) 90000-0005' },
      { nome: 'Ana Beatriz Martins', cargo: 'Secretário', escala: 0, vinculo: 'clt', sal: 1900, pin: '684120', pix: '000.000.000-06' },
      { nome: 'Lucas Oliveira Rocha', cargo: 'Auxiliar Administrativo', escala: 0, vinculo: 'clt', sal: 1800, pin: '215839', pix: 'lucas@exemplo.com' },
      { nome: 'Francisca Pereira', cargo: 'Serviços Gerais', escala: 2, vinculo: 'clt', sal: 1621, pin: '846302', pix: '(98) 90000-0008' },
    ],
  },
  {
    // Outro escritório, em outro fuso: prova que dados, horários e acessos são independentes.
    slug: 'monteiro-costa', nome: 'Monteiro Costa Advocacia', fuso: 'America/Manaus', cidade: 'Manaus - AM',
    admin: { nome: 'Helena Monteiro Costa', email: 'admin@monteirocosta.adv.br', senha: 'monteiro2026admin' },
    gerente: { nome: 'Marta Cavalcante', email: 'gerencia@monteirocosta.adv.br', senha: 'monteiro2026gerencia' },
    equipe: [
      { nome: 'Helena Monteiro Costa', cargo: 'Sócio', escala: 0, vinculo: 'socio', sal: 12000, pin: '918273', oab: 'OAB/AM 5.510', pix: 'helena@exemplo.com' },
      { nome: 'Otávio Prado Lemos', cargo: 'Advogado', escala: 0, vinculo: 'clt', sal: 6800, pin: '465192', oab: 'OAB/AM 7.804', pix: '000.000.000-11' },
      { nome: 'Sabrina Teles Amaral', cargo: 'Advogado', escala: 0, vinculo: 'clt', sal: 6100, pin: '370851', oab: 'OAB/AM 8.092', pix: 'sabrina@exemplo.com' },
      { nome: 'Gustavo Reis Duarte', cargo: 'Estagiário', escala: 1, vinculo: 'estagio', sal: 1300, pin: '829463', pix: '(92) 90000-0014' },
      { nome: 'Marta Cavalcante', cargo: 'Secretário', escala: 0, vinculo: 'clt', sal: 2100, pin: '514927', pix: '(92) 90000-0015' },
    ],
  },
];

function prng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const id = (p: string, n: number) => `${p}-${String(n).padStart(4, '0')}`;

export async function hashSecreto(chave: string, segredo: string): Promise<string> {
  const dados = new TextEncoder().encode(`ge:${chave}:${segredo}`);
  if (globalThis.crypto?.subtle) {
    const h = await crypto.subtle.digest('SHA-256', dados);
    return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let x = 2166136261; // fallback FNV-1a só para contextos sem HTTPS (demonstração)
  for (const b of dados) { x ^= b; x = Math.imul(x, 16777619); }
  return `fnv${(x >>> 0).toString(16)}`;
}

export interface SeedEscritorio {
  cargos: Cargo[]; escalas: Escala[]; funcionarios: Funcionario[]; registros: RegistroPonto[]; ocorrencias: Ocorrencia[];
  feriados: Feriado[]; ajustes: AjusteFolha[]; folhas: Folha[]; config: Config; usuarios: Usuario[];
}

/** Base de um escritório NOVO (criado pela plataforma): cargos, escalas e feriados; nenhum funcionário. */
export function baseEscritorioNovo(): Pick<SeedEscritorio, 'cargos' | 'escalas' | 'feriados'> {
  const ano = Number(agoraBR().data.slice(0, 4));
  return {
    cargos: CARGOS_PADRAO.map((c, i) => ({ id: id('cargo', i + 1), ...c, ativo: true })),
    escalas: ESCALAS_MODELO.map((e, i) => ({ id: id('escala', i + 1), ...e })),
    feriados: [...feriadosPadrao(ano), ...feriadosPadrao(ano + 1)].map((f, i) => ({ id: id('fer', i + 1), ...f })),
  };
}

/** Gera os dados de UM escritório. O relógio usado é o do fuso dele. */
export async function gerarSeedEscritorio(def: DemoEscritorio, escritorioId: string): Promise<SeedEscritorio> {
  definirFuso(def.fuso);
  const agora = agoraBR();
  const hoje = agora.data;
  const cargos: Cargo[] = CARGOS_PADRAO.map((c, i) => ({ id: id('cargo', i + 1), ...c, ativo: true }));
  const cargo = (nome: string) => cargos.find(c => c.nome.startsWith(nome))!.id;
  const escalas: Escala[] = ESCALAS_MODELO.map((e, i) => ({ id: id('escala', i + 1), ...e }));

  const base = { cpf: null, email: null, telefone: null, oab: null, pix: null, banco: null, agencia: null, conta: null, tipo_conta: null, data_desligamento: null, ativo: true, observacoes: null };
  const admissao = addDays(primeiroDoMes(hoje), -120);
  const funcionarios: Funcionario[] = [];
  for (const [i, d] of def.equipe.entries()) {
    const fid = id('func', i + 1);
    funcionarios.push({
      ...base, id: fid, nome: d.nome, cargo_id: cargo(d.cargo), escala_id: escalas[d.escala].id, vinculo: d.vinculo,
      salario_mensal: d.sal, data_admissao: admissao, oab: d.oab ?? null, pix: d.pix ?? null,
      tem_pin: true, pin_hash: await hashSecreto(fid, d.pin), created_at: new Date().toISOString(),
    });
  }

  const ano = Number(hoje.slice(0, 4));
  const feriados: Feriado[] = [...feriadosPadrao(ano - 1), ...feriadosPadrao(ano), ...feriadosPadrao(ano + 1)]
    .map((f, i) => ({ id: id('fer', i + 1), ...f }));
  const feriadoSet = new Set(feriados.map(f => f.data));

  const rnd = prng(def.slug.length * 7919 + 20260930);
  const inicio = addDays(primeiroDoMes(hoje), -31);
  const dias = eachDay(inicio, hoje);
  const ocorrencias: Ocorrencia[] = [];
  const registros: RegistroPonto[] = [];
  const ajustes: AjusteFolha[] = [];
  const cfg = mesclarConfig({}).ponto;

  const uteis = dias.filter(d => d < hoje && !feriadoSet.has(d) && turnoDaData(escalas[0], d));
  const advogado = Math.min(3, funcionarios.length - 1), advogado2 = Math.min(2, funcionarios.length - 1);
  const diaAt = uteis[uteis.length - 6], diaAud = uteis[uteis.length - 3];
  if (diaAt) ocorrencias.push({ id: id('oc', 1), funcionario_id: funcionarios[advogado].id, data_inicio: diaAt, data_fim: diaAt, tipo: 'atestado', remunerado: true, observacao: 'Atestado médico (1 dia)', created_at: new Date().toISOString(), status_analise: 'aceita', origem: 'painel' });
  if (diaAud) ocorrencias.push({ id: id('oc', 2), funcionario_id: funcionarios[advogado2].id, data_inicio: diaAud, data_fim: diaAud, tipo: 'audiencia_externa', remunerado: true, observacao: 'Audiência em outra comarca', created_at: new Date().toISOString(), status_analise: 'aceita', origem: 'painel' });

  let n = 0;
  for (const f of funcionarios) {
    const escala = escalas.find(e => e.id === f.escala_id)!;
    for (const d of dias) {
      const turno = turnoDaData(escala, d);
      if (!turno || feriadoSet.has(d) || d < f.data_admissao) continue;
      if (ocorrencias.some(o => o.funcionario_id === f.id && d >= o.data_inicio && d <= o.data_fim)) continue;
      if (d < hoje && rnd() < 0.045) continue; // falta
      const atrasa = rnd() < 0.09;
      const antecipa = rnd() < 0.03;
      for (const tipo of sequenciaDoDia(turno)) {
        const prev = previstoDoTipo(turno, tipo)!;
        let min = hhmmParaMin(prev) + Math.round((rnd() - 0.5) * 8);
        let just: string | null = null;
        if (tipo === 'entrada' && atrasa) { min = hhmmParaMin(prev) + 32 + Math.round(rnd() * 50); just = 'Trânsito intenso no caminho'; }
        if (tipo === 'saida' && antecipa) { min = hhmmParaMin(prev) - 45; just = 'Compromisso pessoal autorizado pela gerência'; }
        if (d === hoje && min > agora.minutos) continue;
        const hh = `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
        const c = classificar(tipo, prev, min, cfg);
        registros.push({
          id: id('reg', ++n), funcionario_id: f.id, data: d, tipo, horario_previsto: prev, horario_real: brParaIso(d, hh),
          diferenca_minutos: c.diferenca, status: c.status, justificativa: just, latitude: null, longitude: null,
          status_aprovacao: 'aprovado', retroativo: false, motivo_rejeicao: null, aprovado_por: null, aprovado_em: null, created_at: brParaIso(d, hh),
          // atrasos acima do limite já nascem decididos (aceitos), exceto os mais recentes, que ficam na fila do administrador
          analise: c.status === 'atraso' || c.status === 'saida_antecipada' ? (d >= addDays(hoje, -6) ? 'pendente' : 'aceita') : null,
        });
      }
    }
  }

  // Um ajuste de ponto retroativo aguardando aprovação da gerência
  const diaPend = uteis[uteis.length - 2];
  if (diaPend) {
    const f = funcionarios[Math.min(6, funcionarios.length - 1)];
    const antes = registros.findIndex(r => r.funcionario_id === f.id && r.data === diaPend && r.tipo === 'entrada');
    if (antes >= 0) registros.splice(antes, 1);
    registros.push({
      id: id('reg', ++n), funcionario_id: f.id, data: diaPend, tipo: 'entrada', horario_previsto: '08:00', horario_real: brParaIso(diaPend, '08:04'),
      diferenca_minutos: 4, status: 'pendente', justificativa: 'Esqueci de bater o ponto ao chegar.', latitude: null, longitude: null,
      status_aprovacao: 'pendente', retroativo: true, motivo_rejeicao: null, aprovado_por: null, aprovado_em: null, created_at: new Date().toISOString(),
    });
  }

  const mesAtual = primeiroDoMes(hoje);
  const dataAj = addDays(mesAtual, 4) < hoje ? addDays(mesAtual, 4) : hoje;
  ajustes.push(
    { id: id('aj', 1), funcionario_id: funcionarios[advogado2].id, data: dataAj, tipo: 'hora_extra', valor: 187.5, quantidade_horas: 10, motivo: 'Plantão para audiência', observacao: null, created_at: new Date().toISOString() },
    { id: id('aj', 2), funcionario_id: funcionarios[Math.min(6, funcionarios.length - 1)].id, data: dataAj, tipo: 'adiantamento', valor: 300, quantidade_horas: null, motivo: 'Vale', observacao: null, created_at: new Date().toISOString() },
    { id: id('aj', 3), funcionario_id: funcionarios[1].id, data: dataAj, tipo: 'adicional', valor: 250, quantidade_horas: null, motivo: 'Gratificação de função', observacao: null, created_at: new Date().toISOString() },
  );

  const config = mesclarConfig({ escritorio: { nome: def.nome, cnpj: '', endereco: '', cidade: def.cidade, telefone: '', email: '', oab_sociedade: '' } });

  // Mês anterior já fechado (só no primeiro escritório): demonstra o congelamento do período.
  const folhas: Folha[] = [];
  if (def.slug === DEMO_ESCRITORIOS[0].slug) {
    const prevFim = addDays(primeiroDoMes(hoje), -1), prevIni = primeiroDoMes(prevFim);
    for (const func of funcionarios) {
      const escala = escalas.find(e => e.id === func.escala_id) ?? null;
      const calc = calcularFolha({ func, escala, registros, ocorrencias, feriados, ajustes, config, inicio: prevIni, fim: ultimoDoMes(prevIni), hoje, agoraMin: agora.minutos });
      const nova: Folha = { ...calc, id: id('folha', folhas.length + 1), status: 'fechada', observacoes: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      try { validarMudancaFolha(null, nova, { admin: true, ocorrencias, registros }); folhas.push(nova); } catch { /* há item em análise no mês: fica aberta */ }
    }
  }

  const usuarios: Usuario[] = [
    { id: `${escritorioId}-admin`, email: def.admin.email, nome: def.admin.nome, papel: 'admin', senha_hash: await hashSecreto(def.admin.email, def.admin.senha), ativo: true },
    { id: `${escritorioId}-gerente`, email: def.gerente.email, nome: def.gerente.nome, papel: 'gerente', senha_hash: await hashSecreto(def.gerente.email, def.gerente.senha), ativo: true },
  ];
  return { cargos, escalas, funcionarios, registros, ocorrencias, feriados, ajustes, folhas, config, usuarios };
}
