import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Field } from '@/components/ui';
import { getDb } from '@/data/db';
import { fmtData, isoParaBR } from '@/lib/datetime';
import { APP_VERSAO, SCHEMA_ESPERADO } from '@/lib/regras';

interface Item { rotulo: string; ok: boolean | null; detalhe: string }
const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const SENTRY = import.meta.env.VITE_SENTRY_DSN as string | undefined;
/** Backup externo diário: sem sucesso há mais de 48 h é alerta. */
const LIMITE_BACKUP_H = 48;

function jwt(key: string | undefined): { role?: string; ref?: string } {
  try { return JSON.parse(atob((key ?? '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { return {}; }
}
async function chamar(caminho: string, init?: RequestInit) {
  const r = await fetch(`${URL_}${caminho}`, { ...init, headers: { apikey: KEY!, 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  const texto = await r.text();
  let corpo: unknown = texto; try { corpo = JSON.parse(texto); } catch { /* texto puro */ }
  return { status: r.status, corpo };
}

/** Linha de "Esta instalação": versão do app, do banco, do último backup e do monitoramento. */
function useStatus() {
  const [itens, setItens] = useState<Item[] | null>(null);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const out: Item[] = [{ rotulo: 'Versão do app', ok: true, detalhe: `GE Advocacia ${APP_VERSAO}` }];
      try {
        const db = await getDb();
        const sessao = await db.auth.sessao();
        out.push({ rotulo: 'Modo de dados', ok: true, detalhe: db.modo === 'local' ? 'Demonstração: dados fictícios salvos só neste navegador (vários escritórios independentes).' : 'Supabase (banco real).' });
        if (sessao) {
          const v = await db.versaoEsquema().catch(() => null);
          out.push({
            rotulo: 'Migração do banco',
            ok: v !== null && v >= SCHEMA_ESPERADO,
            detalhe: v === null ? `Banco sem controle de versões. O app espera a versão ${SCHEMA_ESPERADO}: rode supabase/atualizacao_definitiva.sql.`
              : v < SCHEMA_ESPERADO ? `Banco na versão ${v}, app espera ${SCHEMA_ESPERADO}: rode supabase/atualizacao_definitiva.sql (é seguro repetir).` : `Banco na versão ${v} (esperada ${SCHEMA_ESPERADO}).`,
          });
          const b = await db.ultimoBackup().catch(() => null);
          if (db.modo === 'local') out.push({ rotulo: 'Último backup', ok: null, detalhe: 'Não se aplica ao modo demonstração.' });
          else if (!b) out.push({ rotulo: 'Último backup', ok: false, detalhe: 'Nenhum backup externo registrado ainda. Configure o workflow de backup (docs/RESTAURACAO.md).' });
          else {
            const horas = (Date.now() - new Date(b).getTime()) / 3600_000;
            const d = isoParaBR(b);
            out.push({ rotulo: 'Último backup', ok: horas <= LIMITE_BACKUP_H, detalhe: `${fmtData(d.data)} às ${d.hhmm} (há ${Math.round(horas)} h)${horas > LIMITE_BACKUP_H ? ` · ALERTA: mais de ${LIMITE_BACKUP_H} h sem backup` : ''}` });
          }
        }
      } catch (e) { out.push({ rotulo: 'Status', ok: false, detalhe: (e as Error).message }); }
      out.push({ rotulo: 'Monitoramento de erros (Sentry)', ok: SENTRY ? true : null, detalhe: SENTRY ? 'Ativo. CPF, PIN e dados bancários são removidos antes do envio.' : 'Desligado (VITE_SENTRY_DSN não definido).' });
      if (vivo) setItens(out);
    })();
    return () => { vivo = false; };
  }, []);
  return itens;
}

function Lista({ itens }: { itens: Item[] }) {
  return (
    <>
      {itens.map(i => (
        <div key={i.rotulo} className="sum-line" style={{ padding: '14px 22px', alignItems: 'flex-start' }}>
          <span><strong className="fw-600">{i.rotulo}</strong><br /><span className="muted fs-md" style={{ wordBreak: 'break-word' }}>{i.detalhe}</span></span>
          <span className={`badge ${i.ok === null ? 'mute' : i.ok ? 'ok' : 'bad'}`}>{i.ok === null ? '—' : i.ok ? 'OK' : 'Atenção'}</span>
        </div>
      ))}
    </>
  );
}

/** Diagnóstico: status da instalação (versão, migração, backup) e testes de conexão. Não exibe nem guarda segredos. */
export default function Diagnostico({ embutido }: { embutido?: boolean }) {
  const status = useStatus();
  const [itens, setItens] = useState<Item[]>([]);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [rodando, setRodando] = useState(false);

  async function rodar() {
    setRodando(true);
    const out: Item[] = [];
    const add = (rotulo: string, ok: boolean | null, detalhe: string) => { out.push({ rotulo, ok, detalhe }); setItens([...out]); };
    try {
      if (!URL_ || !KEY) { add('Configuração do site', false, 'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY não estão definidas neste deploy: o site está em modo demonstração.'); return; }
      const c = jwt(KEY);
      const hostRef = new URL(URL_).hostname.split('.')[0];
      add('URL do projeto', true, URL_);
      add('Chave anon', c.role === 'anon' && c.ref === hostRef, `papel=${c.role ?? '?'} · projeto=${c.ref ?? '?'} ${c.role === 'service_role' ? '· ATENÇÃO: é a chave service_role, troque pela anon' : c.ref !== hostRef ? '· a chave é de OUTRO projeto' : ''}`);
      try { const h = await chamar('/auth/v1/health'); add('Serviço de login (Auth)', h.status === 200, `HTTP ${h.status} ${JSON.stringify(h.corpo).slice(0, 120)}`); }
      catch (e) { add('Serviço de login (Auth)', false, `Sem resposta: ${(e as Error).message}`); }
      const ctx = await chamar('/rest/v1/rpc/ponto_contexto', { method: 'POST', body: JSON.stringify({ p_slug: 'diagnostico' }) });
      add('Tabelas e funções do banco', ctx.status === 200, ctx.status === 200 ? 'ponto_contexto respondeu (schema aplicado).' : `HTTP ${ctx.status} ${JSON.stringify(ctx.corpo).slice(0, 160)}`);
      if (email && senha) {
        const t = await chamar('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email: email.trim(), password: senha }) });
        const corpo = t.corpo as { access_token?: string; msg?: string; error_description?: string; error_code?: string; message?: string };
        if (t.status === 200 && corpo.access_token) {
          add('Login no Supabase Auth', true, 'Usuário e senha corretos.');
          const s = await chamar('/rest/v1/rpc/minha_sessao', { method: 'POST', body: '{}', headers: { Authorization: `Bearer ${corpo.access_token}` } });
          const r = s.corpo as { ok?: boolean; erro?: string; tipo?: string; papel?: string; escritorio?: { nome: string } };
          add('Acesso ao sistema', !!r?.ok, r?.ok ? `${r.tipo === 'plataforma' ? 'Plataforma' : `Escritório "${r.escritorio?.nome}"`} · papel=${r.papel}` : `Sem acesso: ${r?.erro ?? `HTTP ${s.status}`}`);
        } else {
          add('Login no Supabase Auth', false, `HTTP ${t.status} · ${corpo.error_code ?? ''} · ${corpo.msg ?? corpo.error_description ?? corpo.message ?? JSON.stringify(t.corpo).slice(0, 160)}`);
        }
      } else add('Teste de login', null, 'Preencha e-mail e senha abaixo para testar o login.');
    } catch (e) { add('Erro inesperado', false, (e as Error).message); }
    finally { setRodando(false); }
  }

  const conteudo = (
    <>
      <h1 className="page-title">Estado da instalação</h1>
      <div className="card mt-20" >
        <div className="card-head"><span className="section-title">Esta instalação</span></div>
        {status ? <Lista itens={status} /> : <div className="empty">Verificando…</div>}
      </div>
      <div className="card card-pad stack mt-16" >
        <span className="section-title">Teste de conexão</span>
        <div className="grid c2">
          <Field label="E-mail (opcional)"><input className="input" type="email" autoCapitalize="none" value={email} onChange={e => setEmail(e.target.value)} /></Field>
          <Field label="Senha (opcional)"><input className="input" type="password" autoComplete="off" value={senha} onChange={e => setSenha(e.target.value)} /></Field>
        </div>
        <button className="btn" onClick={rodar} disabled={rodando}>{rodando ? 'Verificando…' : 'Rodar diagnóstico'}</button>
      </div>
      <div className="card mt-16" >
        <Lista itens={itens} />
        {!itens.length && <div className="empty">Clique em “Rodar diagnóstico”.</div>}
      </div>
    </>
  );
  if (embutido) return conteudo;
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 20px 60px' }}>
      {conteudo}
      <p className="mt-18"><Link to="/entrar" className="auth-link">← Voltar ao login</Link></p>
    </div>
  );
}
