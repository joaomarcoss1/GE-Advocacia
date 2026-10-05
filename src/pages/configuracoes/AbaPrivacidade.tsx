import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Eraser, ShieldCheck } from 'lucide-react';
import { Badge, Field, Vazio, useConfirm, useToast } from '@/components/ui';
import type { ResumoExpurgo } from '@/data/db';
import { useDados } from '@/context/Dados';
import { fmtData, isoParaBR } from '@/lib/datetime';
import type { AcessoSensivel, Config } from '@/lib/types';

const num = (v: string) => (v === '' ? 0 : Math.max(0, Math.round(Number(v.replace(',', '.')) || 0)));

/** Privacidade (LGPD): prazos de guarda, expurgo com prévia e rastro de quem abriu cada atestado. */
export default function AbaPrivacidade({ c, setC }: { c: Config; setC(c: Config): void }) {
  const { db, funcionarios, recarregar, escritorio } = useDados();
  const toast = useToast();
  const confirmar = useConfirm();
  const [previa, setPrevia] = useState<ResumoExpurgo | null>(null);
  const [acessos, setAcessos] = useState<AcessoSensivel[]>([]);
  const [filtroFunc, setFiltroFunc] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  useEffect(() => { db.acessosSensiveis.list().then(l => setAcessos(l.sort((a, b) => b.created_at.localeCompare(a.created_at)))); }, [db]);

  const nomeDe = (id: string | null) => funcionarios.find(f => f.id === id)?.nome ?? '—';
  const visiveis = useMemo(() => acessos.filter(a => {
    const dia = isoParaBR(a.created_at).data;
    return (!filtroFunc || a.funcionario_id === filtroFunc) && (!de || dia >= de) && (!ate || dia <= ate);
  }), [acessos, filtroFunc, de, ate]);

  async function verPrevia() {
    try { setPrevia(await db.retencao.previa()); } catch (e) { toast.erro((e as Error).message); }
  }
  async function executar() {
    if (!previa) return;
    const total = previa.anexos + previa.geolocalizacao + previa.tentativas_pin;
    if (!total) return toast.ok('Não há nada a expurgar com os prazos atuais.');
    if (!(await confirmar(`Apagar definitivamente: ${previa.anexos} anexo(s) vencido(s), a geolocalização de ${previa.geolocalizacao} marcação(ões) e ${previa.tentativas_pin} tentativa(s) de PIN? Não há como desfazer. A ação fica registrada na auditoria.`, { rotulo: 'Executar expurgo', perigo: true }))) return;
    try {
      const r = await db.retencao.executar();
      toast.ok(`Expurgo concluído: ${r.anexos} anexo(s), ${r.geolocalizacao} coordenada(s), ${r.tentativas_pin} tentativa(s).`);
      setPrevia(null); await recarregar();
    } catch (e) { toast.erro((e as Error).message); }
  }
  const priv = (patch: Partial<Config['privacidade']>) => setC({ ...c, privacidade: { ...c.privacidade, ...patch } });

  return (
    <>
      <div className="demo-banner" role="note"><strong>Apoio técnico, não parecer jurídico.</strong> Os prazos abaixo são valores-padrão de partida: <strong>confirme com o jurídico e a contabilidade do escritório</strong> antes de adotá-los.</div>

      <div className="section-title">Prazos de guarda</div>
      <div className="grid c3">
        <Field label="Atestados e anexos de saúde (meses)" dica="Depois disso, o expurgo apaga o arquivo e o registro do anexo."><input className="input" inputMode="numeric" value={c.privacidade.anexos_meses} onChange={e => priv({ anexos_meses: num(e.target.value) })} /></Field>
        <Field label="Geolocalização das marcações (meses)" dica="Depois disso, a coordenada é apagada; a marcação (data e hora) permanece."><input className="input" inputMode="numeric" value={c.privacidade.geolocalizacao_meses} onChange={e => priv({ geolocalizacao_meses: num(e.target.value) })} /></Field>
        <Field label="Tentativas de PIN (dias)" dica="Fixo: removidas automaticamente após 90 dias."><input className="input" value={90} readOnly aria-readonly="true" /></Field>
      </div>
      <p className="hint">Clique em <em>Salvar alterações</em> (abaixo) para gravar os prazos.</p>

      <div className="card card-pad stack" style={{ boxShadow: 'none', background: 'var(--surface-2)' }}>
        <div className="row between">
          <div><strong style={{ fontWeight: 600 }}>Expurgo de dados vencidos</strong><div className="hint">Veja primeiro o que seria apagado; só então execute. Períodos com folha fechada também são alcançados (só a coordenada/anexos, nunca a marcação em si).</div></div>
          <div className="row"><button className="btn ghost" onClick={verPrevia}><ShieldCheck size={16} />Ver prévia</button><button className="btn danger" disabled={!previa} onClick={executar}><Eraser size={16} />Executar expurgo</button></div>
        </div>
        {previa && (
          <div className="grid c3" role="status">
            <div className="card kpi" style={{ boxShadow: 'none' }}><div className="label">Anexos vencidos</div><div className="value">{previa.anexos}</div><div className="hint">mais de {previa.regras.anexos_meses} meses</div></div>
            <div className="card kpi" style={{ boxShadow: 'none' }}><div className="label">Coordenadas de GPS</div><div className="value">{previa.geolocalizacao}</div><div className="hint">mais de {previa.regras.geolocalizacao_meses} meses</div></div>
            <div className="card kpi" style={{ boxShadow: 'none' }}><div className="label">Tentativas de PIN</div><div className="value">{previa.tentativas_pin}</div><div className="hint">mais de {previa.regras.tentativas_dias} dias</div></div>
          </div>
        )}
      </div>

      <div className="row between" style={{ marginTop: 6 }}>
        <div className="section-title">Acessos a documentos sensíveis</div>
        <a className="btn ghost sm" href={`/privacidade/${escritorio.slug}`} target="_blank" rel="noreferrer"><ExternalLink size={14} />Aviso de privacidade (texto-base)</a>
      </div>
      <p className="hint" style={{ margin: 0 }}>Cada abertura de atestado é registrada (quem e quando) e esse registro não pode ser editado nem apagado.</p>
      <div className="grid c3">
        <Field label="Funcionário"><select className="select" value={filtroFunc} onChange={e => setFiltroFunc(e.target.value)}><option value="">Todos</option>{funcionarios.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></Field>
        <Field label="De"><input className="input" type="date" value={de} onChange={e => setDe(e.target.value)} /></Field>
        <Field label="Até"><input className="input" type="date" value={ate} onChange={e => setAte(e.target.value)} /></Field>
      </div>
      <div className="table-wrap"><table className="tbl">
        <thead><tr><th>Quando</th><th>Quem abriu</th><th>Documento de</th><th>Ação</th></tr></thead>
        <tbody>{visiveis.map(a => (
          <tr key={a.id}>
            <td className="mono">{fmtData(isoParaBR(a.created_at).data)} {isoParaBR(a.created_at).hhmm}</td>
            <td>{a.usuario}</td><td>{nomeDe(a.funcionario_id)}</td><td><Badge tom="gold">{a.acao === 'abrir' ? 'Abriu o atestado' : a.acao}</Badge></td>
          </tr>
        ))}</tbody>
      </table>{!visiveis.length && <Vazio tipo="documento" titulo="Nenhum acesso registrado">Quando um administrador abrir um atestado, o acesso aparece aqui.</Vazio>}</div>
    </>
  );
}
