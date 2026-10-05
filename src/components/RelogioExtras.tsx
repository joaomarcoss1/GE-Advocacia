import { useEffect, useState } from 'react';

const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

/** Faixa da semana (segunda a domingo) com o dia de hoje em destaque. `data` = AAAA-MM-DD no fuso do escritório. */
export function FaixaSemana({ data }: { data: string }) {
  const [a, m, d] = data.split('-').map(Number);
  const hoje = new Date(Date.UTC(a, m - 1, d, 12));
  const idx = (hoje.getUTCDay() + 6) % 7;                          // segunda = 0
  return (
    <ol className="faixa-semana" aria-label="Semana atual">
      {DIAS.map((nome, i) => {
        const dia = new Date(hoje.getTime() + (i - idx) * 86_400_000).getUTCDate();
        return <li key={nome} className={i === idx ? 'hoje' : i > 4 ? 'fds' : ''} aria-current={i === idx ? 'date' : undefined}><span>{nome}</span><b>{String(dia).padStart(2, '0')}</b></li>;
      })}
    </ol>
  );
}

/** Régua do dia (00h–24h) com a posição de agora e as horas de referência; os segundos movem o ponto de luz. */
export function ReguaDoDia({ minutos }: { minutos: number }) {
  const [seg, setSeg] = useState(() => new Date().getSeconds());
  useEffect(() => { const t = setInterval(() => setSeg(new Date().getSeconds()), 1000); return () => clearInterval(t); }, []);
  const pct = Math.min(100, Math.max(0, ((minutos + seg / 60) / 1440) * 100));
  return (
    <div className="regua-dia" role="img" aria-label={`${Math.floor(minutos / 60)} horas e ${minutos % 60} minutos do dia`}>
      <div className="regua-trilho"><i style={{ width: `${pct}%` }} /><b style={{ left: `${pct}%` }} /></div>
      <div className="regua-horas" aria-hidden="true"><span>00h</span><span>06h</span><span>12h</span><span>18h</span><span>24h</span></div>
    </div>
  );
}
