import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { montarCnj } from '@/lib/cnj';
import { agoraBR, brParaIso, definirFuso } from '@/lib/datetime';
import type { Db } from '@/data/db';
import { criarDbLocal } from '@/data/local';
import { DEMO_ESCRITORIOS } from '@/data/seed';

function instalarStorage() {
  const mem = new Map<string, string>();
  (globalThis as { localStorage: Storage }).localStorage = {
    getItem: k => mem.get(k) ?? null, setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: k => { mem.delete(k); },
    clear: () => mem.clear(), key: i => [...mem.keys()][i] ?? null, get length() { return mem.size; },
  } as Storage;
  return mem;
}
const [A, B] = DEMO_ESCRITORIOS;
let db: Db; let mem: Map<string, string>;
beforeEach(async () => { mem = instalarStorage(); definirFuso('America/Fortaleza'); db = criarDbLocal(); await db.init!(); });
afterEach(() => { vi.useRealTimers(); });

const como = async (email: string, senha: string) => { await db.auth.sair(); return db.auth.entrar(email, senha); };
const admin = (e = A) => como(e.admin.email, e.admin.senha);
const rejeita = (p: Promise<unknown>, re: RegExp) => expect(p).rejects.toThrow(re);

describe('sessão forjada no navegador', () => {
  it('trocar o papel ou o id guardados não eleva o acesso: o servidor recalcula tudo pelo cadastro', async () => {
    const s = await como(A.acessos[0].email, A.acessos[0].senha);                       // advogada
    const bruto = JSON.parse(mem.get('ge.v1.sessao')!);
    mem.set('ge.v1.sessao', JSON.stringify({ ...bruto, papel: 'admin' }));
    const lida = (await db.auth.sessao())!;
    expect(lida.papel).toBe('advogado');
    expect(lida.permissoes).not.toContain('folha.ver');
    expect(await db.folhas.list()).toEqual([]);
    await rejeita(db.acessos.lista(), /permissão/);
    mem.set('ge.v1.sessao', JSON.stringify({ ...bruto, id: 'inexistente', papel: 'admin' }));
    expect(await db.auth.sessao()).toBeNull();
    expect(s.papel).toBe('advogado');
  });
  it('sessão de outro escritório não alcança dados do primeiro', async () => {
    await admin(A); const tarefasA = await db.tarefas.list(); expect(tarefasA.length).toBeGreaterThan(0);
    const bruto = JSON.parse(mem.get('ge.v1.sessao')!);
    mem.set('ge.v1.sessao', JSON.stringify({ ...bruto, escritorio: { ...bruto.escritorio, slug: B.slug } }));
    const lista = await db.tarefas.list();
    expect(lista.some(t => tarefasA.some(a => a.id === t.id))).toBe(false);
  });
});

describe('IDOR: usar o identificador de um registro de outro escritório', () => {
  it('B não lê, altera nem exclui processos, clientes e tarefas de A, nem abre documentos', async () => {
    await admin(A);
    // registros novos (identificador aleatório): os de demonstração têm ids iguais nos dois escritórios
    const cli = await db.clientes.insert({ nome: 'Cliente Sigiloso de A', tipo: 'pf' } as never);
    const proc = await db.processos.insert({ numero: montarCnj('0004567', '2024', '826', '0001'), cliente_id: cli.id, titulo: 'Segredo de A' } as never);
    const tar = await db.tarefas.insert({ titulo: 'Tarefa de A', tipo: 'tarefa', status: 'a_fazer', prioridade: 'normal', participantes: [] } as never);
    const docs = await db.arquivos.list();
    await admin(B);
    await rejeita(db.processos.update(proc.id, { titulo: 'invadido' }), /não encontrado|permissão/i);
    expect((await db.processos.list()).some(p => p.id === proc.id) || (await db.clientes.list()).some(c => c.id === cli.id)).toBe(false);
    await rejeita(db.clientes.update(cli.id, { nome: 'invadido' }), /não encontrado|permissão/i);
    await rejeita(db.tarefas.update(tar.id, { titulo: 'invadida' }), /não encontrado|permissão/i);
    await db.processos.remove(proc.id); await db.clientes.remove(cli.id); await db.tarefas.remove(tar.id);
    if (docs[0]) await rejeita(db.arquivos.abrir(docs[0].id), /não encontrado|permissão/i);
    await admin(A);
    expect((await db.processos.list()).some(p => p.id === proc.id && p.titulo !== 'invadido')).toBe(true);
    expect((await db.clientes.list()).some(c => c.id === cli.id)).toBe(true);
    expect((await db.tarefas.list()).some(t => t.id === tar.id && t.titulo !== 'invadida')).toBe(true);
  });
  it('acessos de A não são alterados por B (nem redefinição de senha, nem remoção)', async () => {
    await admin(A); const alvo = (await db.acessos.lista()).find(l => l.papel === 'advogado')!;
    await admin(B);
    await rejeita(db.acessos.atualizar(alvo.id, { papel: 'admin' }), /não encontrado/i);
    await rejeita(db.acessos.redefinirSenha(alvo.id, 'novasenha123'), /não encontrado/i);
    await rejeita(db.acessos.remover(alvo.id), /não encontrado/i);
    await rejeita(db.acessos.liberar(alvo.id, 30, 'ataque'), /não encontrado/i);
  });
});

describe('autoria e escalonamento de privilégio', () => {
  it('autoria vem do servidor: criado_por forjado é ignorado', async () => {
    const s = await admin(A);
    const t = await db.tarefas.insert({ titulo: 'x', tipo: 'tarefa', status: 'a_fazer', prioridade: 'normal', participantes: [], criado_por: 'fantasma', criado_por_nome: 'Fantasma' } as never);
    expect(t.criado_por).toBe(s.id); expect(t.criado_por_nome).toBe(s.nome);
  });
  it('níveis abaixo não se promovem nem concedem o que não têm; o último administrador não some', async () => {
    await admin(A);
    const g = (await db.acessos.lista()).find(l => l.papel === 'gerente')!;
    await db.acessos.atualizar(g.id, { conceder: ['acessos.gerenciar'] });
    await como(A.gerente.email, A.gerente.senha);
    await rejeita(db.acessos.atualizar(g.id, { papel: 'admin' }), /seu próprio acesso/);
    await rejeita(db.acessos.criar({ nome: 'Falso Admin', email: 'fa@x.com', papel: 'admin', senha: 'senhaforte123', exige_ponto: false }), /níveis abaixo/);
    await rejeita(db.acessos.criar({ nome: 'Falsa Coord', email: 'fc@x.com', papel: 'coordenador', senha: 'senhaforte123', conceder: ['folha.ver'] }), /permissões que você mesmo tem/);
    await admin(A);
    const adm = (await db.acessos.lista()).find(l => l.papel === 'admin')!;
    await rejeita(db.acessos.atualizar(adm.id, { ativo: false }), /pelo menos um administrador/);
    await rejeita(db.acessos.remover(adm.id), /próprio acesso/);
  });
  it('a gravação direta nas tabelas de pessoas é negada a quem não é administrador', async () => {
    await como(A.acessos[0].email, A.acessos[0].senha);
    await rejeita(db.funcionarios.insert({ nome: 'x' } as never), /permissão/);
    await rejeita(db.config.save({} as never), /permissão|inválid/i);
    expect(await db.auditoria.list()).toEqual([]);
  });
});

describe('força bruta', () => {
  it('cinco senhas erradas travam o login por 10 minutos; depois volta ao normal', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-06-10T12:00:00Z'));
    await db.auth.sair();
    for (let i = 0; i < 5; i++) await rejeita(db.auth.entrar(A.admin.email, `errada-${i}`), /incorretos/);
    await rejeita(db.auth.entrar(A.admin.email, A.admin.senha), /Aguarde/);                // nem a senha certa entra durante o bloqueio
    vi.setSystemTime(new Date('2026-06-10T12:10:30Z'));
    expect((await db.auth.entrar(A.admin.email, A.admin.senha)).papel).toBe('admin');
  });
  it('o bloqueio é por e-mail: errar em uma conta não trava as outras; e-mail inexistente se comporta igual', async () => {
    await db.auth.sair();
    for (let i = 0; i < 5; i++) await rejeita(db.auth.entrar('ninguem@x.com', `errada-${i}`), /incorretos/);
    await rejeita(db.auth.entrar('ninguem@x.com', 'qualquer'), /Aguarde/);
    expect((await db.auth.entrar(A.gerente.email, A.gerente.senha)).papel).toBe('gerente');
  });
  it('cinco PINs errados bloqueiam a pessoa, também para a entrada automática', async () => {
    const api = db.ponto.para(A.slug);
    const [p] = await api.buscar('juliana');
    for (let i = 0; i < 5; i++) expect((await api.entrarNoSistema(p.id, `00000${i}`))).toMatchObject({ ok: false, erro: 'PIN_INVALIDO' });
    expect(await api.entrarNoSistema(p.id, '902716')).toMatchObject({ ok: false, erro: 'PIN_BLOQUEADO' });
  });
});

describe('entrada automática depois do ponto', () => {
  async function limparHoje(nome: string) {
    await admin(A);
    const f = (await db.funcionarios.list()).find(x => x.nome.includes(nome))!;
    const hoje = agoraBR().data;
    for (const r of (await db.registros.list()).filter(x => x.funcionario_id === f.id && x.data === hoje)) await db.registros.remove(r.id);
    return { f, hoje };
  }
  const marcar = async (fid: string, hoje: string, tipo: 'entrada' | 'saida') =>
    db.registros.insert({ funcionario_id: fid, data: hoje, tipo, horario_real: brParaIso(hoje, '09:00'), status: 'no_horario', status_aprovacao: 'aprovado', retroativo: false } as never);

  it('sem entrada hoje não abre; com a entrada, abre com o nível da pessoa; depois da saída, fecha de novo', async () => {
    const { f, hoje } = await limparHoje('Juliana');
    const api = db.ponto.para(A.slug);
    await db.auth.sair();
    expect(await api.entrarNoSistema(f.id, '902716')).toMatchObject({ ok: false, erro: 'SEM_PONTO' });
    expect(await db.auth.sessao()).toBeNull();
    await admin(A); await marcar(f.id, hoje, 'entrada');
    await db.auth.sair();
    expect(await api.entrarNoSistema(f.id, '902716')).toMatchObject({ ok: true });
    const s = (await db.auth.sessao())!;
    expect(s.papel).toBe('advogado'); expect(s.acesso).toBe('liberado');
    await admin(A); await marcar(f.id, hoje, 'saida');
    await db.auth.sair();
    expect(await api.entrarNoSistema(f.id, '902716')).toMatchObject({ ok: false, erro: 'SEM_PONTO' });
  });
  it('administrador e gerência nunca entram só pelo PIN; quem não tem login ligado recebe resposta neutra', async () => {
    const api = db.ponto.para(A.slug);
    await admin(A);
    const funcs = await db.funcionarios.list();
    const carlos = funcs.find(x => x.nome.includes('Carlos'))!, mariana = funcs.find(x => x.nome.includes('Mariana'))!, lucas = funcs.find(x => x.nome.includes('Lucas'))!;
    await db.auth.sair();
    expect(await api.entrarNoSistema(carlos.id, '482913')).toMatchObject({ ok: false, erro: 'ENTRADA_MANUAL' });
    expect(await api.entrarNoSistema(mariana.id, '739105')).toMatchObject({ ok: false, erro: 'ENTRADA_MANUAL' });
    expect(await api.entrarNoSistema(lucas.id, '215839')).toMatchObject({ ok: false, erro: 'SEM_ACESSO' });
    expect(await db.auth.sessao()).toBeNull();
  });
  it('senha provisória exige a troca antes; o administrador pode desligar a entrada automática', async () => {
    await admin(A);
    const lucas = (await db.funcionarios.list()).find(x => x.nome.includes('Lucas'))!;
    await db.acessos.criar({ nome: 'Lucas', email: 'lucas@x.com', papel: 'secretaria', senha: 'senhaforte123', funcionario_id: lucas.id });
    const hoje = agoraBR().data;
    for (const r of (await db.registros.list()).filter(x => x.funcionario_id === lucas.id && x.data === hoje)) await db.registros.remove(r.id);
    await marcar(lucas.id, hoje, 'entrada');
    const api = db.ponto.para(A.slug); await db.auth.sair();
    expect(await api.entrarNoSistema(lucas.id, '215839')).toMatchObject({ ok: false, erro: 'TROCAR_SENHA' });
    await db.auth.entrar('lucas@x.com', 'senhaforte123'); await db.auth.trocarSenha('outrasenha456');
    await admin(A); await db.acessos.definirEntradaAutomatica(false);
    await db.auth.sair();
    expect(await api.entrarNoSistema(lucas.id, '215839')).toMatchObject({ ok: false, erro: 'ENTRADA_MANUAL' });
    await admin(A); await db.acessos.definirEntradaAutomatica(true); await db.auth.sair();
    expect(await api.entrarNoSistema(lucas.id, '215839')).toMatchObject({ ok: true });
  });
});
