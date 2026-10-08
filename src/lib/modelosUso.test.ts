import { describe, expect, it } from 'vitest';
import { preencher } from './modelos';
import { MODELOS_PADRAO } from './modelosPadrao';
import { qualificacaoCliente, valoresDoModelo } from './modelosUso';
import type { Cliente, Processo } from './types';

const cli = (o: Partial<Cliente> = {}): Cliente => ({ id: '1', nome: 'Maria da Silva', tipo: 'pf', documento: '000.000.000-00', email: null, telefone: null, observacoes: null, ativo: true, created_at: '', updated_at: '', ...o });

describe('dados do cliente nas peças', () => {
  it('qualifica pessoa física só com o que existe', () => {
    expect(qualificacaoCliente(cli())).toBe('Maria da Silva, inscrito(a) no CPF sob o nº 000.000.000-00');
    expect(qualificacaoCliente(cli({ nacionalidade: 'brasileira', estado_civil: 'casada', profissao: 'professora', rg: '123 SSP/MA', endereco: 'Rua A, 1, São Luís/MA' })))
      .toBe('Maria da Silva, brasileira, casada, professora, portador(a) do RG nº 123 SSP/MA, inscrito(a) no CPF sob o nº 000.000.000-00, residente e domiciliado(a) em Rua A, 1, São Luís/MA');
  });
  it('qualifica pessoa jurídica', () => {
    expect(qualificacaoCliente(cli({ nome: 'Alfa Ltda.', tipo: 'pj', documento: '00.000.000/0001-00', endereco: 'Av. B, 2' })))
      .toBe('Alfa Ltda., pessoa jurídica de direito privado, inscrita no CNPJ sob o nº 00.000.000/0001-00, com sede em Av. B, 2');
  });
  it('monta os valores e deixa marcado o que falta', () => {
    const p = { numero: '0000000-00.2026.8.10.0001', orgao_julgador: '1ª Vara Cível', valor_causa: 10000, data_ajuizamento: '2026-03-10', parte_contraria: 'Beta SA' } as Processo;
    const v = valoresDoModelo({ cliente: cli(), processo: p, escritorio: { nome: 'Escritório X', cidade: 'São Luís' }, advogado: { nome: 'João', oab: 'MA 1234' }, hojeIso: '2026-10-08' });
    expect(v['processo.valor_causa_extenso']).toBe('dez mil reais');
    expect(v['advogado.oab']).toBe('OAB MA 1234');
    expect(v['data.extenso']).toBe('8 de outubro de 2026');
    expect(v['cliente.rg']).toBeUndefined();
    const m = MODELOS_PADRAO.find(x => x.titulo.startsWith('Procuração'))!;
    const r = preencher(m.conteudo, v);
    expect(r.texto).toContain('Maria da Silva');
    expect(r.texto).not.toMatch(/\{\{/);
  });
});
