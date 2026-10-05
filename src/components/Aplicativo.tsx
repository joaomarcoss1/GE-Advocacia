import { useEffect, useState } from 'react';
import { Download, RefreshCw, Share, SquarePlus, WifiOff } from 'lucide-react';
import { Modal, useToast } from '@/components/ui';
import { EVENTO_NOVA_VERSAO, useInstalar, useOnline } from '@/lib/pwa';

/** Botão "Instalar aplicativo": pedido nativo no Android e no computador; no iPhone/iPad, passo a passo (o Safari não tem pedido automático). */
export function InstalarApp({ className = 'auth-link' }: { className?: string }) {
  const { podeInstalar, nativo, instalar } = useInstalar();
  const toast = useToast();
  const [guia, setGuia] = useState(false);
  if (!podeInstalar) return null;
  async function clicar() {
    if (nativo) { if (await instalar()) toast.ok('Aplicativo instalado.'); } else setGuia(true);
  }
  return (
    <>
      <button type="button" className={className} onClick={clicar}><Download size={15} />Instalar aplicativo</button>
      {guia && (
        <Modal titulo="Instalar no iPhone ou iPad" onClose={() => setGuia(false)} rodape={<button className="btn" onClick={() => setGuia(false)}>Entendi</button>}>
          <ol className="guia-passos">
            <li><span className="guia-ic"><Share size={18} /></span><span>Toque em <b>Compartilhar</b>, na barra do Safari.</span></li>
            <li><span className="guia-ic"><SquarePlus size={18} /></span><span>Escolha <b>Adicionar à Tela de Início</b>.</span></li>
            <li><span className="guia-ic"><Download size={18} /></span><span>Confirme em <b>Adicionar</b>. O ícone aparece na tela do aparelho.</span></li>
          </ol>
          <p className="muted" style={{ marginBottom: 0 }}>Precisa ser o Safari; em outros navegadores do iPhone a opção não aparece.</p>
        </Modal>
      )}
    </>
  );
}

/** Faixa fixa quando o aparelho fica sem internet: salvar, bater o ponto e consultar tribunais exigem conexão. */
export function AvisoConexao() {
  const online = useOnline();
  if (online) return null;
  return <div className="aviso-conexao" role="status"><WifiOff size={16} aria-hidden="true" />Sem conexão. Salvar e bater o ponto precisam de internet.</div>;
}

/** Faixa de nova versão: o usuário escolhe quando atualizar (nada recarrega no meio de um preenchimento). */
export function AvisoAtualizacao() {
  const [aplicar, setAplicar] = useState<(() => void) | null>(null);
  useEffect(() => {
    const f = (e: Event) => setAplicar(() => (e as CustomEvent<() => void>).detail);
    window.addEventListener(EVENTO_NOVA_VERSAO, f);
    return () => window.removeEventListener(EVENTO_NOVA_VERSAO, f);
  }, []);
  if (!aplicar) return null;
  return (
    <div className="aviso-versao" role="status">
      <span>Nova versão disponível.</span>
      <button className="btn sm gold" onClick={aplicar}><RefreshCw size={15} />Atualizar</button>
      <button className="btn sm ghost" onClick={() => setAplicar(null)}>Depois</button>
    </div>
  );
}
