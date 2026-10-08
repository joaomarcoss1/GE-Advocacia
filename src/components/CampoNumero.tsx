import { useEffect, useState } from 'react';
import { formatarNumero, lerNumero } from '@/lib/numero';

/** Campo numérico em português ("1.234,56"): guarda o que a pessoa digita e devolve o número (ou 0 se vazio). */
export default function CampoNumero({ valor, onChange, casas = 2, rotulo, placeholder, min = 0, max, className = 'input' }: {
  valor: number; onChange(v: number): void; casas?: number; rotulo: string; placeholder?: string; min?: number; max?: number; className?: string;
}) {
  const [texto, setTexto] = useState(valor ? formatarNumero(valor, casas) : '');
  useEffect(() => { setTexto(t => ((lerNumero(t) ?? 0) === valor ? t : valor ? formatarNumero(valor, casas) : '')); }, [valor, casas]);
  return (
    <input className={className} inputMode="decimal" aria-label={rotulo} placeholder={placeholder ?? '0'} value={texto}
      onChange={e => {
        const t = e.target.value;
        if (!/^[\d.,\sR$%]*$/.test(t)) return;
        setTexto(t);
        const n = lerNumero(t);
        onChange(n == null ? 0 : Math.min(max ?? Infinity, Math.max(min, n)));
      }}
      onBlur={() => setTexto(valor ? formatarNumero(valor, casas) : '')} />
  );
}
