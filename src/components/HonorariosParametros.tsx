import { useMemo } from 'react';
import { Plus, Trash2, Users } from 'lucide-react';
import { Field, useToast } from '@/components/ui';
import CampoNumero from '@/components/CampoNumero';
import { useDados } from '@/context/Dados';
import { brl } from '@/lib/modelos';
import {
  CATEGORIAS_CUSTO, REGIMES, REGIOES, SERVICOS, aliquotaEfetiva, custoHora, custoMensalEquipe, horasMensais, totalCustosFixos,
  type CategoriaCusto, type ParametrosHonorarios, type Regiao, type Regime,
} from '@/lib/precificacao';

const COMUNS: [CategoriaCusto, string][] = [
  ['aluguel', 'Aluguel e condomínio'], ['energia', 'Energia elétrica'], ['agua', 'Água'], ['internet', 'Internet e telefone'], ['contabilidade', 'Contabilidade'],
  ['software', 'Sistemas e certificado digital'], ['oab', 'Anuidades OAB / CAA'], ['seguros', 'Seguros'], ['material', 'Material e limpeza'], ['marketing', 'Marketing'],
];
const id = () => Math.random().toString(36).slice(2, 10);

/** Parâmetros do escritório: tudo o que o dono paga, a capacidade de trabalho, tributos, margem, região e a tabela da OAB. */
export default function HonorariosParametros({ p, onChange }: { p: ParametrosHonorarios; onChange(p: ParametrosHonorarios): void }) {
  const { funcionarios } = useDados();
  const toast = useToast();
  const set = <K extends keyof ParametrosHonorarios>(k: K, v: ParametrosHonorarios[K]) => onChange({ ...p, [k]: v });
  const total = totalCustosFixos(p);
  const grupos = useMemo(() => [...new Set(SERVICOS.map(s => s.grupo))], []);

  function setCusto(cid: string, parte: Partial<ParametrosHonorarios['custos'][number]>) { set('custos', p.custos.map(c => (c.id === cid ? { ...c, ...parte } : c))); }
  function adicionarComuns() {
    const faltam = COMUNS.filter(([cat]) => !p.custos.some(c => c.categoria === cat));
    if (!faltam.length) { toast.ok('Todas as contas comuns já estão na lista.'); return; }
    set('custos', [...p.custos, ...faltam.map(([categoria, descricao]) => ({ id: id(), categoria, descricao, valor_mensal: 0 }))]);
  }
  function importarFolha() {
    const valor = custoMensalEquipe(funcionarios, p.encargos_pct);
    if (valor <= 0) { toast.erro('Nenhum salário cadastrado em Funcionários.'); return; }
    const existente = p.custos.find(c => c.categoria === 'folha' && c.descricao.startsWith('Folha do sistema'));
    const linha = { id: existente?.id ?? id(), categoria: 'folha' as const, descricao: `Folha do sistema (com ${p.encargos_pct}% de encargos nos CLT)`, valor_mensal: valor };
    set('custos', existente ? p.custos.map(c => (c.id === existente.id ? linha : c)) : [...p.custos, linha]);
    toast.ok(`Folha importada: ${brl(valor)} por mês.`);
  }

  return (
    <div className="stack g-18" >
      <section className="card card-pad stack" aria-labelledby="h-custos">
        <div className="row between fx-wrap g-8" >
          <div><h2 id="h-custos" className="section-title m-0" >Custos fixos mensais</h2><small className="muted">Tudo o que o escritório paga todo mês, independente de ter caso.</small></div>
          <div className="row g-8 fx-wrap" >
            <button className="btn ghost sm" onClick={importarFolha}><Users size={15} />Importar folha do sistema</button>
            <button className="btn ghost sm" onClick={adicionarComuns}>Adicionar contas comuns</button>
            <button className="btn sm" onClick={() => set('custos', [...p.custos, { id: id(), categoria: 'outros', descricao: '', valor_mensal: 0 }])}><Plus size={15} />Adicionar custo</button>
          </div>
        </div>
        <div className="grid c3" style={{ alignItems: 'end' }}>
          <Field label="Encargos sobre salário CLT (%)" dica="INSS patronal, FGTS, 13º, férias. Usado ao importar a folha."><CampoNumero rotulo="Encargos sobre salário CLT" valor={p.encargos_pct} max={100} onChange={v => set('encargos_pct', v)} /></Field>
        </div>
        {p.custos.length === 0 && <p className="muted">Nenhum custo cadastrado. Comece por "Adicionar contas comuns" e "Importar folha do sistema".</p>}
        <ul className="lista-edicao">
          {p.custos.map(c => (
            <li key={c.id}>
              <select className="select maxw-260" aria-label="Categoria do custo" value={c.categoria} onChange={e => setCusto(c.id, { categoria: e.target.value as CategoriaCusto })}>
                {CATEGORIAS_CUSTO.map(k => <option key={k.id} value={k.id}>{k.rotulo}</option>)}
              </select>
              <input className="input grow" aria-label="Descrição do custo" placeholder="Descrição" maxLength={120} value={c.descricao} onChange={e => setCusto(c.id, { descricao: e.target.value })} />
              <div style={{ width: 150 }}><CampoNumero rotulo={`Valor mensal de ${c.descricao || 'custo'}`} valor={c.valor_mensal} onChange={v => setCusto(c.id, { valor_mensal: v })} placeholder="R$ 0,00" /></div>
              <button className="icon-btn" aria-label="Remover custo" onClick={() => set('custos', p.custos.filter(x => x.id !== c.id))}><Trash2 size={15} /></button>
            </li>
          ))}
        </ul>
        <div className="row between"><strong>Total de custos fixos</strong><strong>{brl(total)} por mês</strong></div>
      </section>

      <section className="card card-pad stack" aria-labelledby="h-cap">
        <h2 id="h-cap" className="section-title m-0" >Capacidade de trabalho</h2>
        <div className="grid c3">
          <Field label="Advogados produtivos" dica="Quem fatura horas (sócios e associados)."><CampoNumero rotulo="Advogados produtivos" valor={p.advogados_produtivos} casas={1} min={0.5} onChange={v => set('advogados_produtivos', v || 1)} /></Field>
          <Field label="Horas faturáveis por mês, por advogado" dica="Realistas: de 80 a 120 h; o resto vai para captação, gestão e tempo ocioso."><CampoNumero rotulo="Horas faturáveis por mês" valor={p.horas_faturaveis_mes} casas={0} max={250} onChange={v => set('horas_faturaveis_mes', v || 10)} /></Field>
          <Field label="Custo de 1 hora do escritório"><div className="valor-calc"><strong>{brl(custoHora(p))}</strong><small className="muted"> · {horasMensais(p)} h/mês</small></div></Field>
        </div>
      </section>

      <section className="card card-pad stack" aria-labelledby="h-trib">
        <h2 id="h-trib" className="section-title m-0" >Tributação</h2>
        <div className="grid c3">
          <Field label="Regime"><select className="select" value={p.regime} onChange={e => set('regime', e.target.value as Regime)}>{REGIMES.map(r => <option key={r.id} value={r.id}>{r.rotulo}</option>)}</select></Field>
          {p.regime === 'simples_iv' && <Field label="Receita bruta dos últimos 12 meses (R$)" dica="Define a faixa do Simples."><CampoNumero rotulo="Receita bruta 12 meses" valor={p.rbt12} onChange={v => set('rbt12', v)} /></Field>}
          {p.regime === 'presumido' && <Field label="ISS do município (%)" dica="De 2% a 5%. Sociedade uniprofissional pode ter ISS fixo."><CampoNumero rotulo="ISS" valor={p.iss_pct} max={5} onChange={v => set('iss_pct', v)} /></Field>}
          {(p.regime === 'autonomo' || p.regime === 'manual') && <Field label="Carga sobre a receita (%)" dica="Informada pela contabilidade (IRPF, INSS, ISS…)."><CampoNumero rotulo="Alíquota informada" valor={p.aliquota_manual_pct} max={60} onChange={v => set('aliquota_manual_pct', v)} /></Field>}
          <Field label="Carga tributária usada no cálculo"><div className="valor-calc"><strong>{aliquotaEfetiva(p).toFixed(2).replace('.', ',')}%</strong></div></Field>
        </div>
        <small className="muted">Estimativa de apoio: confirme com a contabilidade (adicional de IRPJ, ISS fixo e contribuição previdenciária patronal do Simples não estão incluídos).</small>
      </section>

      <section className="card card-pad stack" aria-labelledby="h-margem">
        <h2 id="h-margem" className="section-title m-0" >Margem de lucro e risco</h2>
        <div className="grid c3">
          <Field label="Margem de lucro desejada (%)" dica="Sobre o valor cobrado, depois de custos e tributos."><CampoNumero rotulo="Margem de lucro" valor={p.margem_pct} max={80} onChange={v => set('margem_pct', v)} /></Field>
          <Field label="Inadimplência prevista (%)" dica="Parte do faturamento que não se recebe."><CampoNumero rotulo="Inadimplência" valor={p.inadimplencia_pct} max={40} onChange={v => set('inadimplencia_pct', v)} /></Field>
          <Field label="Reserva para imprevistos (%)" dica="Sobre o custo do caso."><CampoNumero rotulo="Reserva" valor={p.reserva_pct} max={40} onChange={v => set('reserva_pct', v)} /></Field>
          <Field label="Custo do dinheiro no tempo (% ao mês)" dica="Pesa no parcelamento: receber depois vale menos."><CampoNumero rotulo="Custo do dinheiro" valor={p.desconto_mensal_pct} max={10} onChange={v => set('desconto_mensal_pct', v)} /></Field>
          <Field label="Acréscimo da faixa premium (%)" dica="Urgência, sigilo ou complexidade acima do normal."><CampoNumero rotulo="Faixa premium" valor={p.premium_pct} max={200} onChange={v => set('premium_pct', v)} /></Field>
        </div>
      </section>

      <section className="card card-pad stack" aria-labelledby="h-reg">
        <h2 id="h-reg" className="section-title m-0" >Região de atuação</h2>
        <div className="grid c3">
          <Field label="Praça"><select className="select" value={p.regiao} onChange={e => { const r = REGIOES.find(x => x.id === e.target.value)!; onChange({ ...p, regiao: r.id as Regiao, fator_regional: r.fator }); }}>{REGIOES.map(r => <option key={r.id} value={r.id}>{r.rotulo}</option>)}</select></Field>
          <Field label="Fator de mercado" dica="Multiplica a tabela da OAB para a sua praça (1,00 = igual à tabela). Ponto de partida: ajuste ao que seu mercado paga."><CampoNumero rotulo="Fator de mercado" valor={p.fator_regional} casas={2} min={0.3} max={2} onChange={v => set('fator_regional', v || 1)} /></Field>
        </div>
      </section>

      <section className="card card-pad stack" aria-labelledby="h-esf">
        <h2 id="h-esf" className="section-title m-0" >Esforço e despesas do caso</h2>
        <div className="grid c3">
          <Field label="Acompanhamento por mês de duração (h)" dica="Tempo de acompanhar o processo mês a mês (andamentos, clientes, prazos)."><CampoNumero rotulo="Acompanhamento por mês" valor={p.acompanhamento_h_mes} max={20} onChange={v => set('acompanhamento_h_mes', v)} /></Field>
          <Field label="Horas por audiência" dica="Preparação, deslocamento e participação."><CampoNumero rotulo="Horas por audiência" valor={p.horas_por_audiencia} max={40} onChange={v => set('horas_por_audiencia', v)} /></Field>
          <Field label="Valor por km rodado (R$)"><CampoNumero rotulo="Valor por km" valor={p.valor_km} max={20} onChange={v => set('valor_km', v)} /></Field>
        </div>
      </section>

      <section className="card card-pad stack" aria-labelledby="h-custas">
        <h2 id="h-custas" className="section-title m-0" >Custas judiciais (TJMA)</h2>
        <div className="grid c3">
          <Field label="Percentual sobre o valor da causa (%)" dica="Lei estadual 12.193/2023: 3% nas ações cíveis de 1º grau."><CampoNumero rotulo="Percentual das custas" valor={p.custas_pct} max={10} onChange={v => set('custas_pct', v)} /></Field>
          <Field label="Custas mínimas (R$)" dica="Corrigidas todo ano pelo TJMA. Confira a tabela vigente."><CampoNumero rotulo="Custas mínimas" valor={p.custas_piso} onChange={v => set('custas_piso', v)} /></Field>
          <Field label="Custas máximas (R$)"><CampoNumero rotulo="Custas máximas" valor={p.custas_teto} onChange={v => set('custas_teto', v)} /></Field>
        </div>
        <small className="muted">Os valores de piso e teto aqui são estimativas corrigidas pelo índice anual; atualize pela tabela oficial do TJMA (Corregedoria) a cada janeiro.</small>
      </section>

      <section className="card card-pad stack" aria-labelledby="h-oab">
        <div><h2 id="h-oab" className="section-title m-0" >Tabela de honorários mínimos da OAB-MA</h2>
          <small className="muted">Digite os valores mínimos da tabela vigente da Seccional (documento oficial no site da OAB-MA). Onde ficar preenchido, o sistema nunca sugere abaixo do mínimo. Deixe em branco o que não constar da tabela.</small></div>
        {grupos.map(g => (
          <details key={g} className="qualificacao">
            <summary>{g} <small className="muted">· {SERVICOS.filter(s => s.grupo === g && p.tabela_oab[s.id] > 0).length}/{SERVICOS.filter(s => s.grupo === g).length} preenchidos</small></summary>
            <ul className="lista-edicao mt-10" >
              {SERVICOS.filter(s => s.grupo === g).map(s => (
                <li key={s.id}>
                  <span className="grow minw-220" >{s.nome}</span>
                  <div style={{ width: 160 }}><CampoNumero rotulo={`Mínimo da OAB para ${s.nome}`} valor={p.tabela_oab[s.id] ?? 0} placeholder="R$ 0,00" onChange={v => { const t = { ...p.tabela_oab }; if (v > 0) t[s.id] = v; else delete t[s.id]; set('tabela_oab', t); }} /></div>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </section>
    </div>
  );
}
