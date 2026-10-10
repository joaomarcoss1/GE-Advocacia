import { useMemo } from 'react';
import { Badge, Vazio } from '@/components/ui';
import { useDados } from '@/context/Dados';
import { situacaoHoje } from '@/lib/folhaLote';
import { iniciais } from '@/lib/format';

/** Tabela de quem está trabalhando, no intervalo, ausente etc. hoje. */
export default function Presenca() {
  const dados = useDados();
  const linhas = useMemo(() => dados.funcionarios.filter(f => f.ativo).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map(f => ({ f, s: situacaoHoje(dados, f) })), [dados]);
  const cargo = (id: string | null) => dados.cargos.find(c => c.id === id)?.nome ?? '—';
  if (!linhas.length) return <Vazio tipo="pessoas" titulo="Nenhum funcionário ativo" />;
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead><tr><th>Funcionário</th><th>Cargo</th><th>Situação hoje</th><th>Última marcação</th></tr></thead>
        <tbody>
          {linhas.map(({ f, s }) => (
            <tr key={f.id}>
              <td className="nowrap"><div className="row fx-nowrap" ><span className="avatar fs-sm" style={{ width: 32, height: 32 }}>{iniciais(f.nome)}</span><strong>{f.nome}</strong></div></td>
              <td className="muted">{cargo(f.cargo_id)}</td>
              <td><Badge tom={s.tom}>{s.rotulo}</Badge></td>
              <td className="mono">{s.hora ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
