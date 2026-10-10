import { Field } from '@/components/ui';
import type { Config } from '@/lib/types';

const num = (v: string) => (v === '' ? 0 : Number(v.replace(',', '.')) || 0);

export default function AbaFolha({ c, setC }: { c: Config; setC(c: Config): void }) {
  return (
    <>
      <Field label="Periodicidade do pagamento">
        <select className="select maxw-280" value={c.folha.periodicidade} onChange={e => setC({ ...c, folha: { ...c.folha, periodicidade: e.target.value as 'mensal' | 'quinzenal' } })}>
          <option value="mensal">Mensal</option><option value="quinzenal">Quinzenal (1ª e 2ª quinzena)</option>
        </select>
      </Field>
      <Field label="Adicional de hora extra (%)" dica="Usado para sugerir o valor ao lançar horas extras. Para advogado empregado, confira o contrato e a convenção coletiva (art. 20 do Estatuto da OAB)."><input className="input maxw-200" inputMode="numeric" value={c.folha.hora_extra_pct} onChange={e => setC({ ...c, folha: { ...c.folha, hora_extra_pct: num(e.target.value) } })} /></Field>
      <label className="check"><input type="checkbox" checked={c.folha.descontar_atrasos} onChange={e => setC({ ...c, folha: { ...c.folha, descontar_atrasos: e.target.checked } })} />Descontar atrasos e saídas antecipadas proporcionalmente aos minutos</label>
      <p className="hint">Regra fixa: diária = salário mensal ÷ dias de trabalho previstos na escala no mês (feriados fora). Falta = 1 diária descontada. Ausência com abono remunerado não desconta.</p>
    </>
  );
}
