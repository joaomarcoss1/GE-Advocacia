import { useEffect, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Menu, X, type LucideIcon } from 'lucide-react';
import Aparencia from '@/components/Aparencia';
import Logo, { Monograma } from '@/components/Logo';
import { PaginaEsqueleto } from '@/components/ui';
import type { Sessao } from '@/data/db';
import { iniciais } from '@/lib/format';
import { travarRolagem } from '@/lib/rolagem';
import { useState } from 'react';
import Credito from '@/components/Nexutec';
import { InstalarApp } from '@/components/Aplicativo';

export interface ItemNav {
  grupo?: string; to: string; fim?: boolean; rotulo: string; curto?: string; icone: LucideIcon; contagem?: number;
}

/** Copia o texto dos cabeçalhos para cada célula (data-label), usado pelo CSS que transforma tabelas em cartões no celular. */
function useRotulosDeTabela() {
  useEffect(() => {
    let raf = 0;
    const aplicar = () => {
      document.querySelectorAll<HTMLTableElement>('table.tbl').forEach(t => {
        const cab = Array.from(t.querySelectorAll('thead th')).map(th => th.textContent?.trim() ?? '');
        t.querySelectorAll('tbody tr, tfoot tr').forEach(tr => Array.from(tr.children).forEach((td, i) => {
          const r = cab[i] ?? '';
          if (td.getAttribute('data-label') !== r) td.setAttribute('data-label', r);
        }));
      });
      // Regiões de rolagem horizontal precisam ser alcançáveis pelo teclado (WCAG 2.1.1)
      document.querySelectorAll<HTMLElement>('.table-wrap').forEach(w => {
        if (!w.hasAttribute('tabindex')) { w.setAttribute('tabindex', '0'); w.setAttribute('role', 'region'); w.setAttribute('aria-label', 'Tabela (use as setas para rolar)'); }
      });
    };
    aplicar();
    const mo = new MutationObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(aplicar); });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { mo.disconnect(); cancelAnimationFrame(raf); };
  }, []);
}

/** Casca do painel (barra lateral, topo, navegação inferior no celular). Usada pelo escritório e pela plataforma. */
export default function Shell({ itens, atalhos, inicio, sessao, sair, papelRotulo, cartao, avisos, carregando, dataExtenso, chipAlerta, nomeImpressao, rodapeImpressao }: {
  itens: ItemNav[]; atalhos: string[]; inicio: string; sessao: Sessao; sair(): Promise<void>; papelRotulo: string;
  cartao?: ReactNode; avisos?: ReactNode; carregando: boolean; dataExtenso: string;
  chipAlerta?: { to: string; texto: string; curto?: string }; nomeImpressao: string; rodapeImpressao: string;
}) {
  const [aberto, setAberto] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();
  useRotulosDeTabela();
  useEffect(() => setAberto(false), [loc.pathname]);
  useEffect(() => (aberto ? travarRolagem() : undefined), [aberto]);

  const atual = itens.find(i => i.to === loc.pathname);
  const atalhosItens = atalhos.map(to => itens.find(i => i.to === to)).filter((i): i is ItemNav => !!i);

  return (
    <div className="shell">
      <a className="skip" href="#conteudo" onClick={e => { e.preventDefault(); document.getElementById('conteudo')?.focus(); }}>Pular para o conteúdo</a>
      <header className="mobilebar">
        <button onClick={() => setAberto(true)} aria-label="Abrir menu"><Menu size={22} /></button>
        <span className="mb-marca" aria-hidden="true"><Monograma /></span>
        <span className="titulo">{atual?.rotulo ?? 'GE Advocacia'}</span>
        {chipAlerta && <NavLink to={chipAlerta.to} className="chip alert" style={{ marginRight: 6 }} aria-label={chipAlerta.texto}>{chipAlerta.curto ?? chipAlerta.texto}</NavLink>}
      </header>
      <div className={`scrim ${aberto ? 'on' : ''}`} onClick={() => setAberto(false)} aria-hidden="true" />

      <aside className={`side ${aberto ? 'open' : ''}`} aria-label="Menu principal">
        <div className="row between" style={{ flexWrap: 'nowrap' }}>
          <NavLink to={inicio} className="side-brand" onClick={() => setAberto(false)} aria-label="GE Advocacia — início"><Logo /></NavLink>
          <button className="icon-btn" style={{ color: '#fff', display: aberto ? 'grid' : 'none' }} onClick={() => setAberto(false)} aria-label="Fechar menu"><X size={20} /></button>
        </div>
        {cartao}
        <nav className="nav" aria-label="Seções">
          {itens.map(i => (
            <span key={i.to} style={{ display: 'contents' }}>
              {i.grupo && <div className="nav-group">{i.grupo}</div>}
              <NavLink to={i.to} end={i.fim} className={({ isActive }) => (isActive ? 'on' : '')}>
                <i.icone size={18} strokeWidth={1.7} />{i.rotulo}
                {!!i.contagem && i.contagem > 0 && <span className="pill">{i.contagem}</span>}
              </NavLink>
            </span>
          ))}
        </nav>
        <div className="side-ap"><span>Aparência</span><Aparencia /></div>
        <InstalarApp className="side-instalar" />
        <div className="side-foot">
          <span className="avatar">{iniciais(sessao.nome)}</span>
          <div style={{ minWidth: 0 }}>
            <div className="who">{sessao.nome}</div>
            <div className="papel">{papelRotulo}</div>
          </div>
          <button className="icon-btn" aria-label="Sair" title="Sair" onClick={async () => { await sair(); nav('/entrar'); }}><LogOut size={18} /></button>
        </div>
        <Credito className="side-credito" />
      </aside>

      <div className="main">
        <div className="topbar-desk">
          <span className="data">{dataExtenso}</span>
          <div className="row" style={{ gap: 10 }}>
            {chipAlerta && <NavLink to={chipAlerta.to} className="chip alert">{chipAlerta.texto}</NavLink>}
            <span className="chip">{papelRotulo}</span>
          </div>
        </div>
        <main className="content" id="conteudo" tabIndex={-1}>
          <div className="cab-impressao so-impressao"><Logo /><div className="t"><strong>{atual?.rotulo ?? 'GE Advocacia'}</strong>{nomeImpressao}<br />Impresso em {dataExtenso}<br />por {sessao.nome}</div></div>
          {avisos}
          {carregando ? <PaginaEsqueleto /> : <div key={loc.pathname} className="rota"><Outlet /></div>}
          <div className="rodape-impressao so-impressao">{rodapeImpressao}</div>
        </main>
      </div>

      <nav className="bottomnav" aria-label="Atalhos">
        {atalhosItens.map(i => (
          <NavLink key={i.to} to={i.to} end={i.fim} className={({ isActive }) => (isActive ? 'on' : '')}>
            <i.icone size={21} strokeWidth={1.7} />{i.curto ?? i.rotulo}
            {!!i.contagem && i.contagem > 0 && <span className="badge-n">{i.contagem}</span>}
          </NavLink>
        ))}
        <button onClick={() => setAberto(true)} aria-label="Abrir menu completo"><Menu size={21} strokeWidth={1.7} />Menu</button>
      </nav>
    </div>
  );
}
