import { useCallback, useEffect, useState } from 'react';

/* ---------- Service worker e atualização controlada ---------- */
export const EVENTO_NOVA_VERSAO = 'ge:nova-versao';

export function registrarServiceWorker() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  let recarregando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!recarregando) { recarregando = true; location.reload(); } });
  const avisar = (aplicar: () => void) => window.dispatchEvent(new CustomEvent(EVENTO_NOVA_VERSAO, { detail: aplicar }));
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').then(reg => {
      if (reg.waiting && navigator.serviceWorker.controller) avisar(() => reg.waiting?.postMessage('ATUALIZAR'));
      reg.addEventListener('updatefound', () => {
        const novo = reg.installing;
        novo?.addEventListener('statechange', () => { if (novo.state === 'installed' && navigator.serviceWorker.controller) avisar(() => novo.postMessage('ATUALIZAR')); });
      });
      // o que a primeira visita já carregou passa a valer offline na próxima abertura
      void navigator.serviceWorker.ready.then(pronto => {
        const urls = performance.getEntriesByType('resource').map(r => r.name).filter(u => new URL(u).origin === location.origin && new URL(u).pathname.startsWith('/assets/'));
        pronto.active?.postMessage({ tipo: 'CACHEAR', urls });
      });
      setInterval(() => void reg.update(), 60 * 60 * 1000);
    }).catch(() => undefined);
  });
}

/* ---------- Conexão ---------- */
export function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}

/* ---------- Instalação (Android/computador: pedido nativo; iPhone/iPad: instruções) ---------- */
interface EventoInstalar extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
let pedido: EventoInstalar | null = null;
const ouvintes = new Set<() => void>();
const avisarTodos = () => ouvintes.forEach(f => f());

export const emModoApp = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || window.matchMedia?.('(display-mode: minimal-ui)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
export const ehApple = () => typeof navigator !== 'undefined' && (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); pedido = e as EventoInstalar; avisarTodos(); });
  window.addEventListener('appinstalled', () => { pedido = null; avisarTodos(); });
}

export function useInstalar() {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick(n => n + 1); ouvintes.add(f); return () => { ouvintes.delete(f); }; }, []);
  const instalar = useCallback(async () => {
    if (!pedido) return false;
    const p = pedido; pedido = null; avisarTodos();
    await p.prompt();
    return (await p.userChoice).outcome === 'accepted';
  }, []);
  const instalado = emModoApp();
  const apple = ehApple();
  return { instalado, apple, podeInstalar: !instalado && (!!pedido || apple), nativo: !!pedido, instalar };
}

/* ---------- Retomar de onde parou ao abrir o aplicativo instalado ---------- */
const CHAVE_DESTINO = 'ge.destino';
export function lembrarDestino(caminho: string) { try { localStorage.setItem(CHAVE_DESTINO, caminho); } catch { /* sem armazenamento */ } }
export function destinoSalvo(): string | null {
  if (!emModoApp()) return null;
  try { const d = localStorage.getItem(CHAVE_DESTINO); return d && d.startsWith('/') && !d.startsWith('//') ? d : null; } catch { return null; }
}
