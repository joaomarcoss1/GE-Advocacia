import { useMemo, useState } from 'react';
import { usePergunta, useConfirm, useToast } from '@/components/ui';
import { useDados } from '@/context/Dados';
import { fmtData, nomeMes } from '@/lib/datetime';
import type { LinhaExport } from '@/lib/export';
import { pendenciasDeAnalise, periodosDoMes, type FolhaCalculada } from '@/lib/folha';
import { calcularPeriodo, type LinhaFolha } from '@/lib/folhaLote';
import { criarSelo } from '@/lib/selo';
import type { Folha, Funcionario, StatusFolha } from '@/lib/types';

// PDF/Excel pesam ~1 MB: só são baixados quando o usuário exporta.
const exportar = () => import('@/lib/export');

export interface Linha extends LinhaFolha { salva?: Folha; efetivo: FolhaCalculada; travada: boolean; desatualizada: boolean }

/** Estado e ações da folha de pagamento do mês: cálculo, fechamento, reabertura com motivo e exportações. */
export function useFolha() {
  const dados = useDados();
  const { db, cargos, folhas, ajustes, config, agora, recarregar, auditar } = dados;
  const toast = useToast();
  const confirmar = useConfirm();
  const perguntar = usePergunta();
  const [mes, setMes] = useState(agora.data.slice(0, 7));
  const [qz, setQz] = useState(agora.data.slice(8) > '15' ? 1 : 0);

  const periodos = periodosDoMes(`${mes}-01`, config.folha.periodicidade);
  const per = periodos[Math.min(qz, periodos.length - 1)];
  const rotuloPeriodo = `${per.rotulo !== 'Mês completo' ? `${per.rotulo} de ` : ''}${nomeMes(per.inicio)} (${fmtData(per.inicio)} a ${fmtData(per.fim)})`;
  const emAndamento = per.fim >= agora.data;

  const linhas: Linha[] = useMemo(() => calcularPeriodo(dados, per.inicio, per.fim).map(l => {
    const salva = folhas.find(f => f.funcionario_id === l.func.id && f.periodo_inicio === per.inicio && f.periodo_fim === per.fim);
    const travada = !!salva && salva.status !== 'aberta';
    return {
      ...l, salva, travada,
      efetivo: travada ? salva! : l.calc,
      desatualizada: !!salva && !travada && Math.abs(salva.valor_final - l.calc.valor_final) > 0.005,
    };
  }), [dados, folhas, per.inicio, per.fim]);

  const cargoDe = (id: string | null) => cargos.find(c => c.id === id)?.nome ?? '—';
  const abertas = linhas.filter(l => !l.travada);
  const fechadas = linhas.filter(l => l.salva?.status === 'fechada');
  const pendAnalise = linhas.reduce((t, l) => t + pendenciasDeAnalise(l.efetivo.detalhe).total, 0);
  const ajustesDe = (fid: string) => ajustes.filter(a => a.funcionario_id === fid && a.data >= per.inicio && a.data <= per.fim).sort((a, b) => a.data.localeCompare(b.data));
  const paraSalvar = (l: Linha, status: StatusFolha) => ({ ...l.calc, status, observacoes: l.salva?.observacoes ?? null }) as Omit<Folha, 'id' | 'created_at' | 'updated_at'>;

  async function gerar() {
    if (emAndamento && !(await confirmar('O período ainda não terminou: dias futuros entram como previstos e pagos, e o valor pode mudar até o fim do período. Gerar como prévia mesmo assim?', { rotulo: 'Gerar prévia' }))) return;
    try { await db.folhas.upsertMany(abertas.map(l => paraSalvar(l, 'aberta'))); await auditar('Folha gerada', rotuloPeriodo); toast.ok(`Folha de ${abertas.length} funcionário(s) calculada.`); await recarregar(); }
    catch (e) { toast.erro((e as Error).message); }
  }
  async function fechar() {
    if (pendAnalise > 0) return toast.erro(`Há ${pendAnalise} item(ns) aguardando análise na aba Ocorrências. Aceite ou recuse antes de fechar a folha.`);
    if (emAndamento) return toast.erro('Só é possível fechar a folha depois do último dia do período.');
    if (!(await confirmar('Fechar a folha congela os valores calculados (faltas, descontos e ajustes) deste período, inclusive as marcações, ocorrências e ajustes do período. Para alterar depois, é preciso reabrir a folha informando o motivo. Continuar?', { rotulo: 'Fechar folha' }))) return;
    try { await db.folhas.upsertMany(abertas.map(l => paraSalvar(l, 'fechada'))); await auditar('Folha fechada', rotuloPeriodo); toast.ok('Folha fechada.'); await recarregar(); }
    catch (e) { toast.erro((e as Error).message); }
  }
  async function pagar() {
    if (!(await confirmar(`Marcar ${fechadas.length} folha(s) como paga(s)?`, { rotulo: 'Marcar como paga' }))) return;
    try { for (const l of fechadas) await db.folhas.update(l.salva!.id, { status: 'paga' }); await auditar('Folha paga', rotuloPeriodo); toast.ok('Pagamento registrado.'); await recarregar(); }
    catch (e) { toast.erro((e as Error).message); }
  }
  /** Reabrir exige o motivo (mínimo de 5 caracteres); ele fica na auditoria e no próprio registro da folha. */
  async function reabrir(l: Linha): Promise<boolean> {
    if (!l.salva) return false;
    const motivo = await perguntar({
      titulo: `Reabrir a folha de ${l.func.nome}`, rotulo: 'Reabrir folha', perigo: true, minimo: 5, label: 'Motivo da reabertura',
      placeholder: 'Ex.: atestado entregue depois do fechamento, correção de uma marcação…',
      texto: 'Os valores voltam a ser recalculados e as marcações, ocorrências e ajustes do período voltam a poder ser editados. O motivo fica registrado na auditoria.',
    });
    if (!motivo) return false;
    try { await db.folhas.reabrir(l.salva.id, motivo); toast.ok('Folha reaberta.'); await recarregar(); return true; }
    catch (e) { toast.erro((e as Error).message); return false; }
  }

  const paraExportar = (): LinhaExport[] => linhas.map(l => ({ func: l.func, cargo: cargoDe(l.func.cargo_id), calc: l.efetivo, ajustes: ajustesDe(l.func.id) }));
  const situacaoDoc = pendAnalise > 0 ? `Prévia — ${pendAnalise} item(ns) em análise` : emAndamento ? 'Prévia — período em andamento' : fechadas.length && !abertas.length ? 'Definitiva' : 'Conferência';
  const cab = { escritorio: config.escritorio, periodo: rotuloPeriodo, situacao: situacaoDoc };
  /** Cabeçalho com selo de autenticidade (código + QR Code registrados no banco). */
  async function cabComSelo(tipo: 'folha' | 'holerite', titulo: string, resumo: Record<string, unknown>, conteudo: unknown) {
    return { ...cab, selo: await criarSelo(db, { tipo, titulo, periodo: rotuloPeriodo, resumo, conteudo }) };
  }
  const gerarFolhaPdf = async () => {
    const linhasExp = paraExportar();
    const total = linhasExp.reduce((t, l) => t + l.calc.valor_final, 0);
    const [m, c] = await Promise.all([exportar(), cabComSelo('folha', 'Folha de pagamento', { funcionarios: linhasExp.length, total_liquido: Math.round(total * 100) / 100, faltas: linhasExp.reduce((t, l) => t + l.calc.faltas, 0) }, linhasExp.map(l => [l.func.id, l.calc.valor_final, l.calc.faltas]))]);
    await m.folhaPdf(linhasExp, c);
  };
  const gerarHolerite = async (l: { func: Funcionario; efetivo: FolhaCalculada }) => {
    const item = { func: l.func, cargo: cargoDe(l.func.cargo_id), calc: l.efetivo, ajustes: ajustesDe(l.func.id) };
    const [m, c] = await Promise.all([exportar(), cabComSelo('holerite', 'Demonstrativo de pagamento', { total_liquido: l.efetivo.valor_final, faltas: l.efetivo.faltas }, [l.func.id, l.efetivo.valor_final, l.efetivo.faltas])]);
    await m.holeritePdf(item, c);
  };
  /** O Excel traz CPF, PIX e conta bancária: pede ciência da confidencialidade e registra o download na auditoria. */
  async function gerarExcel() {
    if (!(await confirmar('O arquivo Excel tem uma aba "Pagamento" com CPF, chave PIX e dados bancários dos funcionários. Guarde-o em local seguro, compartilhe só com quem precisa (contabilidade, financeiro) e não o envie por canais abertos. O download será registrado na auditoria. Continuar?', { rotulo: 'Baixar Excel' }))) return;
    const m = await exportar();
    await m.folhaXlsx(paraExportar(), cab);
    await auditar('Folha exportada em Excel', `${rotuloPeriodo} · inclui CPF e dados de pagamento`);
  }

  return {
    ...dados, toast, mes, setMes, qz, setQz, periodos, per, rotuloPeriodo, emAndamento, linhas, cargoDe, abertas, fechadas, pendAnalise,
    ajustesDe, gerar, fechar, pagar, reabrir, gerarFolhaPdf, gerarHolerite, gerarExcel, paraExportar, cab,
  };
}
export type FolhaCtx = ReturnType<typeof useFolha>;
