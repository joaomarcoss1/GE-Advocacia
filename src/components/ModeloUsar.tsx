import { useEffect, useMemo, useState } from 'react';
import { Copy, Download, Pencil } from 'lucide-react';
import { Badge, Field, Modal, useToast } from '@/components/ui';
import { useDados } from '@/context/Dados';
import { useAuth } from '@/context/Auth';
import { formaDePagamento, type PropostaHonorarios } from '@/lib/precificacao';
import { baixarDocx } from '@/lib/docx';
import { blocos, brl, extrairVariaveis, nomeArquivoModelo, preencher, rotuloCategoriaModelo, trechos, type ModeloDocumento } from '@/lib/modelos';
import { valoresDoModelo } from '@/lib/modelosUso';
import { plural } from '@/lib/format';

/** Mostra o texto com os campos em branco destacados (a mesma leitura que vai para o .docx). */
export function Previa({ texto }: { texto: string }) {
  return (
    <div className="previa-peca" tabIndex={0} aria-label="Prévia do documento">
      {blocos(texto).map((b, i) => {
        if (b.tipo === 'vazio') return <div key={i} style={{ height: 10 }} />;
        if (b.tipo === 'quebra') return <hr key={i} />;
        const filhos = trechos(b.texto).map((t, j) => (t.preencher ? <mark key={j}>{t.texto}</mark> : t.negrito ? <strong key={j}>{t.texto}</strong> : <span key={j}>{t.texto}</span>));
        return <p key={i} className={`bl-${b.tipo}`}>{b.tipo === 'item' ? <>• {filhos}</> : filhos}</p>;
      })}
    </div>
  );
}

/** Usar um modelo: escolhe cliente, processo e advogado, o sistema preenche com os dados reais; o usuário revisa e baixa em Word. */
export default function ModeloUsar({ modelo, onClose }: { modelo: ModeloDocumento; onClose(): void }) {
  const { db, clientes, processos, funcionarios, config, agora, auditar } = useDados();
  const { sessao } = useAuth();
  const toast = useToast();
  const advogados = useMemo(() => funcionarios.filter(f => !f.data_desligamento).sort((a, b) => Number(!!b.oab) - Number(!!a.oab) || a.nome.localeCompare(b.nome, 'pt-BR')), [funcionarios]);
  const [clienteId, setClienteId] = useState('');
  const [processoId, setProcessoId] = useState('');
  const [advogadoId, setAdvogadoId] = useState(() => advogados.find(a => a.oab)?.id ?? '');
  const [valor, setValor] = useState('');
  const [forma, setForma] = useState('');
  const [exito, setExito] = useState('');
  const [propostas, setPropostas] = useState<PropostaHonorarios[]>([]);
  const [editado, setEditado] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);

  useEffect(() => {
    if (sessao?.papel !== 'admin') return;
    db.honorarios.propostas.list().then(l => setPropostas(l.filter(x => x.status !== 'recusada'))).catch(() => undefined);
  }, [db, sessao?.papel]);
  const propostasDoCliente = propostas.filter(x => x.cliente_id === clienteId);
  function usarProposta(id: string) {
    const x = propostas.find(q => q.id === id);
    if (!x) return;
    setValor(x.valor_proposto ? String(x.valor_proposto).replace('.', ',') : '');
    setForma(x.forma_pagamento ?? formaDePagamento(x.resultado, x.entrada, brl));
    setExito(x.exito_pct ? `${String(x.exito_pct).replace('.', ',')}%` : '');
    mudou();
  }
  const usaHonorarios = useMemo(() => extrairVariaveis(modelo.conteudo).some(v => v.startsWith('honorarios.')), [modelo.conteudo]);
  const doCliente = processos.filter(p => p.cliente_id === clienteId);
  const valorNum = Number(valor.replace(/\./g, '').replace(',', '.'));
  const gerado = useMemo(() => {
    const adv = advogados.find(a => a.id === advogadoId);
    const v = valoresDoModelo({
      cliente: clientes.find(c => c.id === clienteId) ?? null, processo: processos.find(p => p.id === processoId) ?? null, escritorio: config.escritorio,
      advogado: adv ? { nome: adv.nome, oab: adv.oab } : null, honorarios: { valor: Number.isFinite(valorNum) && valorNum > 0 ? valorNum : null, forma: forma.trim(), exito: exito.trim() },
      hojeIso: agora.data,
    });
    return preencher(modelo.conteudo, v);
  }, [modelo.conteudo, clienteId, processoId, advogadoId, valorNum, forma, exito, clientes, processos, advogados, config.escritorio, agora.data]);
  const texto = editado ?? gerado.texto;
  const faltando = editado === null ? gerado.faltando : [];
  const restantes = (texto.match(/\[\[PREENCHER: [^\]]+\]\]/g) ?? []).length;
  const mudou = () => setEditado(null);

  async function baixar() {
    try { await baixarDocx(modelo.titulo, texto, config.escritorio.nome || undefined); void auditar('modelo_baixado', modelo.titulo); }
    catch { toast.erro('Não foi possível gerar o arquivo Word.'); }
  }
  async function copiar() {
    try { await navigator.clipboard.writeText(texto); toast.ok('Texto copiado.'); } catch { toast.erro('Seu navegador não permitiu copiar. Use o download.'); }
  }
  const nomeArq = nomeArquivoModelo(modelo.titulo, 'docx');

  return (
    <Modal titulo={modelo.titulo} onClose={onClose} largo rodape={<>
      <button className="btn ghost" onClick={copiar}><Copy size={16} />Copiar texto</button>
      <button className="btn gold" onClick={baixar}><Download size={16} />Baixar em Word</button>
    </>}>
      <div className="stack">
        <p className="muted m-0" >{rotuloCategoriaModelo(modelo.categoria)}{modelo.descricao ? ` · ${modelo.descricao}` : ''}</p>
        <div className="grid c3">
          <Field label="Cliente">
            <select className="select" value={clienteId} onChange={e => { setClienteId(e.target.value); setProcessoId(''); mudou(); }}>
              <option value="">Sem cliente (deixar em branco)</option>
              {[...clientes].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Field>
          <Field label="Processo">
            <select className="select" value={processoId} disabled={!clienteId} onChange={e => { setProcessoId(e.target.value); mudou(); }}>
              <option value="">Sem processo</option>
              {doCliente.map(p => <option key={p.id} value={p.id}>{p.titulo ? `${p.titulo} · ` : ''}{p.numero}</option>)}
            </select>
          </Field>
          <Field label="Advogado(a) responsável">
            <select className="select" value={advogadoId} onChange={e => { setAdvogadoId(e.target.value); mudou(); }}>
              <option value="">Em branco</option>
              {advogados.map(a => <option key={a.id} value={a.id}>{a.nome}{a.oab ? ` · ${a.oab}` : ' · sem OAB cadastrada'}</option>)}
            </select>
          </Field>
        </div>
        {usaHonorarios && propostasDoCliente.length > 0 && (
          <Field label="Preencher com uma proposta de honorários">
            <select className="select" value="" onChange={e => usarProposta(e.target.value)}>
              <option value="">Escolha a proposta do cliente…</option>
              {propostasDoCliente.map(x => <option key={x.id} value={x.id}>{x.titulo} · {brl(x.valor_proposto)}</option>)}
            </select>
          </Field>
        )}
        {usaHonorarios && (
          <div className="grid c3">
            <Field label="Valor dos honorários (R$)"><input className="input" inputMode="decimal" value={valor} placeholder="6.000,00" onChange={e => { setValor(e.target.value); mudou(); }} /></Field>
            <Field label="Forma de pagamento"><input className="input" value={forma} maxLength={200} placeholder="entrada de R$ 2.000,00 e 4 parcelas…" onChange={e => { setForma(e.target.value); mudou(); }} /></Field>
            <Field label="Êxito (%)"><input className="input" value={exito} maxLength={40} placeholder="10%" onChange={e => { setExito(e.target.value); mudou(); }} /></Field>
          </div>
        )}
        <div className="row between fx-wrap g-8" >
          <span>{restantes === 0 ? <Badge tom="ok">Nenhum campo em branco</Badge> : <Badge tom="warn">{plural(restantes, 'campo', 'campos')} em branco, destacados em amarelo</Badge>}
            {editado !== null && <small className="muted"> · texto editado (mudar a seleção acima refaz o texto)</small>}</span>
          <button className="btn ghost sm" onClick={() => setEditando(e => !e)}><Pencil size={14} />{editando ? 'Ver prévia' : 'Editar texto'}</button>
        </div>
        {faltando.length > 0 && <small className="muted">Sem dado cadastrado: {faltando.join(', ')}. Complete no cadastro do cliente/processo ou digite direto no texto.</small>}
        {editando
          ? <textarea className="textarea mono" style={{ minHeight: 380 }} aria-label="Texto do documento" value={texto} onChange={e => setEditado(e.target.value)} />
          : <Previa texto={texto} />}
        <small className="muted">Arquivo: {nomeArq}. Modelo-base de apoio: revise fatos, fundamentos e pedidos antes de protocolar. A responsabilidade técnica é do advogado.</small>
      </div>
    </Modal>
  );
}
