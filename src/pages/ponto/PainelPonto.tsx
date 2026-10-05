import { ArrowRight, Check, Coffee, FilePlus2, History, LogIn, LogOut, RotateCcw, Undo2 } from 'lucide-react';
import { fmtData, isoParaBR } from '@/lib/datetime';
import { minParaHoras, iniciais } from '@/lib/format';
import { previstoDoTipo } from '@/lib/ponto';
import { ANALISE_LABEL, OCORRENCIA_LABEL, TIPO_MARCACAO_LABEL, type TipoMarcacao } from '@/lib/types';
import { ConfirmarMarcacao, FormAusencia, FormRetro, STATUS_TXT } from './FormulariosPonto';
import MinhasTarefas from './MinhasTarefas';
import StatusLocal from './StatusLocal';
import type { Ponto } from './usePonto';

const ICONE: Record<TipoMarcacao, typeof LogIn> = { entrada: LogIn, saida_intervalo: Coffee, retorno_intervalo: Undo2, saida: LogOut };

/** Etapa 3: marcações do dia, formulários e histórico recente. */
export default function PainelPonto({ p }: { p: Ponto }) {
  const { pessoa, escala, sucesso } = p;
  if (!pessoa) return null;
  const ocupado = p.retro || p.aus || !!p.escolha;
  return (
    <div className="stack">
      <div className="row between">
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <span className="avatar">{iniciais(pessoa.nome)}</span>
          <div><strong style={{ fontWeight: 600, fontSize: '1.06rem' }}>{pessoa.nome}</strong><br /><span className="muted" style={{ fontSize: '.88rem' }}>{escala ? escala.nome : 'Sem escala definida'}</span></div>
        </div>
        <button className="btn ghost sm" onClick={p.voltar}>Sair</button>
      </div>

      {sucesso && (
        <div className="sucesso" role="status">
          <svg className="selo" viewBox="0 0 56 56" aria-hidden="true"><circle cx="28" cy="28" r="24" /><path d="M17 29l8 8 14-16" /></svg>
          <div>
            <strong>{TIPO_MARCACAO_LABEL[sucesso.tipo]} registrada às {sucesso.hora}</strong>
            <div>{STATUS_TXT[sucesso.status]}{sucesso.dif !== 0 && sucesso.status !== 'extra' ? ` (${sucesso.dif > 0 ? '+' : '−'}${minParaHoras(sucesso.dif)})` : ''}</div>
            {sucesso.analise === 'pendente' && <div style={{ marginTop: 6, fontSize: '.9rem' }}>Enviado para análise do administrador (aba Ocorrências).</div>}
            {sucesso.aviso && <div style={{ marginTop: 6, fontSize: '.9rem', color: 'var(--bad)' }}>{sucesso.aviso}</div>}
            {p.volta !== null && (
              <span className="volta">Voltando à tela inicial em {p.volta}s · <button type="button" className="link-btn" onClick={() => p.setVolta(null)}>continuar aqui</button></span>
            )}
          </div>
        </div>
      )}
      {p.ausOk && <div className="notice gold" role="status">Atestado enviado. O administrador vai analisar: se aceito, o dia é pago normalmente; se recusado, será descontado da folha.</div>}
      {p.retroOk && <div className="notice gold" role="status">Solicitação enviada. A gerência vai analisar o ajuste do seu ponto.</div>}
      {p.erro && <div className="notice bad" role="alert">{p.erro}</div>}

      {p.cerca && p.ctx && !p.retro && !p.aus && !p.dentro && <StatusLocal local={p.local} raio={p.ctx.ponto.geofence_raio_m} onVerificar={p.checarLocal} />}
      {p.cerca && p.ctx && !p.retro && !p.aus && p.dentro && p.local.estado === 'dentro' && <StatusLocal compacto local={p.local} raio={p.ctx.ponto.geofence_raio_m} onVerificar={p.checarLocal} />}

      {!ocupado && (
        <>
          {!p.turnoHoje && <div className="notice gold">Hoje não é dia de expediente na sua escala. As marcações serão registradas como extras.</div>}
          <div className="stack" style={{ gap: 10 }}>
            {p.sequencia.map(t => {
              const Ic = ICONE[t];
              const feita = p.hojeRegs.find(r => r.tipo === t);
              return (
                <button key={t} className={`acao ${t === p.proximo ? 'next' : ''}`} disabled={!!feita || !p.dentro || p.enviando} onClick={() => p.escolherTipo(t)}>
                  <span className="ic">{feita ? <Check size={22} /> : <Ic size={22} strokeWidth={1.7} />}</span>
                  <span className="grow">
                    <span className="t">{TIPO_MARCACAO_LABEL[t]}</span><br />
                    <span className="s">{feita ? `Registrada às ${isoParaBR(feita.horario_real).hhmm}${feita.status_aprovacao === 'pendente' ? ' · aguardando aprovação' : ''}` : `Previsto ${previstoDoTipo(p.turnoHoje, t) ?? '—'}`}</span>
                  </span>
                  {!feita && <ArrowRight size={18} />}
                </button>
              );
            })}
          </div>
          <button className="btn ghost block" onClick={p.abrirAusencia}><FilePlus2 size={16} />Enviar atestado / justificar uma falta</button>
          <button className="btn ghost block" onClick={p.abrirRetro}><RotateCcw size={16} />Esqueci de bater o ponto em outro dia</button>
        </>
      )}

      {p.escolha && <ConfirmarMarcacao p={p} />}
      {p.aus && <FormAusencia p={p} />}
      {p.retro && <FormRetro p={p} />}

      {!ocupado && <MinhasTarefas p={p} />}

      <div>
        <div className="section-title"><History size={14} style={{ verticalAlign: 'middle' }} /> Últimos registros</div>
        <div className="timeline" style={{ marginTop: 8 }}>
          {p.hist.slice(0, 8).map(r => (
            <div className="tl-item" key={r.id}>
              <span className={`dot ${r.status_aprovacao === 'rejeitado' ? 'off' : ''}`} />
              <span className="mono muted">{fmtData(r.data).slice(0, 5)} · {isoParaBR(r.horario_real).hhmm}</span>
              <span className="grow">{TIPO_MARCACAO_LABEL[r.tipo]}</span>
              {r.status_aprovacao === 'pendente' ? <span className="badge warn">Em análise</span>
                : r.status_aprovacao === 'rejeitado' ? <span className="badge bad" title={r.motivo_rejeicao ?? ''}>Rejeitado</span>
                : r.status === 'atraso' || r.status === 'saida_antecipada'
                  ? <span className={`badge ${r.analise === 'aceita' ? 'ok' : r.analise === 'pendente' ? 'warn' : 'bad'}`} title={r.motivo_decisao ?? ''}>
                    {STATUS_TXT[r.status]}{r.analise ? ` · ${r.analise === 'pendente' ? 'em análise' : r.analise === 'aceita' ? 'aceito' : 'recusado'}` : ''}</span> : null}
            </div>
          ))}
          {!p.hist.length && <span className="muted">Nenhum registro ainda.</span>}
        </div>
      </div>
      {p.justs.length > 0 && (
        <div>
          <div className="section-title"><FilePlus2 size={14} style={{ verticalAlign: 'middle' }} /> Atestados e justificativas enviados</div>
          <div className="timeline" style={{ marginTop: 8 }}>
            {p.justs.slice(0, 5).map(j => (
              <div className="tl-item" key={j.id}>
                <span className={`dot ${j.status_analise === 'recusada' ? 'off' : ''}`} />
                <span className="mono muted">{fmtData(j.data_inicio).slice(0, 5)}{j.data_fim !== j.data_inicio ? `–${fmtData(j.data_fim).slice(0, 5)}` : ''}</span>
                <span className="grow">{OCORRENCIA_LABEL[j.tipo]}{j.anexos ? ` · ${j.anexos} arquivo(s)` : ''}</span>
                <span className={`badge ${j.status_analise === 'aceita' ? 'ok' : j.status_analise === 'pendente' ? 'warn' : 'bad'}`} title={j.motivo_decisao ?? ''}>{ANALISE_LABEL[j.status_analise]}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
