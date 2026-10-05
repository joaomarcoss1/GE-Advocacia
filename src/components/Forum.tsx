/**
 * Pórtico de fórum desenhado em linha fina (frontão com a balança, entablamento, seis colunas jônicas e degraus).
 * Usado como arte clássica nas telas de entrada; a cor vem do `color` do contêiner.
 */
const COLUNAS = [85, 147, 209, 271, 333, 395];
const TRIGLIFOS = Array.from({ length: 26 }, (_, i) => 66 + i * 13.6);

export default function Forum() {
  return (
    <svg className="forum" viewBox="0 0 480 320" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth=".9" strokeLinecap="round" strokeLinejoin="round">
      {/* degraus */}
      <path d="M36 292H444M26 299H454M16 306H464M36 292V299M444 292V299M26 299V306M454 299V306" />
      {/* colunas */}
      {COLUNAS.map(x => (
        <g key={x}>
          <path d={`M${x - 17} 292H${x + 17}M${x - 17} 286H${x + 17}M${x - 15} 286V280H${x + 15}V286`} />
          <path d={`M${x - 10} 280V126M${x + 10} 280V126`} />
          <path d={`M${x - 5} 279V128M${x} 279V128M${x + 5} 279V128`} strokeOpacity=".45" strokeWidth=".6" />
          <path d={`M${x - 17} 110H${x + 17}V115H${x - 17}Z`} />
          <circle cx={x - 11.5} cy="121" r="4.4" /><circle cx={x - 11.5} cy="121" r="1.6" />
          <circle cx={x + 11.5} cy="121" r="4.4" /><circle cx={x + 11.5} cy="121" r="1.6" />
          <path d={`M${x - 7} 125.4Q${x} 128.6 ${x + 7} 125.4`} />
        </g>
      ))}
      {/* entablamento */}
      <path d="M60 110H420M60 104H420M60 98H420" />
      <path d="M52 86H428M52 81H428M56 76H424M52 81V86M428 81V86" />
      <path d={TRIGLIFOS.map(x => `M${x.toFixed(1)} 88V96`).join('')} strokeOpacity=".5" strokeWidth=".6" />
      {/* frontão, com a balança no tímpano */}
      <path d="M52 76L240 14L428 76M70 71L240 21L410 71" />
      <circle cx="240" cy="50" r="13" /><circle cx="240" cy="50" r="9.6" strokeOpacity=".55" strokeWidth=".6" />
      <path d="M240 43V58M234 58H246M231 46H249M231 46L227.5 53.5H234.5ZM249 46L245.5 53.5H252.5Z" strokeWidth=".8" />
    </svg>
  );
}
