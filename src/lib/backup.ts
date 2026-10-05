import type { Db } from '@/data/db';
import type { EscritorioInfo } from '@/lib/types';

/** Cópia dos dados do escritório em um arquivo (JSON, opcionalmente protegido por senha) para guardar no computador. Documentos ficam no Storage/Drive; aqui vão os registros. */
export interface PacoteBackup { gerado_em: string; versao: 1; escritorio: { nome: string; slug: string }; tabelas: Record<string, unknown[]> }

const SEM_SEGREDO = ['pin_hash', 'senha_hash'];
const limpo = <T extends object>(l: T[]): T[] => l.map(r => Object.fromEntries(Object.entries(r).filter(([k]) => !SEM_SEGREDO.includes(k))) as T);

export async function gerarBackup(db: Db, esc: EscritorioInfo): Promise<PacoteBackup> {
  const ler = async <T,>(f: () => Promise<T[]>): Promise<T[]> => { try { return await f(); } catch { return []; } };
  const [cargos, escalas, funcionarios, registros, ocorrencias, feriados, ajustes, ajustesDia, folhas, tarefas, clientes, processos, modelos, itens, arquivos, usuarios, auditoria] = await Promise.all([
    ler(() => db.cargos.list()), ler(() => db.escalas.list()), ler(() => db.funcionarios.list()), ler(() => db.registros.list()), ler(() => db.ocorrencias.list()), ler(() => db.feriados.list()),
    ler(() => db.ajustes.list()), ler(() => db.ajustesDia.list()), ler(() => db.folhas.list()), ler(() => db.tarefas.list()), ler(() => db.clientes.list()), ler(() => db.processos.list()),
    ler(() => db.checklist.modelos.list()), ler(() => db.checklist.itens.list()), ler(() => db.arquivos.list()), ler(() => db.usuarios.list()), ler(() => db.auditoria.list()),
  ]);
  const movimentos = (await Promise.all(processos.map(p => ler(() => db.processos.movimentos(p.id))))).flat();
  const andamentos = (await Promise.all(tarefas.map(t => ler(() => db.andamentos.list(t.id))))).flat();
  const config = await db.config.get();
  return {
    gerado_em: new Date().toISOString(), versao: 1, escritorio: { nome: esc.nome, slug: esc.slug },
    tabelas: { cargos, escalas, funcionarios: limpo(funcionarios), registros, ocorrencias, feriados, ajustes, ajustes_dia: ajustesDia, folhas, tarefas, andamentos_tarefas: andamentos, clientes, processos, movimentos_processos: movimentos,
      checklist_modelos: modelos, checklist_itens: itens, documentos: arquivos, usuarios: limpo(usuarios), auditoria, configuracoes: [config] },
  };
}

// ---------------------------------------------------------------- proteção por senha (AES-GCM, chave derivada por PBKDF2)
const MAGICO = new TextEncoder().encode('GEBK1');
async function chave(senha: string, sal: Uint8Array) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: sal as BufferSource, iterations: 250_000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function cifrarBackup(texto: string, senha: string): Promise<Uint8Array> {
  const sal = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await chave(senha, sal), new TextEncoder().encode(texto)));
  const out = new Uint8Array(MAGICO.length + 16 + 12 + ct.length);
  out.set(MAGICO); out.set(sal, MAGICO.length); out.set(iv, MAGICO.length + 16); out.set(ct, MAGICO.length + 28);
  return out;
}
export async function decifrarBackup(bytes: Uint8Array, senha: string): Promise<string> {
  const n = MAGICO.length;
  if (bytes.length < n + 29 || !MAGICO.every((b, i) => bytes[i] === b)) throw new Error('Arquivo de backup inválido.');
  try { return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(n + 16, n + 28) }, await chave(senha, bytes.slice(n, n + 16)), bytes.slice(n + 28))); }
  catch { throw new Error('Senha incorreta ou arquivo danificado.'); }
}

export async function montarArquivo(db: Db, esc: EscritorioInfo, senha: string): Promise<{ nome: string; bytes: Uint8Array; cifrado: boolean }> {
  const pacote = await gerarBackup(db, esc);
  const texto = JSON.stringify(pacote);
  const dia = pacote.gerado_em.slice(0, 10);
  return senha ? { nome: `backup-${esc.slug}-${dia}.gebackup`, bytes: await cifrarBackup(texto, senha), cifrado: true } : { nome: `backup-${esc.slug}-${dia}.json`, bytes: new TextEncoder().encode(texto), cifrado: false };
}

export function baixarArquivo(nome: string, bytes: Uint8Array) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/octet-stream' }));
  const a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------- lembrete semanal e pasta no computador
const chaveUltimo = (slug: string) => `ge.backup.ultimo.${slug}`;
const chaveAuto = (slug: string) => `ge.backup.auto.${slug}`;
export function ultimoBackup(slug: string): string | null { try { return localStorage.getItem(chaveUltimo(slug)); } catch { return null; } }
export function marcarBackup(slug: string) { try { localStorage.setItem(chaveUltimo(slug), new Date().toISOString()); } catch { /* sem armazenamento */ } }
export function autoLigado(slug: string): boolean { try { return localStorage.getItem(chaveAuto(slug)) === '1'; } catch { return false; } }
export function ligarAuto(slug: string, ligado: boolean) { try { if (ligado) localStorage.setItem(chaveAuto(slug), '1'); else localStorage.removeItem(chaveAuto(slug)); } catch { /* sem armazenamento */ } }
export const diasSem = (iso: string | null) => (iso ? Math.floor((Date.now() - Date.parse(iso)) / 86_400_000) : Infinity);
export const backupVencido = (slug: string) => diasSem(ultimoBackup(slug)) >= 7;

interface PastaHandle { name: string; queryPermission(o: { mode: 'readwrite' }): Promise<string>; requestPermission(o: { mode: 'readwrite' }): Promise<string>; getFileHandle(n: string, o: { create: boolean }): Promise<{ createWritable(): Promise<{ write(b: BufferSource): Promise<void>; close(): Promise<void> }> }> }
export const suportaPasta = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => { const r = indexedDB.open('ge-backup', 1); r.onupgradeneeded = () => r.result.createObjectStore('pastas'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
async function lerPasta(slug: string): Promise<PastaHandle | null> {
  try { const d = await idb(); return await new Promise(res => { const q = d.transaction('pastas').objectStore('pastas').get(slug); q.onsuccess = () => res((q.result as PastaHandle) ?? null); q.onerror = () => res(null); }); } catch { return null; }
}
export async function nomeDaPasta(slug: string) { return (await lerPasta(slug))?.name ?? null; }
export async function escolherPasta(slug: string): Promise<string> {
  const h = await (window as unknown as { showDirectoryPicker(o: { mode: 'readwrite' }): Promise<PastaHandle> }).showDirectoryPicker({ mode: 'readwrite' });
  const d = await idb();
  await new Promise<void>((res, rej) => { const t = d.transaction('pastas', 'readwrite'); t.objectStore('pastas').put(h, slug); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
  return h.name;
}
/** Grava na pasta escolhida. `interativo=false` (salvamento automático) não abre pedido de permissão: se o navegador não liberou, devolve false. */
export async function salvarNaPasta(slug: string, nome: string, bytes: Uint8Array, interativo: boolean): Promise<boolean> {
  const h = await lerPasta(slug);
  if (!h) return false;
  let p = await h.queryPermission({ mode: 'readwrite' });
  if (p !== 'granted' && interativo) p = await h.requestPermission({ mode: 'readwrite' });
  if (p !== 'granted') return false;
  const w = await (await h.getFileHandle(nome, { create: true })).createWritable();
  await w.write(bytes as BufferSource); await w.close();
  return true;
}
