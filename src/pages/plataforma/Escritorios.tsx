import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Copy, KeyRound, Plus, Power, Trash2, UserPlus, Wand2 } from 'lucide-react';
import { Badge, Field, Kpi, Modal, PageHeader, useConfirm, useToast, Vazio } from '@/components/ui';
import { getDb, type Db } from '@/data/db';
import { FUSOS_BR, fmtData } from '@/lib/datetime';
import Medidor from '@/components/Medidor';
import { gerarSenha, validarSenha } from '@/lib/seguranca';
import { SLUG_REGEX, slugDe } from '@/lib/slug';
import type { EscritorioPlataforma, Usuario } from '@/lib/types';

type UsuarioResumo = Pick<Usuario, 'id' | 'nome' | 'email' | 'papel' | 'ativo'>;
const vazioNovo = { nome: '', slug: '', slugEditado: false, fuso: 'America/Fortaleza', adminNome: '', adminEmail: '', adminSenha: '' };

/** Gestão dos escritórios (clientes) pela plataforma. Mostra só contagens: nunca dados de pessoas, ponto ou folha. */
export default function Escritorios() {
  const toast = useToast();
  const confirmar = useConfirm();
  const [db, setDb] = useState<Db | null>(null);
  const [lista, setLista] = useState<EscritorioPlataforma[] | null>(null);
  const [novo, setNovo] = useState<typeof vazioNovo | null>(null);
  const [ger, setGer] = useState<EscritorioPlataforma | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioResumo[]>([]);
  const [edicao, setEdicao] = useState({ nome: '', fuso: 'America/Fortaleza' });
  const [novoAdmin, setNovoAdmin] = useState<{ nome: string; email: string; senha: string } | null>(null);
  const [senhaDe, setSenhaDe] = useState<{ u: UsuarioResumo; senha: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async (d: Db) => { setLista(await d.plataforma.listar()); }, []);
  useEffect(() => { getDb().then(async d => { setDb(d); await carregar(d); }).catch(e => toast.erro((e as Error).message)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const totais = useMemo(() => ({
    n: lista?.length ?? 0, ativos: lista?.filter(e => e.ativo).length ?? 0,
    suspensos: lista?.filter(e => !e.ativo).length ?? 0, funcs: lista?.reduce((s, e) => s + e.funcionarios, 0) ?? 0,
  }), [lista]);

  async function abrir(e: EscritorioPlataforma) {
    if (!db) return;
    setGer(e); setEdicao({ nome: e.nome, fuso: e.fuso }); setNovoAdmin(null); setSenhaDe(null);
    setUsuarios(await db.plataforma.usuarios(e.id));
  }
  async function criar() {
    if (!db || !novo || salvando) return;
    if (novo.nome.trim().length < 2) return toast.erro('Informe o nome do escritório.');
    if (!SLUG_REGEX.test(novo.slug)) return toast.erro('O endereço deve ter de 3 a 40 letras minúsculas, números ou hífens.');
    const p = validarSenha(novo.adminSenha); if (p) return toast.erro(p);
    setSalvando(true);
    try {
      await db.plataforma.criar({ nome: novo.nome, slug: novo.slug, fuso: novo.fuso, adminNome: novo.adminNome, adminEmail: novo.adminEmail, adminSenha: novo.adminSenha });
      toast.ok(`Escritório "${novo.nome}" criado. Repasse o e-mail e a senha ao administrador.`);
      setNovo(null); await carregar(db);
    } catch (e) { toast.erro((e as Error).message); } finally { setSalvando(false); }
  }
  async function salvarEdicao(ativo: boolean) {
    if (!db || !ger || salvando) return;
    setSalvando(true);
    try {
      await db.plataforma.atualizar(ger.id, { nome: edicao.nome, ativo, fuso: edicao.fuso });
      toast.ok('Escritório atualizado.'); await carregar(db);
      setGer({ ...ger, nome: edicao.nome.trim(), ativo, fuso: edicao.fuso });
    } catch (e) { toast.erro((e as Error).message); } finally { setSalvando(false); }
  }
  async function alternar(e: EscritorioPlataforma) {
    if (!db) return;
    const msg = e.ativo
      ? `Suspender "${e.nome}"? Ninguém do escritório consegue entrar nem registrar ponto até a reativação. Os dados são preservados.`
      : `Reativar "${e.nome}"?`;
    if (!(await confirmar(msg, { rotulo: e.ativo ? 'Suspender' : 'Reativar', perigo: e.ativo }))) return;
    try { await db.plataforma.atualizar(e.id, { nome: e.nome, ativo: !e.ativo, fuso: e.fuso }); toast.ok(e.ativo ? 'Escritório suspenso.' : 'Escritório reativado.'); await carregar(db); }
    catch (x) { toast.erro((x as Error).message); }
  }
  async function excluir(e: EscritorioPlataforma) {
    if (!db) return;
    if (!(await confirmar(`Excluir "${e.nome}" definitivamente? Só é possível porque ele não tem funcionários cadastrados. Os acessos dele também serão removidos.`, { rotulo: 'Excluir', perigo: true }))) return;
    try { await db.plataforma.excluir(e.id); toast.ok('Escritório excluído.'); setGer(null); await carregar(db); }
    catch (x) { toast.erro((x as Error).message); }
  }
  async function criarAdmin() {
    if (!db || !ger || !novoAdmin || salvando) return;
    const p = validarSenha(novoAdmin.senha); if (p) return toast.erro(p);
    setSalvando(true);
    try {
      await db.plataforma.criarAdmin(ger.id, novoAdmin);
      toast.ok('Administrador criado.'); setNovoAdmin(null);
      setUsuarios(await db.plataforma.usuarios(ger.id)); await carregar(db);
    } catch (e) { toast.erro((e as Error).message); } finally { setSalvando(false); }
  }
  async function redefinir() {
    if (!db || !senhaDe || salvando) return;
    const p = validarSenha(senhaDe.senha); if (p) return toast.erro(p);
    setSalvando(true);
    try { await db.plataforma.redefinirSenha(senhaDe.u.id, senhaDe.senha); toast.ok(`Senha de ${senhaDe.u.email} redefinida.`); setSenhaDe(null); }
    catch (e) { toast.erro((e as Error).message); } finally { setSalvando(false); }
  }
  const linkPonto = (slug: string) => `${location.origin}/ponto/${slug}`;
  async function copiar(texto: string) { try { await navigator.clipboard.writeText(texto); toast.ok('Endereço copiado.'); } catch { window.prompt('Copie o endereço (Ctrl+C):', texto); } }

  return (
    <>
      <PageHeader titulo="Escritórios" sub="Cada escritório tem equipe, ponto, folha e usuários totalmente separados. Aqui você cria os acessos iniciais e suspende ou reativa escritórios; os dados deles ficam fora do seu alcance.">
        <button className="btn gold" onClick={() => setNovo({ ...vazioNovo })}><Plus size={18} />Novo escritório</button>
      </PageHeader>

      <div className="grid c4" style={{ marginBottom: 20 }}>
        <Kpi label="Escritórios" valor={totais.n} dica="cadastrados na plataforma" />
        <Kpi label="Ativos" valor={totais.ativos} dica="com acesso liberado" />
        <Kpi label="Suspensos" valor={totais.suspensos} alerta={totais.suspensos > 0} dica="sem acesso" />
        <Kpi label="Funcionários" valor={totais.funcs} dica="soma dos escritórios ativos" />
      </div>

      {lista && !lista.length && <div className="card"><Vazio tipo="cargos" titulo="Nenhum escritório ainda" acao={{ rotulo: 'Cadastrar o primeiro escritório', onClick: () => setNovo({ ...vazioNovo }) }}>Cadastre o escritório e o administrador que vai gerenciar a equipe dele.</Vazio></div>}
      <div className="tenants">
        {lista?.map(e => (
          <article key={e.id} className={`tenant ${e.ativo ? '' : 'off'}`} aria-label={e.nome}>
            <div className="tenant-topo">
              <div>
                <div className="tenant-nome">{e.nome}</div>
                <span className="tenant-slug">/{e.slug}</span>
              </div>
              <Badge tom={e.ativo ? 'ok' : 'bad'}>{e.ativo ? 'Ativo' : 'Suspenso'}</Badge>
            </div>
            <div className="tenant-nums">
              <div><b>{e.funcionarios}</b><span>Funcionários</span></div>
              <div><b>{e.usuarios}</b><span>Acessos</span></div>
              <div><b>{e.admins}</b><span>Admins</span></div>
            </div>
            <div className="link-ponto"><span className="grow">{linkPonto(e.slug)}</span><button className="icon-btn" style={{ width: 30, height: 30 }} aria-label={`Copiar endereço do ponto de ${e.nome}`} onClick={() => copiar(linkPonto(e.slug))}><Copy size={15} /></button></div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn sm" onClick={() => abrir(e)}><Building2 size={15} />Gerenciar</button>
              <button className="btn ghost sm" onClick={() => alternar(e)}><Power size={15} />{e.ativo ? 'Suspender' : 'Reativar'}</button>
              <span className="muted" style={{ marginLeft: 'auto', fontSize: '.78rem' }}>desde {fmtData(e.created_at)}</span>
            </div>
          </article>
        ))}
      </div>

      {novo && (
        <Modal titulo="Novo escritório" onClose={() => setNovo(null)} rodape={<><button className="btn ghost" onClick={() => setNovo(null)}>Cancelar</button><button className="btn" onClick={criar} disabled={salvando}>{salvando ? 'Criando…' : 'Criar escritório'}</button></>}>
          <div className="stack">
            <Field label="Nome do escritório"><input className="input" value={novo.nome} placeholder="Ex.: Silva & Ribeiro Advogados"
              onChange={e => setNovo({ ...novo, nome: e.target.value, slug: novo.slugEditado ? novo.slug : slugDe(e.target.value) })} /></Field>
            <Field label="Endereço do ponto (slug)" dica={`Os funcionários registram o ponto em ${location.origin}/ponto/${novo.slug || 'endereco'}. Não pode ser alterado depois sem avisar a equipe.`}>
              <input className="input" value={novo.slug} onChange={e => setNovo({ ...novo, slug: slugDe(e.target.value), slugEditado: true })} />
            </Field>
            <Field label="Fuso horário"><select className="select" value={novo.fuso} onChange={e => setNovo({ ...novo, fuso: e.target.value })}>{FUSOS_BR.map(f => <option key={f.id} value={f.id}>{f.rotulo}</option>)}</select></Field>
            <div className="section-title" style={{ marginTop: 6 }}>Administrador do escritório</div>
            <div className="grid c2">
              <Field label="Nome"><input className="input" value={novo.adminNome} onChange={e => setNovo({ ...novo, adminNome: e.target.value })} /></Field>
              <Field label="E-mail"><input className="input" type="email" autoComplete="off" value={novo.adminEmail} onChange={e => setNovo({ ...novo, adminEmail: e.target.value })} /></Field>
            </div>
            <Field label="Senha inicial" dica="Mínimo de 10 caracteres, com letras e números. O administrador deve trocá-la no primeiro acesso.">
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input className="input" autoComplete="new-password" value={novo.adminSenha} onChange={e => setNovo({ ...novo, adminSenha: e.target.value })} />
                <button type="button" className="btn ghost" onClick={() => setNovo({ ...novo, adminSenha: gerarSenha() })}><Wand2 size={16} />Gerar</button>
              </div>
              <Medidor senha={novo.adminSenha} />
            </Field>
          </div>
        </Modal>
      )}

      {ger && (
        <Modal largo titulo={ger.nome} onClose={() => setGer(null)} rodape={<>
          {ger.funcionarios === 0 && <button className="btn danger ghost" onClick={() => excluir(ger)}><Trash2 size={16} />Excluir escritório</button>}
          <button className="btn ghost" onClick={() => alternar(ger).then(() => setGer(null))}><Power size={16} />{ger.ativo ? 'Suspender' : 'Reativar'}</button>
          <button className="btn" onClick={() => salvarEdicao(ger.ativo)} disabled={salvando}>Salvar alterações</button>
        </>}>
          <div className="grid c2" style={{ alignItems: 'start' }}>
            <div className="stack">
              <div className="section-title">Dados</div>
              <Field label="Nome"><input className="input" value={edicao.nome} onChange={e => setEdicao({ ...edicao, nome: e.target.value })} /></Field>
              <Field label="Fuso horário"><select className="select" value={edicao.fuso} onChange={e => setEdicao({ ...edicao, fuso: e.target.value })}>{FUSOS_BR.map(f => <option key={f.id} value={f.id}>{f.rotulo}</option>)}</select></Field>
              <Field label="Endereço do ponto"><div className="link-ponto"><span className="grow">{linkPonto(ger.slug)}</span></div></Field>
              <p className="hint">A plataforma enxerga apenas contagens ({ger.funcionarios} funcionário(s), {ger.usuarios} acesso(s)). Folha, ponto, salários e atestados do escritório ficam fora do seu alcance.</p>
            </div>
            <div className="stack">
              <div className="row between"><span className="section-title">Quem acessa o painel</span><button className="btn ghost sm" onClick={() => setNovoAdmin({ nome: '', email: '', senha: '' })}><UserPlus size={15} />Novo administrador</button></div>
              <div className="card" style={{ boxShadow: 'none' }}>
                {usuarios.map(u => (
                  <div className="sum-line" key={u.id} style={{ padding: '10px 14px' }}>
                    <span><strong style={{ fontWeight: 600 }}>{u.nome}</strong><br /><span className="muted" style={{ fontSize: '.82rem' }}>{u.email}</span></span>
                    <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                      <Badge tom={u.papel === 'admin' ? 'gold' : ''}>{u.papel === 'admin' ? 'Administrador' : 'Gerência'}</Badge>
                      {!u.ativo && <Badge tom="mute">Inativo</Badge>}
                      <button className="icon-btn" style={{ width: 32, height: 32 }} aria-label={`Redefinir a senha de ${u.email}`} title="Redefinir senha" onClick={() => setSenhaDe({ u, senha: '' })}><KeyRound size={16} /></button>
                    </span>
                  </div>
                ))}
                {!usuarios.length && <p className="muted" style={{ padding: 14 }}>Nenhum acesso cadastrado.</p>}
              </div>
              {novoAdmin && (
                <div className="stack card card-pad" style={{ boxShadow: 'none' }}>
                  <Field label="Nome"><input className="input" value={novoAdmin.nome} onChange={e => setNovoAdmin({ ...novoAdmin, nome: e.target.value })} /></Field>
                  <Field label="E-mail"><input className="input" type="email" autoComplete="off" value={novoAdmin.email} onChange={e => setNovoAdmin({ ...novoAdmin, email: e.target.value })} /></Field>
                  <Field label="Senha inicial"><div className="row" style={{ flexWrap: 'nowrap' }}><input className="input" autoComplete="new-password" value={novoAdmin.senha} onChange={e => setNovoAdmin({ ...novoAdmin, senha: e.target.value })} /><button type="button" className="btn ghost" onClick={() => setNovoAdmin({ ...novoAdmin, senha: gerarSenha() })}><Wand2 size={16} />Gerar</button></div></Field>
                  <div className="row"><button className="btn sm" onClick={criarAdmin} disabled={salvando}>Criar administrador</button><button className="btn ghost sm" onClick={() => setNovoAdmin(null)}>Cancelar</button></div>
                </div>
              )}
              {senhaDe && (
                <div className="stack card card-pad" style={{ boxShadow: 'none' }}>
                  <strong style={{ fontWeight: 600 }}>Nova senha para {senhaDe.u.email}</strong>
                  <div className="row" style={{ flexWrap: 'nowrap' }}><input className="input" aria-label="Nova senha" autoComplete="new-password" value={senhaDe.senha} onChange={e => setSenhaDe({ ...senhaDe, senha: e.target.value })} /><button type="button" className="btn ghost" onClick={() => setSenhaDe({ ...senhaDe, senha: gerarSenha() })}><Wand2 size={16} />Gerar</button></div>
                  <Medidor senha={senhaDe.senha} />
                  <div className="row"><button className="btn sm" onClick={redefinir} disabled={salvando}>Redefinir senha</button><button className="btn ghost sm" onClick={() => setSenhaDe(null)}>Cancelar</button></div>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
