import { Clock, FileCheck2, ShieldCheck } from 'lucide-react';

/** Arte discreta do lado do formulário nas telas de entrada: cantos finos, fio com losango e anéis suaves. Só decoração. */
export default function AuthArte() {
  return (
    <div className="auth-arte" aria-hidden="true">
      <span className="aa-aneis"><i /><i /></span>
      <span className="aa-cantos"><i /><i /><i /><i /></span>
      <span className="aa-fio"><i /></span>
    </div>
  );
}

/** Três selos temáticos (horário, segurança, documento) abaixo do cartão; ficam no fluxo da página para nunca sobrepor o conteúdo. */
export function AuthSelos() {
  return (
    <div className="aa-selos" aria-hidden="true">
      <span className="s"><Clock strokeWidth={1.5} /></span><i className="sep" />
      <span className="s"><ShieldCheck strokeWidth={1.5} /></span><i className="sep" />
      <span className="s"><FileCheck2 strokeWidth={1.5} /></span>
    </div>
  );
}
