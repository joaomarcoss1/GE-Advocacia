import { useEffect, useState } from 'react';
import { Download, FolderOpen } from 'lucide-react';
import { Badge, Field, useToast } from '@/components/ui';
import { useDados } from '@/context/Dados';
import { fmtData, isoParaBR } from '@/lib/datetime';
import { autoLigado, baixarArquivo, diasSem, escolherPasta, ligarAuto, marcarBackup, montarArquivo, nomeDaPasta, salvarNaPasta, suportaPasta, ultimoBackup } from '@/lib/backup';

/** Backup do escritório no computador: manual (com senha) e, se o navegador permitir, salvo sozinho toda semana numa pasta. */
export default function AbaBackup() {
  const { db, escritorio } = useDados();
  const toast = useToast();
  const [senha, setSenha] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [ultimo, setUltimo] = useState(ultimoBackup(escritorio.slug));
  const [pasta, setPasta] = useState<string | null>(null);
  const [auto, setAuto] = useState(autoLigado(escritorio.slug));
  useEffect(() => { void nomeDaPasta(escritorio.slug).then(setPasta); }, [escritorio.slug]);
  const dias = diasSem(ultimo);

  async function fazer(paraPasta: boolean) {
    if (senha && senha.length < 8) return toast.erro('Use uma senha de pelo menos 8 caracteres.');
    setOcupado(true);
    try {
      const a = await montarArquivo(db, escritorio, senha);
      if (paraPasta) {
        if (!(await salvarNaPasta(escritorio.slug, a.nome, a.bytes, true))) throw new Error('O navegador não liberou a pasta. Escolha a pasta de novo.');
        toast.ok(`Backup salvo em “${pasta}”.`);
      } else { baixarArquivo(a.nome, a.bytes); toast.ok('Backup baixado.'); }
      marcarBackup(escritorio.slug); setUltimo(new Date().toISOString());
    } catch (e) { toast.erro((e as Error).message); } finally { setOcupado(false); }
  }
  async function escolher() {
    try { setPasta(await escolherPasta(escritorio.slug)); } catch (e) { if ((e as Error).name !== 'AbortError') toast.erro('Não foi possível escolher a pasta.'); }
  }
  function alternarAuto(v: boolean) { ligarAuto(escritorio.slug, v); setAuto(v); }

  return (
    <div className="stack">
      <div className="row between" style={{ flexWrap: 'wrap' }}>
        <div>
          <strong>Último backup neste computador</strong>
          <div className="muted">{ultimo ? `${fmtData(isoParaBR(ultimo).data)} ${isoParaBR(ultimo).hhmm} · há ${dias} dia(s)` : 'Nenhum ainda'}</div>
        </div>
        <Badge tom={dias >= 7 ? 'warn' : 'ok'}>{dias >= 7 ? 'Semanal pendente' : 'Em dia'}</Badge>
      </div>

      <Field label="Senha do arquivo (recomendado)" dica="O backup tem dados pessoais e salários. Com senha, o arquivo é cifrado e só abre com ela. Guarde a senha: não há como recuperá-la.">
        <input className="input" type="password" autoComplete="new-password" value={senha} onChange={e => setSenha(e.target.value)} style={{ maxWidth: 360 }} />
      </Field>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button className="btn" onClick={() => fazer(false)} disabled={ocupado}><Download size={17} />{ocupado ? 'Gerando…' : 'Baixar backup agora'}</button>
        {suportaPasta() && pasta && <button className="btn ghost" onClick={() => fazer(true)} disabled={ocupado}><FolderOpen size={17} />Salvar em “{pasta}”</button>}
        {suportaPasta() && <button className="btn ghost" onClick={escolher}>{pasta ? 'Trocar pasta' : 'Escolher pasta de backup'}</button>}
      </div>
      {suportaPasta() && pasta && (
        <label className="check">
          <input type="checkbox" checked={auto} onChange={e => alternarAuto(e.target.checked)} />
          Salvar sozinho toda semana na pasta (sem senha) quando o painel for aberto por um administrador
        </label>
      )}
      {auto && <div className="notice gold" role="note">O salvamento automático grava o arquivo <strong>sem senha</strong>. Use só numa pasta de um computador protegido.</div>}
      {!suportaPasta() && <p className="hint">Este navegador não permite salvar em pasta automaticamente. Use o botão de baixar (o painel avisa quando passar uma semana).</p>}
    </div>
  );
}
