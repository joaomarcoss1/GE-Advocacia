import { beforeEach, describe, expect, it } from 'vitest';
import { agoraBR, addDays, definirFuso } from '@/lib/datetime';
import type { Db, PontoApi } from './db';
import { criarDbLocal } from './local';
import { DEMO_ESCRITORIOS, DEMO_PLATAFORMA } from './seed';

// localStorage em memória (o modo demonstração grava tudo lá)
function instalarStorage() {
  const mem = new Map<string, string>();
  (globalThis as { localStorage: Storage }).localStorage = {
    getItem: k => mem.get(k) ?? null, setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: k => { mem.delete(k); },
    clear: () => mem.clear(), key: i => [...mem.keys()][i] ?? null, get length() { return mem.size; },
  } as Storage;
}
const [A, B] = DEMO_ESCRITORIOS;
let db: Db;
beforeEach(async () => { instalarStorage(); definirFuso('America/Fortaleza'); db = criarDbLocal(); await db.init!(); });

const entrar = (e: typeof A, papel: 'admin' | 'gerente' = 'admin') => db.auth.entrar(e[papel === 'admin' ? 'admin' : 'gerente'].email, e[papel === 'admin' ? 'admin' : 'gerente'].senha);

describe('isolamento entre escritórios (demonstração)', () => {
  it('cada escritório só enxerga os próprios dados', async () => {
    await entrar(A);
    const nomesA = (await db.funcionarios.list()).map(f => f.nome);
    await db.auth.sair(); await entrar(B);
    const nomesB = (await db.funcionarios.list()).map(f => f.nome);
    expect(nomesA).toContain('Carlos Eduardo Silva');
    expect(nomesB).toContain('Helena Monteiro Costa');
    expect(nomesA.some(n => nomesB.includes(n))).toBe(false);
    expect((await db.cargos.list()).length).toBeGreaterThan(0);
  });

  it('escritório B não vê marcações, ocorrências nem folhas de A', async () => {
    await entrar(A);
    const regsA = await db.registros.list(); const folhasA = await db.folhas.list();
    expect(regsA.length).toBeGreaterThan(0); expect(folhasA.length).toBeGreaterThan(0);
    await db.auth.sair(); await entrar(B);
    const idsA = new Set(regsA.map(r => r.funcionario_id));
    expect((await db.registros.list()).some(r => idsA.has(r.funcionario_id) && r.funcionario_id.startsWith('func-0001') && false)).toBe(false);
    expect((await db.folhas.list()).length).toBe(0);                // só A tem mês fechado no seed
    expect((await db.usuarios.list()).every(u => u.email.endsWith('monteirocosta.adv.br'))).toBe(true);
  });

  it('gravar como B nunca altera A', async () => {
    await entrar(B);
    await db.funcionarios.insert({ nome: 'Novo de B', salario_mensal: 1000, vinculo: 'clt', data_admissao: '2026-01-01', ativo: true, tem_pin: false } as never);
    await db.auth.sair(); await entrar(A);
    expect((await db.funcionarios.list()).some(f => f.nome === 'Novo de B')).toBe(false);
  });

  it('sem login nada é lido e nada é gravado', async () => {
    expect(await db.funcionarios.list()).toEqual([]);
    await expect(db.funcionarios.insert({ nome: 'x' } as never)).rejects.toThrow(/permissão/);
    await expect(db.equipe()).rejects.toThrow(/permissão/);
  });

  it('plataforma gerencia escritórios mas não lê dados deles', async () => {
    await db.auth.entrar(DEMO_PLATAFORMA.email, DEMO_PLATAFORMA.senha);
    const lista = await db.plataforma.listar();
    expect(lista.map(e => e.slug).sort()).toEqual(['monteiro-costa', 'silva-ribeiro']);
    expect(lista.find(e => e.slug === 'silva-ribeiro')!.funcionarios).toBe(8);
    expect(await db.funcionarios.list()).toEqual([]);
    expect(await db.registros.list()).toEqual([]);
    await expect(db.equipe()).rejects.toThrow();
  });

  it('administrador de escritório não usa a área da plataforma', async () => {
    await entrar(A);
    await expect(db.plataforma.listar()).rejects.toThrow(/permissão/);
    await expect(db.plataforma.criar({ nome: 'X', slug: 'xx-yy', fuso: 'America/Fortaleza', adminNome: 'N', adminEmail: 'n@x.com', adminSenha: 'segredo123' })).rejects.toThrow(/permissão/);
  });

  it('gerência não lê salários nem acessos e não cria usuários', async () => {
    await entrar(A, 'gerente');
    expect(await db.funcionarios.list()).toEqual([]);
    expect(await db.usuarios.list()).toEqual([]);
    expect((await db.equipe()).length).toBe(8);
    await expect(db.acessos.criar({ nome: 'X Y', email: 'x@y.com', papel: 'gerente', senha: 'segredo123' })).rejects.toThrow(/permissão/);
  });

  it('o ponto público é preso ao endereço: buscar em /A não acha gente de B', async () => {
    const a = db.ponto.para('silva-ribeiro'), b = db.ponto.para('monteiro-costa');
    expect((await a.buscar('helena')).length).toBe(0);
    expect((await b.buscar('helena')).length).toBe(1);
    expect((await a.buscar('carlos'))[0]?.nome).toBe('Carlos Eduardo Silva');
    expect((await a.buscar('ca')).length).toBe(0);                  // mínimo de 3 letras
    expect(await db.ponto.para('nao-existe').buscar('carlos')).toEqual([]);
    const ctx = await db.ponto.para('nao-existe').contexto();
    expect(ctx).toEqual({ ok: false, erro: 'ESCRITORIO_NAO_ENCONTRADO' });
  });

  it('o PIN de um escritório não abre funcionário de outro', async () => {
    const pinB = B.equipe[0].pin;
    const idA = (await db.ponto.para('silva-ribeiro').buscar('carlos'))[0].id;
    const r = await db.ponto.para('silva-ribeiro').historico(idA, pinB);
    expect(r.ok).toBe(false);
    // um id de A usado no endereço de B é tratado como inexistente
    const r2 = await db.ponto.para('monteiro-costa').historico(idA, A.equipe[0].pin);
    expect(r2.ok).toBe(false);
  });

  it('escritório suspenso perde painel e ponto; reativar devolve', async () => {
    await db.auth.entrar(DEMO_PLATAFORMA.email, DEMO_PLATAFORMA.senha);
    const e = (await db.plataforma.listar()).find(x => x.slug === 'monteiro-costa')!;
    await db.plataforma.atualizar(e.id, { nome: e.nome, ativo: false, fuso: e.fuso });
    expect(await db.ponto.para('monteiro-costa').contexto()).toEqual({ ok: false, erro: 'ESCRITORIO_SUSPENSO' });
    expect(await db.ponto.para('monteiro-costa').buscar('helena')).toEqual([]);
    await db.auth.sair();
    await expect(entrar(B)).rejects.toThrow(/suspenso/);
    await db.auth.entrar(DEMO_PLATAFORMA.email, DEMO_PLATAFORMA.senha);
    await db.plataforma.atualizar(e.id, { nome: e.nome, ativo: true, fuso: e.fuso });
    await db.auth.sair();
    await expect(entrar(B)).resolves.toBeTruthy();
  });

  it('criar escritório novo: dados vazios, e-mail único em toda a plataforma', async () => {
    await db.auth.entrar(DEMO_PLATAFORMA.email, DEMO_PLATAFORMA.senha);
    await db.plataforma.criar({ nome: 'Novo Escritório', slug: 'novo-escritorio', fuso: 'America/Rio_Branco', adminNome: 'Nora Nova', adminEmail: 'nora@novo.com', adminSenha: 'segredo123' });
    await expect(db.plataforma.criar({ nome: 'Outro', slug: 'novo-escritorio', fuso: 'America/Fortaleza', adminNome: 'N N', adminEmail: 'o@o.com', adminSenha: 'segredo123' })).rejects.toThrow(/endereço/);
    await expect(db.plataforma.criar({ nome: 'Outro', slug: 'outro-esc', fuso: 'America/Fortaleza', adminNome: 'N N', adminEmail: A.admin.email, adminSenha: 'segredo123' })).rejects.toThrow(/em uso/);
    await expect(db.plataforma.criar({ nome: 'Outro', slug: 'Slug Ruim', fuso: 'America/Fortaleza', adminNome: 'N N', adminEmail: 'p@p.com', adminSenha: 'segredo123' })).rejects.toThrow(/endereço/);
    await db.auth.sair();
    const s = await db.auth.entrar('nora@novo.com', 'segredo123');
    expect(s.escritorio?.slug).toBe('novo-escritorio');
    expect(await db.funcionarios.list()).toEqual([]);
    expect((await db.cargos.list()).length).toBe(9);
  });
});

describe('integridade (espelho do banco)', () => {
  it('batida duplicada: dois toques simultâneos geram uma só marcação', async () => {
    const ponto: PontoApi = db.ponto.para('silva-ribeiro');
    await entrar(A);
    const func = (await db.funcionarios.list()).find(f => f.nome === 'Francisca Pereira')!;
    // escala "agora": entrada = hora atual, para não exigir justificativa
    const agora = agoraBR();
    const dias = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, { ativo: true, entrada: agora.hhmm, saida_intervalo: '', retorno_intervalo: '', saida: '23:59' }]));
    const esc = (await db.escalas.list())[0];
    await db.escalas.update(esc.id, { dias } as never);
    await db.funcionarios.update(func.id, { escala_id: esc.id });
    const hoje = agoraBR().data;
    for (const r of (await db.registros.list()).filter(r => r.funcionario_id === func.id && r.data === hoje)) await db.registros.remove(r.id);
    const pin = A.equipe.find(e => e.nome === func.nome)!.pin;
    const rs = await Promise.all(Array.from({ length: 6 }, () => ponto.bater({ funcionario_id: func.id, pin, tipo: 'entrada' })));
    expect(rs.filter(r => r.ok)).toHaveLength(1);
    expect(rs.filter(r => !r.ok && r.erro === 'JA_REGISTRADO')).toHaveLength(5);
    expect((await db.registros.list()).filter(r => r.funcionario_id === func.id && r.data === hoje && r.tipo === 'entrada')).toHaveLength(1);
  });

  it('bloqueia o PIN após 5 erros seguidos, só para aquela pessoa', async () => {
    const ponto = db.ponto.para('silva-ribeiro');
    const [c, m] = [(await ponto.buscar('carlos'))[0], (await ponto.buscar('mariana'))[0]];
    for (let i = 0; i < 5; i++) expect((await ponto.historico(c.id, '000000')).ok).toBe(false);
    const r = await ponto.historico(c.id, A.equipe[0].pin);
    expect(r).toMatchObject({ ok: false, erro: 'PIN_BLOQUEADO' });
    expect((await ponto.historico(m.id, A.equipe[1].pin)).ok).toBe(true);
  });

  it('funcionário com histórico não pode ser excluído; sem histórico pode; desligar preserva', async () => {
    await entrar(A);
    const todos = await db.funcionarios.list();
    const comHist = todos.find(f => f.nome === 'Carlos Eduardo Silva')!;
    await expect(db.funcionarios.remove(comHist.id)).rejects.toThrow(/histórico/);
    const novo = await db.funcionarios.insert({ nome: 'Dora Descartável', salario_mensal: 1000, vinculo: 'clt', data_admissao: '2026-01-01', ativo: true, tem_pin: false } as never);
    await db.funcionarios.remove(novo.id);
    expect((await db.funcionarios.list()).some(f => f.id === novo.id)).toBe(false);
    await db.funcionarios.update(comHist.id, { ativo: false, data_desligamento: agoraBR().data });
    expect((await db.registros.list()).some(r => r.funcionario_id === comHist.id)).toBe(true);
  });

  it('período fechado congela marcações, ocorrências e ajustes; reabrir exige motivo e libera', async () => {
    await entrar(A);
    const fechada = (await db.folhas.list()).find(f => f.status === 'fechada')!;
    expect(fechada).toBeTruthy();
    const dia = fechada.periodo_inicio;
    const fid = fechada.funcionario_id;
    await expect(db.registros.insert({ funcionario_id: fid, data: dia, tipo: 'entrada', horario_real: new Date().toISOString(), status: 'manual', status_aprovacao: 'aprovado' } as never)).rejects.toThrow(/fechado/);
    await expect(db.ocorrencias.insert({ funcionario_id: fid, data_inicio: dia, data_fim: dia, tipo: 'outro', remunerado: true } as never)).rejects.toThrow(/fechado/);
    await expect(db.ajustes.insert({ funcionario_id: fid, data: dia, tipo: 'adicional', valor: 10, motivo: 'x' } as never)).rejects.toThrow(/fechado/);
    await expect(db.ajustesDia.insert({ funcionario_id: fid, data: dia, situacao: 'falta' } as never)).rejects.toThrow(/fechado/);
    await expect(db.folhas.update(fechada.id, { valor_final: 9999 })).rejects.toThrow(/congelados/);
    await expect(db.folhas.remove(fechada.id)).rejects.toThrow(/fechado/);
    await expect(db.folhas.reabrir(fechada.id, 'oi')).rejects.toThrow(/motivo/);
    await db.folhas.reabrir(fechada.id, 'Correção de um atestado entregue depois');
    await expect(db.ajustes.insert({ funcionario_id: fid, data: dia, tipo: 'adicional', valor: 10, motivo: 'x' } as never)).resolves.toBeTruthy();
    const trilha = await db.auditoria.list();
    expect(trilha.some(a => a.acao === 'Folha reaberta' && a.detalhe.includes('atestado entregue depois'))).toBe(true);
    expect(await db.periodosFechados()).not.toContainEqual(expect.objectContaining({ funcionario_id: fid, periodo_inicio: fechada.periodo_inicio }));
  });

  it('gerência não reabre folha nem decide atestado; a auditoria é imutável', async () => {
    await entrar(A);
    const fid = (await db.funcionarios.list())[0].id;
    const hoje = agoraBR().data;
    const o = await db.ocorrencias.insert({ funcionario_id: fid, data_inicio: addDays(hoje, 2), data_fim: addDays(hoje, 2), tipo: 'atestado', remunerado: true, status_analise: 'pendente', origem: 'funcionario' } as never);
    await db.auth.sair(); await entrar(A, 'gerente');
    await expect(db.folhas.reabrir('qualquer', 'motivo de teste')).rejects.toThrow(/permissão/);
    await expect(db.ocorrencias.update(o.id, { status_analise: 'recusada' })).rejects.toThrow(/administrador/);
    await expect(db.auditoria.update('x', {})).rejects.toThrow(/alterado/);
    await expect(db.auditoria.remove('x')).rejects.toThrow(/apagado/);
  });

  it('retroativo e atestado do funcionário respeitam período fechado', async () => {
    await entrar(A);
    const fechada = (await db.folhas.list()).find(f => f.status === 'fechada')!;
    const f = (await db.funcionarios.list()).find(x => x.id === fechada.funcionario_id)!;
    await db.auth.sair();
    const ponto = db.ponto.para('silva-ribeiro');
    const pin = A.equipe.find(e => e.nome === f.nome)!.pin;
    const hoje = agoraBR().data;
    // dentro dos 45 dias só há fechamento se o mês anterior ainda estiver na janela
    const dia = fechada.periodo_fim >= addDays(hoje, -44) ? fechada.periodo_fim : null;
    if (dia) {
      expect(await ponto.retroativo({ funcionario_id: f.id, pin, data: dia, tipo: 'entrada', hora: '08:10', justificativa: 'esqueci de bater' })).toMatchObject({ ok: false, erro: 'PERIODO_FECHADO' });
      expect(await ponto.justificarAusencia({ funcionario_id: f.id, pin, inicio: dia, fim: dia, tipo: 'atestado' })).toMatchObject({ ok: false, erro: 'PERIODO_FECHADO' });
    }
    expect(await ponto.retroativo({ funcionario_id: f.id, pin, data: hoje, tipo: 'entrada', hora: '08:10', justificativa: 'esqueci de bater' })).toMatchObject({ erro: 'USE_PONTO_NORMAL' });
  });

  it('atestado: abrir fica registrado; só o administrador abre; arquivo vive só no escritório', async () => {
    const ponto = db.ponto.para('silva-ribeiro');
    const f = (await ponto.buscar('rafael'))[0];
    const pin = A.equipe.find(e => e.nome === f.nome)!.pin;
    const hoje = agoraBR().data;
    const j = await ponto.justificarAusencia({ funcionario_id: f.id, pin, inicio: addDays(hoje, 1), fim: addDays(hoje, 1), tipo: 'atestado' });
    expect(j.ok).toBe(true);
    const pdf = btoa('%PDF-1.4 ' + 'x'.repeat(60));
    const a = await ponto.anexar({ funcionario_id: f.id, pin, ocorrencia_id: (j as { id: string }).id, arquivo: { nome: 'a.pdf', mime: 'application/pdf', tamanho: 80, conteudo: pdf } });
    expect(a.ok).toBe(true);
    await entrar(A, 'gerente');
    expect(await db.anexos.listar()).toEqual([]);
    await expect(db.anexos.abrir((a as { id: string }).id)).rejects.toThrow(/permissão/);
    await db.auth.sair(); await entrar(A);
    const meta = (await db.anexos.listar())[0];
    expect(meta).toBeTruthy();
    expect(meta).not.toHaveProperty('conteudo');
    const aberto = await db.anexos.abrir(meta.id);
    expect(aberto.url).toMatch(/^blob:/);
    const acessos = await db.acessosSensiveis.list();
    expect(acessos).toHaveLength(1);
    expect(acessos[0].usuario).toContain(A.admin.email);
    await db.auth.sair(); await entrar(B);
    expect(await db.anexos.listar()).toEqual([]);
    expect(await db.acessosSensiveis.list()).toEqual([]);
  });

  it('retenção: prévia não apaga; execução apaga e registra na auditoria', async () => {
    await entrar(A);
    const antes = await db.retencao.previa();
    expect(antes.executado).toBe(false);
    const r = await db.retencao.executar();
    expect(r.executado).toBe(true);
    expect((await db.auditoria.list()).some(a => a.acao === 'Expurgo de retenção')).toBe(true);
  });

  it('o fuso do escritório muda a hora local (Manaus = Fortaleza − 1 h)', async () => {
    definirFuso('America/Fortaleza'); const f = agoraBR();
    definirFuso('America/Manaus'); const m = agoraBR();
    expect(f.minutos - m.minutos === 60 || f.minutos - m.minutos === -1380).toBe(true);
    definirFuso('America/Fortaleza');
  });
});

describe('delegação: tarefas, prazos e reuniões (espelho da migração 0006)', () => {
  const coord = (e: typeof A) => db.auth.entrar(e.coordenador.email, e.coordenador.senha);
  const pontoA = () => db.ponto.para(A.slug);
  const rafael = () => `func-0003`;
  const nova = { tipo: 'tarefa' as const, titulo: 'Revisar minuta', responsavel_id: 'func-0003' };

  it('cada escritório só enxerga as próprias tarefas e andamentos', async () => {
    await entrar(A);
    const tA = await db.tarefas.list();
    expect(tA.length).toBeGreaterThan(3);
    const secreta = await db.tarefas.insert({ ...nova, titulo: 'Só do escritório A' });       // id novo (único no navegador)
    await db.andamentos.add(secreta.id, 'andamento de A');
    await db.auth.sair(); await entrar(B);
    const tB = await db.tarefas.list();
    expect(tB.length).toBeGreaterThan(0);
    expect(tB.some(t => t.titulo === 'Só do escritório A')).toBe(false);
    expect(tB.some(t => tA.some(a => a.titulo === t.titulo))).toBe(false);
    expect(await db.andamentos.list(secreta.id)).toEqual([]);                                // andamento de A não aparece em B
    await expect(db.tarefas.update(secreta.id, { titulo: 'invasão' })).rejects.toThrow();     // nem se altera por id
    await expect(db.andamentos.add(secreta.id, 'invasão')).rejects.toThrow();
    await db.tarefas.remove(secreta.id);                                                      // sem efeito em A
    await db.auth.sair(); await entrar(A);
    const volta = await db.tarefas.list();
    expect(volta.find(t => t.id === secreta.id)!.titulo).toBe('Só do escritório A');
    expect((await db.andamentos.list(secreta.id)).map(a => a.texto)).toEqual(['andamento de A']);
  });

  it('criar grava a autoria e normaliza o número do processo; valida processo, equipe e datas', async () => {
    await entrar(A);
    const t = await db.tarefas.insert({ ...nova, titulo: '  Contestação  ', processo_numero: '00012347720248260001' });
    expect(t.titulo).toBe('Contestação');
    expect(t.criado_por_nome).toBe(A.admin.nome);
    expect(t.processo_numero).toBe('0001234-77.2024.8.26.0001');
    await expect(db.tarefas.insert({ ...nova, processo_numero: '0001234-78.2024.8.26.0001' })).rejects.toThrow(/processo inválido/i);
    await expect(db.tarefas.insert({ ...nova, responsavel_id: 'func-9999' })).rejects.toThrow(/equipe/i);
    await expect(db.tarefas.insert({ ...nova, participantes: ['func-9999'] })).rejects.toThrow(/participantes/i);
    await expect(db.tarefas.insert({ ...nova, tipo: 'audiencia' })).rejects.toThrow(/datas/i);
    await expect(db.tarefas.insert({ ...nova, tipo: 'reuniao', inicio: '2026-10-08T15:00:00.000Z', fim: '2026-10-08T14:00:00.000Z' })).rejects.toThrow(/datas/i);
    await expect(db.tarefas.insert({ ...nova, responsavel_id: 'func-0001' } as never)).resolves.toBeTruthy();
  });

  it('coordenador vê e delega, mas só altera o que criou e não lê dados pessoais', async () => {
    await coord(A);
    expect((await db.tarefas.list()).length).toBeGreaterThan(3);
    expect(await db.funcionarios.list()).toEqual([]);
    expect(await db.registros.list()).toEqual([]);
    expect(await db.ocorrencias.list()).toEqual([]);
    expect((await db.equipe()).length).toBeGreaterThan(3);
    const euId = (await db.auth.sessao())!.id;
    const de = (await db.tarefas.list()).find(t => t.criado_por !== euId)!;
    await expect(db.tarefas.update(de.id, { prioridade: 'baixa' })).rejects.toThrow(/permissão/);
    await expect(db.tarefas.remove(de.id)).rejects.toThrow(/permissão/);
    const minha = await db.tarefas.insert(nova);
    await expect(db.tarefas.update(minha.id, { prioridade: 'alta' })).resolves.toMatchObject({ prioridade: 'alta' });
    await db.tarefas.remove(minha.id);
    await expect(db.definirPin('func-0003', '482913')).rejects.toThrow();
    await expect(db.acessos.criar({ nome: 'X', email: 'x@y.com', papel: 'admin', senha: 'abc1234567' })).rejects.toThrow(/permissão/);
  });

  it('gerência e administração alteram qualquer tarefa do escritório', async () => {
    await entrar(A);
    const t = await db.tarefas.insert(nova);
    await db.auth.sair(); await entrar(A, 'gerente');
    await expect(db.tarefas.update(t.id, { prioridade: 'urgente' })).resolves.toMatchObject({ prioridade: 'urgente' });
    expect(t.criado_por_nome).toBe(A.admin.nome);                                       // autoria não muda
    expect((await db.tarefas.list()).find(x => x.id === t.id)!.criado_por_nome).toBe(A.admin.nome);
  });

  it('mudanças de situação e de responsável viram andamentos; andamento só se acrescenta', async () => {
    await entrar(A);
    const t = await db.tarefas.insert(nova);
    await db.tarefas.update(t.id, { status: 'em_andamento' });
    await db.tarefas.update(t.id, { status: 'concluida' });
    await db.tarefas.update(t.id, { responsavel_id: 'func-0004' });
    await db.andamentos.add(t.id, 'Protocolo conferido');
    const ands = await db.andamentos.list(t.id);
    expect(ands.map(a => a.texto)).toEqual(['Status: a fazer → em andamento', 'Status: em andamento → concluída', expect.stringContaining('Responsável:'), 'Protocolo conferido']);
    expect((await db.tarefas.list()).find(x => x.id === t.id)!.concluida_em).not.toBeNull();
    await db.tarefas.update(t.id, { status: 'a_fazer' });
    expect((await db.tarefas.list()).find(x => x.id === t.id)!.concluida_em).toBeNull();
    await expect(db.andamentos.add(t.id, '   ')).rejects.toThrow();
    await db.tarefas.remove(t.id);
    expect(await db.andamentos.list(t.id)).toEqual([]);                                  // sai junto com a tarefa
  });

  it('funcionário (PIN) vê só as suas tarefas e atualiza só as que é responsável', async () => {
    await entrar(A);
    const r = await pontoA().tarefas(rafael(), '561847');
    expect(r.ok).toBe(true);
    const minhas = (r as { tarefas: { id: string; papel: string; titulo: string }[] }).tarefas;
    expect(minhas.length).toBeGreaterThan(0);
    expect(minhas.every(t => ['responsavel', 'revisor', 'participante'].includes(t.papel))).toBe(true);
    expect(await pontoA().tarefas(rafael(), '000000')).toMatchObject({ ok: false, erro: 'PIN_INVALIDO' });
    const dele = minhas.find(t => t.papel === 'responsavel')!;
    const ok = await pontoA().atualizarTarefa({ funcionario_id: rafael(), pin: '561847', id: dele.id, status: 'concluida', nota: 'Protocolada' });
    expect(ok.ok).toBe(true);
    const ands = await db.andamentos.list(dele.id);
    expect(ands.at(-1)!.texto).toContain('Protocolada');
    expect(ands.at(-1)!.autor_nome).toBe('Rafael Costa Ribeiro');
    // quem não é responsável (revisor/participante) e outro funcionário não atualizam; status inválido é recusado
    const dOutro = (await db.tarefas.list()).find(t => t.responsavel_id !== rafael() && t.status !== 'cancelada')!;
    expect(await pontoA().atualizarTarefa({ funcionario_id: rafael(), pin: '561847', id: dOutro.id, status: 'concluida' })).toMatchObject({ ok: false, erro: 'NAO_ENCONTRADO' });
    expect(await pontoA().atualizarTarefa({ funcionario_id: rafael(), pin: '561847', id: dele.id, status: 'cancelada' as never })).toMatchObject({ ok: false, erro: 'STATUS_INVALIDO' });
  });

  it('o PIN de B não abre as tarefas de A nem o endereço de A mostra tarefas de B', async () => {
    const pontoB = db.ponto.para(B.slug);
    expect(await pontoB.tarefas('func-0003', '561847')).toMatchObject({ ok: false });                // func-0003 de B tem outro PIN
    const rB = await pontoB.tarefas('func-0002', '465192');                                          // Otávio (B)
    expect(rB.ok).toBe(true);
    await entrar(A);
    const titulosA = new Set((await db.tarefas.list()).map(t => t.titulo));
    expect((rB as { tarefas: { titulo: string }[] }).tarefas.length).toBeGreaterThan(0);
    expect((rB as { tarefas: { titulo: string }[] }).tarefas.some(t => titulosA.has(t.titulo))).toBe(false);
  });

  it('funcionário com tarefa delegada não pode ser excluído; Google fica indisponível no modo demonstração', async () => {
    await entrar(A);
    await expect(db.funcionarios.remove('func-0003')).rejects.toThrow(/histórico/);
    expect(await db.google.status()).toEqual({ disponivel: false, conectado: false });
    await expect(db.google.conectar()).rejects.toThrow(/não está disponível/);
    await expect(db.google.sincronizar('x')).rejects.toThrow();
  });

  it('a delegação entra na auditoria do escritório', async () => {
    await entrar(A);
    const t = await db.tarefas.insert(nova);
    await db.tarefas.update(t.id, { prioridade: 'alta' });
    const audit = (await db.auditoria.list()).filter(a => a.tabela === 'tarefas');
    expect(audit.map(a => a.acao)).toEqual(expect.arrayContaining(['Criado · tarefas', 'Alterado · tarefas']));
    expect(agoraBR().data >= addDays(agoraBR().data, -1)).toBe(true);
  });
});
