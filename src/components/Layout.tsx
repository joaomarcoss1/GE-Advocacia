import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Briefcase, CalendarClock, UserRound, KeyRound, CalendarDays, CalendarOff, ClipboardCheck, Clock, FileBarChart, FolderOpen, LayoutDashboard, LibraryBig, Calculator, Inbox, ListChecks, Scale, LockKeyhole, Settings, ShieldCheck, Smartphone, Users, Wallet,
} from 'lucide-react';
import sqlAtualizacao from '../../supabase/atualizacao_definitiva.sql?raw';
import Shell, { type ItemNav } from '@/components/Shell';
import { useAuth } from '@/context/Auth';
import { useDados } from '@/context/Dados';
import { filaDeAnalise } from '@/lib/analises';
import { dataExtensa } from '@/lib/datetime';
import { PAPEIS } from '@/lib/permissoes';
import { SCHEMA_ESPERADO } from '@/lib/regras';
import { autoLigado, backupVencido, marcarBackup, montarArquivo, salvarNaPasta } from '@/lib/backup';
import { contar } from '@/lib/tarefas';
import { useToast } from '@/components/ui';
import { lembrarDestino } from '@/lib/pwa';
import { plural } from '@/lib/format';

/** Atalhos da barra inferior (celular): os primeiros que o nível de acesso permite. */
const ATALHOS_BASE = ['/painel', '/painel/gerencia', '/painel/meu-espaco', '/painel/tarefas', '/painel/processos', '/painel/documentos', '/painel/agenda'];

/** Painel de UM escritório: menus, avisos e dados vêm só do escritório da sessão. */
export default function Layout() {
  const { sessao, sair, modo, pode } = useAuth();
  const toast = useToast();
  useEffect(() => { lembrarDestino('/painel'); }, []);
  const { db, registros, ocorrencias, tarefas, novidades, intimacoesNovas, carregando, agora, atualizacaoPendente, versaoBanco, recarregar, escritorio } = useDados();
  const [copiado, setCopiado] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [backupPendente, setBackupPendente] = useState(() => backupVencido(escritorio.slug));
  // O lembrete de backup pode ser adiado por 24 horas (fica só neste aparelho)
  const chaveAdiar = `ge.backup.adiado.${escritorio.slug}`;
  const [backupAdiado, setBackupAdiado] = useState(() => { try { return Date.now() - Number(localStorage.getItem(chaveAdiar) ?? 0) < 86_400_000; } catch { return false; } });
  const adiarBackup = () => { try { localStorage.setItem(chaveAdiar, String(Date.now())); } catch { /* sem armazenamento */ } setBackupAdiado(true); };
  const ehAdmin = sessao?.papel === 'admin';
  // Backup semanal: salva sozinho na pasta escolhida (se ligado e liberado pelo navegador); senão, lembra o administrador.
  useEffect(() => {
    if (!ehAdmin || carregando || !backupVencido(escritorio.slug)) return;
    setBackupPendente(true);
    if (!autoLigado(escritorio.slug)) return;
    let cancelado = false;
    (async () => {
      try {
        const a = await montarArquivo(db, escritorio, '');
        if (!cancelado && await salvarNaPasta(escritorio.slug, a.nome, a.bytes, false)) { marcarBackup(escritorio.slug); setBackupPendente(false); toast.ok('Backup semanal salvo na pasta escolhida.'); }
      } catch { /* o lembrete continua visível */ }
    })();
    return () => { cancelado = true; };
  }, [ehAdmin, carregando, db, escritorio]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!sessao || sessao.papel === 'plataforma') return null;

  const papel = sessao.papel;
  const gere = pode('ponto.gerir');
  const pendentes = registros.filter(r => r.status_aprovacao === 'pendente').length;
  const analises = filaDeAnalise(ocorrencias, registros).total;
  const atrasadas = contar(tarefas).atrasadas;
  /** `perm`: permissão exigida (sem ela, o item some do menu); sem `perm`, todos veem. `so`: só o sócio-administrador. */
  const todos: (ItemNav & { perm?: string; so?: boolean })[] = [
    { grupo: 'Visão geral', to: '/painel', fim: true, rotulo: 'Painel', icone: LayoutDashboard, so: true },
    { grupo: 'Visão geral', to: '/painel/meu-espaco', rotulo: 'Meu espaço', icone: UserRound },
    { grupo: 'Delegação', to: '/painel/tarefas', rotulo: 'Tarefas', icone: ListChecks, contagem: atrasadas },
    { grupo: 'Delegação', to: '/painel/agenda', rotulo: 'Agenda', icone: CalendarClock },
    { grupo: 'Processos', to: '/painel/processos', rotulo: 'Processos', icone: Scale, perm: 'processos.ver', contagem: novidades.length },
    { grupo: 'Processos', to: '/painel/intimacoes', rotulo: 'Intimações', icone: Inbox, perm: 'intimacoes.ver', contagem: intimacoesNovas },
    { grupo: 'Processos', to: '/painel/documentos', rotulo: 'Documentos', icone: FolderOpen, perm: 'documentos.ver' },
    { grupo: 'Processos', to: '/painel/modelos', rotulo: 'Modelos', icone: LibraryBig, perm: 'modelos.usar' },
    { grupo: 'Gestão', to: '/painel/gerencia', rotulo: 'Gerência', icone: ShieldCheck, perm: 'ponto.gerir', contagem: pendentes },
    { grupo: 'Equipe', to: '/painel/funcionarios', rotulo: 'Funcionários', curto: 'Equipe', icone: Users, perm: 'funcionarios.gerir' },
    { grupo: 'Equipe', to: '/painel/cargos', rotulo: 'Cargos', icone: Briefcase, perm: 'funcionarios.gerir' },
    { grupo: 'Equipe', to: '/painel/escalas', rotulo: 'Escalas', icone: CalendarDays, perm: 'ponto.gerir' },
    { grupo: 'Frequência', to: '/painel/ponto', rotulo: 'Registros de ponto', curto: 'Ponto', icone: Clock, perm: 'ponto.gerir' },
    { grupo: 'Frequência', to: '/painel/ocorrencias', rotulo: 'Ocorrências e abonos', curto: 'Ocorrências', icone: ClipboardCheck, perm: 'ponto.gerir', contagem: analises },
    { grupo: 'Frequência', to: '/painel/feriados', rotulo: 'Feriados', icone: CalendarOff, perm: 'ponto.gerir' },
    { grupo: 'Financeiro', to: '/painel/folha', rotulo: 'Folha de pagamento', curto: 'Folha', icone: Wallet, perm: 'folha.ver' },
    { grupo: 'Financeiro', to: '/painel/honorarios', rotulo: 'Honorários', icone: Calculator, perm: 'honorarios.ver' },
    { grupo: 'Financeiro', to: '/painel/relatorios', rotulo: 'Relatórios', icone: FileBarChart, perm: 'relatorios.ver' },
    { grupo: 'Sistema', to: '/painel/acessos', rotulo: 'Acessos e níveis', curto: 'Acessos', icone: KeyRound, perm: 'acessos.gerenciar|ponto.gerir' },
    { grupo: 'Sistema', to: '/painel/configuracoes', rotulo: 'Configurações', curto: 'Ajustes', icone: Settings, perm: 'config.editar' },
  ];
  // o título do grupo aparece só no primeiro item visível dele
  const visiveis = todos.filter(i => (i.so ? papel === 'admin' : !i.perm || pode(i.perm)));
  const itens: ItemNav[] = visiveis.map(({ perm: _p, so: _s, ...i }, k) => ({ ...i, grupo: k === 0 || visiveis[k - 1].grupo !== i.grupo ? i.grupo : undefined }));
  itens.push({ grupo: 'Acesso', to: `/ponto/${escritorio.slug}`, rotulo: 'Tela de ponto', icone: Smartphone });
  itens.push({ to: `/privacidade/${escritorio.slug}`, rotulo: 'Privacidade (LGPD)', icone: LockKeyhole });

  const inicio = papel === 'admin' ? '/painel' : gere ? '/painel/gerencia' : papel === 'coordenador' ? '/painel/tarefas' : '/painel/meu-espaco';
  const atalhos = ATALHOS_BASE.filter(a => itens.some(i => i.to === a)).filter(a => a !== '/painel' || papel === 'admin').slice(0, 4);
  const ext = dataExtensa(agora.iso);

  const avisos = (
    <>
      {modo === 'local' && <div className="demo-banner mb-20" ><strong>Demonstração</strong> · dados fictícios neste navegador.</div>}
      {ehAdmin && backupPendente && !backupAdiado && !carregando && <div className="demo-banner row mb-20 g-10" ><span><strong>Backup semanal pendente.</strong> <Link to="/painel/configuracoes?aba=backup">Fazer backup agora</Link></span><button type="button" className="link-btn fechar" onClick={adiarBackup}>Lembrar amanhã</button></div>}
      {atualizacaoPendente && (
        <div className="demo-banner mb-20" >
          <strong>Atualização do banco pendente.</strong> O app espera a versão {SCHEMA_ESPERADO} do banco e o Supabase está na versão {versaoBanco ?? 'desconhecida'}.
          <ol style={{ margin: '8px 0 10px 18px', padding: 0 }}>
            <li>Clique em <em>Copiar SQL</em>.</li>
            <li>No Supabase, abra <strong>SQL Editor → New query</strong>, cole e clique em <strong>Run</strong> (é seguro repetir).</li>
            <li>Volte aqui e clique em <em>Verificar novamente</em>.</li>
          </ol>
          <div className="row g-8 fx-wrap" >
            <button className="btn sm" onClick={async () => { try { await navigator.clipboard.writeText(sqlAtualizacao); setCopiado(true); setTimeout(() => setCopiado(false), 3000); } catch { window.prompt('Copie o SQL (Ctrl+C):', sqlAtualizacao); } }}>{copiado ? 'SQL copiado ✓' : 'Copiar SQL'}</button>
            <button className="btn ghost sm" disabled={verificando} onClick={async () => { setVerificando(true); try { await recarregar(); } finally { setVerificando(false); } }}>{verificando ? 'Verificando…' : 'Verificar novamente'}</button>
            <a className="btn ghost sm" href="/diagnostico">Diagnóstico</a>
          </div>
        </div>
      )}
    </>
  );

  return (
    <Shell
      itens={itens} atalhos={atalhos} inicio={inicio} sessao={sessao} sair={sair}
      papelRotulo={PAPEIS[papel].rotulo}
      cartao={<div className="escritorio-card"><span className="rot">Escritório</span><strong>{escritorio.nome}</strong><span className="slug">/{escritorio.slug}</span></div>}
      avisos={avisos} carregando={carregando} dataExtenso={ext}
      chipAlerta={pendentes > 0 && gere ? { to: papel === 'admin' ? '/painel/ponto' : '/painel/gerencia', texto: `${plural(pendentes, 'aprovação pendente', 'aprovações pendentes')}`, curto: `${plural(pendentes, 'pendente', 'pendentes')}` } : undefined}
      nomeImpressao={escritorio.nome}
      rodapeImpressao={`${escritorio.nome} · documento gerencial de conferência, gerado pelo GE Advocacia. Autenticidade: use o QR Code dos PDFs oficiais.`}
    />
  );
}
