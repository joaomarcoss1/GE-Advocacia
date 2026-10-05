import { Fragment, useEffect, useState } from 'react';
import { Vazio } from '@/components/ui';
import { useDados } from '@/context/Dados';
import { fmtData, isoParaBR } from '@/lib/datetime';
import type { Auditoria } from '@/lib/types';

/** Trilha de auditoria do escritório: alterações campo a campo. Só leitura (ninguém edita nem apaga). */
export default function AbaAuditoria() {
  const { db } = useDados();
  const [logs, setLogs] = useState<Auditoria[]>([]);
  const [filtro, setFiltro] = useState('');
  const [aberto, setAberto] = useState<string | null>(null);
  useEffect(() => { db.auditoria.list().then(l => setLogs(l.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 400))); }, [db]);
  const visiveis = logs.filter(l => !filtro.trim() || `${l.usuario} ${l.acao} ${l.detalhe}`.toLowerCase().includes(filtro.trim().toLowerCase()));

  return (
    <>
      <div className="row between" style={{ gap: 12, flexWrap: 'wrap' }}>
        <input className="input" style={{ maxWidth: 340 }} placeholder="Filtrar por pessoa, ação ou texto…" value={filtro} onChange={e => setFiltro(e.target.value)} aria-label="Filtrar auditoria" />
        <span className="hint">Registro automático e permanente: não pode ser editado nem apagado. Mostrando {visiveis.length} de {logs.length} mais recentes.</span>
      </div>
      <div className="table-wrap"><table className="tbl">
        <thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Detalhe</th><th /></tr></thead>
        <tbody>{visiveis.map(l => (
          <Fragment key={l.id}>
            <tr>
              <td className="mono">{fmtData(isoParaBR(l.created_at).data)} {isoParaBR(l.created_at).hhmm}</td><td>{l.usuario}</td><td><strong>{l.acao}</strong></td><td className="muted">{l.detalhe}</td>
              <td className="right">{(l.antes || l.depois) && <button className="btn ghost sm" onClick={() => setAberto(aberto === l.id ? null : l.id)} aria-expanded={aberto === l.id}>{aberto === l.id ? 'Ocultar' : 'Ver mudança'}</button>}</td>
            </tr>
            {aberto === l.id && (
              <tr><td colSpan={5}><div className="diff">
                {Object.keys({ ...(l.antes ?? {}), ...(l.depois ?? {}) }).map(k => (
                  <div key={k}><span className="k">{k}</span>
                    {l.antes && k in l.antes && <span className="de">{String(l.antes[k] ?? '—')}</span>}
                    {l.antes && l.depois && <span className="seta">→</span>}
                    {l.depois && k in l.depois && <span className="para">{String(l.depois[k] ?? '—')}</span>}</div>
                ))}
              </div></td></tr>
            )}
          </Fragment>))}</tbody>
      </table>{!visiveis.length && <Vazio tipo="documento" titulo="Nenhuma ação registrada" />}</div>
    </>
  );
}
