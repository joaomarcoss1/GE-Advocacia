// Edge Function "ponto-entrar" (Deno): entrada automática no sistema depois do ponto confirmado.
//
//   POST { funcionario_id, pin }  (sem login; protegida pelo PIN, com bloqueio por origem no banco)
//     1. a função SQL ponto_acesso valida o PIN e as regras (login ativo ligado ao funcionário, nível que depende do ponto,
//        senha já trocada, entrada confirmada hoje, sem saída). Administrador e gerência nunca entram por aqui.
//     2. com a service_role, gera um link de uso único (magic link) para o e-mail do login e devolve só o token_hash;
//        o navegador troca esse token por uma sessão com supabase.auth.verifyOtp. Nenhuma senha trafega.
//
// Segurança: limite de tentativas por IP (aqui e no banco), corpo estrito (UUID e PIN numérico), mensagens de erro genéricas,
// service_role só aqui dentro, token de uso único e curto. Deploy: supabase functions deploy ponto-entrar --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2';
import { criarLimitador, ipDe } from '../_shared/limite.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const limite = criarLimitador(15, 60_000);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, erro: 'METODO' }, 405);
  const ip = ipDe(req);
  if (!limite.tenta(ip)) return json({ ok: false, erro: 'LIMITE' }, 429);
  try {
    const corpo = await req.json().catch(() => null) as { funcionario_id?: unknown; pin?: unknown } | null;
    const fid = typeof corpo?.funcionario_id === 'string' ? corpo.funcionario_id : '';
    const pin = typeof corpo?.pin === 'string' ? corpo.pin : '';
    if (!UUID.test(fid) || !/^\d{6,8}$/.test(pin)) return json({ ok: false, erro: 'PIN_INVALIDO' }, 400);

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data, error } = await sb.rpc('ponto_acesso', { p_func_id: fid, p_pin: pin, p_origem: ip });
    if (error || !data) return json({ ok: false, erro: 'INDISPONIVEL' }, 200);
    const r = data as { ok: boolean; erro?: string; email?: string };
    if (!r.ok || !r.email) return json({ ok: false, erro: r.erro ?? 'SEM_ACESSO' });

    const { data: link, error: e2 } = await sb.auth.admin.generateLink({ type: 'magiclink', email: r.email });
    const token = link?.properties?.hashed_token;
    if (e2 || !token) return json({ ok: false, erro: 'INDISPONIVEL' });
    return json({ ok: true, token_hash: token });
  } catch {
    return json({ ok: false, erro: 'INDISPONIVEL' });
  }
});
