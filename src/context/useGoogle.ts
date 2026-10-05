import { useCallback, useEffect, useState } from 'react';
import type { GoogleStatus, SyncGoogle } from '@/lib/types';
import { useDados } from './Dados';

/** Estado da integração com o Google Agenda para a pessoa logada e a sincronização de cada tarefa. */
export function useGoogle() {
  const { db } = useDados();
  const [status, setStatus] = useState<GoogleStatus>({ disponivel: false, conectado: false });
  const [estados, setEstados] = useState<Record<string, SyncGoogle>>({});
  const recarregar = useCallback(async () => {
    try {
      const [s, e] = await Promise.all([db.google.status(), db.google.estados()]);
      setStatus(s);
      setEstados(Object.fromEntries(e.map(x => [x.tarefa_id, x])));
    } catch { /* integração indisponível: o resto do painel segue funcionando */ }
  }, [db]);
  useEffect(() => { void recarregar(); }, [recarregar]);
  return { status, estados, recarregar };
}
