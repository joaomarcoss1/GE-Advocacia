// Edge Function "google-agenda": liga o GE Advocacia ao Google Agenda de quem delega.
//
//  • acao "conectar"    → devolve o endereço de autorização do Google (a pessoa concede acesso à PRÓPRIA agenda)
//  • GET ?code&state    → retorno do Google: troca o código por tokens e guarda o refresh_token CIFRADO (AES-GCM)
//  • acao "sincronizar" → cria/atualiza o evento da tarefa na agenda de quem delega e convida os envolvidos por e-mail
//  • acao "remover"     → apaga o evento
//
// Segurança: o front-end nunca vê tokens nem a service_role. A função confere o JWT do chamador, o papel (admin, gerência
// ou coordenação) e que a tarefa pertence ao escritório dele (lida com o RLS do próprio usuário). Tokens ficam em
// public.google_conexoes (sem política e sem privilégio para anon/authenticated).
//
// Segredos (supabase secrets set ...): GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_TOKEN_KEY (32 bytes em base64),
// ALLOWED_ORIGINS (endereços do app, separados por vírgula, ex.: https://meu-app.vercel.app).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const URL_BASE = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';
const TOKEN_KEY = Deno.env.get('GOOGLE_TOKEN_KEY') ?? '';
const ORIGENS = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);
const REDIRECT_URI = `${URL_BASE}/functions/v1/google-agenda`;
const ESCOPOS = 'https://www.googleapis.com/auth/calendar.events openid email';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const falha = (erro: string, status = 400) => json({ erro }, status);

// ---------------------------------------------------------------- cripto (AES-GCM) e estado assinado (HMAC)
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const deb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const b64url = (u: Uint8Array) => b64(u).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deb64url = (s: string) => deb64(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));

async function chaveAes() { return crypto.subtle.importKey('raw', deb64(TOKEN_KEY), 'AES-GCM', false, ['encrypt', 'decrypt']); }
async function cifrar(texto: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await chaveAes(), new TextEncoder().encode(texto)));
  const out = new Uint8Array(iv.length + ct.length); out.set(iv); out.set(ct, iv.length);
  return b64(out);
}
async function decifrar(dado: string): Promise<string> {
  const b = deb64(dado);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(0, 12) }, await chaveAes(), b.slice(12));
  return new TextDecoder().decode(pt);
}
async function hmac(msg: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', deb64(TOKEN_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg))));
}
async function assinarEstado(dados: Record<string, unknown>): Promise<string> {
  const corpo = b64url(new TextEncoder().encode(JSON.stringify(dados)));
  return `${corpo}.${await hmac(corpo)}`;
}
async function lerEstado(estado: string): Promise<{ u: string; e: string; r: string; x: number } | null> {
  const [corpo, sig] = estado.split('.');
  if (!corpo || !sig || (await hmac(corpo)) !== sig) return null;
  const d = JSON.parse(new TextDecoder().decode(deb64url(corpo)));
  return d.x > Date.now() ? d : null;
}
const origemPermitida = (url: string) => { try { return ORIGENS.includes(new URL(url).origin); } catch { return false; } };

// ---------------------------------------------------------------- Google
async function trocarCodigo(code: string) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code' }),
  });
  if (!r.ok) throw new Error('Google recusou o código de autorização.');
  return await r.json() as { access_token: string; refresh_token?: string; id_token?: string };
}
async function tokenDeAcesso(sb: SupabaseClient, usuarioId: string): Promise<{ token: string; calendario: string; usuario: string }> {
  const { data } = await sb.from('google_conexoes').select('refresh_token_enc,calendario_id').eq('usuario_id', usuarioId).maybeSingle();
  if (!data) throw new Error('GOOGLE_NAO_CONECTADO');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: await decifrar(data.refresh_token_enc), grant_type: 'refresh_token' }),
  });
  if (!r.ok) {
    // acesso revogado no Google: a conexão deixa de valer
    if ((await r.json().catch(() => ({}))).error === 'invalid_grant') await sb.from('google_conexoes').delete().eq('usuario_id', usuarioId);
    throw new Error('GOOGLE_NAO_CONECTADO');
  }
  return { token: (await r.json()).access_token, calendario: data.calendario_id ?? 'primary', usuario: usuarioId };
}
async function google(token: string, metodo: string, caminho: string, corpo?: unknown) {
  const r = await fetch(`https://www.googleapis.com/calendar/v3${caminho}`, {
    method: metodo, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined,
  });
  if (!r.ok && ![404, 410].includes(r.status)) {
    const e = await r.json().catch(() => ({}));
    throw new Error(`Google Agenda: ${e?.error?.message ?? r.status}`);
  }
  return { status: r.status, dados: r.status === 204 || !r.ok ? null : await r.json() };
}

// ---------------------------------------------------------------- evento a partir da tarefa
const ROTULO: Record<string, string> = { tarefa: 'Tarefa', prazo: 'Prazo processual', audiencia: 'Audiência', reuniao: 'Reunião', diligencia: 'Diligência', protocolo: 'Protocolo', atendimento: 'Atendimento' };
const dataLocal = (iso: string, fuso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
const maisUmDia = (d: string) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };

// deno-lint-ignore no-explicit-any
function montarEvento(t: any, fuso: string, emails: string[]) {
  const prefixo = t.status === 'concluida' ? '✔ ' : '';
  const titulo = `${prefixo}${t.prazo_fatal ? 'PRAZO FATAL' : ROTULO[t.tipo] ?? 'Tarefa'}: ${t.titulo}`;
  const descricao = [t.processo_numero && `Processo: ${t.processo_numero}`, t.cliente && `Cliente: ${t.cliente}`, t.descricao].filter(Boolean).join('\n');
  const inicio = t.dia_inteiro ? { date: dataLocal(t.inicio, fuso) } : { dateTime: new Date(t.inicio).toISOString(), timeZone: fuso };
  const fimIso = t.fim ?? new Date(new Date(t.inicio).getTime() + 3_600_000).toISOString();
  const fim = t.dia_inteiro ? { date: maisUmDia(dataLocal(fimIso, fuso)) } : { dateTime: new Date(fimIso).toISOString(), timeZone: fuso };
  return {
    summary: titulo, description: descricao || undefined, location: t.local || undefined, start: inicio, end: fim,
    attendees: emails.map(email => ({ email })), reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: t.lembrete_min ?? 60 }] },
    colorId: t.status === 'concluida' ? '8' : t.prazo_fatal ? '11' : undefined, extendedProperties: { private: { ge_tarefa: t.id } },
  };
}

// ---------------------------------------------------------------- identificação do chamador
async function chamador(req: Request) {
  const auth = req.headers.get('Authorization');
  if (!auth) throw new Error('SEM_PERMISSAO');
  const sbUser = createClient(URL_BASE, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: u } = await sbUser.auth.getUser();
  if (!u.user) throw new Error('SEM_PERMISSAO');
  const { data: ok } = await sbUser.rpc('eh_delegante');
  const { data: esc } = await sbUser.rpc('meu_escritorio');
  if (!ok || !esc) throw new Error('SEM_PERMISSAO');
  return { sbUser, userId: u.user.id, escId: esc as string };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const sb = createClient(URL_BASE, SERVICE, { auth: { persistSession: false } });
  try {
    // ---------- retorno do Google ----------
    if (req.method === 'GET') {
      const q = new URL(req.url).searchParams;
      const st = q.get('state') ? await lerEstado(q.get('state')!) : null;
      if (!st || !origemPermitida(st.r)) return new Response('Solicitação inválida ou expirada. Volte ao sistema e tente de novo.', { status: 400 });
      const voltar = (resultado: string) => Response.redirect(`${st.r}${st.r.includes('?') ? '&' : '?'}google=${resultado}`, 302);
      if (q.get('error') || !q.get('code')) return voltar('erro');
      try {
        const t = await trocarCodigo(q.get('code')!);
        if (!t.refresh_token) return voltar('erro');
        const email = t.id_token ? JSON.parse(new TextDecoder().decode(deb64url(t.id_token.split('.')[1]))).email ?? null : null;
        await sb.from('google_conexoes').upsert({ usuario_id: st.u, escritorio_id: st.e, email_google: email, refresh_token_enc: await cifrar(t.refresh_token) });
        return voltar('ok');
      } catch { return voltar('erro'); }
    }
    if (req.method !== 'POST') return falha('Método não permitido.', 405);
    if (!CLIENT_ID || !CLIENT_SECRET || !TOKEN_KEY) return falha('GOOGLE_INDISPONIVEL', 503);

    const { acao, retorno, tarefa_id } = await req.json();
    const { sbUser, userId, escId } = await chamador(req);

    // ---------- conectar ----------
    if (acao === 'conectar') {
      if (!origemPermitida(String(retorno ?? ''))) return falha('Endereço de retorno não permitido (ALLOWED_ORIGINS).');
      const estado = await assinarEstado({ u: userId, e: escId, r: retorno, x: Date.now() + 10 * 60_000 });
      const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
        client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: 'code', scope: ESCOPOS, access_type: 'offline', prompt: 'consent', state: estado,
      });
      return json({ url });
    }

    // ---------- sincronizar / remover ----------
    if (acao !== 'sincronizar' && acao !== 'remover') return falha('Ação desconhecida.');
    const { data: t } = await sbUser.from('tarefas').select('*').eq('id', tarefa_id).maybeSingle();   // RLS: só tarefas do escritório do chamador
    if (!t) return falha('NAO_ENCONTRADO', 404);
    const { data: ja } = await sb.from('tarefa_google').select('*').eq('tarefa_id', t.id).maybeSingle();
    const dono = ja?.usuario_id ?? userId;                                                              // o evento fica na agenda onde nasceu

    if (acao === 'remover' || t.status === 'cancelada' || !t.inicio) {
      if (ja?.event_id) {
        const c = await tokenDeAcesso(sb, dono);
        await google(c.token, 'DELETE', `/calendars/${encodeURIComponent(c.calendario)}/events/${ja.event_id}?sendUpdates=all`);
      }
      await sb.from('tarefa_google').delete().eq('tarefa_id', t.id);
      return json({ ok: true });
    }

    const c = await tokenDeAcesso(sb, dono);
    const { data: e } = await sb.from('escritorios').select('fuso').eq('id', t.escritorio_id).single();
    const ids = [t.responsavel_id, t.revisor_id, ...(t.participantes ?? [])].filter(Boolean);
    const { data: pessoas } = ids.length ? await sb.from('funcionarios').select('email').in('id', ids).eq('escritorio_id', t.escritorio_id).eq('ativo', true) : { data: [] };
    const emails = [...new Set((pessoas ?? []).map((p: { email: string | null }) => (p.email ?? '').trim().toLowerCase()).filter((m: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m)))] as string[];
    const evento = montarEvento(t, e?.fuso ?? 'America/Fortaleza', emails);
    const cal = `/calendars/${encodeURIComponent(c.calendario)}/events`;

    try {
      let r = ja?.event_id ? await google(c.token, 'PATCH', `${cal}/${ja.event_id}?sendUpdates=all`, evento) : { status: 404, dados: null as { id: string } | null };
      if (r.status === 404 || r.status === 410) r = await google(c.token, 'POST', `${cal}?sendUpdates=all`, evento);
      await sb.from('tarefa_google').upsert({ tarefa_id: t.id, escritorio_id: t.escritorio_id, usuario_id: c.usuario, calendario_id: c.calendario, event_id: r.dados?.id, sync_em: new Date().toISOString(), erro: null });
      return json({ ok: true, convidados: emails.length });
    } catch (x) {
      await sb.from('tarefa_google').upsert({ tarefa_id: t.id, escritorio_id: t.escritorio_id, usuario_id: c.usuario, event_id: ja?.event_id ?? null, erro: String((x as Error).message).slice(0, 300) });
      return falha((x as Error).message, 502);
    }
  } catch (x) {
    const m = (x as Error).message;
    return falha(m === 'SEM_PERMISSAO' ? 'Você não tem permissão para esta ação.' : m === 'GOOGLE_NAO_CONECTADO' ? 'Conecte a sua conta Google para sincronizar com a agenda.' : m, m === 'SEM_PERMISSAO' ? 403 : 400);
  }
});
