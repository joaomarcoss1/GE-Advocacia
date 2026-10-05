import { useEffect, useState } from 'react';
import { Download, FileText, ImageIcon } from 'lucide-react';
import { Modal, useToast } from '@/components/ui';
import { useDados } from '@/context/Dados';
import type { AnexoAberto } from '@/data/db';
import { fmtTamanho } from '@/lib/anexos';
import type { AnexoMeta } from '@/lib/types';

/**
 * Arquivos anexados a um item. Só o administrador abre: cada clique pede um endereço temporário (60 s) ao servidor,
 * que registra QUEM abriu o atestado e QUANDO. O conteúdo nunca fica no navegador antes do clique.
 */
export default function Anexos({ metas }: { metas: AnexoMeta[] }) {
  const { db } = useDados();
  const toast = useToast();
  const [ver, setVer] = useState<AnexoAberto | null>(null);
  useEffect(() => () => { ver?.revogar?.(); }, [ver]);
  if (!metas.length) return <span className="muted" style={{ fontSize: '.86rem' }}>Sem anexo</span>;

  async function abrir(m: AnexoMeta) {
    try {
      const a = await db.anexos.abrir(m.id);
      if (a.mime === 'application/pdf') {
        const l = document.createElement('a'); l.href = a.url; l.target = '_blank'; l.rel = 'noreferrer'; l.download = a.nome; l.click();
        setTimeout(() => a.revogar?.(), 60_000);
      } else setVer(a);
    } catch (e) { toast.erro((e as Error).message); }
  }
  return (
    <>
      <div className="anexos-chips">
        {metas.map(m => (
          <button key={m.id} type="button" className="anexo-chip" onClick={() => abrir(m)} title={`${m.nome} · ${fmtTamanho(m.tamanho)} · a abertura fica registrada`}>
            {m.mime === 'application/pdf' ? <FileText size={15} /> : <ImageIcon size={15} />}<span>{m.nome}</span>
            {m.mime === 'application/pdf' ? <Download size={13} /> : null}
          </button>
        ))}
      </div>
      {ver && (
        <Modal largo titulo={ver.nome} onClose={() => setVer(null)} rodape={<a className="btn" href={ver.url} download={ver.nome}><Download />Baixar</a>}>
          <img src={ver.url} alt={`Anexo: ${ver.nome}`} style={{ maxWidth: '100%', maxHeight: '70vh', display: 'block', margin: '0 auto', borderRadius: 8 }} />
          <p className="hint" style={{ textAlign: 'center', marginTop: 8 }}>O endereço desta imagem expira em 60 segundos.</p>
        </Modal>
      )}
    </>
  );
}
