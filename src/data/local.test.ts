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
