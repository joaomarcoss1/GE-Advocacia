import { useState } from 'react';
import {
  Briefcase, CalendarDays, CalendarOff, ClipboardCheck, Clock, FileBarChart, LayoutDashboard, LockKeyhole, Settings, ShieldCheck, Smartphone, Users, Wallet,
} from 'lucide-react';
import sqlAtualizacao from '../../supabase/atualizacao_definitiva.sql?raw';
import Shell, { type ItemNav } from '@/components/Shell';
import { useAuth } from '@/context/Auth';
import { useDados } from '@/context/Dados';
import { filaDeAnalise } from '@/lib/analises';
import { dataExtensa } from '@/lib/datetime';
import { SCHEMA_ESPERADO } from '@/lib/regras';

const ATALHOS = {
  admin: ['/painel', '/painel/ponto', '/painel/folha', '/painel/funcionarios'],
  gerente: ['/painel/gerencia', '/painel/ponto', '/painel/ocorrencias', '/painel/escalas'],
};

/** Painel de UM escritório: menus, avisos e dados vêm só do escritório da sessão. */
export default function Layout() {
  const { sessao, sair, modo } = useAuth();
  const { registros, ocorrencias, carregando, agora, atualizacaoPendente, versaoBanco, recarregar, escritorio } = useDados();
  const [copiado, setCopiado] = useState(false);
  const [verificando, setVerificando] = useState(false);
  if (!sessao || sessao.papel === 'plataforma') return null;

  const papel = sessao.papel;
  const pendentes = registros.filter(r => r.status_aprovacao === 'pendente').length;
  const analises = filaDeAnalise(ocorrencias, registros).total;
  const todos: (ItemNav & { papeis: ('admin' | 'gerente')[] })[] = [
    { grupo: 'Visão geral', to: '/painel', fim: true, rotulo: 'Painel', icone: LayoutDashboard, papeis: ['admin'] },
    { to: '/painel/gerencia', rotulo: 'Gerência', icone: ShieldCheck, papeis: ['admin', 'gerente'], contagem: pendentes },
    { grupo: 'Equipe', to: '/painel/funcionarios', rotulo: 'Funcionários', curto: 'Equipe', icone: Users, papeis: ['admin'] },
    { to: '/painel/cargos', rotulo: 'Cargos', icone: Briefcase, papeis: ['admin'] },
    { to: '/painel/escalas', rotulo: 'Escalas', icone: CalendarDays, papeis: ['admin', 'gerente'] },
    { grupo: 'Frequência', to: '/painel/ponto', rotulo: 'Registros de ponto', curto: 'Ponto', icone: Clock, papeis: ['admin', 'gerente'] },
    { to: '/painel/ocorrencias', rotulo: 'Ocorrências e abonos', curto: 'Ocorrências', icone: ClipboardCheck, papeis: ['admin', 'gerente'], contagem: analises },
    { to: '/painel/feriados', rotulo: 'Feriados', icone: CalendarOff, papeis: ['admin', 'gerente'] },
    { grupo: 'Financeiro', to: '/painel/folha', rotulo: 'Folha de pagamento', curto: 'Folha', icone: Wallet, papeis: ['admin'] },
    { to: '/painel/relatorios', rotulo: 'Relatórios', icone: FileBarChart, papeis: ['admin', 'gerente'] },
    { grupo: 'Sistema', to: '/painel/configuracoes', rotulo: 'Configurações', curto: 'Ajustes', icone: Settings, papeis: ['admin'] },
  ];
  const itens: ItemNav[] = todos.filter(i => i.papeis.includes(papel));
  itens.push({ grupo: 'Acesso', to: `/ponto/${escritorio.slug}`, rotulo: 'Tela de ponto', icone: Smartphone });
  itens.push({ to: `/privacidade/${escritorio.slug}`, rotulo: 'Privacidade (LGPD)', icone: LockKeyhole });

  const inicio = papel === 'admin' ? '/painel' : '/painel/gerencia';
  const ext = dataExtensa(agora.iso);

  const avisos = (
    <>
      {modo === 'local' && <div className="demo-banner" style={{ marginBottom: 20 }}><strong>Demonstração</strong> · dados fictícios neste navegador.</div>}
      {atualizacaoPendente && (
        <div className="demo-banner" style={{ marginBottom: 20 }}>
          <strong>Atualização do banco pendente.</strong> O app espera a versão {SCHEMA_ESPERADO} do banco e o Supabase está na versão {versaoBanco ?? 'desconhecida'}.
          <ol style={{ margin: '8px 0 10px 18px', padding: 0 }}>
            <li>Clique em <em>Copiar SQL</em>.</li>
            <li>No Supabase, abra <strong>SQL Editor → New query</strong>, cole e clique em <strong>Run</strong> (é seguro repetir).</li>
            <li>Volte aqui e clique em <em>Verificar novamente</em>.</li>
          </ol>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
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
      itens={itens} atalhos={ATALHOS[papel]} inicio={inicio} sessao={sessao} sair={sair}
      papelRotulo={papel === 'admin' ? 'Administrador' : 'Gerência'}
      cartao={<div className="escritorio-card"><span className="rot">Escritório</span><strong>{escritorio.nome}</strong><span className="slug">/{escritorio.slug}</span></div>}
      avisos={avisos} carregando={carregando} dataExtenso={ext}
      chipAlerta={pendentes > 0 ? { to: papel === 'admin' ? '/painel/ponto' : '/painel/gerencia', texto: `${pendentes} aprovação(ões) pendente(s)` } : undefined}
      nomeImpressao={escritorio.nome}
      rodapeImpressao={`${escritorio.nome} · documento gerencial de conferência, gerado pelo GE Advocacia. Autenticidade: use o QR Code dos PDFs oficiais.`}
    />
  );
}
