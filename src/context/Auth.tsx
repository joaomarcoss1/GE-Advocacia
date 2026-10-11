import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getDb, type Sessao } from '@/data/db';
import { definirFuso } from '@/lib/datetime';
import { permissoesEfetivas, type EstadoAcesso } from '@/lib/permissoes';

interface AuthCtx {
  sessao: Sessao | null;
  carregando: boolean;
  modo: 'local' | 'supabase' | null;
  entrar(email: string, senha: string): Promise<Sessao>;
  sair(): Promise<void>;
  /** Lê a sessão de novo (estado do ponto, troca de senha, permissões alteradas por outra pessoa). */
  recarregar(): Promise<Sessao | null>;
  /** Estado da porta do ponto de quem está logado. */
  acesso: EstadoAcesso;
  /** Tem esta permissão agora? (várias separadas por "|": basta uma). Falso com a porta do ponto fechada. O administrador tem todas. */
  pode(permissao: string): boolean;
}
const Ctx = createContext<AuthCtx | null>(null);

/** O relógio do app segue o fuso do escritório de quem está logado. */
const aplicarFuso = (s: Sessao | null) => { if (s?.escritorio) definirFuso(s.escritorio.fuso); };
/** Banco ainda sem a migração 0013: o nível antigo (administrador, gerência, coordenação) vale com o padrão de permissões. */
const permissoesDa = (s: Sessao | null): Set<string> => {
  if (!s || s.papel === 'plataforma') return new Set();
  return new Set(s.permissoes ?? permissoesEfetivas({ papel: s.papel }));
};
const assinatura = (s: Sessao | null) => (s ? JSON.stringify([s.id, s.papel, s.nome, s.acesso, s.trocar_senha, s.liberado_ate, s.permissoes, s.funcionario_id]) : '');

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [modo, setModo] = useState<'local' | 'supabase' | null>(null);
  const ultima = useRef('');

  const aplicar = useCallback((s: Sessao | null) => {
    aplicarFuso(s);
    const a = assinatura(s);
    if (a === ultima.current) return;      // nada mudou: não renderiza o app inteiro de novo
    ultima.current = a;
    setSessao(s);
  }, []);

  useEffect(() => {
    let vivo = true;
    getDb().then(async db => {
      const s = await db.auth.sessao().catch(() => null);
      if (!vivo) return;
      setModo(db.modo); aplicar(s); setCarregando(false);
    });
    return () => { vivo = false; };
  }, [aplicar]);

  const entrar = useCallback(async (email: string, senha: string) => {
    const db = await getDb();
    const s = await db.auth.entrar(email, senha);
    aplicar(s);
    void db.auth.registrarEvento('login');
    if (s.acesso && s.acesso !== 'liberado') void db.auth.registrarEvento(s.acesso === 'encerrado' ? 'acesso_encerrado' : 'bloqueado_ponto');
    return s;
  }, [aplicar]);
  const sair = useCallback(async () => {
    const db = await getDb();
    await db.auth.registrarEvento('logout');
    await db.auth.sair(); ultima.current = ''; setSessao(null);
  }, []);
  const recarregar = useCallback(async () => {
    const db = await getDb();
    const s = await db.auth.sessao().catch(() => null);
    aplicar(s);
    return s;
  }, [aplicar]);

  // A porta do ponto se confere de tempos em tempos (a entrada abre, a saída fecha, a gerência libera) e ao voltar para a aba.
  const logado = !!sessao && sessao.papel !== 'plataforma';
  const fechada = logado && sessao?.acesso !== undefined && sessao.acesso !== 'liberado';
  useEffect(() => {
    if (!logado) return;
    const antes = { v: sessao?.acesso };
    const conferir = async () => {
      const s = await recarregar();
      if (s && antes.v === 'liberado' && s.acesso === 'encerrado') void getDb().then(db => db.auth.registrarEvento('acesso_encerrado'));
      antes.v = s?.acesso;
    };
    const t = setInterval(conferir, fechada ? 15_000 : 60_000);
    const ao = () => { if (document.visibilityState === 'visible') void conferir(); };
    document.addEventListener('visibilitychange', ao);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', ao); };
  }, [logado, fechada, recarregar]); // eslint-disable-line react-hooks/exhaustive-deps

  const perms = useMemo(() => permissoesDa(sessao), [sessao]);
  const acesso: EstadoAcesso = sessao?.acesso ?? 'liberado';
  const pode = useCallback((p: string) => acesso === 'liberado' && p.split('|').some(x => perms.has(x)), [acesso, perms]);

  const valor = useMemo(() => ({ sessao, carregando, modo, entrar, sair, recarregar, acesso, pode }), [sessao, carregando, modo, entrar, sair, recarregar, acesso, pode]);
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}
export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth fora do AuthProvider');
  return c;
}
