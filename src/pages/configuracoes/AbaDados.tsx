import { Download, RotateCcw } from 'lucide-react';
import { useConfirm } from '@/components/ui';
import { useDados } from '@/context/Dados';

/** Cópia dos dados do PRÓPRIO escritório e (no modo demonstração) restauração. */
export default function AbaDados() {
  const { db, auditar, escritorio } = useDados();
  const confirmar = useConfirm();

  async function backup() {
    if (!(await confirmar('O arquivo contém dados pessoais (nomes, CPF, salários e dados de pagamento). Guarde-o em local seguro e não o envie por canais abertos. O download será registrado na auditoria. Continuar?', { rotulo: 'Baixar backup' }))) return;
    const dump: Record<string, unknown> = {};
    for (const k of ['cargos', 'escalas', 'funcionarios', 'registros', 'ocorrencias', 'feriados', 'ajustes', 'folhas'] as const) dump[k] = await db[k].list();
    dump.config = await db.config.get();
    dump.escritorio = { nome: escritorio.nome, slug: escritorio.slug };
    const semPin = JSON.parse(JSON.stringify(dump, (k, v) => (k === 'pin_hash' ? undefined : v)));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(semPin, null, 2)], { type: 'application/json' }));
    a.download = `backup-${escritorio.slug}-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(a.href);
    await auditar('Backup exportado', 'JSON com dados pessoais (sem PINs)');
  }
  async function restaurarDemo() {
    if (!(await confirmar('Apagar TODOS os dados de demonstração deste navegador (de todos os escritórios de exemplo) e voltar ao estado inicial?', { perigo: true, rotulo: 'Apagar e restaurar' }))) return;
    Object.keys(localStorage).filter(k => k.startsWith('ge.v1.')).forEach(k => localStorage.removeItem(k));
    location.href = '/entrar';
  }

  return (
    <>
      <div className="row"><button className="btn ghost" onClick={backup}><Download size={17} />Baixar backup (JSON)</button>
        {db.modo === 'local' && <button className="btn danger ghost" onClick={restaurarDemo}><RotateCcw size={17} />Restaurar dados de demonstração</button>}</div>
      <p className="hint">Modo de dados: <strong>{db.modo === 'local' ? 'demonstração (navegador)' : 'Supabase'}</strong>. O backup é só deste escritório e não inclui PINs. {db.modo === 'supabase' && 'O backup completo e criptografado do banco é feito automaticamente fora do Supabase (veja docs/RESTAURACAO.md).'}</p>
    </>
  );
}
