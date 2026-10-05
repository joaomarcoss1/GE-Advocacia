import { useState } from 'react';
import { Eye, EyeOff, KeyRound, Trash2, Wand2 } from 'lucide-react';
import Medidor from '@/components/Medidor';
import { Badge, Field, Modal, useConfirm, useToast, Vazio } from '@/components/ui';
import { useAuth } from '@/context/Auth';
import { useDados } from '@/context/Dados';
import { gerarSenha, validarSenha } from '@/lib/seguranca';
import type { Papel, Usuario } from '@/lib/types';

/** Acessos ao painel DESTE escritório (administrador e gerência). */
export default function AbaAcessos() {
  const { db, usuarios, recarregar, auditar } = useDados();
  const { sessao } = useAuth();
  const toast = useToast();
  const confirmar = useConfirm();
  const [novo, setNovo] = useState<{ nome: string; email: string; papel: Papel; senha: string } | null>(null);
  const [verSenha, setVerSenha] = useState(false);
  const [senhaDe, setSenhaDe] = useState<{ u: Usuario; senha: string } | null>(null);

  async function criarUsuario() {
    if (!novo) return;
    const problema = validarSenha(novo.senha);
    if (problema) return toast.erro(problema);
    try {
      await db.acessos.criar({ nome: novo.nome, email: novo.email, papel: novo.papel, senha: novo.senha });
      await auditar('Acesso criado', `${novo.email} (${novo.papel})`);
      toast.ok(`Acesso criado para ${novo.email}.`); setNovo(null); setVerSenha(false); await recarregar();
    } catch (e) { toast.erro((e as Error).message); }
  }
  async function salvarAcesso(u: Usuario, mudanca: Partial<Pick<Usuario, 'papel' | 'ativo'>>) {
    try {
      await db.acessos.atualizar(u.id, { nome: u.nome, papel: mudanca.papel ?? u.papel, ativo: mudanca.ativo ?? u.ativo });
      await recarregar(); toast.ok('Acesso atualizado.');
    } catch (e) { toast.erro((e as Error).message); await recarregar(); }
  }
  async function redefinir() {
    if (!senhaDe) return;
    try { await db.acessos.redefinirSenha(senhaDe.u.id, senhaDe.senha); toast.ok('Senha redefinida.'); setSenhaDe(null); setVerSenha(false); }
    catch (e) { toast.erro((e as Error).message); }
  }
  async function excluirUsuario(u: Usuario) {
    if (!(await confirmar(`Remover definitivamente o acesso de ${u.email}?`, { perigo: true, rotulo: 'Remover' }))) return;
    try { await db.acessos.remover(u.id); toast.ok('Acesso removido.'); await recarregar(); }
    catch (e) { toast.erro((e as Error).message); }
  }

  return (
    <>
      <div className="row between">
        <button className="btn" onClick={() => { setNovo({ nome: '', email: '', papel: 'gerente', senha: '' }); setVerSenha(false); }}>Novo acesso</button>
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="table-wrap"><table className="tbl">
          <thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Situação</th><th /></tr></thead>
          <tbody>{usuarios.map(u => (
            <tr key={u.id}>
              <td><strong>{u.nome}</strong>{u.id === sessao?.id && <> <Badge tom="gold">você</Badge></>}</td>
              <td className="muted">{u.email}</td>
              <td>
                <select className="select" style={{ minHeight: 38, maxWidth: 170 }} value={u.papel} aria-label={`Papel de ${u.nome}`} onChange={e => salvarAcesso(u, { papel: e.target.value as Papel })}>
                  <option value="admin">Administrador</option><option value="gerente">Gerência</option><option value="coordenador">Coordenação</option>
                </select>
              </td>
              <td><button className={`btn sm ${u.ativo ? 'ghost' : ''}`} onClick={() => salvarAcesso(u, { ativo: !u.ativo })}>{u.ativo ? 'Ativo' : 'Inativo'}</button></td>
              <td className="right" style={{ whiteSpace: 'nowrap' }}>
                <button className="icon-btn" title="Redefinir senha" aria-label={`Redefinir senha de ${u.email}`} onClick={() => { setSenhaDe({ u, senha: '' }); setVerSenha(false); }}><KeyRound size={18} /></button>
                <button className="icon-btn" title="Remover" aria-label={`Remover ${u.email}`} onClick={() => excluirUsuario(u)}><Trash2 size={18} /></button>
              </td>
            </tr>
          ))}</tbody>
        </table>{!usuarios.length && <Vazio titulo="Nenhum acesso cadastrado" />}</div>
      </div>

      {novo && (
        <Modal titulo="Novo acesso ao painel" onClose={() => setNovo(null)} rodape={<><button className="btn ghost" onClick={() => setNovo(null)}>Cancelar</button><button className="btn" onClick={criarUsuario}>Criar acesso</button></>}>
          <div className="stack">
            <Field label="Nome"><input className="input" value={novo.nome} onChange={e => setNovo({ ...novo, nome: e.target.value })} autoFocus /></Field>
            <Field label="E-mail (será o login)"><input className="input" type="email" inputMode="email" autoCapitalize="none" value={novo.email} onChange={e => setNovo({ ...novo, email: e.target.value })} /></Field>
            <div className="field">
              <label>Papel</label>
              <label className={`role-opt ${novo.papel === 'admin' ? 'on' : ''}`}><input type="radio" name="papel" checked={novo.papel === 'admin'} onChange={() => setNovo({ ...novo, papel: 'admin' })} /><span><strong>Administrador</strong><br /><span className="muted">Acesso total ao escritório: salários, folha, atestados, configurações e acessos.</span></span></label>
              <label className={`role-opt ${novo.papel === 'gerente' ? 'on' : ''}`}><input type="radio" name="papel" checked={novo.papel === 'gerente'} onChange={() => setNovo({ ...novo, papel: 'gerente' })} /><span><strong>Gerência</strong><br /><span className="muted">Aprova ponto, registra ocorrências e vê escalas. Não vê salários, folha nem atestados.</span></span></label>
              <label className={`role-opt ${novo.papel === 'coordenador' ? 'on' : ''}`}><input type="radio" name="papel" checked={novo.papel === 'coordenador'} onChange={() => setNovo({ ...novo, papel: 'coordenador' })} /><span><strong>Coordenação</strong><br /><span className="muted">Delega e acompanha tarefas, prazos e reuniões. Não vê ponto, salários, folha nem atestados.</span></span></label>
            </div>
            <Field label="Senha inicial (mín. 10 caracteres)" dica="Use letras e números; quanto mais longa, melhor. Anote e repasse com segurança.">
              <div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
                <input className="input" type={verSenha ? 'text' : 'password'} autoComplete="new-password" value={novo.senha} onChange={e => setNovo({ ...novo, senha: e.target.value })} />
                <button type="button" className="icon-btn" aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setVerSenha(v => !v)}>{verSenha ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                <button type="button" className="icon-btn" aria-label="Gerar senha forte" title="Gerar senha forte" onClick={() => { setNovo({ ...novo, senha: gerarSenha() }); setVerSenha(true); }}><Wand2 size={18} /></button>
              </div>
              <Medidor senha={novo.senha} />
            </Field>
          </div>
        </Modal>
      )}

      {senhaDe && (
        <Modal titulo="Redefinir senha" onClose={() => setSenhaDe(null)} rodape={<><button className="btn ghost" onClick={() => setSenhaDe(null)}>Cancelar</button><button className="btn" disabled={!!validarSenha(senhaDe.senha)} onClick={redefinir}>Salvar nova senha</button></>}>
          <div className="stack">
            <p>Usuário: <strong>{senhaDe.u.nome}</strong> <span className="muted">· {senhaDe.u.email}</span></p>
            <Field label="Nova senha (mín. 10 caracteres, com letras e números)">
              <div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
                <input className="input" type={verSenha ? 'text' : 'password'} autoComplete="new-password" value={senhaDe.senha} onChange={e => setSenhaDe({ ...senhaDe, senha: e.target.value })} autoFocus />
                <button type="button" className="icon-btn" aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setVerSenha(v => !v)}>{verSenha ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                <button type="button" className="icon-btn" aria-label="Gerar senha forte" title="Gerar senha forte" onClick={() => { setSenhaDe({ ...senhaDe, senha: gerarSenha() }); setVerSenha(true); }}><Wand2 size={18} /></button>
              </div>
              <Medidor senha={senhaDe.senha} />
            </Field>
          </div>
        </Modal>
      )}
    </>
  );
}
