import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, KeyRound, Pencil, Plus, Timer, Trash2, Wand2 } from 'lucide-react';
import Medidor from '@/components/Medidor';
import { Abas, Badge, Field, Modal, PageHeader, useConfirm, useToast, Vazio, type Tom } from '@/components/ui';
import { useAuth } from '@/context/Auth';
import { useDados } from '@/context/Dados';
import { fmtData, isoParaBR } from '@/lib/datetime';
import {
  DELEGAVEIS, ORDEM_PAPEIS, PADRAO, PAPEIS, PERMISSOES, expandir, permissoesEfetivas, podeAtribuirPapel, podeConceder, type PapelId,
} from '@/lib/permissoes';
import { gerarSenha, validarSenha } from '@/lib/seguranca';
import Credenciais, { type Entrega } from './acessos/Credenciais';
import type { AcessoLinha, PoliticaAcesso, RegistroAcesso } from '@/lib/types';
import EditorPermissoes, { diferenca } from './acessos/EditorPermissoes';

type Aba = 'acessos' | 'niveis' | 'registro';
const ESTADO: Record<AcessoLinha['estado'], { rotulo: string; tom: Tom }> = {
  liberado: { rotulo: 'Liberado', tom: 'ok' }, aguardando_ponto: { rotulo: 'Aguardando o ponto', tom: 'warn' }, encerrado: { rotulo: 'Jornada encerrada', tom: 'mute' }, sem_acesso: { rotulo: 'Sem acesso', tom: 'bad' },
};
const EVENTO: Record<RegistroAcesso['evento'], string> = {
  login: 'Entrou no sistema', logout: 'Saiu', bloqueado_ponto: 'Barrado: ponto não batido', acesso_encerrado: 'Acesso encerrado pela saída', senha_trocada: 'Trocou a senha',
  acesso_criado: 'Acesso criado', acesso_alterado: 'Acesso alterado', senha_redefinida: 'Senha redefinida', acesso_removido: 'Acesso removido', liberacao: 'Acesso liberado pela gerência',
  permissoes_nivel: 'Permissões do nível', politica_ponto: 'Regra do ponto',
};

interface Rascunho {
  id?: string; nome: string; email: string; papel: PapelId; senha: string; ativo: boolean; funcionario_id: string; exige: 'padrao' | 'sim' | 'nao'; permissoes: Set<string>;
}

/** Acessos e níveis: quem entra no sistema, com qual nível, e quando. */
export default function Acessos() {
  const { db, funcionarios, recarregar } = useDados();
  const { sessao, pode } = useAuth();
  const toast = useToast();
  const confirmar = useConfirm();
  const [aba, setAba] = useState<Aba>('acessos');
  const [linhas, setLinhas] = useState<AcessoLinha[] | null>(null);
  const [politica, setPolitica] = useState<PoliticaAcesso | null>(null);
  const [registro, setRegistro] = useState<RegistroAcesso[]>([]);
  const [erroCarga, setErroCarga] = useState('');
  const [edicao, setEdicao] = useState<Rascunho | null>(null);
  const [verSenha, setVerSenha] = useState(false);
  const [senhaDe, setSenhaDe] = useState<{ a: AcessoLinha; senha: string } | null>(null);
  const [liberando, setLiberando] = useState<{ a: AcessoLinha; minutos: number; motivo: string } | null>(null);
  const [nivelEdit, setNivelEdit] = useState<{ papel: PapelId; permissoes: Set<string> } | null>(null);
  const [entregue, setEntregue] = useState<Entrega | null>(null);

  const ator = sessao && sessao.papel !== 'plataforma' ? sessao.papel : 'colaborador';
  const ehAdmin = ator === 'admin';
  const minhas = useMemo(() => new Set(sessao?.permissoes ?? []), [sessao]);

  const carregar = useCallback(async () => {
    try {
      const [l, p] = await Promise.all([db.acessos.lista(), db.acessos.politica()]);
      setLinhas(l); setPolitica(p); setErroCarga('');
      if (ehAdmin) setRegistro(await db.acessos.registro().catch(() => []));
    } catch (e) {
      setLinhas([]);
      setErroCarga(/function|schema cache|could not find/i.test((e as Error).message) ? 'O banco ainda não recebeu a atualização 13 (níveis de acesso). Rode o fluxo "Supabase — aplicar banco e funções" e volte aqui.' : (e as Error).message);
    }
  }, [db, ehAdmin]);
  useEffect(() => { void carregar(); }, [carregar]);

  const padraoDe = useCallback((p: PapelId): Set<string> => new Set(politica?.papeis[p]?.permissoes ?? PADRAO[p]), [politica]);
  const papeisPossiveis = ORDEM_PAPEIS.filter(p => podeAtribuirPapel(ator, p));
  const livres = useMemo(() => {
    const usados = new Set((linhas ?? []).map(l => l.funcionario_id).filter(Boolean));
    return funcionarios.filter(f => f.ativo && (!usados.has(f.id) || f.id === edicao?.funcionario_id));
  }, [funcionarios, linhas, edicao?.funcionario_id]);

  function novo() {
    const papel = papeisPossiveis.includes('advogado') ? 'advogado' : (papeisPossiveis[papeisPossiveis.length - 1] ?? 'colaborador');
    setEdicao({ nome: '', email: '', papel, senha: gerarSenha(), ativo: true, funcionario_id: '', exige: 'padrao', permissoes: permissoesEfetivas({ papel, base: [...padraoDe(papel)] }) });
    setVerSenha(true);
  }
  function editar(a: AcessoLinha) {
    setEdicao({
      id: a.id, nome: a.nome, email: a.email, papel: a.papel, senha: '', ativo: a.ativo, funcionario_id: a.funcionario_id ?? '',
      exige: a.exige_ponto === null ? 'padrao' : a.exige_ponto ? 'sim' : 'nao',
      permissoes: permissoesEfetivas({ papel: a.papel, base: [...padraoDe(a.papel)], conceder: a.conceder, negar: a.negar }),
    });
    setVerSenha(false);
  }
  /** Ao mudar o nível, as permissões voltam ao padrão do novo nível. */
  const trocarNivel = (papel: PapelId) => setEdicao(e => (e ? { ...e, papel, permissoes: permissoesEfetivas({ papel, base: [...padraoDe(papel)] }) } : e));

  async function salvar() {
    if (!edicao) return;
    const { conceder, negar } = diferenca(padraoDe(edicao.papel), edicao.permissoes);
    const exige = edicao.exige === 'padrao' ? null : edicao.exige === 'sim';
    try {
      if (edicao.id) {
        await db.acessos.atualizar(edicao.id, { nome: edicao.nome, papel: edicao.papel, ativo: edicao.ativo, funcionario_id: edicao.funcionario_id || null, conceder, negar, exige_ponto: exige });
        toast.ok('Acesso atualizado.');
      } else {
        const problema = validarSenha(edicao.senha);
        if (problema) return toast.erro(problema);
        await db.acessos.criar({ nome: edicao.nome, email: edicao.email, papel: edicao.papel, senha: edicao.senha, funcionario_id: edicao.funcionario_id || null, conceder, negar, exige_ponto: exige });
        setEntregue({ nome: edicao.nome, email: edicao.email.trim().toLowerCase(), senha: edicao.senha });
      }
      setEdicao(null); await carregar(); await recarregar();
    } catch (e) { toast.erro((e as Error).message); }
  }
  async function redefinir() {
    if (!senhaDe) return;
    try { await db.acessos.redefinirSenha(senhaDe.a.id, senhaDe.senha); setEntregue({ nome: senhaDe.a.nome, email: senhaDe.a.email, senha: senhaDe.senha }); setSenhaDe(null); await carregar(); }
    catch (e) { toast.erro((e as Error).message); }
  }
  async function remover(a: AcessoLinha) {
    if (!(await confirmar(`Remover definitivamente o acesso de ${a.nome} (${a.email})?`, { perigo: true, rotulo: 'Remover' }))) return;
    try { await db.acessos.remover(a.id); toast.ok('Acesso removido.'); await carregar(); } catch (e) { toast.erro((e as Error).message); }
  }
  async function liberar() {
    if (!liberando) return;
    try { await db.acessos.liberar(liberando.a.id, liberando.minutos, liberando.motivo); toast.ok(`Acesso de ${liberando.a.nome} liberado por ${liberando.minutos} min.`); setLiberando(null); await carregar(); }
    catch (e) { toast.erro((e as Error).message); }
  }
  async function trocarPolitica(valor: boolean) {
    try { await db.acessos.definirExigirPonto(valor); toast.ok(valor ? 'Agora o acesso só abre depois do ponto.' : 'O acesso deixou de depender do ponto.'); await carregar(); }
    catch (e) { toast.erro((e as Error).message); }
  }
  async function trocarEntradaAutomatica(valor: boolean) {
    try { await db.acessos.definirEntradaAutomatica(valor); toast.ok(valor ? 'Depois do ponto, o funcionário entra no sistema sozinho.' : 'Depois do ponto, o funcionário entra com e-mail e senha.'); await carregar(); }
    catch (e) { toast.erro((e as Error).message); }
  }
  async function salvarNivel() {
    if (!nivelEdit) return;
    try { await db.acessos.definirPermissoesPapel(nivelEdit.papel, DELEGAVEIS.filter(id => nivelEdit.permissoes.has(id))); toast.ok(`Permissões de ${PAPEIS[nivelEdit.papel].rotulo} salvas.`); setNivelEdit(null); await carregar(); }
    catch (e) { toast.erro((e as Error).message); }
  }
  async function restaurarNivel(papel: PapelId) {
    if (!(await confirmar(`Voltar as permissões de ${PAPEIS[papel].rotulo} ao padrão do sistema?`, { rotulo: 'Restaurar' }))) return;
    try { await db.acessos.restaurarPermissoesPapel(papel); toast.ok('Padrão restaurado.'); setNivelEdit(null); await carregar(); } catch (e) { toast.erro((e as Error).message); }
  }

  const abas = [{ id: 'acessos' as const, rotulo: 'Acessos' }, { id: 'niveis' as const, rotulo: 'Níveis e permissões' }, ...(ehAdmin ? [{ id: 'registro' as const, rotulo: 'Registro de acessos' }] : [])];

  return (
    <>
      <PageHeader titulo="Acessos e níveis">
        {aba === 'acessos' && !erroCarga && pode('acessos.gerenciar') && <button className="btn" onClick={novo}><Plus size={16} aria-hidden="true" />Novo acesso</button>}
      </PageHeader>
      <p className="page-sub">Cada pessoa entra com o próprio login e um nível de acesso. Quem tem nível mais alto gerencia quem tem nível mais baixo.</p>
      <Abas valor={aba} onChange={setAba} itens={abas} />
      {erroCarga && <div className="notice bad mt-14" role="alert">{erroCarga}</div>}

      {aba === 'acessos' && !erroCarga && (
        <>
          <div className="card card-pad row between g-14 mb-14">
            <div>
              <strong>Acesso só depois do ponto</strong>
              <p className="muted fs-md m-0">{politica?.exigir_ponto ?? true
                ? 'Advogados, financeiro, secretaria, estágio e colaboradores entram no sistema depois de bater a entrada; a saída encerra o acesso. Administrador, gerência e coordenação não dependem do ponto.'
                : 'Desligado: todos entram a qualquer hora, sem depender do ponto.'}</p>
            </div>
            {ehAdmin
              ? <button className="btn ghost" onClick={() => trocarPolitica(!(politica?.exigir_ponto ?? true))}>{politica?.exigir_ponto ?? true ? 'Desligar a exigência' : 'Exigir o ponto'}</button>
              : <Badge tom={politica?.exigir_ponto ?? true ? 'ok' : 'mute'}>{politica?.exigir_ponto ?? true ? 'Ligado' : 'Desligado'}</Badge>}
          </div>
          <div className="card card-pad row between g-14 mb-14">
            <div>
              <strong>Entrada automática depois do ponto</strong>
              <p className="muted fs-md m-0">{politica?.entrada_automatica ?? true
                ? 'Ao confirmar o ponto, quem tem acesso entra no sistema sozinho, com o nível dele. Administrador e gerência sempre entram com e-mail e senha; quem ainda tem senha provisória também. Não vale no tablet compartilhado (modo quiosque).'
                : 'Desligada: depois de bater o ponto, cada pessoa entra com e-mail e senha.'}</p>
            </div>
            {ehAdmin
              ? <button className="btn ghost" onClick={() => trocarEntradaAutomatica(!(politica?.entrada_automatica ?? true))}>{politica?.entrada_automatica ?? true ? 'Desligar' : 'Ligar'}</button>
              : <Badge tom={politica?.entrada_automatica ?? true ? 'ok' : 'mute'}>{politica?.entrada_automatica ?? true ? 'Ligada' : 'Desligada'}</Badge>}
          </div>
          <div className="card" style={{ overflow: 'hidden' }}>
            <div className="table-wrap"><table className="tbl">
              <thead><tr><th>Pessoa</th><th>Nível</th><th>Funcionário</th><th>Acesso agora</th><th>Último acesso</th><th><span className="sr-only">Ações</span></th></tr></thead>
              <tbody>{(linhas ?? []).map(a => {
                const est = a.ativo ? ESTADO[a.estado] : { rotulo: 'Inativo', tom: 'mute' as Tom };
                return (
                  <tr key={a.id}>
                    <td><strong>{a.nome}</strong>{a.id === sessao?.id && <> <Badge tom="gold">você</Badge></>}<div className="muted fs-sm">{a.email}</div></td>
                    <td><span className="nivel-pill">{PAPEIS[a.papel].rotulo}{(a.conceder.length > 0 || a.negar.length > 0) && <Badge tom="gold">ajustado</Badge>}</span></td>
                    <td className="muted">{a.funcionario_nome ?? '—'}</td>
                    <td><Badge tom={est.tom}>{est.rotulo}</Badge>{a.trocar_senha && <div className="muted fs-sm">senha provisória</div>}</td>
                    <td className="muted nowrap">{a.ultimo_acesso ? `${fmtData(isoParaBR(a.ultimo_acesso).data)} ${isoParaBR(a.ultimo_acesso).hhmm}` : 'nunca'}</td>
                    <td className="right nowrap">
                      {a.pode_liberar && a.ativo && a.estado !== 'liberado' && (
                        <button className="icon-btn" title="Liberar o acesso por um tempo" aria-label={`Liberar o acesso de ${a.nome}`} onClick={() => setLiberando({ a, minutos: 60, motivo: '' })}><Timer size={18} /></button>
                      )}
                      {a.pode_gerir && (
                        <>
                          <button className="icon-btn" title="Editar" aria-label={`Editar o acesso de ${a.nome}`} onClick={() => editar(a)}><Pencil size={18} /></button>
                          <button className="icon-btn" title="Redefinir senha" aria-label={`Redefinir a senha de ${a.email}`} onClick={() => { setSenhaDe({ a, senha: gerarSenha() }); setVerSenha(true); }}><KeyRound size={18} /></button>
                          {a.id !== sessao?.id && <button className="icon-btn" title="Remover" aria-label={`Remover ${a.email}`} onClick={() => remover(a)}><Trash2 size={18} /></button>}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>{linhas && !linhas.length && <Vazio titulo="Nenhum acesso cadastrado" />}</div>
          </div>
        </>
      )}

      {aba === 'niveis' && !erroCarga && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <p className="hint card-pad" style={{ paddingBottom: 0 }}>{ehAdmin ? 'Este é o padrão de cada nível. Ajuste o que o seu escritório precisa; ajustes por pessoa ficam na tela de cada acesso.' : 'Padrão de cada nível neste escritório. Só o sócio-administrador altera.'}</p>
          <div className="matriz-wrap"><table className="matriz">
            <thead><tr><th>Permissão</th>{ORDEM_PAPEIS.map(p => (
              <th key={p}><div>{PAPEIS[p].rotulo}</div><div className="muted fs-2xs">nível {PAPEIS[p].nivel}</div>
                {ehAdmin && p !== 'admin' && <button className="btn ghost sm mt-6" onClick={() => setNivelEdit({ papel: p, permissoes: new Set(padraoDe(p)) })} aria-label={`Editar o nível ${PAPEIS[p].rotulo}`}>{politica?.papeis[p]?.personalizado ? 'Editar (ajustado)' : 'Editar'}</button>}
              </th>))}</tr></thead>
            <tbody>
              {(['dia', 'casos', 'financeiro', 'pessoas', 'admin'] as const).flatMap(g => [
                <tr key={`g-${g}`} className="grupo"><th colSpan={ORDEM_PAPEIS.length + 1}>{{ dia: 'Tarefas e agenda', casos: 'Casos e documentos', financeiro: 'Honorários', pessoas: 'Equipe e ponto', admin: 'Administração' }[g]}</th></tr>,
                ...PERMISSOES.filter(p => p.grupo === g).map(p => (
                  <tr key={p.id}>
                    <td>{p.rotulo}{p.reservada && <div className="reservada">reservada ao sócio-administrador</div>}</td>
                    {ORDEM_PAPEIS.map(papel => {
                      const tem = papel === 'admin' ? true : !p.reservada && expandir(padraoDe(papel)).has(p.id);
                      return <td key={papel} className={tem ? 'sim' : 'nao'}><span aria-hidden="true">{tem ? '✓' : '·'}</span><span className="sr-only">{tem ? 'tem' : 'não tem'}</span></td>;
                    })}
                  </tr>
                )),
              ])}
            </tbody>
          </table></div>
        </div>
      )}

      {aba === 'registro' && ehAdmin && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Quando</th><th>Pessoa</th><th>O que aconteceu</th><th>Detalhe</th></tr></thead>
            <tbody>{registro.map(r => (
              <tr key={r.id}><td className="nowrap muted">{fmtData(isoParaBR(r.created_at).data)} {isoParaBR(r.created_at).hhmm}</td><td><strong>{r.nome}</strong></td><td>{EVENTO[r.evento] ?? r.evento}</td><td className="muted">{r.detalhe}</td></tr>
            ))}</tbody>
          </table>{!registro.length && <Vazio titulo="Nenhum registro ainda" />}</div>
        </div>
      )}

      {edicao && (
        <Modal largo titulo={edicao.id ? `Acesso de ${edicao.nome}` : 'Novo acesso'} onClose={() => setEdicao(null)}
          rodape={<><button className="btn ghost" onClick={() => setEdicao(null)}>Cancelar</button><button className="btn" onClick={salvar}>{edicao.id ? 'Salvar' : 'Criar acesso'}</button></>}>
          <div className="stack">
            <Field label="Funcionário" dica="O login fica ligado ao cadastro da pessoa: é pelo ponto dela que o acesso abre e fecha.">
              <select className="select" value={edicao.funcionario_id} onChange={e => {
                const f = funcionarios.find(x => x.id === e.target.value);
                setEdicao({ ...edicao, funcionario_id: e.target.value, nome: edicao.nome || f?.nome || '' });
              }}>
                <option value="">Sem vínculo (não bate ponto)</option>
                {livres.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </Field>
            <Field label="Nome"><input className="input" value={edicao.nome} onChange={e => setEdicao({ ...edicao, nome: e.target.value })} /></Field>
            <Field label="E-mail (será o login)"><input className="input" type="email" inputMode="email" autoCapitalize="none" value={edicao.email} disabled={!!edicao.id} onChange={e => setEdicao({ ...edicao, email: e.target.value })} /></Field>
            <div className="field">
              <label htmlFor="nivel-sel">Nível de acesso</label>
              <select id="nivel-sel" className="select" value={edicao.papel} onChange={e => trocarNivel(e.target.value as PapelId)}>
                {papeisPossiveis.map(p => <option key={p} value={p}>{PAPEIS[p].rotulo}</option>)}
              </select>
              <span className="hint">{PAPEIS[edicao.papel].descricao}</span>
            </div>
            {!edicao.id && (
              <Field label="Senha provisória (mín. 10 caracteres)" dica="A pessoa troca no primeiro acesso. Repasse com segurança.">
                <div className="row fx-nowrap g-6">
                  <input className="input" type={verSenha ? 'text' : 'password'} autoComplete="new-password" value={edicao.senha} onChange={e => setEdicao({ ...edicao, senha: e.target.value })} />
                  <button type="button" className="icon-btn" aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setVerSenha(v => !v)}>{verSenha ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                  <button type="button" className="icon-btn" aria-label="Gerar senha forte" title="Gerar senha forte" onClick={() => { setEdicao({ ...edicao, senha: gerarSenha() }); setVerSenha(true); }}><Wand2 size={18} /></button>
                </div>
                <Medidor senha={edicao.senha} />
              </Field>
            )}
            <Field label="Entrada pelo ponto" dica="O padrão depende do nível. Escolha “nunca” para quem trabalha fora do escritório com frequência.">
              <select className="select" value={edicao.exige} onChange={e => setEdicao({ ...edicao, exige: e.target.value as Rascunho['exige'] })}>
                <option value="padrao">Seguir o padrão do nível ({PAPEIS[edicao.papel].exigePonto ? 'exige o ponto' : 'não exige'})</option>
                <option value="sim">Sempre exigir o ponto</option>
                <option value="nao">Nunca exigir o ponto</option>
              </select>
            </Field>
            {edicao.id && (
              <label className="check"><input type="checkbox" checked={edicao.ativo} onChange={e => setEdicao({ ...edicao, ativo: e.target.checked })} />Acesso ativo</label>
            )}
            <details>
              <summary className="section-title" style={{ cursor: 'pointer' }}>Permissões desta pessoa</summary>
              <p className="hint">Marque a mais ou desmarque a menos que o padrão do nível. {ehAdmin ? '' : 'Você só concede o que você mesmo tem.'}</p>
              <EditorPermissoes escolhidas={edicao.permissoes} onChange={p => setEdicao({ ...edicao, permissoes: p })} padrao={padraoDe(edicao.papel)} podeDar={ehAdmin ? undefined : id => podeConceder(minhas, id)} />
            </details>
          </div>
        </Modal>
      )}

      {senhaDe && (
        <Modal titulo="Redefinir senha" onClose={() => setSenhaDe(null)} rodape={<><button className="btn ghost" onClick={() => setSenhaDe(null)}>Cancelar</button><button className="btn" disabled={!!validarSenha(senhaDe.senha)} onClick={redefinir}>Redefinir</button></>}>
          <div className="stack">
            <p>Pessoa: <strong>{senhaDe.a.nome}</strong> <span className="muted">· {senhaDe.a.email}</span></p>
            <Field label="Nova senha provisória" dica="Ela precisará criar a própria senha ao entrar.">
              <div className="row fx-nowrap g-6">
                <input className="input" type={verSenha ? 'text' : 'password'} autoComplete="new-password" value={senhaDe.senha} onChange={e => setSenhaDe({ ...senhaDe, senha: e.target.value })} />
                <button type="button" className="icon-btn" aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setVerSenha(v => !v)}>{verSenha ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                <button type="button" className="icon-btn" aria-label="Gerar senha forte" title="Gerar senha forte" onClick={() => { setSenhaDe({ ...senhaDe, senha: gerarSenha() }); setVerSenha(true); }}><Wand2 size={18} /></button>
              </div>
              <Medidor senha={senhaDe.senha} />
            </Field>
          </div>
        </Modal>
      )}

      {liberando && (
        <Modal titulo={`Liberar o acesso de ${liberando.a.nome}`} onClose={() => setLiberando(null)} rodape={<><button className="btn ghost" onClick={() => setLiberando(null)}>Cancelar</button><button className="btn" disabled={liberando.motivo.trim().length < 3} onClick={liberar}>Liberar</button></>}>
          <div className="stack">
            <p className="muted fs-md m-0">Use para audiência externa, plantão ou hora extra. Fica no registro de acessos, com o motivo e quem liberou.</p>
            <Field label="Por quanto tempo">
              <select className="select" value={liberando.minutos} onChange={e => setLiberando({ ...liberando, minutos: Number(e.target.value) })}>
                {[30, 60, 120, 240, 480, 720].map(m => <option key={m} value={m}>{m < 60 ? `${m} minutos` : `${m / 60} ${m === 60 ? 'hora' : 'horas'}`}</option>)}
              </select>
            </Field>
            <Field label="Motivo"><input className="input" value={liberando.motivo} onChange={e => setLiberando({ ...liberando, motivo: e.target.value })} placeholder="Ex.: audiência externa" /></Field>
          </div>
        </Modal>
      )}

      {nivelEdit && (
        <Modal largo titulo={`Permissões · ${PAPEIS[nivelEdit.papel].rotulo}`} onClose={() => setNivelEdit(null)}
          rodape={<><button className="btn ghost" onClick={() => restaurarNivel(nivelEdit.papel)}>Restaurar padrão</button><button className="btn" onClick={salvarNivel}>Salvar</button></>}>
          <p className="hint">Vale para todas as pessoas deste nível. As reservadas ao sócio-administrador não podem ser dadas.</p>
          <EditorPermissoes escolhidas={nivelEdit.permissoes} onChange={p => setNivelEdit({ ...nivelEdit, permissoes: p })} padrao={new Set(PADRAO[nivelEdit.papel])} />
        </Modal>
      )}

      {entregue && <Credenciais e={entregue} onClose={() => setEntregue(null)} />}
    </>
  );
}
