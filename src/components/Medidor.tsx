import { forcaSenha, validarSenha } from '@/lib/seguranca';

const FORCA = ['Muito fraca', 'Fraca', 'Razoável', 'Boa', 'Forte'];

/** Medidor visual de força de senha (a regra de aceitação é a do servidor: 10+ caracteres com letras e números). */
export default function Medidor({ senha }: { senha: string }) {
  if (!senha) return null;
  const f = validarSenha(senha) ? Math.min(forcaSenha(senha), 1) : forcaSenha(senha);
  return (
    <div className="medidor" role="status" aria-label={`Força da senha: ${FORCA[f]}`}>
      <span className="barras">{[1, 2, 3, 4].map(n => <i key={n} className={n <= f ? `on f${f}` : ''} />)}</span>
      <span className="hint">{validarSenha(senha) || FORCA[f]}</span>
    </div>
  );
}
