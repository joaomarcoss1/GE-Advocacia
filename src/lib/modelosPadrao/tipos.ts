import type { AreaJuridica } from '../types';
import type { CategoriaModelo } from '../modelos';

export interface ModeloPadrao { titulo: string; categoria: CategoriaModelo; area: AreaJuridica | null; descricao: string; conteudo: string }
export const modelo = (titulo: string, categoria: CategoriaModelo, area: AreaJuridica | null, descricao: string, conteudo: string): ModeloPadrao => ({ titulo, categoria, area, descricao, conteudo: conteudo.trim() });

/** Cabeçalho padrão de petição dirigida ao juízo. */
export const ENDERECAMENTO = `>> **EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DE DIREITO DA {{processo.vara|[vara/juízo]}} DA COMARCA DE [comarca] – ESTADO DO MARANHÃO**`;
export const ENCERRAMENTO = `~ Nestes termos,
~ pede deferimento.
<< {{escritorio.cidade|[cidade]}}/MA, {{data.extenso}}.
<< **{{advogado.nome}}**
<< {{advogado.oab}}`;
/** Parte comum de provas e valor da causa. */
export const PROVAS_E_VALOR = `## DAS PROVAS
Protesta provar o alegado por todos os meios de prova em direito admitidos, em especial documental, testemunhal, depoimento pessoal da parte contrária e perícia, se necessária.

## DO VALOR DA CAUSA
Dá-se à causa o valor de **{{processo.valor_causa|[valor da causa]}}** ({{processo.valor_causa_extenso|[valor por extenso]}}).`;
