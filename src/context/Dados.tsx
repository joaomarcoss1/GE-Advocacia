import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getDb, type Db, type PeriodoFechado } from '@/data/db';
import { CONFIG_PADRAO } from '@/lib/config';
import { agoraBR, type AgoraBR } from '@/lib/datetime';
import { SCHEMA_ESPERADO, periodoFechado } from '@/lib/regras';
import type {
  AjusteDia, AjusteFolha, Cargo, Config, Escala, EscritorioInfo, Feriado, Folha, Funcionario, Ocorrencia, RegistroPonto, Tarefa, Usuario,
  Cliente, Movimento, Processo,
} from '@/lib/types';
import { useAuth } from './Auth';

interface DadosCtx {
  db: Db;
  /** Escritório da sessão: todos os dados abaixo são só dele (o banco filtra; nenhum outro escritório é alcançável). */
  escritorio: EscritorioInfo;
  carregando: boolean;
  cargos: Cargo[]; escalas: Escala[]; funcionarios: Funcionario[]; registros: RegistroPonto[]; ocorrencias: Ocorrencia[];
  feriados: Feriado[]; ajustes: AjusteFolha[]; ajustesDia: AjusteDia[]; folhas: Folha[]; usuarios: Usuario[]; config: Config; tarefas: Tarefa[];
  clientes: Cliente[]; processos: Processo[]; novidades: Movimento[];
  /** Intimações do DJEN ainda não abertas (selo do menu). */
  intimacoesNovas: number;
  agora: AgoraBR;
  /** Esta data (ou intervalo) cai num período com folha fechada/paga? Então marcações, ocorrências e ajustes ficam congelados. */
  travado(funcionarioId: string, ini: string, fim?: string): boolean;
  /** true quando o banco está numa versão anterior à que o app espera (falta rodar atualizacao_definitiva.sql). */
  atualizacaoPendente: boolean;
  /** Versão da migração aplicada (null = banco sem controle de versão). */
  versaoBanco: number | null;
  recarregar(): Promise<void>;
  auditar(acao: string, detalhe?: string): Promise<void>;
}
const Ctx = createContext<DadosCtx | null>(null);

export function DadosProvider({ children }: { children: ReactNode }) {
  const { sessao } = useAuth();
  const [db, setDb] = useState<Db | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [d, setD] = useState({
    cargos: [] as Cargo[], escalas: [] as Escala[], funcionarios: [] as Funcionario[], registros: [] as RegistroPonto[],
    ocorrencias: [] as Ocorrencia[], feriados: [] as Feriado[], ajustes: [] as AjusteFolha[], ajustesDia: [] as AjusteDia[], folhas: [] as Folha[],
    usuarios: [] as Usuario[], config: CONFIG_PADRAO, tarefas: [] as Tarefa[],
    clientes: [] as Cliente[], processos: [] as Processo[], novidades: [] as Movimento[], intimacoesNovas: 0,
  });
  const [agora, setAgora] = useState(agoraBR());
  const [fechados, setFechados] = useState<PeriodoFechado[]>([]);
  const [versaoBanco, setVersaoBanco] = useState<number | null>(SCHEMA_ESPERADO);

  useEffect(() => { getDb().then(setDb); }, []);
  useEffect(() => { const t = setInterval(() => setAgora(agoraBR()), 30_000); return () => clearInterval(t); }, []);

  const recarregar = useCallback(async () => {
    if (!db || !sessao) return;
    const admin = sessao.papel === 'admin';
    // Porta do ponto fechada: nenhum dado é lido (o banco também recusa); a tela mostra o aviso de acesso.
    if (sessao.acesso && sessao.acesso !== 'liberado') {
      setD(x => ({ ...x, cargos: [], escalas: [], funcionarios: [], registros: [], ocorrencias: [], feriados: [], ajustes: [], ajustesDia: [], folhas: [], usuarios: [], tarefas: [], clientes: [], processos: [], novidades: [], intimacoesNovas: 0 }));
      return;
    }
    const seguro = <T,>(p: Promise<T>, padrao: T) => p.catch(() => padrao);
    const [cargos, escalas, func, registros, ocorrencias, feriados, config, ajustes, ajustesDia, folhas, usuarios, periodos, tarefas, clientes, processos, novidades, intimacoesNovas] = await Promise.all([
      seguro(db.cargos.list(), [] as Cargo[]), seguro(db.escalas.list(), [] as Escala[]),
      admin
        ? db.funcionarios.list()
        : seguro(db.equipe().then(eq => eq.map(e => ({
          ...e, cpf: null, email: null, telefone: null, salario_mensal: 0, oab: null, pix: null, banco: null, agencia: null,
          conta: null, tipo_conta: null, observacoes: null, created_at: '',
        }) as Funcionario)), [] as Funcionario[]),
      seguro(db.registros.list(), [] as RegistroPonto[]), seguro(db.ocorrencias.list(), [] as Ocorrencia[]), seguro(db.feriados.list(), [] as Feriado[]), seguro(db.config.get(), CONFIG_PADRAO),
      admin ? db.ajustes.list() : Promise.resolve([] as AjusteFolha[]),
      seguro(db.ajustesDia.list(), [] as AjusteDia[]),
      admin ? db.folhas.list() : Promise.resolve([] as Folha[]),
      admin ? seguro(db.usuarios.list(), [] as Usuario[]) : Promise.resolve([] as Usuario[]),
      db.periodosFechados().catch(() => [] as PeriodoFechado[]),
      db.tarefas.list().catch(() => [] as Tarefa[]),   // banco ainda sem a migração 0006: o resto do painel continua funcionando
      db.clientes.list().catch(() => [] as Cliente[]),
      db.processos.list().catch(() => [] as Processo[]),
      db.processos.naoLidos().catch(() => [] as Movimento[]),
      db.intimacoes.novas().catch(() => 0),             // banco ainda sem a migração 0012: o resto continua funcionando
    ]);
    setFechados(periodos);
    if (admin) setVersaoBanco(await db.versaoEsquema().catch(() => null));
    // Selos de PDFs emitidos enquanto o banco estava indisponível são enviados sozinhos assim que possível.
    try {
      if (localStorage.getItem('ge.selos.pendentes')) import('@/lib/selo').then(m => m.sincronizarSelos(db)).catch(() => undefined);
    } catch { /* sem armazenamento local */ }
    setD({ cargos, escalas, funcionarios: func, registros, ocorrencias, feriados, config, ajustes, ajustesDia, folhas, usuarios, tarefas, clientes, processos, novidades, intimacoesNovas });
    setAgora(agoraBR());
  }, [db, sessao]);

  useEffect(() => {
    if (!db || !sessao) { setCarregando(false); return; }
    setCarregando(true);
    recarregar().finally(() => setCarregando(false));
  }, [db, sessao, recarregar]);

  const auditar = useCallback(async (acao: string, detalhe = '') => {
    if (!db || !sessao) return;
    try { await db.auditoria.insert({ usuario: sessao.nome, acao, detalhe }); } catch { /* auditoria não deve travar a ação */ }
  }, [db, sessao]);

  const travado = useCallback((fid: string, ini: string, fim?: string) => periodoFechado(fechados, fid, ini, fim), [fechados]);
  const atualizacaoPendente = db?.modo === 'supabase' && sessao?.papel === 'admin' && (versaoBanco === null || versaoBanco < SCHEMA_ESPERADO);
  const valor = useMemo(() => (db && sessao?.escritorio ? { db, escritorio: sessao.escritorio, carregando, ...d, agora, travado, atualizacaoPendente, versaoBanco, recarregar, auditar } : null),
    [db, sessao, carregando, d, agora, travado, atualizacaoPendente, versaoBanco, recarregar, auditar]);
  if (!valor) return null;
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}
export function useDados() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useDados fora do DadosProvider');
  return c;
}
