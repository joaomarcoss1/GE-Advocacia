// Edge Function "documentos" (Deno): recebe os arquivos, guarda no Storage privado e organiza no Google Drive do escritório.
//
//   enviar            → (painel) arquivo de um cliente/processo/item da checklist
//   abrir             → (painel) URL assinada de 60 s; o acesso fica registrado
//   limpar            → remove do Storage/Drive o que foi excluído no sistema
//   drive_conectar    → endereço de autorização do Google (somente administrador; escopo drive.file)
//   GET ?code&state   → retorno do Google: guarda o refresh_token CIFRADO e cria a pasta raiz do escritório
//   drive_sincronizar → reenvia ao Drive o que ficou pendente ou com erro
//   drive_varredura   → idem para todos os escritórios (agendada, cabeçalho x-cron-secret)
//   publico_info / publico_enviar → página /enviar/:token do cliente (sem login; o token vale para um cliente/processo)
//
// Segurança: o Storage é privado e só esta função (service_role) o acessa; o JWT e o papel são conferidos aqui e o escritório
// vem sempre do banco, nunca do corpo da requisição. Todo arquivo é conferido pela ASSINATURA real (não só pela extensão).
// O Drive usa o escopo drive.file: o sistema só enxerga o que ele mesmo criou. Se o Drive falhar, o documento continua guardado
// no Storage e a sincronização é refeita depois (status "pendente"/"erro" visível no painel).
// Segredos: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_TOKEN_KEY, ALLOWED_ORIGINS, CRON_SECRET.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { criarCripto, segredoConfere } from '../_shared/cripto.ts';
import { conferirArquivo, escaparConsultaDrive, MAX_BYTES, nomeSeguro, sha256Hex, sha256Texto } from '../_shared/arquivos.ts';

const URL_BASE = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';
const TOKEN_KEY = Deno.env.get('GOOGLE_TOKEN_KEY') ?? '';
const CRON = Deno.env.get('CRON_SECRET');
const ORIGENS = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);
const REDIRECT_URI = `${URL_BASE}/functions/v1/documentos`;
const ESCOPOS = 'https://www.googleapis.com/auth/drive.file openid email';
const BUCKET = 'documentos';
const MAX_TENTATIVAS = 8;
const cripto = criarCripto(TOKEN_KEY || 'invalida');

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' };
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const falha = (erro: string, status = 400) => json({ erro }, status);
const origemPermitida = (url: string) => { try { return ORIGENS.includes(new URL(url).origin); } catch { return false; } };
const COLS_DOC = 'id,cliente_id,processo_id,item_id,nome,mime,tamanho,sha256,origem,enviado_por_nome,conferido,conferido_em,drive_status,drive_link,drive_erro,created_at';

interface DocLinha { id: string; escritorio_id: string; cliente_id: string; processo_id: string | null; item_id: string | null; nome: string; mime: string; storage_path: string | null; drive_tentativas: number }

// ---------------------------------------------------------------- Google Drive
async function tokenDrive(sb: SupabaseClient, escId: string): Promise<{ token: string; raiz: string | null } | null> {
  const { data } = await sb.from('drive_conexoes').select('refresh_token_enc,pasta_raiz_id').eq('escritorio_id', escId).maybeSingle();
  if (!data) return null;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: await cripto.decifrar(data.refresh_token_enc), grant_type: 'refresh_token' }),
  });
  if (!r.ok) {
    // acesso revogado no Google: a conexão deixa de valer e nada fica "pendente" para sempre
    if ((await r.json().catch(() => ({}))).error === 'invalid_grant') {
      await sb.from('drive_conexoes').delete().eq('escritorio_id', escId);
      await sb.from('documentos').update({ drive_status: 'desligado' }).eq('escritorio_id', escId).in('drive_status', ['pendente', 'erro']);
    }
    throw new Error('O acesso ao Google Drive foi revogado ou expirou. Conecte novamente em Configurações.');
  }
  return { token: (await r.json()).access_token, raiz: data.pasta_raiz_id };
}
async function drive(token: string, metodo: string, caminho: string, corpo?: unknown, base = 'https://www.googleapis.com/drive/v3') {
  const r = await fetch(`${base}${caminho}`, { method: metodo, headers: { Authorization: `Bearer ${token}`, ...(corpo ? { 'Content-Type': 'application/json' } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined });
  if (!r.ok && r.status !== 404) throw new Error(`Google Drive: ${(await r.json().catch(() => ({})))?.error?.message ?? r.status}`);
  return { status: r.status, dados: r.status === 204 || !r.ok ? null : await r.json() };
}
/** Pasta com a marca do registro (appProperties.ge_id): reaproveita a existente, recria se foi apagada. */
async function garantirPasta(token: string, marca: string, nome: string, pai: string, cache: string | null): Promise<string> {
  if (cache) {
    const r = await drive(token, 'GET', `/files/${cache}?fields=id,trashed`);
    if (r.status === 200 && !r.dados?.trashed) return cache;
  }
  const q = `'${pai}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder' and appProperties has { key='ge_id' and value='${escaparConsultaDrive(marca)}' }`;
  const achada = await drive(token, 'GET', `/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`);
  if (achada.dados?.files?.[0]?.id) return achada.dados.files[0].id;
  const c = await drive(token, 'POST', '/files?fields=id', { name: nomeSeguro(nome), mimeType: 'application/vnd.google-apps.folder', parents: [pai], appProperties: { ge_id: marca } });
  if (c.status === 404) throw new Error('PASTA_RAIZ_AUSENTE');
  return c.dados.id;
}
async function criarRaiz(sb: SupabaseClient, token: string, escId: string): Promise<string> {
  const { data: e } = await sb.from('escritorios').select('nome').eq('id', escId).single();
  const c = await drive(token, 'POST', '/files?fields=id', { name: nomeSeguro(`GE Advocacia – ${e?.nome ?? 'Escritório'}`), mimeType: 'application/vnd.google-apps.folder', appProperties: { ge_id: `raiz:${escId}` } });
  await sb.from('drive_conexoes').update({ pasta_raiz_id: c.dados.id }).eq('escritorio_id', escId);
  await sb.from('clientes').update({ drive_folder_id: null }).eq('escritorio_id', escId);       // pastas antigas não valem mais
  await sb.from('processos').update({ drive_folder_id: null }).eq('escritorio_id', escId);
  return c.dados.id;
}

/** Envia um documento ao Drive: Cliente/ → Processo/ → arquivo "Item - original". Nunca apaga nada. */
async function enviarAoDrive(sb: SupabaseClient, d: DocLinha, conexao: { token: string; raiz: string | null }): Promise<void> {
  const falhar = async (msg: string) => { await sb.from('documentos').update({ drive_status: 'erro', drive_erro: msg.slice(0, 300), drive_tentativas: d.drive_tentativas + 1 }).eq('id', d.id); };
  try {
    if (!d.storage_path) throw new Error('Arquivo ausente do armazenamento.');
    const baixado = await sb.storage.from(BUCKET).download(d.storage_path);
    if (baixado.error || !baixado.data) throw new Error('Arquivo não encontrado no armazenamento.');
    const bytes = new Uint8Array(await baixado.data.arrayBuffer());

    const montarCaminho = async (raiz: string) => {
      const { data: cli } = await sb.from('clientes').select('nome,drive_folder_id').eq('id', d.cliente_id).single();
      const pastaCliente = await garantirPasta(conexao.token, `cliente:${d.cliente_id}`, cli?.nome ?? 'Cliente', raiz, cli?.drive_folder_id ?? null);
      if (pastaCliente !== cli?.drive_folder_id) await sb.from('clientes').update({ drive_folder_id: pastaCliente }).eq('id', d.cliente_id);
      if (!d.processo_id) return pastaCliente;
      const { data: pr } = await sb.from('processos').select('numero,drive_folder_id').eq('id', d.processo_id).single();
      const pastaProc = await garantirPasta(conexao.token, `processo:${d.processo_id}`, `Processo ${pr?.numero ?? ''}`.trim(), pastaCliente, pr?.drive_folder_id ?? null);
      if (pastaProc !== pr?.drive_folder_id) await sb.from('processos').update({ drive_folder_id: pastaProc }).eq('id', d.processo_id);
      return pastaProc;
    };
    let raiz = conexao.raiz ?? await criarRaiz(sb, conexao.token, d.escritorio_id);
    let destino: string;
    try { destino = await montarCaminho(raiz); }
    catch (e) {
      if ((e as Error).message !== 'PASTA_RAIZ_AUSENTE') throw e;
      raiz = await criarRaiz(sb, conexao.token, d.escritorio_id);                                  // a pasta raiz foi apagada no Drive
      conexao.raiz = raiz;
      destino = await montarCaminho(raiz);
    }

    const item = d.item_id ? (await sb.from('checklist_itens').select('nome').eq('id', d.item_id).maybeSingle()).data?.nome : null;
    const nome = nomeSeguro(item ? `${item} - ${d.nome}` : d.nome);
    const limite = `ge${crypto.randomUUID().replaceAll('-', '')}`;
    const meta = JSON.stringify({ name: nome, parents: [destino], appProperties: { ge_doc: d.id } });
    const enc = new TextEncoder();
    const corpo = new Blob([enc.encode(`--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${limite}\r\nContent-Type: ${d.mime}\r\n\r\n`), bytes, enc.encode(`\r\n--${limite}--`)]);
    const up = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
      method: 'POST', headers: { Authorization: `Bearer ${conexao.token}`, 'Content-Type': `multipart/related; boundary=${limite}` }, body: corpo,
    });
    if (!up.ok) throw new Error(`Google Drive: ${(await up.json().catch(() => ({})))?.error?.message ?? up.status}`);
    const f = await up.json();
    await sb.from('documentos').update({ drive_status: 'enviado', drive_file_id: f.id, drive_link: f.webViewLink ?? null, drive_erro: null }).eq('id', d.id);
  } catch (e) { await falhar((e as Error).message); }
}

async function sincronizarEscritorio(sb: SupabaseClient, escId: string, limite: number): Promise<{ enviados: number; erros: number }> {
  const r = { enviados: 0, erros: 0 };
  const { data: lista } = await sb.from('documentos').select('id,escritorio_id,cliente_id,processo_id,item_id,nome,mime,storage_path,drive_tentativas')
    .eq('escritorio_id', escId).in('drive_status', ['pendente', 'erro']).lt('drive_tentativas', MAX_TENTATIVAS).order('created_at').limit(limite);
  if (!lista?.length) return r;
  let c: Awaited<ReturnType<typeof tokenDrive>>;
  try { c = await tokenDrive(sb, escId); } catch { return { enviados: 0, erros: lista.length }; }
  if (!c) return r;
  for (const d of lista as DocLinha[]) {
    await enviarAoDrive(sb, d, c);
    const { data: depois } = await sb.from('documentos').select('drive_status').eq('id', d.id).single();
    if (depois?.drive_status === 'enviado') r.enviados++; else r.erros++;
  }
  return r;
}

/** Exclusões feitas no sistema: apaga o arquivo do Storage e manda a cópia do Drive para a lixeira do Drive (recuperável). */
async function limparLixeira(sb: SupabaseClient, escId: string | null): Promise<number> {
  let q = sb.from('documentos_lixeira').select('id,escritorio_id,storage_path,drive_file_id').order('id').limit(100);
  if (escId) q = q.eq('escritorio_id', escId);
  const { data: itens } = await q;
  if (!itens?.length) return 0;
  const tokens = new Map<string, string | null>();
  let feitos = 0;
  for (const it of itens as { id: number; escritorio_id: string; storage_path: string; drive_file_id: string | null }[]) {
    try {
      if (it.storage_path) {
        const r = await sb.storage.from(BUCKET).remove([it.storage_path]);
        if (r.error) throw r.error;
      }
      if (it.drive_file_id) {
        if (!tokens.has(it.escritorio_id)) tokens.set(it.escritorio_id, await tokenDrive(sb, it.escritorio_id).then(c => c?.token ?? null).catch(() => null));
        const t = tokens.get(it.escritorio_id);
        if (t) await drive(t, 'PATCH', `/files/${it.drive_file_id}`, { trashed: true }).catch(() => undefined);
      }
      await sb.from('documentos_lixeira').delete().eq('id', it.id);
      feitos++;
    } catch { /* fica na fila e tenta de novo na próxima limpeza */ }
  }
  return feitos;
}

// ---------------------------------------------------------------- guardar um arquivo (painel e link do cliente)
/** Mensagem própria para o usuário (pode ser mostrada a quem enviou). Qualquer outro erro é interno e não vai para o visitante anônimo. */
class ErroUsuario extends Error {}
interface Entrada { esc: string; cliente_id: string; processo_id: string | null; item_id: string | null; nome: string; bytes: Uint8Array; origem: 'painel' | 'link_cliente'; enviado_por: string | null; enviado_por_nome: string }
async function guardar(sb: SupabaseClient, x: Entrada) {
  const c = conferirArquivo(x.nome, x.bytes);
  if (!c.ok) throw new ErroUsuario(c.erro);
  const id = crypto.randomUUID();
  const caminho = `${x.esc}/${x.cliente_id}/${id}`;
  const up = await sb.storage.from(BUCKET).upload(caminho, x.bytes, { contentType: c.mime, upsert: false });
  if (up.error) throw new ErroUsuario('Não foi possível guardar o arquivo. Tente novamente.');
  const { data: cfg } = await sb.from('configuracoes').select('dados').eq('escritorio_id', x.esc).maybeSingle();
  const { data: conexao } = await sb.from('drive_conexoes').select('escritorio_id').eq('escritorio_id', x.esc).maybeSingle();
  const driveAtivo = !!conexao && (cfg?.dados as { automacao?: { enviar_drive?: boolean } } | undefined)?.automacao?.enviar_drive !== false;
  const { data: doc, error } = await sb.from('documentos').insert({
    id, escritorio_id: x.esc, cliente_id: x.cliente_id, processo_id: x.processo_id, item_id: x.item_id, nome: nomeSeguro(x.nome), mime: c.mime, tamanho: x.bytes.length,
    sha256: await sha256Hex(x.bytes), storage_path: caminho, origem: x.origem, enviado_por: x.enviado_por, enviado_por_nome: x.enviado_por_nome, drive_status: driveAtivo ? 'pendente' : 'desligado',
  }).select(COLS_DOC).single();
  if (error) { await sb.storage.from(BUCKET).remove([caminho]); throw new Error(error.message); }
  if (driveAtivo && CLIENT_ID && TOKEN_KEY) {
    try { await sincronizarEscritorio(sb, x.esc, 5); } catch { /* o documento já está guardado; a varredura refaz */ }
    const { data: atual } = await sb.from('documentos').select(COLS_DOC).eq('id', id).single();
    return atual ?? doc;
  }
  return doc;
}

async function lerArquivo(req: Request): Promise<{ campos: FormData; bytes: Uint8Array; nome: string }> {
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BYTES + 1_000_000) throw new Error('Arquivo grande demais. O máximo é 20 MB.');
  const campos = await req.formData();
  const arq = campos.get('arquivo');
  if (!(arq instanceof File)) throw new Error('Nenhum arquivo recebido.');
  if (arq.size > MAX_BYTES) throw new Error('Arquivo grande demais. O máximo é 20 MB.');
  return { campos, bytes: new Uint8Array(await arq.arrayBuffer()), nome: String(campos.get('nome') ?? arq.name ?? 'arquivo') };
}
const texto = (v: FormDataEntryValue | null) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidOuNulo = (v: string | null) => { if (v && !UUID.test(v)) throw new Error('Pedido inválido.'); return v; };

// ---------------------------------------------------------------- link público do cliente
const MSG_LINK = {
  invalido: 'Link inválido. Confira o endereço recebido do escritório.',
  expirado: 'Este link expirou ou foi cancelado. Peça um novo ao escritório.',
  indisponivel: 'Este endereço está indisponível.',
  limite: 'Limite de arquivos deste link atingido. Peça um novo link ao escritório.',
};
interface LinkLinha { id: string; escritorio_id: string; cliente_id: string; processo_id: string | null; expira_em: string; ativo: boolean; max_arquivos: number; usos: number }
async function acharLink(sb: SupabaseClient, token: string): Promise<{ link: LinkLinha } | { erro: string }> {
  if (!/^[a-f0-9]{48}$/.test(token)) return { erro: MSG_LINK.invalido };
  const { data: l } = await sb.from('documento_links').select('id,escritorio_id,cliente_id,processo_id,expira_em,ativo,max_arquivos,usos').eq('token_hash', await sha256Texto(token)).maybeSingle();
  if (!l) return { erro: MSG_LINK.invalido };
  const { data: e } = await sb.from('escritorios').select('ativo').eq('id', l.escritorio_id).single();
  if (!e?.ativo) return { erro: MSG_LINK.indisponivel };
  if (!l.ativo || Date.parse(l.expira_em) < Date.now()) return { erro: MSG_LINK.expirado };
  return { link: l as LinkLinha };
}
/** Reserva uma vaga do link (otimista, sem corrida entre envios simultâneos). */
async function reservarUso(sb: SupabaseClient, l: LinkLinha): Promise<boolean> {
  let usos = l.usos;
  for (let i = 0; i < 4; i++) {
    if (usos >= l.max_arquivos) return false;
    const { data } = await sb.from('documento_links').update({ usos: usos + 1, ultimo_uso: new Date().toISOString() }).eq('id', l.id).eq('usos', usos).select('usos').maybeSingle();
    if (data) return true;
    usos = (await sb.from('documento_links').select('usos').eq('id', l.id).single()).data?.usos ?? usos;
  }
  return false;
}
async function devolverUso(sb: SupabaseClient, id: string) {
  const { data } = await sb.from('documento_links').select('usos').eq('id', id).single();
  if (data && data.usos > 0) await sb.from('documento_links').update({ usos: data.usos - 1 }).eq('id', id).eq('usos', data.usos);
}

// ---------------------------------------------------------------- identificação do chamador
async function chamador(req: Request, exigirAdmin = false) {
  const auth = req.headers.get('Authorization');
  if (!auth) throw new Error('SEM_PERMISSAO');
  const sbUser = createClient(URL_BASE, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: u } = await sbUser.auth.getUser();
  if (!u.user) throw new Error('SEM_PERMISSAO');
  const { data: ok } = await sbUser.rpc(exigirAdmin ? 'eh_admin' : 'eh_delegante');
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
      const st = q.get('state') ? await cripto.lerEstado<{ u: string; e: string; r: string; x: number }>(q.get('state')!) : null;
      if (!st || !origemPermitida(st.r)) return new Response('Solicitação inválida ou expirada. Volte ao sistema e tente de novo.', { status: 400 });
      const voltar = (resultado: string) => Response.redirect(`${st.r}${st.r.includes('?') ? '&' : '?'}drive=${resultado}`, 302);
      if (q.get('error') || !q.get('code')) return voltar('erro');
      try {
        const r = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ code: q.get('code')!, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code' }),
        });
        if (!r.ok) return voltar('erro');
        const t = await r.json() as { access_token: string; refresh_token?: string; id_token?: string };
        if (!t.refresh_token) return voltar('erro');
        let email: string | null = null;
        try { email = JSON.parse(atob(t.id_token!.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email ?? null; } catch { /* sem e-mail */ }
        await sb.from('drive_conexoes').upsert({ escritorio_id: st.e, conectado_por: st.u, email_google: email, refresh_token_enc: await cripto.cifrar(t.refresh_token), pasta_raiz_id: null });
        await criarRaiz(sb, t.access_token, st.e);
        await sb.from('documentos').update({ drive_status: 'pendente', drive_tentativas: 0 }).eq('escritorio_id', st.e).eq('drive_status', 'desligado');   // o que já existe vai para o Drive
        return voltar('ok');
      } catch { return voltar('erro'); }
    }
    if (req.method !== 'POST') return falha('Método não permitido.', 405);

    const multipart = (req.headers.get('content-type') ?? '').startsWith('multipart/form-data');
    if (multipart) {
      const { campos, bytes, nome } = await lerArquivo(req);
      const acao = texto(campos.get('acao'));

      // ---------- envio pelo painel ----------
      if (acao === 'enviar') {
        const { sbUser, userId, escId } = await chamador(req);
        const cliente = uuidOuNulo(texto(campos.get('cliente_id')));
        const processo = uuidOuNulo(texto(campos.get('processo_id')));
        const item = uuidOuNulo(texto(campos.get('item_id')));
        if (!cliente) return falha('Pedido inválido.');
        if (!(await sbUser.from('clientes').select('id').eq('id', cliente).maybeSingle()).data) return falha('NAO_ENCONTRADO', 404);
        if (processo && !(await sbUser.from('processos').select('id').eq('id', processo).maybeSingle()).data) return falha('NAO_ENCONTRADO', 404);
        const { data: perfil } = await sb.from('perfis').select('nome').eq('id', userId).maybeSingle();
        const documento = await guardar(sb, { esc: escId, cliente_id: cliente, processo_id: processo, item_id: item, nome, bytes, origem: 'painel', enviado_por: userId, enviado_por_nome: perfil?.nome ?? 'Equipe' });
        return json({ documento });
      }

      // ---------- envio pelo link do cliente (sem login) ----------
      if (acao === 'publico_enviar') {
        const achado = await acharLink(sb, String(texto(campos.get('token')) ?? ''));
        if ('erro' in achado) return json({ ok: false, erro: achado.erro });
        const l = achado.link;
        let item: string | null;
        try { item = uuidOuNulo(texto(campos.get('item_id'))); } catch { return json({ ok: false, erro: 'Item não encontrado.' }); }
        if (!(await reservarUso(sb, l))) return json({ ok: false, erro: MSG_LINK.limite });
        try {
          await guardar(sb, { esc: l.escritorio_id, cliente_id: l.cliente_id, processo_id: l.processo_id, item_id: item, nome, bytes, origem: 'link_cliente', enviado_por: null, enviado_por_nome: 'Cliente (link de envio)' });
          return json({ ok: true });
        } catch (e) {
          await devolverUso(sb, l.id);
          const m = (e as Error).message;
          if (e instanceof ErroUsuario) return json({ ok: false, erro: m });
          return json({ ok: false, erro: m.includes('ITEM_INVALIDO') || m.includes('NAO_ENCONTRADO') ? 'Item não encontrado.' : 'Não foi possível receber o arquivo.' });
        }
      }
      return falha('Ação desconhecida.');
    }

    const corpo = await req.json().catch(() => ({}));
    const acao = String(corpo.acao ?? '');

    // ---------- página pública: o que falta enviar ----------
    if (acao === 'publico_info') {
      const achado = await acharLink(sb, String(corpo.token ?? ''));
      if ('erro' in achado) return json({ ok: false, erro: achado.erro });
      const l = achado.link;
      const [esc, cli, proc] = await Promise.all([
        sb.from('escritorios').select('nome').eq('id', l.escritorio_id).single(),
        sb.from('clientes').select('nome').eq('id', l.cliente_id).single(),
        l.processo_id ? sb.from('processos').select('numero').eq('id', l.processo_id).single() : Promise.resolve({ data: null }),
      ]);
      let qi = sb.from('checklist_itens').select('id,nome,obrigatorio,status').eq('escritorio_id', l.escritorio_id).neq('status', 'dispensado').order('ordem');
      qi = l.processo_id ? qi.eq('processo_id', l.processo_id) : qi.is('processo_id', null).eq('cliente_id', l.cliente_id);
      const { data: itens } = await qi;
      return json({ ok: true, escritorio: esc.data?.nome ?? '', cliente: cli.data?.nome ?? '', processo: proc.data?.numero ?? null, expira_em: l.expira_em, restantes: Math.max(0, l.max_arquivos - l.usos), itens: itens ?? [] });
    }

    // ---------- varredura agendada: só com o segredo ----------
    if (acao === 'drive_varredura') {
      if (!segredoConfere(req.headers.get('x-cron-secret'), CRON)) return falha('Não autorizado.', 401);
      if (!CLIENT_ID || !TOKEN_KEY) return falha('GOOGLE_INDISPONIVEL', 503);
      const { data: escritorios } = await sb.from('drive_conexoes').select('escritorio_id');
      const total = { enviados: 0, erros: 0, limpos: 0 };
      for (const e of escritorios ?? []) {
        const r = await sincronizarEscritorio(sb, e.escritorio_id, 25);
        total.enviados += r.enviados; total.erros += r.erros;
      }
      total.limpos = await limparLixeira(sb, null);
      return json({ ok: true, ...total });
    }

    // ---------- ações do painel ----------
    if (acao === 'drive_conectar') {
      if (!CLIENT_ID || !CLIENT_SECRET || !TOKEN_KEY) return falha('GOOGLE_INDISPONIVEL', 503);
      const { userId, escId } = await chamador(req, true);
      if (!origemPermitida(String(corpo.retorno ?? ''))) return falha('Endereço de retorno não permitido (ALLOWED_ORIGINS).');
      const estado = await cripto.assinarEstado({ u: userId, e: escId, r: corpo.retorno, x: Date.now() + 10 * 60_000 });
      return json({ url: 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: 'code', scope: ESCOPOS, access_type: 'offline', prompt: 'consent', state: estado }) });
    }
    if (acao === 'drive_sincronizar') {
      const { escId } = await chamador(req);
      if (!CLIENT_ID || !TOKEN_KEY) return falha('GOOGLE_INDISPONIVEL', 503);
      return json(await sincronizarEscritorio(sb, escId, 40));
    }
    if (acao === 'abrir') {
      const { sbUser } = await chamador(req);
      const aberto = await sbUser.rpc('documento_abrir', { p_id: String(corpo.id ?? '') });                  // confere papel e escritório e registra o acesso
      if (aberto.error) return falha(aberto.error.message, aberto.error.message.includes('SEM_PERMISSAO') ? 403 : 404);
      const { storage_path, nome, mime } = aberto.data as { storage_path: string; nome: string; mime: string };
      const assinada = await sb.storage.from(BUCKET).createSignedUrl(storage_path, 60, { download: nome });
      if (assinada.error || !assinada.data) return falha('Arquivo não encontrado no armazenamento.', 404);
      return json({ nome, mime, url: assinada.data.signedUrl });
    }
    if (acao === 'limpar') {
      const { escId } = await chamador(req);
      return json({ ok: true, limpos: await limparLixeira(sb, escId) });
    }
    return falha('Ação desconhecida.');
  } catch (x) {
    const m = (x as Error).message;
    return falha(m === 'SEM_PERMISSAO' ? 'Você não tem permissão para esta ação.' : m, m === 'SEM_PERMISSAO' ? 403 : 400);
  }
});
