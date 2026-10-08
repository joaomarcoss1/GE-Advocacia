import { brl, dataBR, dataPorExtenso, reaisPorExtenso } from './modelos';
import type { Cliente, ConfigEscritorio, Processo } from './types';

const t = (v: string | null | undefined) => (v ?? '').trim();

/** Qualificação completa para peças (CPC, art. 319, II): pessoa física ou jurídica, só com o que está cadastrado. */
export function qualificacaoCliente(c: Cliente): string {
  const doc = t(c.documento), end = t(c.endereco);
  if (c.tipo === 'pj') {
    return [c.nome, 'pessoa jurídica de direito privado', doc && `inscrita no CNPJ sob o nº ${doc}`, end && `com sede em ${end}`].filter(Boolean).join(', ');
  }
  return [c.nome, t(c.nacionalidade), t(c.estado_civil), t(c.profissao), t(c.rg) && `portador(a) do RG nº ${t(c.rg)}`, doc && `inscrito(a) no CPF sob o nº ${doc}`, end && `residente e domiciliado(a) em ${end}`]
    .filter(Boolean).join(', ');
}

export interface DadosUso {
  cliente: Cliente | null; processo: Processo | null; escritorio: Partial<ConfigEscritorio>;
  advogado: { nome: string; oab: string | null } | null;
  honorarios?: { valor?: number | null; forma?: string; exito?: string };
  hojeIso: string;
}
/** Valores dos campos {{grupo.campo}} a partir dos cadastros. Só devolve o que existe: o resto vira [[PREENCHER: …]]. */
export function valoresDoModelo(d: DadosUso): Record<string, string> {
  const v: Record<string, string> = {};
  const put = (k: string, x: string | null | undefined) => { if (t(x)) v[k] = t(x); };
  const c = d.cliente, p = d.processo;
  if (c) {
    put('cliente.nome', c.nome); put('cliente.qualificacao', qualificacaoCliente(c)); put('cliente.documento', c.documento); put('cliente.rg', c.rg);
    put('cliente.nacionalidade', c.nacionalidade); put('cliente.estado_civil', c.estado_civil); put('cliente.profissao', c.profissao);
    put('cliente.endereco', c.endereco); put('cliente.email', c.email); put('cliente.telefone', c.telefone);
  }
  if (p) {
    put('processo.numero', p.numero); put('processo.vara', p.orgao_julgador); put('processo.tribunal', p.tribunal); put('processo.classe', p.classe);
    put('processo.assunto', p.assunto); put('processo.parte_contraria', p.parte_contraria);
    if (p.valor_causa != null && p.valor_causa > 0) { put('processo.valor_causa', brl(p.valor_causa)); put('processo.valor_causa_extenso', reaisPorExtenso(p.valor_causa)); }
    if (p.data_ajuizamento) put('processo.data_ajuizamento', dataBR(p.data_ajuizamento));
  }
  put('escritorio.nome', d.escritorio.nome); put('escritorio.endereco', d.escritorio.endereco); put('escritorio.cidade', d.escritorio.cidade);
  if (d.advogado) { put('advogado.nome', d.advogado.nome); put('advogado.oab', d.advogado.oab ? (/oab/i.test(d.advogado.oab) ? d.advogado.oab : `OAB ${d.advogado.oab}`) : ''); }
  put('data.hoje', dataBR(d.hojeIso)); put('data.extenso', dataPorExtenso(d.hojeIso));
  const h = d.honorarios;
  if (h?.valor != null && h.valor > 0) { put('honorarios.valor', brl(h.valor)); put('honorarios.extenso', reaisPorExtenso(h.valor)); }
  put('honorarios.forma', h?.forma); put('honorarios.exito', h?.exito);
  return v;
}
