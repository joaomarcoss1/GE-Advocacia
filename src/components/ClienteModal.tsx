import { useState } from 'react';
import { Field, Modal, useToast } from '@/components/ui';
import { useDados } from '@/context/Dados';
import type { Cliente, TipoPessoa } from '@/lib/types';

/** Cadastro de cliente (nome, tipo, contato). CPF/CNPJ e contatos ficam fora da trilha de auditoria. */
export default function ClienteModal({ cliente, onClose, onSalvo }: { cliente: Cliente | null; onClose(): void; onSalvo(c: Cliente): void }) {
  const { db } = useDados();
  const toast = useToast();
  const [f, setF] = useState({ nome: cliente?.nome ?? '', tipo: (cliente?.tipo ?? 'pf') as TipoPessoa, documento: cliente?.documento ?? '', email: cliente?.email ?? '', telefone: cliente?.telefone ?? '', observacoes: cliente?.observacoes ?? '', ativo: cliente?.ativo ?? true });
  const [salvando, setSalvando] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(x => ({ ...x, [k]: v }));

  async function salvar() {
    if (f.nome.trim().length < 2) return toast.erro('Informe o nome do cliente.');
    if (f.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) return toast.erro('Informe um e-mail válido.');
    setSalvando(true);
    try {
      const dados: Partial<Cliente> = { nome: f.nome.trim(), tipo: f.tipo, documento: f.documento.trim() || null, email: f.email.trim() || null, telefone: f.telefone.trim() || null, observacoes: f.observacoes.trim() || null, ativo: f.ativo };
      onSalvo(cliente ? await db.clientes.update(cliente.id, dados) : await db.clientes.insert(dados));
    } catch (e) { toast.erro((e as Error).message); setSalvando(false); }
  }
  return (
    <Modal titulo={cliente ? 'Editar cliente' : 'Novo cliente'} onClose={onClose}
      rodape={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button></>}>
      <div className="stack">
        <div className="grid c2">
          <Field label="Nome"><input className="input" autoFocus value={f.nome} maxLength={200} onChange={e => set('nome', e.target.value)} /></Field>
          <Field label="Tipo">
            <select className="select" value={f.tipo} onChange={e => set('tipo', e.target.value as TipoPessoa)}><option value="pf">Pessoa física</option><option value="pj">Pessoa jurídica</option></select>
          </Field>
        </div>
        <div className="grid c3">
          <Field label={f.tipo === 'pf' ? 'CPF' : 'CNPJ'}><input className="input" inputMode="numeric" value={f.documento} maxLength={32} onChange={e => set('documento', e.target.value)} /></Field>
          <Field label="E-mail"><input className="input" type="email" value={f.email} maxLength={200} onChange={e => set('email', e.target.value)} /></Field>
          <Field label="Telefone / WhatsApp"><input className="input" inputMode="tel" value={f.telefone} maxLength={40} onChange={e => set('telefone', e.target.value)} /></Field>
        </div>
        <Field label="Observações"><textarea className="textarea" value={f.observacoes} maxLength={2000} onChange={e => set('observacoes', e.target.value)} /></Field>
        {cliente && <label className="check"><input type="checkbox" checked={f.ativo} onChange={e => set('ativo', e.target.checked)} />Cliente ativo</label>}
      </div>
    </Modal>
  );
}
