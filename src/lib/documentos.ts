import type { ArquivoAnexo } from '@/data/db';
import { MAX_DOCUMENTO_BYTES, MAX_DOCUMENTO_DEMO, mimeDoNome, nomeSeguroArquivo } from './checklist';
import { fmtTamanho } from './anexos';

function lerBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] ?? '');
    r.onerror = () => rej(new Error('Não foi possível ler o arquivo.'));
    r.readAsDataURL(blob);
  });
}

/** Assinatura real do arquivo (início em base64), para não confiar só na extensão. */
const ASSINATURAS: Record<string, string[]> = {
  'application/pdf': ['JVBER'], 'image/jpeg': ['/9j/'], 'image/png': ['iVBOR'], 'image/webp': ['UklGR'],
  'application/msword': ['0M8R4KGx'], 'application/vnd.ms-excel': ['0M8R4KGx'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['UEsD'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['UEsD'],
};

/** Foto de celular grande demais: reduz para JPEG legível (documentos escaneados continuam nítidos). */
async function reduzirImagem(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const esc = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * esc); c.height = Math.round(bmp.height * esc);
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Não foi possível processar a imagem neste aparelho.');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  const blob: Blob | null = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
  if (!blob) throw new Error('Não foi possível processar a imagem.');
  return blob;
}

/** Valida e prepara um documento (PDF, imagem, Word ou Excel) para envio. Lança Error com mensagem amigável. */
export async function prepararDocumento(file: File, demonstracao = false): Promise<ArquivoAnexo> {
  const limite = demonstracao ? MAX_DOCUMENTO_DEMO : MAX_DOCUMENTO_BYTES;
  let mime = mimeDoNome(file.name) ?? (file.type.startsWith('image/') ? 'image/jpeg' : null);
  if (!mime) throw new Error('Tipo de arquivo não aceito. Envie PDF, imagem (JPG, PNG), Word ou Excel.');
  let blob: Blob = file;
  let nome = file.name;
  if (mime.startsWith('image/') && (file.size > 3 * 1024 * 1024 || demonstracao && file.size > limite || /\.(heic|heif)$/i.test(nome))) {
    blob = await reduzirImagem(file); mime = 'image/jpeg'; nome = nome.replace(/\.[^.]+$/, '') + '.jpg';
  }
  if (blob.size > limite) throw new Error(`"${file.name}" tem ${fmtTamanho(blob.size)}; o limite é de ${fmtTamanho(limite)}${demonstracao ? ' na demonstração' : ''}.`);
  if (blob.size < 20) throw new Error(`"${file.name}" está vazio.`);
  const conteudo = await lerBase64(blob);
  if (!(ASSINATURAS[mime] ?? []).some(a => conteudo.startsWith(a))) throw new Error(`"${file.name}" não parece ser um arquivo ${mime === 'application/pdf' ? 'PDF' : 'desse tipo'} válido.`);
  return { nome: nomeSeguroArquivo(nome), mime, tamanho: blob.size, conteudo };
}

/** Abre um arquivo já resolvido (blob ou URL assinada) numa nova aba, sem bloqueio de pop-up. */
export function abrirNovaAba(url: string, nome: string, baixar = false) {
  const a = document.createElement('a');
  a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
  if (baixar) a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
}
