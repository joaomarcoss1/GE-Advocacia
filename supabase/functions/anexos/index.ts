// Edge Function "anexos" (Deno) — único caminho para enviar, abrir e limpar atestados.
//
//   enviar  (multipart, sem login, protegido por PIN): valida tipo REAL (assinatura do arquivo) e tamanho, autoriza pela
//           função SQL ponto_anexo_preparar e grava no bucket PRIVADO "anexos" com a service_role.
//   abrir   (JSON, administrador logado): a função SQL anexo_abrir confere papel e escritório, REGISTRA o acesso em
//           acessos_sensiveis e só então esta função assina uma URL de 60 segundos.
//   limpar  (JSON, administrador logado): remove do Storage os arquivos cujo registro foi apagado ou expurgado.
//
// O bucket não tem política pública e nenhum usuário da API tem acesso direto aos objetos.
// Deploy: supabase functions deploy anexos --no-verify-jwt   (a autorização é feita aqui dentro)
import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'anexos';
const MAX_BYTES = 2 * 1024 * 1024;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

/** Tipo real pelo início do arquivo (não confia no mime declarado pelo navegador). */
export function tipoReal(b: Uint8Array): string | null {
  if (b.length < 12) return null;
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return 'application/pdf';              // %PDF-
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp'; // RIFF....WEBP
  return null;
}

async function sha256(b: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', b);
  return Array.from(new Uint8Array(h)).map(x => x.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ erro: 'Método não permitido' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  // cliente "como o usuário": repassa o JWT de quem chamou para que auth.uid() funcione nas funções SQL
  const comoUsuario = () => createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false }, global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });

  try {
    // ------------------------------------------------------------------ enviar (multipart)
    if ((req.headers.get('content-type') ?? '').includes('multipart/form-data')) {
      const f = await req.formData();
      if (f.get('acao') !== 'enviar') return json({ ok: false, erro: 'ARQUIVO_INVALIDO' }, 400);
      const arquivo = f.get('arquivo');
      if (!(arquivo instanceof File)) return json({ ok: false, erro: 'ARQUIVO_INVALIDO' });
      if (arquivo.size < 1 || arquivo.size > MAX_BYTES) return json({ ok: false, erro: 'ARQUIVO_INVALIDO', detalhe: 'Envie PDF ou foto de até 2 MB' });
      const bytes = new Uint8Array(await arquivo.arrayBuffer());
      const mime = tipoReal(bytes);
      if (!mime) return json({ ok: false, erro: 'ARQUIVO_INVALIDO', detalhe: 'O conteúdo não corresponde a PDF, JPG, PNG ou WebP' });

      const prep = await service.rpc('ponto_anexo_preparar', {
        p_func_id: String(f.get('funcionario_id') ?? ''), p_pin: String(f.get('pin') ?? ''),
        p_registro_id: f.get('registro_id') ? String(f.get('registro_id')) : null,
        p_ocorrencia_id: f.get('ocorrencia_id') ? String(f.get('ocorrencia_id')) : null,
        p_nome: String(f.get('nome') ?? arquivo.name ?? 'arquivo'), p_mime: mime, p_tamanho: bytes.length, p_sha256: await sha256(bytes),
      });
      if (prep.error) return json({ ok: false, erro: 'ARQUIVO_INVALIDO', detalhe: prep.error.message }, 500);
      const r = prep.data as { ok: boolean; erro?: string; detalhe?: string; id?: string; path?: string };
      if (!r.ok) return json(r);

      const up = await service.storage.from(BUCKET).upload(r.path!, bytes, { contentType: mime, upsert: false });
      if (up.error) {
        await service.rpc('ponto_anexo_cancelar', { p_id: r.id });      // não deixa metadado sem arquivo
        return json({ ok: false, erro: 'ARQUIVO_INVALIDO', detalhe: 'Falha ao gravar o arquivo. Tente de novo.' }, 500);
      }
      return json({ ok: true, id: r.id });
    }

    // ------------------------------------------------------------------ abrir / limpar (JSON, administrador)
    const corpo = await req.json().catch(() => ({}));
    const usuario = comoUsuario();

    if (corpo.acao === 'abrir') {
      // anexo_abrir confere administrador + escritório e grava o rastro de acesso; se falhar, nada é assinado
      const aberto = await usuario.rpc('anexo_abrir', { p_id: String(corpo.id ?? '') });
      if (aberto.error) return json({ erro: aberto.error.message }, aberto.error.message.includes('SEM_PERMISSAO') ? 403 : 404);
      const { path, nome, mime } = aberto.data as { path: string; nome: string; mime: string };
      const assinada = await service.storage.from(BUCKET).createSignedUrl(path, 60);
      if (assinada.error || !assinada.data) return json({ erro: 'Arquivo não encontrado no armazenamento.' }, 404);
      return json({ nome, mime, url: assinada.data.signedUrl });
    }

    if (corpo.acao === 'limpar') {
      const ehAdmin = await usuario.rpc('eh_admin');
      const esc = await usuario.rpc('meu_escritorio');
      if (ehAdmin.error || ehAdmin.data !== true || !esc.data) return json({ erro: 'SEM_PERMISSAO' }, 403);
      const itens = await service.from('anexos_lixeira').select('id,storage_path').eq('escritorio_id', esc.data).limit(500);
      if (itens.error) return json({ erro: itens.error.message }, 500);
      const linhas = itens.data ?? [];
      if (linhas.length) {
        await service.storage.from(BUCKET).remove(linhas.map(l => l.storage_path));
        await service.from('anexos_lixeira').delete().in('id', linhas.map(l => l.id));
      }
      return json({ removidos: linhas.length });
    }

    return json({ erro: 'Ação desconhecida' }, 400);
  } catch (e) {
    return json({ erro: (e as Error).message }, 500);
  }
});
