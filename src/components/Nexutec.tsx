/** Crédito discreto de desenvolvimento: apenas o texto, sem logo. */
export default function Credito({ className = '' }: { className?: string }) {
  return <p className={`credito ${className}`.trim()}>Sistema desenvolvido pela <b>Nexutec</b></p>;
}
