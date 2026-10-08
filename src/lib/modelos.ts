import type { AreaJuridica } from './types';

/**
 * Modelos de documentos (peças, contratos, procurações…): texto com campos {{grupo.campo}} que o sistema preenche com os dados
 * reais do cliente, do processo, do escritório e do advogado. O que não houver dado vira um destaque [[PREENCHER: campo]].
 *
 * Apoio técnico: os modelos são ponto de partida e DEVEM ser revisados pelo advogado responsável antes do uso. Não substituem a análise do caso.
 */
export type CategoriaModelo = 'procuracoes' | 'contratos' | 'iniciais' | 'defesas' | 'recursos' | 'manifestacoes' | 'execucao' | 'extrajudicial' | 'acordos' | 'cliente' | 'interno';

export const CATEGORIAS_MODELO: readonly { id: CategoriaModelo; rotulo: string }[] = [
  { id: 'procuracoes', rotulo: 'Procurações e declarações' }, { id: 'contratos', rotulo: 'Contratos e honorários' }, { id: 'iniciais', rotulo: 'Petições iniciais' },
  { id: 'defesas', rotulo: 'Defesas e réplicas' }, { id: 'recursos', rotulo: 'Recursos' }, { id: 'manifestacoes', rotulo: 'Manifestações e requerimentos' },
  { id: 'execucao', rotulo: 'Execução e cumprimento de sentença' }, { id: 'extrajudicial', rotulo: 'Extrajudicial e pareceres' }, { id: 'acordos', rotulo: 'Acordos e termos' },
  { id: 'cliente', rotulo: 'Comunicação com o cliente' }, { id: 'interno', rotulo: 'Controles internos' },
];
export const rotuloCategoriaModelo = (c: string) => CATEGORIAS_MODELO.find(x => x.id === c)?.rotulo ?? 'Outros';

export interface ModeloDocumento {
  id: string; titulo: string; categoria: CategoriaModelo; area: AreaJuridica | null; descricao: string | null; conteudo: string;
  ativo: boolean; versao: number; created_at: string; updated_at: string;
}

// ---------------------------------------------------------------- variáveis
export interface VariavelInfo { chave: string; rotulo: string; grupo: string; exemplo: string }
export const VARIAVEIS: readonly VariavelInfo[] = [
  { chave: 'cliente.nome', rotulo: 'Nome do cliente', grupo: 'Cliente', exemplo: 'Maria da Silva' },
  { chave: 'cliente.qualificacao', rotulo: 'Qualificação completa do cliente', grupo: 'Cliente', exemplo: 'Maria da Silva, brasileira, casada, professora, portadora do RG nº 1234567 e inscrita no CPF sob o nº 000.000.000-00, residente e domiciliada na Rua A, nº 1, São Luís/MA' },
  { chave: 'cliente.documento', rotulo: 'CPF/CNPJ do cliente', grupo: 'Cliente', exemplo: '000.000.000-00' },
  { chave: 'cliente.rg', rotulo: 'RG do cliente', grupo: 'Cliente', exemplo: '1234567 SSP/MA' },
  { chave: 'cliente.nacionalidade', rotulo: 'Nacionalidade', grupo: 'Cliente', exemplo: 'brasileira' },
  { chave: 'cliente.estado_civil', rotulo: 'Estado civil', grupo: 'Cliente', exemplo: 'casada' },
  { chave: 'cliente.profissao', rotulo: 'Profissão', grupo: 'Cliente', exemplo: 'professora' },
  { chave: 'cliente.endereco', rotulo: 'Endereço do cliente', grupo: 'Cliente', exemplo: 'Rua A, nº 1, Centro, São Luís/MA, CEP 65000-000' },
  { chave: 'cliente.email', rotulo: 'E-mail do cliente', grupo: 'Cliente', exemplo: 'maria@exemplo.com' },
  { chave: 'cliente.telefone', rotulo: 'Telefone do cliente', grupo: 'Cliente', exemplo: '(98) 99999-0000' },
  { chave: 'processo.numero', rotulo: 'Número do processo', grupo: 'Processo', exemplo: '0000000-00.2026.8.10.0001' },
  { chave: 'processo.vara', rotulo: 'Vara / órgão julgador', grupo: 'Processo', exemplo: '1ª Vara Cível de São Luís' },
  { chave: 'processo.tribunal', rotulo: 'Tribunal', grupo: 'Processo', exemplo: 'Tribunal de Justiça do Maranhão' },
  { chave: 'processo.classe', rotulo: 'Classe processual', grupo: 'Processo', exemplo: 'Procedimento Comum Cível' },
  { chave: 'processo.assunto', rotulo: 'Assunto', grupo: 'Processo', exemplo: 'Indenização por dano moral' },
  { chave: 'processo.parte_contraria', rotulo: 'Parte contrária', grupo: 'Processo', exemplo: 'Empresa X Ltda.' },
  { chave: 'processo.valor_causa', rotulo: 'Valor da causa', grupo: 'Processo', exemplo: 'R$ 10.000,00' },
  { chave: 'processo.valor_causa_extenso', rotulo: 'Valor da causa por extenso', grupo: 'Processo', exemplo: 'dez mil reais' },
  { chave: 'processo.data_ajuizamento', rotulo: 'Data de ajuizamento', grupo: 'Processo', exemplo: '10/03/2026' },
  { chave: 'escritorio.nome', rotulo: 'Nome do escritório', grupo: 'Escritório', exemplo: 'Silva & Ribeiro Advogados' },
  { chave: 'escritorio.endereco', rotulo: 'Endereço do escritório', grupo: 'Escritório', exemplo: 'Av. dos Holandeses, 100, São Luís/MA' },
  { chave: 'escritorio.cidade', rotulo: 'Cidade do escritório', grupo: 'Escritório', exemplo: 'São Luís' },
  { chave: 'advogado.nome', rotulo: 'Nome do advogado', grupo: 'Advogado', exemplo: 'Dr. João Souza' },
  { chave: 'advogado.oab', rotulo: 'OAB do advogado', grupo: 'Advogado', exemplo: 'OAB/MA 00.000' },
  { chave: 'data.hoje', rotulo: 'Data de hoje', grupo: 'Data', exemplo: '08/10/2026' },
  { chave: 'data.extenso', rotulo: 'Data de hoje por extenso', grupo: 'Data', exemplo: '8 de outubro de 2026' },
  { chave: 'honorarios.valor', rotulo: 'Valor dos honorários', grupo: 'Honorários', exemplo: 'R$ 6.000,00' },
  { chave: 'honorarios.extenso', rotulo: 'Valor dos honorários por extenso', grupo: 'Honorários', exemplo: 'seis mil reais' },
  { chave: 'honorarios.forma', rotulo: 'Forma de pagamento dos honorários', grupo: 'Honorários', exemplo: 'entrada de R$ 2.000,00 e 4 parcelas mensais de R$ 1.000,00' },
  { chave: 'honorarios.exito', rotulo: 'Percentual de êxito', grupo: 'Honorários', exemplo: '10%' },
];
export const GRUPOS_VARIAVEIS = [...new Set(VARIAVEIS.map(v => v.grupo))];
const ROTULO_VAR = new Map(VARIAVEIS.map(v => [v.chave, v.rotulo]));

const RE_VAR = /\{\{\s*([a-z_]+(?:\.[a-z_]+)?)\s*(?:\|([^}]*))?\}\}/gi;
/** Campos usados no texto (sem repetição, na ordem em que aparecem). */
export function extrairVariaveis(texto: string): string[] {
  const achados: string[] = [];
  for (const m of texto.matchAll(RE_VAR)) if (!achados.includes(m[1].toLowerCase())) achados.push(m[1].toLowerCase());
  return achados;
}
/** Campos do texto que não existem no catálogo (erro de digitação ao editar o modelo). */
export const variaveisDesconhecidas = (texto: string) => extrairVariaveis(texto).filter(v => !ROTULO_VAR.has(v) && !v.startsWith('extra.'));

export const MARCA_INICIO = '[[PREENCHER: ';
export const MARCA_FIM = ']]';
export interface Preenchido { texto: string; faltando: string[] }
/** Troca {{campo}} pelo valor; sem valor, usa o padrão ({{campo|padrão}}) ou deixa a marca [[PREENCHER: rótulo]]. */
export function preencher(modelo: string, valores: Record<string, string | null | undefined>): Preenchido {
  const faltando: string[] = [];
  const texto = modelo.replace(RE_VAR, (_, chaveBruta: string, padrao?: string) => {
    const chave = chaveBruta.toLowerCase();
    const v = valores[chave];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
    if (padrao !== undefined && padrao.trim() !== '') return padrao.trim();
    const rot = ROTULO_VAR.get(chave) ?? chave;
    if (!faltando.includes(rot)) faltando.push(rot);
    return `${MARCA_INICIO}${rot}${MARCA_FIM}`;
  });
  return { texto, faltando };
}

// ---------------------------------------------------------------- formatação de valores
const UN = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZ = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CEN = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
function ate999(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100), r = n % 100, partes: string[] = [];
  if (c) partes.push(CEN[c]);
  if (r) partes.push(r < 20 ? UN[r] : DEZ[Math.floor(r / 10)] + (r % 10 ? ` e ${UN[r % 10]}` : ''));
  return partes.join(' e ');
}
/** Número inteiro por extenso, em português (até 999 bilhões). */
export function inteiroPorExtenso(n: number): string {
  if (!Number.isFinite(n) || n < 0 || n >= 1e12) return String(n);
  n = Math.floor(n);
  if (n === 0) return 'zero';
  const escalas: [number, string, string][] = [[1e9, 'bilhão', 'bilhões'], [1e6, 'milhão', 'milhões'], [1e3, 'mil', 'mil']];
  const partes: string[] = [], grupos: number[] = []; let resto = n;
  for (const [v, sing, plur] of escalas) {
    const q = Math.floor(resto / v); resto %= v;
    if (q) { partes.push(v === 1e3 && q === 1 ? 'mil' : `${ate999(q)} ${q === 1 ? sing : plur}`); grupos.push(q); }
  }
  if (resto) { partes.push(ate999(resto)); grupos.push(resto); }
  // "e" antes do último bloco quando ele é menor que 100 ou centena exata (mil e quinhentos; dois milhões e quinhentos mil; dois mil e cem)
  if (partes.length > 1) {
    const ult = grupos[grupos.length - 1], antes = partes.slice(0, -1).join(' ');
    return ult < 100 || ult % 100 === 0 ? `${antes} e ${partes[partes.length - 1]}` : `${antes} ${partes[partes.length - 1]}`;
  }
  return partes[0];
}
/** Valor em reais por extenso: "mil e quinhentos reais e cinquenta centavos". */
export function reaisPorExtenso(v: number): string {
  const total = Math.round(Math.abs(v) * 100), reais = Math.floor(total / 100), cent = total % 100;
  const r = reais === 0 && cent > 0 ? '' : `${inteiroPorExtenso(reais)} ${reais === 1 ? 'real' : (reais !== 0 && reais % 1_000_000 === 0 ? 'de reais' : 'reais')}`;
  const c = cent ? `${inteiroPorExtenso(cent)} ${cent === 1 ? 'centavo' : 'centavos'}` : '';
  return [r, c].filter(Boolean).join(' e ') || 'zero reais';
}
export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export function dataPorExtenso(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} de ${MESES[m - 1]} de ${a}`;
}
export const dataBR = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

// ---------------------------------------------------------------- blocos (prévia e .docx usam o mesmo)
export type TipoBloco = 'titulo' | 'secao' | 'centro' | 'direita' | 'paragrafo' | 'semrecuo' | 'item' | 'quebra' | 'vazio';
export interface Bloco { tipo: TipoBloco; texto: string }
/**
 * Marcação simples do modelo:  `# Título` (centralizado) · `## Seção` (negrito) · `>> centro` · `<< direita` · `~ sem recuo` · `- item` ·
 * `[[quebra]]` (nova página) · **negrito** · linha em branco separa parágrafos. Texto comum vira parágrafo justificado com recuo.
 */
export function blocos(texto: string): Bloco[] {
  const out: Bloco[] = [];
  for (const bruta of texto.replace(/\r\n/g, '\n').split('\n')) {
    const l = bruta.trimEnd();
    if (!l.trim()) { if (out.length && out[out.length - 1].tipo !== 'vazio') out.push({ tipo: 'vazio', texto: '' }); continue; }
    if (l.trim() === '[[quebra]]') out.push({ tipo: 'quebra', texto: '' });
    else if (l.startsWith('## ')) out.push({ tipo: 'secao', texto: l.slice(3) });
    else if (l.startsWith('# ')) out.push({ tipo: 'titulo', texto: l.slice(2) });
    else if (l.startsWith('>> ')) out.push({ tipo: 'centro', texto: l.slice(3) });
    else if (l.startsWith('<< ')) out.push({ tipo: 'direita', texto: l.slice(3) });
    else if (l.startsWith('~ ')) out.push({ tipo: 'semrecuo', texto: l.slice(2) });
    else if (l.startsWith('- ')) out.push({ tipo: 'item', texto: l.slice(2) });
    else out.push({ tipo: 'paragrafo', texto: l });
  }
  while (out.length && out[out.length - 1].tipo === 'vazio') out.pop();
  return out;
}
/** Trechos de um parágrafo: negrito (**x**), campos a preencher e lacunas do modelo. */
export interface Trecho { texto: string; negrito: boolean; preencher: boolean }
export function trechos(linha: string): Trecho[] {
  const out: Trecho[] = [];
  // **negrito** · [[PREENCHER: campo]] (dado que faltou) · [campo livre] (lacuna do próprio modelo, a completar à mão)
  const partes = linha.split(/(\*\*[^*]+\*\*|\[\[PREENCHER: [^\]]+\]\]|\[[^[\]]{1,90}\])/g).filter(Boolean);
  for (const p of partes) {
    if (p.startsWith('**') && p.endsWith('**')) out.push({ texto: p.slice(2, -2), negrito: true, preencher: false });
    else if (p.startsWith(MARCA_INICIO)) out.push({ texto: `[${p.slice(MARCA_INICIO.length, -MARCA_FIM.length)}]`, negrito: true, preencher: true });
    else if (p.startsWith('[') && p.endsWith(']')) out.push({ texto: p, negrito: false, preencher: true });
    else out.push({ texto: p, negrito: false, preencher: false });
  }
  return out;
}
/** Nome de arquivo seguro para o download. */
export const nomeArquivoModelo = (titulo: string, ext: string) => `${titulo.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'documento'}.${ext}`;
