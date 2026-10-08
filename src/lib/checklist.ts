import type { AreaJuridica } from './types';

/** Modelos de checklist iniciais (o escritório edita à vontade). Os mesmos nomes e itens estão em `_semear_checklists` (migração 0007): um teste confere a igualdade. */
export interface ModeloInicial { nome: string; area: AreaJuridica | null; itens: { nome: string; obrigatorio?: boolean }[] }
const i = (nome: string, obrigatorio = true) => (obrigatorio ? { nome } : { nome, obrigatorio: false });

export const MODELOS_INICIAIS: ModeloInicial[] = [
  { nome: 'Geral', area: null, itens: [i('Documento de identificação (RG ou CNH)'), i('CPF'), i('Comprovante de residência'), i('Procuração assinada'), i('Contrato de honorários assinado')] },
  { nome: 'Trabalhista', area: 'trabalhista', itens: [i('RG e CPF'), i('Comprovante de residência'), i('Carteira de trabalho (CTPS)'), i('Contrato de trabalho'), i('Holerites / contracheques'), i('Termo de rescisão (TRCT)'), i('Extrato do FGTS'), i('Procuração assinada'), i('Declaração de hipossuficiência'), i('Provas (mensagens, fotos, testemunhas)', false)] },
  { nome: 'Cível', area: 'civel', itens: [i('RG e CPF (ou CNPJ e contrato social)'), i('Comprovante de residência'), i('Procuração assinada'), i('Contrato ou documento que originou a causa'), i('Comprovantes de pagamento'), i('Troca de mensagens e e-mails', false), i('Provas do dano (fotos, orçamentos, laudos)', false)] },
  { nome: 'Família e sucessões', area: 'familia', itens: [i('RG e CPF'), i('Certidão de casamento ou nascimento'), i('Certidão de nascimento dos filhos'), i('Comprovante de residência'), i('Comprovantes de renda'), i('Documentos dos bens', false), i('Procuração assinada')] },
  { nome: 'Previdenciário', area: 'previdenciario', itens: [i('RG e CPF'), i('Comprovante de residência'), i('CNIS (extrato previdenciário)'), i('Carteira de trabalho (CTPS)'), i('PPP e laudos'), i('Carta de concessão ou indeferimento'), i('Procuração assinada')] },
  { nome: 'Empresarial e tributário', area: 'empresarial', itens: [i('Contrato social e alterações'), i('Cartão CNPJ'), i('Documentos dos sócios (RG e CPF)'), i('Procuração assinada'), i('Certidões negativas', false), i('Documentos fiscais e guias')] },
  { nome: 'Criminal', area: 'criminal', itens: [i('RG e CPF'), i('Comprovante de residência'), i('Procuração assinada'), i('Boletim de ocorrência ou documentos do inquérito'), i('Certidão de antecedentes', false)] },
];

/** Tipos aceitos nos documentos (PDF, imagens e Office). O servidor confere o conteúdo real do arquivo, não só a extensão. */
export const MIMES_DOCUMENTO: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
export const ACEITA_DOCUMENTO = '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,application/pdf,image/*';
export const MAX_DOCUMENTO_BYTES = 20 * 1024 * 1024;
/** Limite no modo demonstração (o navegador guarda ~5 MB no total). */
export const MAX_DOCUMENTO_DEMO = 1_500_000;

export const extensao = (nome: string) => (nome.split('.').pop() ?? '').toLowerCase();
export const mimeDoNome = (nome: string): string | null => MIMES_DOCUMENTO[extensao(nome)] ?? null;
/** Nome de arquivo/pasta seguro para o Google Drive e para download. */
export const nomeSeguroArquivo = (n: string) => n.normalize('NFC').replace(/[\\/:*?"<>|\x00-\x1f]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120) || 'arquivo';

const semAcentoMin = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const palavras = (s: string) => new Set(semAcentoMin(s).split(/[^a-z0-9]+/).filter(p => p.length >= 4));
/** Pontua o quanto uma lista combina com o processo: área igual e palavras do "tipo de processo" na classe, no assunto ou no título. */
export function pontuarLista(m: { nome: string; tipo?: string | null; area: AreaJuridica | null }, p: { area?: AreaJuridica | null; classe?: string | null; assunto?: string | null; titulo?: string | null } | null | undefined): number {
  if (!p) return 0;
  let n = 0;
  if (m.area && m.area === p.area) n += 2;
  const alvo = palavras(`${p.classe ?? ''} ${p.assunto ?? ''} ${p.titulo ?? ''}`);
  for (const w of palavras(`${m.tipo ?? ''} ${m.nome}`)) if (alvo.has(w)) n += 3;
  return n;
}
