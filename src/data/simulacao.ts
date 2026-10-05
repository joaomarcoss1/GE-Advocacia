/** Modo demonstração: não há tribunal para consultar, então cada "Atualizar" traz o próximo andamento desta lista (marcado como SIMULADO). */
export const HISTORICO_SIMULADO: { nome: string; complemento?: string; dias: number }[] = [
  { nome: 'Distribuição', dias: -120 },
  { nome: 'Citação', complemento: 'Mandado cumprido', dias: -100 },
  { nome: 'Juntada', complemento: 'Contestação', dias: -80 },
];
export const NOVOS_SIMULADOS: { nome: string; complemento?: string }[] = [
  { nome: 'Juntada', complemento: 'Petição de manifestação da parte autora' },
  { nome: 'Conclusão', complemento: 'Conclusos ao juiz' },
  { nome: 'Despacho', complemento: 'Determinada a manifestação das partes' },
  { nome: 'Expedição de documento', complemento: 'Intimação: disponibilizada no Diário da Justiça Eletrônico' },
  { nome: 'Audiência de instrução designada' },
  { nome: 'Decisão', complemento: 'Deferida a tutela de urgência' },
  { nome: 'Sentença', complemento: 'Julgado procedente em parte o pedido' },
  { nome: 'Trânsito em julgado' },
];
