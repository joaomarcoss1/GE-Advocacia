import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Calculator, FileDown, FileSpreadsheet, Lock, Plus, ReceiptText, Wallet } from 'lucide-react';
import { Badge, Field, Kpi, PageHeader, Vazio } from '@/components/ui';
import { fmtData } from '@/lib/datetime';
import { brl } from '@/lib/format';
import { type StatusFolha } from '@/lib/types';
import DetalheFolha from './folha/DetalheFolha';
import ModalAjuste, { type FormAjuste } from './folha/ModalAjuste';
import { useFolha } from './folha/useFolha';

const STATUS: Record<StatusFolha, { rotulo: string; tom: 'warn' | 'gold' | 'ok' }> = { aberta: { rotulo: 'Aberta', tom: 'warn' }, fechada: { rotulo: 'Fechada', tom: 'gold' }, paga: { rotulo: 'Paga', tom: 'ok' } };

export default function Folha() {
  const f = useFolha();
  const { linhas, per, periodos, abertas, fechadas, agora, emAndamento, pendAnalise, toast } = f;
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const [ajuste, setAjuste] = useState<FormAjuste | null>(null);

  const totalLiquido = linhas.reduce((s, l) => s + l.efetivo.valor_final, 0);
  const totalFaltas = linhas.reduce((s, l) => s + l.efetivo.desconto_faltas, 0);
  const nFaltas = linhas.reduce((s, l) => s + l.efetivo.faltas, 0);
  const det = linhas.find(l => l.func.id === detalhe);

  function novoAjuste(fid = '') {
    const data = agora.data >= per.inicio && agora.data <= per.fim ? agora.data : per.fim;
    setAjuste({ funcionario_id: fid, tipo: 'adicional', data, motivo: '' });
  }

  return (
    <>
      <PageHeader titulo="Folha de pagamento">
        <button className="btn ghost" onClick={() => novoAjuste()}><Plus size={18} />Lançar ajuste</button>
      </PageHeader>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="row" style={{ alignItems: 'flex-end', gap: 14 }}>
          <Field label="Mês de competência"><input className="input" type="month" value={f.mes} onChange={e => f.setMes(e.target.value || f.mes)} /></Field>
          {periodos.length > 1 && (
            <Field label="Período">
              <div className="seg">{periodos.map((p, i) => <button key={i} className={f.qz === i ? 'on' : ''} onClick={() => f.setQz(i)}>{p.rotulo}</button>)}</div>
            </Field>
          )}
          <div className="grow" />
          <button className="btn" onClick={f.gerar} disabled={!abertas.length}><Calculator size={18} />Gerar / recalcular</button>
          <button className="btn gold" onClick={f.fechar} disabled={!abertas.length || emAndamento}><Lock size={18} />Fechar folha</button>
          <button className="btn ghost" onClick={f.pagar} disabled={!fechadas.length}><Wallet size={18} />Marcar como paga</button>
        </div>
        {pendAnalise > 0 && (
          <div className="demo-banner" style={{ marginTop: 14 }} role="status">
            <strong>{pendAnalise} item(ns) aguardando análise do administrador.</strong> Os valores abaixo são provisórios (atestado em análise conta como falta; atraso em análise desconta só os minutos). <Link to="/painel/ocorrencias">Analisar em Ocorrências →</Link>
          </div>
        )}
        {emAndamento && <div className="demo-banner" style={{ marginTop: 14 }}><strong>Prévia:</strong> o período termina em {fmtData(per.fim)}. Dias que ainda não aconteceram contam como previstos e pagos; faltas só são apuradas para dias já passados.</div>}
      </div>

      <div className="grid c4" style={{ marginBottom: 16 }}>
        <Kpi label="Líquido total" valor={brl(totalLiquido)} dica={`${linhas.length} funcionário(s)`} />
        <Kpi label="Descontos por faltas" valor={brl(totalFaltas)} dica={`${nFaltas} falta(s) no período`} alerta={nFaltas > 0} />
        <Kpi label="Ajustes (adic. − desc.)" valor={brl(linhas.reduce((s, l) => s + l.efetivo.adicionais - l.efetivo.descontos, 0))} />
        <Kpi label="Situação" valor={linhas.length && linhas.every(l => l.salva?.status === 'paga') ? 'Paga' : fechadas.length && !abertas.length ? 'Fechada' : linhas.some(l => l.salva) ? 'Aberta' : 'Prévia'} dica={`${fechadas.length} fechada(s) · ${linhas.filter(l => l.salva?.status === 'paga').length} paga(s)`} />
      </div>

      <div className="card">
        <div className="card-head">
          <span className="section-title">{f.rotuloPeriodo}</span>
          <div className="row">
            <button className="btn ghost sm" disabled={!linhas.length} onClick={() => f.gerarFolhaPdf().catch(e => toast.erro((e as Error).message))}><FileDown size={16} />PDF</button>
            <button className="btn ghost sm" disabled={!linhas.length} onClick={() => f.gerarExcel().catch(e => toast.erro((e as Error).message))}><FileSpreadsheet size={16} />Excel</button>
          </div>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Funcionário</th><th className="num">Salário</th><th className="num">Diária</th><th className="num">Dias</th><th className="num">Faltas</th><th className="num">Desc. faltas</th><th className="num">Adic.</th><th className="num">Desc.</th><th className="num">Líquido</th><th>Status</th><th><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>
              {linhas.map(l => {
                const e = l.efetivo;
                return (
                  <tr key={l.func.id}>
                    <td className="nome"><strong>{l.func.nome}</strong><div className="muted" style={{ fontSize: '.82rem' }}>{f.cargoDe(l.func.cargo_id)}{!l.escala && <> · <span style={{ color: 'var(--bad)' }}>sem escala</span></>}</div></td>
                    <td className="num">{brl(e.salario_mensal)}</td>
                    <td className="num">{brl(e.valor_diaria)}</td>
                    <td className="num">{e.dias_trabalhados + e.dias_abonados}/{e.dias_previstos}</td>
                    <td className="num">{e.faltas ? <Badge tom="bad">{e.faltas}</Badge> : '0'}</td>
                    <td className="num" style={{ color: e.desconto_faltas ? 'var(--bad)' : undefined }}>{e.desconto_faltas ? `− ${brl(e.desconto_faltas + e.desconto_atrasos)}` : '—'}</td>
                    <td className="num">{e.adicionais ? brl(e.adicionais) : '—'}</td>
                    <td className="num">{e.descontos ? brl(e.descontos) : '—'}</td>
                    <td className="num"><strong>{brl(e.valor_final)}</strong></td>
                    <td>{l.salva ? <Badge tom={STATUS[l.salva.status].tom}>{STATUS[l.salva.status].rotulo}</Badge> : <Badge tom="mute">Prévia</Badge>}{l.desatualizada && <> <Badge tom="warn">Recalcular</Badge></>}</td>
                    <td className="right" style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn ghost sm" onClick={() => setDetalhe(l.func.id)}>Detalhes</button>{' '}
                      <button className="icon-btn" title="Demonstrativo em PDF" aria-label={`Demonstrativo de ${l.func.nome}`} onClick={() => f.gerarHolerite(l).catch(er => toast.erro((er as Error).message))}><ReceiptText size={17} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {linhas.length > 0 && <tfoot><tr><td colSpan={8} className="right">TOTAL LÍQUIDO</td><td className="num">{brl(totalLiquido)}</td><td colSpan={2} /></tr></tfoot>}
          </table>
          {!linhas.length && <Vazio tipo="pessoas" titulo="Ninguém na folha deste período" />}
        </div>
      </div>
      <p className="hint" style={{ marginTop: 12 }}>Os valores são de conferência gerencial: encargos legais (INSS, IRRF, FGTS, férias e 13º) não são calculados aqui. Confirme os cálculos com a contabilidade do escritório.</p>

      {det && (
        <DetalheFolha det={det} ajustesLista={f.ajustesDe(det.func.id)} onFechar={() => setDetalhe(null)} onReabrir={f.reabrir}
          onNovoAjuste={novoAjuste} onEditarAjuste={a => setAjuste({ ...a, valorTxt: String(a.valor).replace('.', ','), horasTxt: a.quantidade_horas ? String(a.quantidade_horas).replace('.', ',') : '' })} onHolerite={l => f.gerarHolerite(l).catch(er => toast.erro((er as Error).message))} />
      )}
      {ajuste && <ModalAjuste ajuste={ajuste} setAjuste={setAjuste} linhas={linhas} inicioPeriodo={per.inicio} />}
    </>
  );
}
