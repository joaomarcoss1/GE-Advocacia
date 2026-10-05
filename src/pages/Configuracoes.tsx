import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Abas, PageHeader, useToast } from '@/components/ui';
import { useDados } from '@/context/Dados';
import { mesclarConfig } from '@/lib/config';
import type { Config } from '@/lib/types';
import AbaAcessos from './configuracoes/AbaAcessos';
import AbaAuditoria from './configuracoes/AbaAuditoria';
import AbaDados from './configuracoes/AbaDados';
import AbaEscritorio from './configuracoes/AbaEscritorio';
import AbaBackup from './configuracoes/AbaBackup';
import AbaFolha from './configuracoes/AbaFolha';
import AbaIntegracoes from './configuracoes/AbaIntegracoes';
import AbaPonto from './configuracoes/AbaPonto';
import AbaPrivacidade from './configuracoes/AbaPrivacidade';

type Aba = 'escritorio' | 'ponto' | 'folha' | 'acessos' | 'integracoes' | 'backup' | 'privacidade' | 'auditoria' | 'dados';
const ABAS: Aba[] = ['escritorio', 'ponto', 'folha', 'acessos', 'integracoes', 'backup', 'privacidade', 'auditoria', 'dados'];
/** Abas cujo conteúdo é um formulário de configuração (mostram o botão Salvar). */
const COM_SALVAR = new Set<Aba>(['escritorio', 'ponto', 'folha', 'privacidade', 'integracoes']);

export default function Configuracoes() {
  const { db, config, recarregar, auditar } = useDados();
  const toast = useToast();
  const [params] = useSearchParams();
  const abaInicial = params.get('aba') as Aba | null;
  const [aba, setAba] = useState<Aba>(abaInicial && ABAS.includes(abaInicial) ? abaInicial : 'escritorio');
  const [c, setC] = useState<Config>(config);
  useEffect(() => setC(config), [config]);

  async function salvar() {
    if (c.ponto.geofence_ativo && (c.ponto.geofence_lat == null || c.ponto.geofence_lng == null)) {
      return toast.erro('Para bloquear o ponto fora do escritório, defina a localização (use “Usar minha localização” ou informe latitude e longitude).');
    }
    try { await db.config.save(mesclarConfig(c)); await auditar('Configurações alteradas', aba); toast.ok('Configurações salvas.'); await recarregar(); }
    catch (e) { toast.erro((e as Error).message); }
  }

  return (
    <>
      <PageHeader titulo="Configurações" />
      <div className="card">
        <div style={{ padding: '0 12px' }}>
          <Abas valor={aba} onChange={setAba} itens={[
            { id: 'escritorio', rotulo: 'Escritório' }, { id: 'ponto', rotulo: 'Ponto' }, { id: 'folha', rotulo: 'Folha' }, { id: 'acessos', rotulo: 'Acessos' },
            { id: 'integracoes', rotulo: 'Integrações' }, { id: 'backup', rotulo: 'Backup' }, { id: 'privacidade', rotulo: 'Privacidade' }, { id: 'auditoria', rotulo: 'Auditoria' }, { id: 'dados', rotulo: 'Dados' },
          ]} />
        </div>
        <div className="card-pad stack">
          {aba === 'escritorio' && <AbaEscritorio c={c} setC={setC} />}
          {aba === 'ponto' && <AbaPonto c={c} setC={setC} />}
          {aba === 'folha' && <AbaFolha c={c} setC={setC} />}
          {aba === 'acessos' && <AbaAcessos />}
          {aba === 'integracoes' && <AbaIntegracoes c={c} setC={setC} />}
          {aba === 'backup' && <AbaBackup />}
          {aba === 'privacidade' && <AbaPrivacidade c={c} setC={setC} />}
          {aba === 'auditoria' && <AbaAuditoria />}
          {aba === 'dados' && <AbaDados />}
          {COM_SALVAR.has(aba) && <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}><button className="btn" onClick={salvar}>Salvar alterações</button></div>}
        </div>
      </div>
    </>
  );
}
