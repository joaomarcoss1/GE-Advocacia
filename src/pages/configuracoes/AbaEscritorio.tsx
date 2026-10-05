import { Field } from '@/components/ui';
import type { Config } from '@/lib/types';

export default function AbaEscritorio({ c, setC }: { c: Config; setC(c: Config): void }) {
  const campo = (k: keyof Config['escritorio'], rotulo: string) => (
    <Field label={rotulo}><input className="input" value={c.escritorio[k]} onChange={e => setC({ ...c, escritorio: { ...c.escritorio, [k]: e.target.value } })} /></Field>
  );
  return (
    <div className="grid c2">
      {campo('nome', 'Nome')}{campo('cnpj', 'CNPJ')}{campo('endereco', 'Endereço')}{campo('cidade', 'Cidade / UF')}
      {campo('telefone', 'Telefone')}{campo('email', 'E-mail')}{campo('oab_sociedade', 'Registro da sociedade na OAB')}
    </div>
  );
}
