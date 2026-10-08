/**
 * Organização automática dos documentos: categorias, sugestão pelo nome, pastas e nome do arquivo no Drive.
 * Sem dependência de Deno nem do navegador: usado pelo app, pelas Edge Functions e pelos testes.
 */
export type CategoriaDoc = 'contrato' | 'pessoais' | 'peticoes' | 'decisoes' | 'audiencias' | 'provas' | 'financeiro' | 'outros';

export interface InfoCategoria { id: CategoriaDoc; rotulo: string; pasta: string }

/** Ordem = ordem das subpastas no Drive (01, 02…). Mudar a numeração depois de usar espalharia os arquivos: não renumere. */
export const CATEGORIAS: readonly InfoCategoria[] = [
  { id: 'contrato', rotulo: 'Procuração e contrato', pasta: '01 · Procuração e contrato' },
  { id: 'pessoais', rotulo: 'Documentos pessoais', pasta: '02 · Documentos pessoais' },
  { id: 'peticoes', rotulo: 'Petições e peças', pasta: '03 · Petições e peças' },
  { id: 'decisoes', rotulo: 'Decisões e intimações', pasta: '04 · Decisões e intimações' },
  { id: 'audiencias', rotulo: 'Audiências', pasta: '05 · Audiências' },
  { id: 'provas', rotulo: 'Provas e anexos', pasta: '06 · Provas e anexos' },
  { id: 'financeiro', rotulo: 'Financeiro e custas', pasta: '07 · Financeiro e custas' },
  { id: 'outros', rotulo: 'Outros', pasta: '08 · Outros' },
];
export const CATEGORIA_IDS: readonly CategoriaDoc[] = CATEGORIAS.map(c => c.id);
export const ehCategoria = (x: unknown): x is CategoriaDoc => typeof x === 'string' && (CATEGORIA_IDS as readonly string[]).includes(x);
export const infoCategoria = (c: string | null | undefined): InfoCategoria => CATEGORIAS.find(x => x.id === c) ?? CATEGORIAS[CATEGORIAS.length - 1];
export const rotuloCategoria = (c: string | null | undefined) => infoCategoria(c).rotulo;
export const pastaDaCategoria = (c: string | null | undefined) => infoCategoria(c).pasta;

const sa = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[_\-.]+/g, ' ');

/** A primeira regra que casa vale (a ordem importa: "contrato de honorários" é contrato, não financeiro). */
const REGRAS: [CategoriaDoc, RegExp][] = [
  ['contrato', /\b(procuracao|contrato|honorario|honorarios|substabelecimento|termo de (ajuste|compromisso|ciencia|renuncia)|hipossuficiencia)\b/],
  ['pessoais', /\b(rg|cpf|cnh|identidade|certidao de (nascimento|casamento|obito|nasc)|comprovante de (residencia|endereco)|titulo de eleitor|carteira de trabalho|ctps|passaporte|documento pessoal|documentos pessoais)\b/],
  ['decisoes', /\b(sentenca|decisao|despacho|acordao|intimacao|mandado|alvara|citacao|oficio|publicacao)\b/],
  ['audiencias', /\b(audiencia|ata)\b/],
  ['peticoes', /\b(peticao|inicial|contestacao|replica|recurso|apelacao|agravo|embargos|manifestacao|memoriais|impugnacao|reclamacao|minuta|razoes|contrarrazoes|cumprimento)\b/],
  ['financeiro', /\b(boleto|guia|custas|deposito|pagamento|recibo|nota fiscal|darf|gru|fatura|comprovante de pagamento|cobranca)\b/],
  ['provas', /\b(laudo|pericia|prova|provas|foto|fotos|print|prints|screenshot|extrato|exame|atestado|declaracao|testemunha|video|audio|email|e mail|holerite|contracheque|anexo)\b/],
];

/** Sugere a categoria pelo item da lista (mais confiável) e, se não bastar, pelo nome do arquivo. */
export function sugerirCategoria(nomeArquivo: string, nomeItem?: string | null): CategoriaDoc {
  for (const texto of [nomeItem ?? '', nomeArquivo.replace(/\.[a-z0-9]{2,5}$/i, '')]) {
    const t = sa(texto);
    if (!t.trim()) continue;
    for (const [cat, re] of REGRAS) if (re.test(t)) return cat;
  }
  return 'outros';
}

/** AAAA-MM-DD de uma data ISO (ou do instante atual) — base do nome padronizado. */
export const dataDoNome = (iso?: string | null) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : new Date().toISOString().slice(0, 10));

const EXT = /(\.[a-z0-9]{2,5})$/i;
/**
 * Nome padronizado no Drive: "2026-10-08 · Procuração assinada · arquivo.pdf" (sem o item: "2026-10-08 · arquivo.pdf").
 * Ordena por data, deixa claro o que é e nunca passa de 120 caracteres (a extensão é preservada).
 */
export function nomeNoDrive(o: { criadoEm?: string | null; nome: string; item?: string | null }): string {
  const limpo = (s: string) => s.normalize('NFC').replace(/[\\/:*?"<>|\x00-\x1f]+/g, '_').replace(/\s+/g, ' ').trim();
  const original = limpo(o.nome) || 'arquivo';
  const ext = (original.match(EXT) ?? ['', ''])[1];
  const base = ext ? original.slice(0, -ext.length) : original;
  const item = o.item ? limpo(o.item) : '';
  const semRepetir = item && sa(base).includes(sa(item)) ? '' : item;
  const partes = [dataDoNome(o.criadoEm), semRepetir, base].filter(Boolean);
  const maxBase = 120 - ext.length;
  let nome = partes.join(' · ');
  if (nome.length > maxBase) nome = nome.slice(0, maxBase - 1).trimEnd() + '…';
  return nome + ext;
}

/** Endereço de uma pasta do Drive a partir do id. */
export const urlPastaDrive = (id: string) => `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`;

const PARADAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'as', 'os', 'para', 'com', 'em', 'no', 'na', 'copia', 'documento', 'documentos', 'arquivo', 'assinado', 'assinada', 'final', 'frente', 'verso', 'scan', 'img', 'pdf', 'v1', 'v2', 'v3']);
const palavras = (t: string) => sa(t.replace(/\.[a-z0-9]{2,5}$/i, '')).split(/[^a-z0-9]+/).filter(p => p.length >= 2 && !PARADAS.has(p) && !/^\d+$/.test(p));

/**
 * Sugere o item da lista de documentos que o arquivo atende, pelas palavras em comum com o nome.
 * Só sugere quando há um único melhor candidato (empate = não adivinha). Itens dispensados ficam de fora.
 */
export function sugerirItem<T extends { id: string; nome: string; status: string }>(nomeArquivo: string, itens: readonly T[]): T | null {
  const doArquivo = new Set(palavras(nomeArquivo));
  if (!doArquivo.size) return null;
  let melhor: T | null = null, pontos = 0, empate = false;
  for (const i of itens) {
    if (i.status === 'dispensado') continue;
    const comuns = palavras(i.nome).filter(p => doArquivo.has(p)).length;
    if (!comuns) continue;
    const p = comuns * 2 + (i.status === 'pendente' ? 1 : 0);
    if (p > pontos) { melhor = i; pontos = p; empate = false; } else if (p === pontos) empate = true;
  }
  return empate ? null : melhor;
}
