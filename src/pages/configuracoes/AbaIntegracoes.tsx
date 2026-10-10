import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Cloud, Link2, Unlink } from 'lucide-react';
import { Badge, useConfirm, useToast } from '@/components/ui';
import { CartaoIntegracao, PassosAtivacao } from '@/components/Integracao';
import { ErroNegocio } from '@/lib/erros';
import { useDados } from '@/context/Dados';
import type { Config, DriveStatus } from '@/lib/types';
import { plural } from '@/lib/format';

/** Integrações do escritório: Google Drive (documentos), acompanhamento de processos e automações. */
export default function AbaIntegracoes({ c, setC }: { c: Config; setC(c: Config): void }) {
  const { db, escritorio } = useDados();
  const toast = useToast();
  const confirmar = useConfirm();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [drive, setDrive] = useState<DriveStatus>({ disponivel: false, conectado: false });
  const [fonte, setFonte] = useState<{ disponivel: boolean; simulada: boolean } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [ativacao, setAtivacao] = useState<'FUNCAO_NAO_PUBLICADA' | 'GOOGLE_INDISPONIVEL' | null>(null);
  const carregar = () => db.arquivos.drive.status().then(setDrive).catch(() => undefined);
  useEffect(() => { void carregar(); db.processos.fonte().then(setFonte).catch(() => setFonte({ disponivel: false, simulada: false })); }, [db]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const d = params.get('drive');
    if (!d) return;
    if (d === 'ok') toast.ok('Google Drive conectado.'); else toast.erro('Não foi possível conectar o Google Drive.');
    void carregar(); nav('/painel/configuracoes?aba=integracoes', { replace: true });
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  async function conectar() {
    try { setOcupado(true); setAtivacao(null); window.location.href = await db.arquivos.drive.conectar(); } catch (e) {
      const cod = e instanceof ErroNegocio ? e.codigo : '';
      if (cod === 'FUNCAO_NAO_PUBLICADA' || cod === 'GOOGLE_INDISPONIVEL') setAtivacao(cod); else toast.erro((e as Error).message);
      setOcupado(false);
    }
  }
  async function desconectar() {
    if (!(await confirmar('Desconectar o Google Drive? Os arquivos já enviados continuam lá; os novos ficam só no sistema.', { rotulo: 'Desconectar', perigo: true }))) return;
    try { await db.arquivos.drive.desconectar(); toast.ok('Google Drive desconectado.'); await carregar(); } catch (e) { toast.erro((e as Error).message); }
  }
  async function reenviar() {
    setOcupado(true);
    try { const r = await db.arquivos.drive.sincronizar(); toast.ok(r.erros ? `${plural(r.enviados, 'enviado', 'enviados')}; ${r.erros} com erro.` : r.enviados ? `${plural(r.enviados, 'documento enviado', 'documentos enviados')}.` : 'Nada pendente.'); } catch (e) { toast.erro((e as Error).message); } finally { setOcupado(false); }
  }
  const auto = (patch: Partial<Config['automacao']>) => setC({ ...c, automacao: { ...c.automacao, ...patch } });

  return (
    <div className="stack">
      <CartaoIntegracao
        icone={<Cloud size={20} />}
        titulo="Google Drive"
        descricao={`Cada documento recebido é arquivado em GE Advocacia / ${escritorio.nome} / Cliente / Processo.`}
        situacao={!drive.disponivel ? 'Indisponível' : drive.conectado ? 'Conectado' : ativacao ? 'Ativação necessária' : 'Não conectado'}
        tom={drive.conectado ? 'ok' : ativacao ? 'warn' : 'mute'}
        acoes={drive.disponivel && (drive.conectado
          ? <><button className="btn ghost sm" onClick={reenviar} disabled={ocupado}>Enviar pendentes</button><button className="btn ghost sm" onClick={desconectar}><Unlink size={15} />Desconectar</button></>
          : <button className="btn sm" onClick={conectar} disabled={ocupado}><Link2 size={15} />Conectar</button>)}
      >
        {drive.conectado && drive.email && <p className="ci-conta">Conta conectada: <b>{drive.email}</b></p>}
        {ativacao && <PassosAtivacao motivo={ativacao} servico="documentos" />}
        <div className="ci-estrutura" aria-label="Como os arquivos ficam organizados no Drive">
          <span className="ci-estrutura-titulo">Como fica no Drive</span>
          <code>GE Advocacia – {escritorio.nome} / <b>Cliente</b> / <b>Processo 0001234-56…</b> / 03 · Petições e peças / 2026-10-08 · Contestação · arquivo.pdf</code>
          <ul>
            <li>Cada arquivo tem <b>duas cópias</b>: a do sistema (privada) e a do Drive; se o Drive falhar, nada se perde e o envio é refeito sozinho.</li>
            <li>O sistema só enxerga o que ele mesmo criou no Drive (permissão mínima). Seus outros arquivos continuam fora do alcance.</li>
            <li>Excluir no sistema manda a cópia do Drive para a <b>lixeira</b> (recuperável por 30 dias).</li>
            <li>Dica: conecte uma conta Google do escritório (não a pessoal) e ative a verificação em duas etapas nela.</li>
          </ul>
        </div>
        <label className="check" style={{ marginTop: 12 }}><input type="checkbox" checked={c.automacao.enviar_drive} onChange={e => auto({ enviar_drive: e.target.checked })} />Enviar sozinho para o Drive cada documento recebido</label>
      </CartaoIntegracao>

      <section className="integracao">
        <div className="row between" style={{ flexWrap: 'wrap' }}>
          <strong>Acompanhamento de processos</strong>
          <Badge tom={fonte?.disponivel ? (fonte.simulada ? 'mute' : 'ok') : 'mute'}>{!fonte ? '…' : fonte.simulada ? 'Simulado (demonstração)' : fonte.disponivel ? 'Consulta automática ativa' : 'Indisponível'}</Badge>
        </div>
        <label className="check" style={{ marginTop: 12 }}><input type="checkbox" checked={c.automacao.tarefa_andamento} onChange={e => auto({ tarefa_andamento: e.target.checked })} />Criar uma tarefa para o responsável quando o andamento exigir ação (sentença, intimação, citação...)</label>
      </section>
    </div>
  );
}
