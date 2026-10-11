import { beforeEach, describe, expect, it } from 'vitest';
import { agoraBR, brParaIso, definirFuso } from '@/lib/datetime';
import type { Db } from './db';
import { criarDbLocal } from './local';
import { DEMO_ESCRITORIOS } from './seed';

function instalarStorage() {
  const mem = new Map<string, string>();
  (globalThis as { localStorage: Storage }).localStorage = {
    getItem: k => mem.get(k) ?? null, setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: k => { mem.delete(k); },
    clear: () => mem.clear(), key: i => [...mem.keys()][i] ?? null, get length() { return mem.size; },
  } as Storage;
}
const A = DEMO_ESCRITORIOS[0];
const acesso = (papel: string) => A.acessos.find(a => a.papel === papel)!;
let db: Db;
beforeEach(async () => { instalarStorage(); definirFuso('America/Fortaleza'); db = criarDbLocal(); await db.init!(); });

const como = async (email: string, senha: string) => { await db.auth.sair(); return db.auth.entrar(email, senha); };
const admin = () => como(A.admin.email, A.admin.senha);
const gerente = () => como(A.gerente.email, A.gerente.senha);
const advogada = () => como(acesso('advogado').email, acesso('advogado').senha);
const estagiario = () => como(acesso('estagiario').email, acesso('estagiario').senha);
const secretaria = () => como(acesso('secretaria').email, acesso('secretaria').senha);

/** Deixa o funcionário sem marcações hoje (como no começo do expediente) e, se pedido, registra as marcações. */
async function ponto(funcionarioId: string, ...tipos: ('entrada' | 'saida')[]) {
  await admin();
  const hoje = agoraBR().data;
  for (const r of (await db.registros.list()).filter(x => x.funcionario_id === funcionarioId && x.data === hoje)) await db.registros.remove(r.id);
  for (const tipo of tipos) {
    await db.registros.insert({ funcionario_id: funcionarioId, data: hoje, tipo, horario_previsto: null, horario_real: brParaIso(hoje, '09:00'), diferenca_minutos: 0, status: 'no_horario', status_aprovacao: 'aprovado', retroativo: false } as never);
  }
}
const funcDeAcesso = async (papel: string) => (await db.auth.entrar(acesso(papel).email, acesso(papel).senha)).funcionario_id!;

describe('níveis de acesso (demonstração): sessão e permissões', () => {
  it('a sessão traz nível, permissões e o estado da porta do ponto', async () => {
    const s = await admin();
    expect(s.papel).toBe('admin'); expect(s.nivel).toBe(100); expect(s.acesso).toBe('liberado'); expect(s.permissoes).toContain('folha.ver');
    const g = await gerente();
    expect(g.permissoes).toContain('ponto.gerir'); expect(g.permissoes).not.toContain('folha.ver'); expect(g.permissoes).not.toContain('honorarios.ver');
    const j = await advogada();
    expect(j.papel).toBe('advogado'); expect(j.permissoes).toContain('processos.ver'); expect(j.permissoes).not.toContain('processos.ver_todos');
  });
  it('quem não é administrador não lê a folha nem cadastra pessoas', async () => {
    await advogada();
    expect(await db.folhas.list()).toEqual([]);
    expect(await db.funcionarios.list()).toEqual([]);
    await expect(db.funcionarios.insert({ nome: 'x' } as never)).rejects.toThrow(/permissão/);
  });
});

describe('hierarquia de acessos', () => {
  it('só o administrador cria acessos, até a gerência receber a permissão; e nunca acima do próprio nível', async () => {
    await gerente();
    const antes = await db.acessos.lista();                       // a gerência lê a lista (libera acessos fora do horário), mas não altera nada
    expect(antes.length).toBeGreaterThan(3); expect(antes.some(l => l.pode_gerir)).toBe(false); expect(antes.find(l => l.papel === 'advogado')!.pode_liberar).toBe(true);
    await expect(db.acessos.criar({ nome: 'X', email: 'x@x.com', papel: 'coordenador', senha: 'senhaforte123' })).rejects.toThrow(/permissão/);
    await como(A.coordenador.email, A.coordenador.senha);
    await expect(db.acessos.lista()).rejects.toThrow(/permissão/);
    await admin();
    const g = (await db.acessos.lista()).find(l => l.papel === 'gerente')!;
    await db.acessos.atualizar(g.id, { conceder: ['acessos.gerenciar'] });
    await gerente();
    const lista = await db.acessos.lista();
    expect(lista.find(l => l.papel === 'admin')!.pode_gerir).toBe(false);
    expect(lista.find(l => l.papel === 'advogado')!.pode_gerir).toBe(true);
    await expect(db.acessos.criar({ nome: 'Outra Gerente', email: 'g2@x.com', papel: 'gerente', senha: 'senhaforte123', exige_ponto: false })).rejects.toThrow(/níveis abaixo do seu/);
    await expect(db.acessos.criar({ nome: 'Coord Nova', email: 'c2@x.com', papel: 'coordenador', senha: 'senhaforte123', conceder: ['honorarios.ver'] })).rejects.toThrow(/permissões que você mesmo tem/);
    const adm = lista.find(l => l.papel === 'admin')!;
    await expect(db.acessos.atualizar(adm.id, { nome: 'Hackeado' })).rejects.toThrow(/níveis abaixo do seu/);
    await expect(db.acessos.redefinirSenha(adm.id, 'novasenha123')).rejects.toThrow(/níveis abaixo do seu/);
    await expect(db.acessos.remover(adm.id)).rejects.toThrow(/níveis abaixo do seu/);
    await expect(db.acessos.atualizar(g.id, { papel: 'admin' })).rejects.toThrow(/seu próprio acesso/);
    await db.acessos.criar({ nome: 'Coord Nova', email: 'c2@x.com', papel: 'coordenador', senha: 'senhaforte123' });
    expect((await db.acessos.lista()).some(l => l.email === 'c2@x.com')).toBe(true);
  });
  it('nível que exige ponto precisa de funcionário vinculado; funcionário tem um só acesso; permissão reservada nunca se concede', async () => {
    await admin();
    await expect(db.acessos.criar({ nome: 'Fulano', email: 'f@x.com', papel: 'advogado', senha: 'senhaforte123' })).rejects.toThrow(/Vincule o acesso/);
    const livre = (await db.funcionarios.list()).find(f => f.nome === 'Lucas Oliveira Rocha')!;
    await expect(db.acessos.criar({ nome: 'Lucas', email: 'l@x.com', papel: 'financeiro', senha: 'senhaforte123', funcionario_id: livre.id, conceder: ['folha.ver'] })).rejects.toThrow(/permissões que você mesmo tem/);
    await db.acessos.criar({ nome: 'Lucas', email: 'l@x.com', papel: 'financeiro', senha: 'senhaforte123', funcionario_id: livre.id });
    await expect(db.acessos.criar({ nome: 'Lucas 2', email: 'l2@x.com', papel: 'financeiro', senha: 'senhaforte123', funcionario_id: livre.id })).rejects.toThrow(/já tem um acesso/);
  });
  it('senha provisória: a primeira entrada exige trocar', async () => {
    await admin();
    const livre = (await db.funcionarios.list()).find(f => f.nome === 'Lucas Oliveira Rocha')!;
    await db.acessos.criar({ nome: 'Lucas', email: 'l@x.com', papel: 'financeiro', senha: 'senhaforte123', funcionario_id: livre.id });
    const s = await db.auth.entrar('l@x.com', 'senhaforte123');
    expect(s.trocar_senha).toBe(true);
    await expect(db.auth.trocarSenha('senhaforte123')).rejects.toThrow(/diferente/);
    await db.auth.trocarSenha('outrasenha456');
    expect((await db.auth.sessao())!.trocar_senha).toBe(false);
    await db.auth.sair();
    await expect(db.auth.entrar('l@x.com', 'senhaforte123')).rejects.toThrow(/incorretos/);
    expect((await db.auth.entrar('l@x.com', 'outrasenha456')).trocar_senha).toBe(false);
  });
});

describe('porta do ponto', () => {
  it('abre com a entrada, fecha com a saída e a gerência libera por um tempo', async () => {
    const fid = await funcDeAcesso('advogado');
    await ponto(fid);
    expect((await advogada()).acesso).toBe('aguardando_ponto');
    expect(await db.processos.list()).toEqual([]);
    expect(await db.tarefas.list()).toEqual([]);
    await expect(db.minhaArea.tarefas()).rejects.toThrow(/permissão/);
    expect((await db.minhaArea.pontoHoje()).estado).toBe('aguardando_ponto');

    await ponto(fid, 'entrada');
    expect((await advogada()).acesso).toBe('liberado');
    expect((await db.processos.list()).length).toBeGreaterThan(0);

    await ponto(fid, 'entrada', 'saida');
    expect((await advogada()).acesso).toBe('encerrado');
    expect(await db.processos.list()).toEqual([]);

    await admin();
    const j = (await db.acessos.lista()).find(l => l.papel === 'advogado')!;
    expect(j.estado).toBe('encerrado');
    await gerente();
    await expect(db.acessos.liberar(j.id, 30, 'x')).rejects.toThrow(/motivo/);
    await expect(db.acessos.liberar(j.id, 1, 'audiência externa')).rejects.toThrow(/5 minutos/);
    await db.acessos.liberar(j.id, 30, 'audiência externa');
    expect((await advogada()).acesso).toBe('liberado');
    await gerente(); await db.acessos.encerrarLiberacao(j.id);
    expect((await advogada()).acesso).toBe('encerrado');
  });
  it('só o administrador desliga a regra; administrador, gerência e coordenação não dependem do ponto', async () => {
    const fid = await funcDeAcesso('advogado');
    await ponto(fid);
    await gerente();
    await expect(db.acessos.definirExigirPonto(false)).rejects.toThrow(/permissão/);
    expect((await gerente()).acesso).toBe('liberado');
    await admin(); await db.acessos.definirExigirPonto(false);
    expect((await advogada()).acesso).toBe('liberado');
    await admin(); await db.acessos.definirExigirPonto(true);
    expect((await advogada()).acesso).toBe('aguardando_ponto');
  });
  it('marcação rejeitada não abre o acesso', async () => {
    const fid = await funcDeAcesso('estagiario');
    await ponto(fid);
    await admin();
    await db.registros.insert({ funcionario_id: fid, data: agoraBR().data, tipo: 'entrada', horario_real: brParaIso(agoraBR().data, '09:00'), status: 'no_horario', status_aprovacao: 'rejeitado', retroativo: false } as never);
    expect((await estagiario()).acesso).toBe('aguardando_ponto');
  });
});

describe('escopo e permissões nos dados', () => {
  it('advogado vê só os processos que responde ou que lhe foram delegados; gerência e coordenação veem todos', async () => {
    const todos = (await admin().then(() => db.processos.list()));
    expect(todos.length).toBeGreaterThan(2);
    const fid = await funcDeAcesso('advogado');
    await ponto(fid, 'entrada');
    await advogada();
    const meus = await db.processos.list();
    expect(meus.length).toBeGreaterThan(0); expect(meus.length).toBeLessThan(todos.length);
    const tarefas = await admin().then(() => db.tarefas.list());
    for (const p of meus) expect(p.responsavel_id === fid || tarefas.some(t => t.processo_id === p.id && (t.responsavel_id === fid || t.revisor_id === fid || t.participantes.includes(fid)))).toBe(true);
    expect((await gerente().then(() => db.processos.list())).length).toBe(todos.length);
  });
  it('estágio só apoia: não edita processo nem cliente, não delega e não lê honorários', async () => {
    const fid = await funcDeAcesso('estagiario');
    await ponto(fid, 'entrada');
    await estagiario();
    await expect(db.clientes.insert({ nome: 'Novo cliente', tipo: 'pf' } as never)).rejects.toThrow(/permissão/);
    const base = (await db.processos.list())[0];
    if (base) await expect(db.processos.update(base.id, { titulo: 'x' })).rejects.toThrow(/permissão/);
    const colega = (await admin().then(() => db.funcionarios.list())).find(f => f.id !== fid)!;
    await estagiario();
    await expect(db.tarefas.insert({ titulo: 'delegada', tipo: 'tarefa', status: 'a_fazer', prioridade: 'normal', responsavel_id: colega.id, participantes: [] } as never)).rejects.toThrow(/permissão/);
    await db.tarefas.insert({ titulo: 'minha', tipo: 'tarefa', status: 'a_fazer', prioridade: 'normal', responsavel_id: fid, participantes: [] } as never);
    expect((await db.tarefas.list()).some(t => t.titulo === 'minha')).toBe(true);
    expect(await db.honorarios.propostas.list()).toEqual([]);
  });
  it('a matriz de níveis do escritório muda o que cada nível enxerga (só o administrador altera)', async () => {
    const fid = await funcDeAcesso('secretaria');
    await ponto(fid, 'entrada');
    expect((await secretaria().then(() => db.processos.list())).length).toBeGreaterThan(0);
    await gerente();
    await expect(db.acessos.definirPermissoesPapel('secretaria', ['clientes.ver'])).rejects.toThrow(/permissão/);
    await admin();
    await expect(db.acessos.definirPermissoesPapel('admin', [])).rejects.toThrow(/inválido/);
    await expect(db.acessos.definirPermissoesPapel('secretaria', ['folha.ver'])).rejects.toThrow(/reservada/);
    await db.acessos.definirPermissoesPapel('secretaria', ['clientes.ver']);
    expect((await db.acessos.politica()).papeis.secretaria).toMatchObject({ personalizado: true, permissoes: ['clientes.ver'] });
    await secretaria();
    expect(await db.processos.list()).toEqual([]);
    expect((await db.clientes.list()).length).toBeGreaterThan(0);
    await admin(); await db.acessos.restaurarPermissoesPapel('secretaria');
    expect((await secretaria().then(() => db.processos.list())).length).toBeGreaterThan(0);
  });
  it('permissões por pessoa: negar retira, conceder acrescenta', async () => {
    const fid = await funcDeAcesso('advogado');
    await ponto(fid, 'entrada');
    await admin();
    const j = (await db.acessos.lista()).find(l => l.papel === 'advogado')!;
    await db.acessos.atualizar(j.id, { conceder: ['processos.ver_todos'] });
    const todos = (await advogada().then(() => db.processos.list())).length;
    expect(todos).toBeGreaterThan(0);
    await admin(); await db.acessos.atualizar(j.id, { conceder: [], negar: ['honorarios.ver'] });
    await advogada();
    expect(await db.honorarios.propostas.list()).toEqual([]);
  });
  it('minha área: tarefas delegadas e andamento sem PIN', async () => {
    const fid = await funcDeAcesso('advogado');
    await ponto(fid, 'entrada');
    await advogada();
    const minhas = await db.minhaArea.tarefas();
    expect(minhas.length).toBeGreaterThan(0);
    const t = minhas.find(x => x.papel === 'responsavel' && x.status !== 'concluida');
    if (t) { await db.minhaArea.atualizarTarefa(t.id, 'em_andamento', 'comecei'); expect((await db.minhaArea.tarefas()).find(x => x.id === t.id)!.status).toBe('em_andamento'); }
    await expect(db.minhaArea.atualizarTarefa('inexistente', 'concluida')).rejects.toThrow(/não encontrado/i);
  });
});

describe('registro de acessos', () => {
  it('guarda criação, senha, liberação e entradas; só o administrador lê', async () => {
    await admin();
    const livre = (await db.funcionarios.list()).find(f => f.nome === 'Lucas Oliveira Rocha')!;
    await db.acessos.criar({ nome: 'Lucas', email: 'l@x.com', papel: 'financeiro', senha: 'senhaforte123', funcionario_id: livre.id });
    await db.auth.registrarEvento('login'); await db.auth.registrarEvento('login');
    const r = await db.acessos.registro();
    expect(r.some(x => x.evento === 'acesso_criado' && x.nome === 'Lucas')).toBe(true);
    expect(r.filter(x => x.evento === 'login').length).toBe(1);        // o mesmo evento não se repete em minutos
    await gerente();
    expect(await db.acessos.registro()).toEqual([]);
  });
});
