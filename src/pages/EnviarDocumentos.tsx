import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check, CircleDashed, ShieldCheck, UploadCloud } from 'lucide-react';
import Logo from '@/components/Logo';
import { getDb, type Db } from '@/data/db';
import { ACEITA_DOCUMENTO } from '@/lib/checklist';
import { fmtData, isoParaBR } from '@/lib/datetime';
import { prepararDocumento } from '@/lib/documentos';
import type { EnvioPublicoInfo } from '@/lib/types';

/** Página pública (sem login): o cliente recebe o link do escritório e envia os documentos pedidos, direto do celular. */
export default function EnviarDocumentos() {
  const { token = '' } = useParams();
  const [db, setDb] = useState<Db | null>(null);
  const [info, setInfo] = useState<EnvioPublicoInfo | null>(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);

  const carregar = useCallback(async (d: Db) => {
    const r = await d.arquivos.publico.info(token);
    if (r.ok) { setInfo(r); setErro(''); } else setErro(r.erro);
  }, [token]);
  useEffect(() => { getDb().then(async d => { setDb(d); await carregar(d); }); }, [carregar]);

  async function enviar(itemId: string | null, files: FileList | null) {
    if (!db || !files?.length) return;
    setEnviando(itemId ?? 'avulso'); setAviso(null);
    let ok = 0, falhas = 0;
    for (const f of Array.from(files)) {
      try {
        const arquivo = await prepararDocumento(f, db.modo === 'local');
        const r = await db.arquivos.publico.enviar(token, itemId, arquivo);
        if (r.ok) ok++; else { falhas++; setAviso({ ok: false, texto: r.erro }); }
      } catch (e) { falhas++; setAviso({ ok: false, texto: (e as Error).message }); }
    }
    if (ok && !falhas) setAviso({ ok: true, texto: ok === 1 ? 'Documento recebido. Obrigado!' : `${ok} documentos recebidos. Obrigado!` });
    setEnviando(null);
    await carregar(db);
  }

  const obrig = info?.itens.filter(i => i.obrigatorio) ?? [];
  const feitos = obrig.filter(i => i.status === 'recebido' || i.status === 'conferido').length;

  return (
    <main className="verif">
      <div className="verif-card" style={{ width: 'min(640px, 100%)' }}>
        <div className="verif-logo"><Logo /></div>
        {!info && !erro && <p className="muted" role="status" aria-busy="true">Carregando…</p>}
        {erro && <div className="notice bad" role="alert">{erro}</div>}
        {info && (
          <div className="stack">
            <div>
              <h1>Envio de documentos</h1>
              <p style={{ margin: '6px 0 0' }}><strong>{info.cliente}</strong> · {info.escritorio}</p>
              {info.processo && <p className="muted mono" style={{ margin: '2px 0 0' }}>Processo {info.processo}</p>}
            </div>
            {obrig.length > 0 && (
              <div>
                <div className="row between"><strong>{feitos} de {obrig.length} documentos enviados</strong></div>
                <div className="barra" role="progressbar" aria-valuenow={Math.round((feitos / obrig.length) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Documentos enviados"><i style={{ width: `${Math.round((feitos / obrig.length) * 100)}%` }} /></div>
              </div>
            )}
            {aviso && <div className={`notice ${aviso.ok ? 'gold' : 'bad'}`} role={aviso.ok ? 'status' : 'alert'}>{aviso.texto}</div>}
            <ul className="itens-check">
              {info.itens.map(i => {
                const pronto = i.status === 'recebido' || i.status === 'conferido';
                return (
                  <li key={i.id} className={`item-check ${i.status}`}>
                    <div className="item-topo">
                      <span className={`ic ${i.status}`} aria-hidden="true">{pronto ? <Check size={16} /> : <CircleDashed size={16} />}</span>
                      <span className="grow"><strong>{i.nome}</strong>{!i.obrigatorio && <small className="muted"> · opcional</small>}<span className="sr-only"> ({pronto ? 'enviado' : 'pendente'})</span></span>
                      <label className={`btn sm ${pronto ? 'ghost' : ''}`} aria-disabled={enviando === i.id}>
                        <UploadCloud size={15} />{enviando === i.id ? 'Enviando…' : pronto ? 'Enviar outro' : 'Enviar'}
                        <input type="file" hidden multiple accept={ACEITA_DOCUMENTO} aria-label={`Enviar arquivo: ${i.nome}`} disabled={enviando !== null} onChange={e => { void enviar(i.id, e.target.files); e.target.value = ''; }} />
                      </label>
                    </div>
                  </li>
                );
              })}
            </ul>
            <label className="btn ghost" aria-disabled={enviando === 'avulso'}>
              <UploadCloud size={16} />{enviando === 'avulso' ? 'Enviando…' : 'Enviar outro documento'}
              <input type="file" hidden multiple accept={ACEITA_DOCUMENTO} aria-label="Enviar outro documento" disabled={enviando !== null} onChange={e => { void enviar(null, e.target.files); e.target.value = ''; }} />
            </label>
            <p className="hint"><ShieldCheck size={13} style={{ verticalAlign: '-2px' }} /> Link pessoal, válido até {fmtData(isoParaBR(info.expira_em).data)}. Os arquivos vão direto para o escritório e não ficam visíveis a mais ninguém.</p>
          </div>
        )}
      </div>
    </main>
  );
}
