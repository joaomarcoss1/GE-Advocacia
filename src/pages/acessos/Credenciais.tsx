import { Modal, useToast } from '@/components/ui';

/** Dados que o administrador entrega à pessoa: aparecem uma única vez, logo depois de criados. */
export interface Entrega { nome?: string; email?: string; senha?: string; pin?: string; avisos?: string[] }

export default function Credenciais({ e, onClose }: { e: Entrega; onClose(): void }) {
  const toast = useToast();
  const texto = [e.nome && `Pessoa: ${e.nome}`, e.email && `Login: ${e.email}`, e.senha && `Senha provisória: ${e.senha}`, e.pin && `PIN do ponto: ${e.pin}`].filter(Boolean).join('\n');
  return (
    <Modal titulo="Dados de acesso" onClose={onClose} rodape={<button className="btn" onClick={onClose}>Concluir</button>}>
      <div className="stack">
        <p>Entregue estes dados {e.nome ? <>a <strong>{e.nome}</strong> </> : 'à pessoa '}por um canal seguro. Eles não serão mostrados de novo. {e.senha ? 'A senha provisória precisa ser trocada no primeiro acesso.' : ''}</p>
        <div className="notice" data-testid="credenciais">
          {e.email && <div><strong>Login:</strong> {e.email}</div>}
          {e.senha && <div><strong>Senha provisória:</strong> <span className="mono">{e.senha}</span></div>}
          {e.pin && <div><strong>PIN do ponto:</strong> <span className="mono">{e.pin}</span></div>}
        </div>
        {e.avisos?.map(a => <div key={a} className="notice bad" role="alert">{a}</div>)}
        <button className="btn ghost sm" onClick={() => { void navigator.clipboard?.writeText(texto); toast.ok('Copiado.'); }}>Copiar</button>
      </div>
    </Modal>
  );
}
