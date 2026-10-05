/**
 * Validação de documentos pelo CONTEÚDO real (assinatura do arquivo), não pela extensão nem pelo tipo declarado pelo navegador.
 * Sem dependência de Deno: usada pela Edge Function "documentos" e testada no vitest.
 */
export const MAX_BYTES = 20 * 1024 * 1024;

export const EXT_MIME: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
const IMAGENS = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const extensao = (nome: string) => (nome.split('.').pop() ?? '').toLowerCase();

/** Nome seguro para arquivo/pasta (Drive, download e Storage). */
export const nomeSeguro = (n: string) => n.normalize('NFC').replace(/[\\/:*?"<>|\x00-\x1f]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120) || 'arquivo';

const comeca = (b: Uint8Array, sig: number[]) => b.length >= sig.length && sig.every((v, i) => b[i] === v);

/** Tipo pelo início do arquivo. Para Word/Excel novos (zip) exige o marcador interno [Content_Types].xml. */
export function tipoPelaAssinatura(b: Uint8Array): 'pdf' | 'image/jpeg' | 'image/png' | 'image/webp' | 'ole' | 'zip-office' | null {
  if (comeca(b, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf';
  if (comeca(b, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (comeca(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (comeca(b, [0x52, 0x49, 0x46, 0x46]) && b.length > 12 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  if (comeca(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return 'ole';
  if (comeca(b, [0x50, 0x4b, 0x03, 0x04])) {
    const cabeca = new TextDecoder('latin1').decode(b.slice(0, Math.min(b.length, 4096)));
    return cabeca.includes('[Content_Types].xml') ? 'zip-office' : null;
  }
  return null;
}

export type Conferencia = { ok: true; mime: string } | { ok: false; erro: string };
/** Confere nome, tamanho e conteúdo. Devolve o tipo REAL (que é o que fica gravado). */
export function conferirArquivo(nome: string, bytes: Uint8Array): Conferencia {
  if (!bytes.length) return { ok: false, erro: 'O arquivo está vazio.' };
  if (bytes.length > MAX_BYTES) return { ok: false, erro: 'O arquivo passa de 20 MB.' };
  const porNome = EXT_MIME[extensao(nome)];
  if (!porNome) return { ok: false, erro: 'Tipo de arquivo não aceito. Envie PDF, imagem (JPG, PNG), Word ou Excel.' };
  const real = tipoPelaAssinatura(bytes);
  if (!real) return { ok: false, erro: 'O conteúdo do arquivo não corresponde a um documento válido.' };
  if (real === 'pdf') return porNome === 'application/pdf' ? { ok: true, mime: 'application/pdf' } : { ok: false, erro: 'O arquivo não é do tipo indicado pela extensão.' };
  if (IMAGENS.has(real)) return IMAGENS.has(porNome) ? { ok: true, mime: real } : { ok: false, erro: 'O arquivo não é do tipo indicado pela extensão.' };
  if (real === 'ole') return porNome === 'application/msword' || porNome === 'application/vnd.ms-excel' ? { ok: true, mime: porNome } : { ok: false, erro: 'O arquivo não é do tipo indicado pela extensão.' };
  return porNome.includes('openxmlformats') ? { ok: true, mime: porNome } : { ok: false, erro: 'O arquivo não é do tipo indicado pela extensão.' };
}

export async function sha256Hex(b: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', b as BufferSource);
  return Array.from(new Uint8Array(h)).map(x => x.toString(16).padStart(2, '0')).join('');
}
export const sha256Texto = (t: string) => sha256Hex(new TextEncoder().encode(t));

/** Aspas e barras de um nome entram na consulta do Drive (`name = '...'`): precisam de escape. */
export const escaparConsultaDrive = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
