import { describe, expect, it } from 'vitest';
import {
  DELEGAVEIS, ehPapel, estadoAcesso, expandir, ORDEM_PAPEIS, PADRAO, PAPEIS, permissoesEfetivas, PERMISSOES, PERMISSAO_DA_ROTA,
  podeAtribuirPapel, podeConceder, podeGerirAlvo, RESERVADAS, TODAS, type PapelId,
} from './permissoes';

describe('catálogo', () => {
  it('ids únicos e todas as referências existem', () => {
    const ids = PERMISSOES.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of PERMISSOES) for (const i of p.implica ?? []) expect(ids, `${p.id} → ${i}`).toContain(i);
    for (const [papel, lista] of Object.entries(PADRAO)) for (const i of lista) expect(ids, `${papel}: ${i}`).toContain(i);
    for (const v of Object.values(PERMISSAO_DA_ROTA)) for (const x of (v ?? '').split('|')) if (x) expect(ids).toContain(x);
  });
  it('a hierarquia tem níveis distintos, do mais alto ao mais baixo', () => {
    const niveis = ORDEM_PAPEIS.map(p => PAPEIS[p].nivel);
    expect(new Set(niveis).size).toBe(niveis.length);
    expect([...niveis].sort((a, b) => b - a)).toEqual(niveis);
    expect(ehPapel('advogado')).toBe(true);
    expect(ehPapel('plataforma')).toBe(false);
  });
  it('permissões reservadas só o administrador tem', () => {
    expect(RESERVADAS.sort()).toEqual(['auditoria.ver', 'backup.gerir', 'config.editar', 'folha.ver', 'funcionarios.gerir']);
    for (const papel of ORDEM_PAPEIS.filter(p => p !== 'admin')) {
      for (const r of RESERVADAS) expect(permissoesEfetivas({ papel }).has(r), `${papel} ${r}`).toBe(false);
      expect(permissoesEfetivas({ papel, conceder: RESERVADAS }).size).toBe(permissoesEfetivas({ papel }).size);
    }
    expect([...permissoesEfetivas({ papel: 'admin' })].sort()).toEqual([...TODAS].sort());
  });
});

describe('padrões dos níveis', () => {
  const tem = (papel: PapelId, ...ids: string[]) => ids.every(i => permissoesEfetivas({ papel }).has(i));
  const nao = (papel: PapelId, ...ids: string[]) => ids.every(i => !permissoesEfetivas({ papel }).has(i));

  it('gerência e coordenação seguem o que já tinham antes dos novos níveis', () => {
    expect(tem('gerente', 'ponto.gerir', 'relatorios.ver', 'processos.ver_todos', 'processos.sigilosos', 'modelos.editar', 'documentos.excluir', 'tarefas.editar_todas')).toBe(true);
    expect(nao('gerente', 'honorarios.ver', 'acessos.gerenciar', 'folha.ver')).toBe(true);
    expect(tem('coordenador', 'tarefas.delegar', 'processos.ver_todos', 'processos.editar', 'intimacoes.tratar', 'equipe.ver')).toBe(true);
    expect(nao('coordenador', 'ponto.gerir', 'relatorios.ver', 'modelos.editar', 'documentos.excluir', 'tarefas.editar_todas', 'honorarios.ver')).toBe(true);
  });
  it('advogado vê só os seus processos; financeiro não vê processos nem documentos', () => {
    expect(tem('advogado', 'processos.ver', 'processos.editar', 'honorarios.editar', 'tarefas.delegar')).toBe(true);
    expect(nao('advogado', 'processos.ver_todos', 'processos.sigilosos', 'ponto.gerir')).toBe(true);
    expect(tem('financeiro', 'honorarios.parametros', 'clientes.ver')).toBe(true);
    expect(nao('financeiro', 'processos.ver', 'documentos.ver', 'intimacoes.ver')).toBe(true);
  });
  it('estágio só apoia; colaborador não tem nada além do próprio espaço', () => {
    expect(nao('estagiario', 'processos.ver_todos', 'processos.editar', 'tarefas.delegar', 'honorarios.ver')).toBe(true);
    expect(permissoesEfetivas({ papel: 'colaborador' }).size).toBe(0);
  });
  it('quem delega enxerga a equipe; quem gerencia o ponto também', () => {
    for (const papel of ORDEM_PAPEIS) {
      const p = permissoesEfetivas({ papel });
      if (p.has('tarefas.delegar') || p.has('ponto.gerir')) expect(p.has('equipe.ver'), papel).toBe(true);
    }
  });
});

describe('permissões efetivas', () => {
  it('"ver todos" inclui "ver"; "sigilosos" inclui "ver todos"', () => {
    expect([...expandir(['processos.sigilosos'])].sort()).toEqual(['casos.acessar', 'processos.sigilosos', 'processos.ver', 'processos.ver_todos']);
  });
  it('concede o que o nível não tem e retira o que tem; negar vence', () => {
    const p = permissoesEfetivas({ papel: 'estagiario', conceder: ['honorarios.ver', 'processos.ver_todos'], negar: ['documentos.enviar', 'processos.ver'] });
    expect(p.has('honorarios.ver')).toBe(true);
    expect(p.has('processos.ver_todos')).toBe(true);
    expect(p.has('processos.ver')).toBe(false);
    expect(p.has('documentos.enviar')).toBe(false);
    expect(p.has('documentos.ver')).toBe(true);
  });
  it('o escritório pode trocar o padrão do nível', () => {
    expect(permissoesEfetivas({ papel: 'secretaria', base: ['clientes.ver'] }).has('processos.ver_todos')).toBe(false);
    expect(permissoesEfetivas({ papel: 'secretaria', base: ['clientes.ver'] }).has('casos.acessar')).toBe(true);
    expect(permissoesEfetivas({ papel: 'admin', negar: ['folha.ver'] }).has('folha.ver')).toBe(true);
  });
  it('ids desconhecidos são ignorados', () => {
    expect(permissoesEfetivas({ papel: 'colaborador', conceder: ['x.y', 'tarefas.criar'] }).size).toBe(1);
  });
  it('só o que é delegável pode ser dado', () => { expect(DELEGAVEIS.length + RESERVADAS.length).toBe(PERMISSOES.length); });
});

describe('hierarquia', () => {
  it('só se atribui nível abaixo do próprio; o administrador atribui qualquer um', () => {
    expect(podeAtribuirPapel('admin', 'admin')).toBe(true);
    expect(podeAtribuirPapel('gerente', 'coordenador')).toBe(true);
    expect(podeAtribuirPapel('gerente', 'gerente')).toBe(false);
    expect(podeAtribuirPapel('gerente', 'admin')).toBe(false);
    expect(podeAtribuirPapel('advogado', 'estagiario')).toBe(true);
    expect(podeAtribuirPapel('estagiario', 'advogado')).toBe(false);
  });
  it('só gerencia o acesso de quem tem nível mais baixo', () => {
    expect(podeGerirAlvo('admin', 'admin')).toBe(true);
    expect(podeGerirAlvo('gerente', 'gerente')).toBe(false);
    expect(podeGerirAlvo('gerente', 'advogado')).toBe(true);
    expect(podeGerirAlvo('coordenador', 'gerente')).toBe(false);
  });
  it('só concede permissão que o próprio ator tem e que não é reservada', () => {
    const gerente = permissoesEfetivas({ papel: 'gerente' });
    expect(podeConceder(gerente, 'processos.ver_todos')).toBe(true);
    expect(podeConceder(gerente, 'honorarios.ver')).toBe(false);
    expect(podeConceder(permissoesEfetivas({ papel: 'admin' }), 'folha.ver')).toBe(false);
    expect(podeConceder(gerente, 'inventada')).toBe(false);
  });
});

describe('porta do ponto', () => {
  const base = { politicaAtiva: true, exigePonto: true, agora: '2026-06-10T14:00:00.000Z', liberadoAte: null };
  it('abre com a entrada e fecha com a saída', () => {
    expect(estadoAcesso({ ...base, marcacoes: [] })).toBe('aguardando_ponto');
    expect(estadoAcesso({ ...base, marcacoes: ['entrada'] })).toBe('liberado');
    expect(estadoAcesso({ ...base, marcacoes: ['entrada', 'saida_intervalo'] })).toBe('liberado');
    expect(estadoAcesso({ ...base, marcacoes: ['entrada', 'saida_intervalo', 'retorno_intervalo'] })).toBe('liberado');
    expect(estadoAcesso({ ...base, marcacoes: ['entrada', 'saida'] })).toBe('encerrado');
  });
  it('não vale para quem não precisa ou quando o escritório desliga a regra', () => {
    expect(estadoAcesso({ ...base, exigePonto: false, marcacoes: [] })).toBe('liberado');
    expect(estadoAcesso({ ...base, politicaAtiva: false, marcacoes: [] })).toBe('liberado');
  });
  it('a gerência pode liberar por um período, mesmo sem ponto ou depois da saída', () => {
    const ate = '2026-06-10T18:00:00.000Z';
    expect(estadoAcesso({ ...base, marcacoes: [], liberadoAte: ate })).toBe('liberado');
    expect(estadoAcesso({ ...base, marcacoes: ['entrada', 'saida'], liberadoAte: ate })).toBe('liberado');
    expect(estadoAcesso({ ...base, marcacoes: ['entrada', 'saida'], liberadoAte: '2026-06-10T13:00:00.000Z' })).toBe('encerrado');
  });
});
