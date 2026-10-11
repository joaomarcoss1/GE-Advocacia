import { DELEGAVEIS, GRUPOS, PERMISSOES, expandir, type GrupoPermissao } from '@/lib/permissoes';

/** Marca ou desmarca uma permissão levando junto o que ela implica (marcar) ou o que depende dela (desmarcar). */
export function alternarPermissao(atual: ReadonlySet<string>, id: string, marcado: boolean): Set<string> {
  if (marcado) return expandir([...atual, id]);
  const saida = new Set(atual);
  saida.delete(id);
  for (const p of PERMISSOES) if (saida.has(p.id) && p.id !== id && expandir([p.id]).has(id)) saida.delete(p.id);
  return saida;
}

/** Diferença entre o que a pessoa terá e o padrão do nível: é o que se grava como "conceder" e "negar". */
export function diferenca(padrao: ReadonlySet<string>, escolhidas: ReadonlySet<string>): { conceder: string[]; negar: string[] } {
  const base = expandir(padrao);
  return {
    conceder: DELEGAVEIS.filter(id => escolhidas.has(id) && !base.has(id)),
    negar: DELEGAVEIS.filter(id => base.has(id) && !escolhidas.has(id)),
  };
}

const ORDEM: GrupoPermissao[] = ['dia', 'casos', 'financeiro', 'pessoas', 'admin'];

/**
 * Lista de permissões em grupos. As reservadas ao sócio-administrador aparecem desabilitadas;
 * `podeDar` limita o que quem edita consegue conceder (só o que ele mesmo tem).
 */
export default function EditorPermissoes({ escolhidas, onChange, podeDar, padrao }: {
  escolhidas: ReadonlySet<string>; onChange(proximas: Set<string>): void;
  podeDar?(id: string): boolean;
  /** Padrão do nível: o que difere dele ganha uma marca. */
  padrao?: ReadonlySet<string>;
}) {
  const base = padrao ? expandir(padrao) : null;
  return (
    <div>
      {ORDEM.map(g => {
        const itens = PERMISSOES.filter(p => p.grupo === g);
        return (
          <fieldset key={g} className="perm-grupo">
            <legend>{GRUPOS[g]}</legend>
            {itens.map(p => {
              const marcada = escolhidas.has(p.id);
              const bloqueada = !!p.reservada || (podeDar ? !podeDar(p.id) && !marcada : false);
              const mudou = base ? marcada !== base.has(p.id) : false;
              const id = `perm-${p.id}`;
              return (
                <div key={p.id} className="perm-linha">
                  <input id={id} type="checkbox" checked={marcada} disabled={bloqueada} onChange={e => onChange(alternarPermissao(escolhidas, p.id, e.target.checked))} />
                  <label htmlFor={id}>
                    {p.rotulo}{mudou && <span className="badge gold" style={{ marginLeft: 8 }}>{marcada ? 'a mais' : 'a menos'}</span>}
                    {(p.ajuda || p.reservada) && <span className="ajuda">{p.reservada ? 'Reservada ao sócio-administrador.' : p.ajuda}</span>}
                  </label>
                </div>
              );
            })}
          </fieldset>
        );
      })}
    </div>
  );
}
