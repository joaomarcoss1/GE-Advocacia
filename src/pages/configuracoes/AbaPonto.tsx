import { useState } from 'react';
import { Crosshair, ExternalLink, LocateFixed } from 'lucide-react';
import { Field, useConfirm, useToast } from '@/components/ui';
import { useDados } from '@/context/Dados';
import { mesclarConfig } from '@/lib/config';
import { fmtDistancia, lerPosicao, linkMapa, type Posicao } from '@/lib/geo';
import { distanciaMetros } from '@/lib/ponto';
import type { Config } from '@/lib/types';

const num = (v: string) => (v === '' ? 0 : Number(v.replace(',', '.')) || 0);
/** Campo de coordenada: aceita vazio (cerca sem local definido). */
const coord = (v: string): number | null => { const n = Number(v.replace(',', '.')); return v.trim() === '' || Number.isNaN(n) ? null : n; };

export default function AbaPonto({ c, setC }: { c: Config; setC(c: Config): void }) {
  const { db, recarregar, auditar } = useDados();
  const toast = useToast();
  const confirmar = useConfirm();
  const [lendoGps, setLendoGps] = useState(false);
  const [teste, setTeste] = useState<{ dist: number; precisao: number } | null>(null);
  const p = c.ponto;
  const temLocal = p.geofence_lat != null && p.geofence_lng != null;

  async function posicaoAtual(): Promise<Posicao | null> {
    setLendoGps(true);
    try { return await lerPosicao(); }
    catch (e) { toast.erro((e as { mensagem?: string }).mensagem ?? 'Não foi possível obter a localização.'); return null; }
    finally { setLendoGps(false); }
  }
  /** Redefine o centro da cerca para onde o administrador está agora e salva na hora. */
  async function definirMinhaLocalizacao() {
    const pos = await posicaoAtual();
    if (!pos) return;
    const lat = Number(pos.lat.toFixed(6)), lng = Number(pos.lng.toFixed(6));
    const ok = await confirmar(
      `Definir esta localização como o escritório? Novo centro: ${lat}, ${lng} (precisão ±${Math.round(pos.precisao)} m). A partir de agora o ponto só poderá ser batido a até ${p.geofence_raio_m} m daqui.${pos.precisao > 150 ? ' Atenção: o sinal de GPS está impreciso; se puder, faça isso ao ar livre ou com o Wi-Fi ligado.' : ''}`,
      { rotulo: 'Definir e salvar' });
    if (!ok) return;
    const novo = mesclarConfig({ ...c, ponto: { ...p, geofence_ativo: true, geofence_lat: lat, geofence_lng: lng } });
    try {
      await db.config.save(novo);
      await auditar('Localização do escritório redefinida', `${lat}, ${lng} · raio ${novo.ponto.geofence_raio_m} m`);
      setC(novo); setTeste(null); toast.ok('Nova localização do escritório salva.'); await recarregar();
    } catch (e) { toast.erro((e as Error).message); }
  }
  async function testarDistancia() {
    if (!temLocal) return toast.erro('Defina primeiro a localização do escritório.');
    const pos = await posicaoAtual();
    if (pos) setTeste({ dist: distanciaMetros(pos.lat, pos.lng, p.geofence_lat!, p.geofence_lng!), precisao: pos.precisao });
  }
  const ponto = (patch: Partial<Config['ponto']>) => setC({ ...c, ponto: { ...p, ...patch } });

  return (
    <>
      <div className="grid c2">
        <Field label="Tolerância (min)" dica="Diferença até este valor conta como “no horário”."><input className="input" inputMode="numeric" value={p.tolerancia_min} onChange={e => ponto({ tolerancia_min: num(e.target.value) })} /></Field>
        <Field label="Atraso / saída antecipada a partir de (min)" dica="Exige justificativa e é contado como ocorrência."><input className="input" inputMode="numeric" value={p.limite_atraso_min} onChange={e => ponto({ limite_atraso_min: num(e.target.value) })} /></Field>
      </div>
      <div className="card card-pad stack no-shadow" style={{ background: 'var(--navy-tint)' }}>
        <label className="check"><input type="checkbox" checked={p.geofence_ativo} onChange={e => ponto({ geofence_ativo: e.target.checked })} /><strong>Bloquear o ponto fora do escritório (GPS)</strong></label>
        <p className="hint m-0" >O funcionário só consegue registrar o ponto se o aparelho estiver dentro do raio abaixo. A conferência é refeita no servidor a cada registro. {!temLocal && <strong>Defina a localização antes de ativar.</strong>}</p>
        <Field label="Endereço do escritório (referência)"><input className="input" value={p.geofence_endereco} onChange={e => ponto({ geofence_endereco: e.target.value })} /></Field>
        <div className="grid c3">
          <Field label="Latitude"><input className="input" inputMode="decimal" value={p.geofence_lat ?? ''} onChange={e => ponto({ geofence_lat: coord(e.target.value) })} /></Field>
          <Field label="Longitude"><input className="input" inputMode="decimal" value={p.geofence_lng ?? ''} onChange={e => ponto({ geofence_lng: coord(e.target.value) })} /></Field>
          <Field label="Raio permitido (metros)"><input className="input" inputMode="numeric" value={p.geofence_raio_m} onChange={e => ponto({ geofence_raio_m: num(e.target.value) })} /></Field>
        </div>
        <div className="row g-8 fx-wrap" >
          <button className="btn" disabled={lendoGps} onClick={definirMinhaLocalizacao}><LocateFixed size={16} />{lendoGps ? 'Obtendo localização…' : 'Usar minha localização'}</button>
          <button className="btn ghost" disabled={lendoGps || !temLocal} onClick={testarDistancia}><Crosshair size={16} />Testar minha distância</button>
          {temLocal && <a className="btn ghost" href={linkMapa(p.geofence_lat!, p.geofence_lng!)} target="_blank" rel="noreferrer"><ExternalLink size={16} />Ver no mapa</a>}
        </div>
        {teste && (
          <div className={`notice ${teste.dist <= p.geofence_raio_m ? 'ok' : 'bad'}`} role="status">
            Você está a <strong>{fmtDistancia(teste.dist)}</strong> do centro (limite {fmtDistancia(p.geofence_raio_m)}) — {teste.dist <= p.geofence_raio_m ? 'dentro da área, o ponto seria permitido.' : 'fora da área, o ponto seria bloqueado.'} Precisão do GPS: ±{Math.round(teste.precisao)} m.
          </div>
        )}
        <p className="hint m-0" ><strong>Usar minha localização</strong> define o centro da cerca onde você está agora e salva na hora. Faça isso de dentro do escritório, de preferência com o GPS/Wi-Fi ligado. Alterações de raio, coordenadas ou endereço digitados valem ao clicar em <em>Salvar</em>. Limite técnico: o GPS vem do aparelho; a cerca reduz fraudes comuns, e a auditoria e a aprovação de ajustes cobrem o resto.</p>
      </div>
    </>
  );
}
