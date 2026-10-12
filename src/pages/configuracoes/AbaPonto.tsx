import { useState } from 'react';
import { ClipboardPaste, Crosshair, ExternalLink, LocateFixed } from 'lucide-react';
import { Field, useConfirm, useToast } from '@/components/ui';
import { useDados } from '@/context/Dados';
import { mesclarConfig } from '@/lib/config';
import { calibrarCentro, fmtDistancia, lerCoordenadas, lerPosicao, limiteGps, linkMapa, margemGps, MARGEM_GPS_MAX, type Posicao } from '@/lib/geo';
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
  const [progresso, setProgresso] = useState<{ precisao: number; amostras: number } | null>(null);
  const [colado, setColado] = useState('');
  const p = c.ponto;
  const temLocal = p.geofence_lat != null && p.geofence_lng != null;

  async function posicaoAtual(): Promise<Posicao | null> {
    setLendoGps(true); setProgresso(null);
    try { return await lerPosicao({ aoProgresso: setProgresso }); }
    catch (e) { toast.erro((e as { mensagem?: string }).mensagem ?? 'Não foi possível obter a localização.'); return null; }
    finally { setLendoGps(false); setProgresso(null); }
  }
  /** Grava o novo centro da cerca depois de confirmar com quem configura. */
  async function aplicarCentro(lat: number, lng: number, origem: string, precisao?: number) {
    const aviso = precisao !== undefined && precisao > 50 ? ` Atenção: a precisão do GPS foi ±${Math.round(precisao)} m. Para ficar mais exato, repita ao ar livre, perto de uma janela ou com o Wi-Fi ligado.` : '';
    const ok = await confirmar(
      `Definir ${lat}, ${lng} como o escritório (${origem}${precisao !== undefined ? `, precisão ±${Math.round(precisao)} m` : ''})? O ponto só poderá ser batido a até ${limiteGps({ geofence_raio_m: p.geofence_raio_m, geofence_margem_m: p.geofence_margem_m })} m daqui.${aviso}`,
      { rotulo: 'Definir e salvar' });
    if (!ok) return;
    const novo = mesclarConfig({ ...c, ponto: { ...p, geofence_ativo: true, geofence_lat: lat, geofence_lng: lng } });
    try {
      await db.config.save(novo);
      await auditar('Localização do escritório redefinida', `${lat}, ${lng} · ${origem} · raio ${novo.ponto.geofence_raio_m} m`);
      setC(novo); setTeste(null); toast.ok('Nova localização do escritório salva.'); await recarregar();
    } catch (e) { toast.erro((e as Error).message); }
  }
  /** Calibra o centro pelo GPS: ~15 s de leituras, média ponderada pela precisão. Faça de dentro do escritório. */
  async function calibrarPeloGps() {
    setLendoGps(true); setProgresso(null);
    try {
      const pos = await calibrarCentro({ aoProgresso: setProgresso });
      setLendoGps(false); setProgresso(null);
      await aplicarCentro(Number(pos.lat.toFixed(6)), Number(pos.lng.toFixed(6)), `${pos.amostras} leituras do GPS`, pos.precisao);
    } catch (e) { toast.erro((e as { mensagem?: string }).mensagem ?? 'Não foi possível obter a localização.'); }
    finally { setLendoGps(false); setProgresso(null); }
  }
  async function aplicarColado() {
    const xy = lerCoordenadas(colado);
    if (!xy) return toast.erro('Não encontrei coordenadas. Cole algo como "-2.5307, -44.3068" ou o link do Google Maps (botão Compartilhar).');
    await aplicarCentro(Number(xy.lat.toFixed(6)), Number(xy.lng.toFixed(6)), 'coordenadas coladas');
    setColado('');
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

        <div className="stack" data-testid="definir-local">
          <strong>1. Onde fica o escritório</strong>
          <div className="row g-8 fx-wrap">
            <button className="btn" disabled={lendoGps} onClick={calibrarPeloGps}><LocateFixed size={16} />{lendoGps && progresso ? `Calibrando… ±${Math.round(progresso.precisao)} m (${progresso.amostras} leituras)` : lendoGps ? 'Obtendo localização…' : 'Estou no escritório: calibrar pelo GPS'}</button>
            <button className="btn ghost" disabled={lendoGps || !temLocal} onClick={testarDistancia}><Crosshair size={16} />Testar minha distância</button>
            {temLocal && <a className="btn ghost" href={linkMapa(p.geofence_lat!, p.geofence_lng!)} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} />Ver no mapa</a>}
          </div>
          <div className="row g-8 fx-nowrap">
            <input className="input" aria-label="Colar coordenadas ou link do Google Maps" placeholder="Ou cole as coordenadas / o link do Google Maps do escritório" value={colado} onChange={e => setColado(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void aplicarColado(); }} />
            <button className="btn ghost" disabled={!colado.trim()} onClick={aplicarColado}><ClipboardPaste size={16} />Aplicar</button>
          </div>
          <details>
            <summary className="hint">Informar latitude e longitude manualmente</summary>
            <div className="grid c2 mt-8">
              <Field label="Latitude"><input className="input" inputMode="decimal" value={p.geofence_lat ?? ''} onChange={e => ponto({ geofence_lat: coord(e.target.value) })} /></Field>
              <Field label="Longitude"><input className="input" inputMode="decimal" value={p.geofence_lng ?? ''} onChange={e => ponto({ geofence_lng: coord(e.target.value) })} /></Field>
            </div>
          </details>
        </div>

        <div className="stack">
          <strong>2. Quanto de distância é aceito</strong>
          <div className="row g-8 fx-wrap" role="group" aria-label="Raio permitido">
            {[50, 100, 200, 300, 500].map(r => <button key={r} type="button" className={`btn sm ${p.geofence_raio_m === r ? '' : 'ghost'}`} aria-pressed={p.geofence_raio_m === r} onClick={() => ponto({ geofence_raio_m: r })}>{r} m</button>)}
          </div>
          <div className="grid c2">
            <Field label="Raio permitido (metros)" dica="Distância máxima do ponto central. Escritório em sala ou andar: 50 a 100 m. Prédio grande ou quarteirão: 200 a 300 m."><input className="input" inputMode="numeric" value={p.geofence_raio_m} onChange={e => ponto({ geofence_raio_m: num(e.target.value) })} /></Field>
            <Field label={`Tolerância do GPS (0 a ${MARGEM_GPS_MAX} m)`} dica="O aparelho erra algumas dezenas de metros, principalmente dentro de prédios. Somada ao raio. Padrão: 30 m."><input className="input" inputMode="numeric" value={p.geofence_margem_m ?? 30} onChange={e => ponto({ geofence_margem_m: margemGps(num(e.target.value)) })} /></Field>
          </div>
          <p className="hint m-0" data-testid="limite-gps">Limite efetivo: <strong>{limiteGps(p)} m</strong> a partir do ponto central ({p.geofence_raio_m} m de raio + {margemGps(p.geofence_margem_m)} m de tolerância).</p>
        </div>
        {teste && (
          <div className={`notice ${teste.dist <= p.geofence_raio_m ? 'ok' : 'bad'}`} role="status">
            Você está a <strong>{fmtDistancia(teste.dist)}</strong> do centro (limite {fmtDistancia(p.geofence_raio_m)}) — {teste.dist <= p.geofence_raio_m ? 'dentro da área, o ponto seria permitido.' : 'fora da área, o ponto seria bloqueado.'} Precisão do GPS: ±{Math.round(teste.precisao)} m.
          </div>
        )}
        <p className="hint m-0">Para calibrar, fique <strong>dentro do escritório</strong>, de preferência perto de uma janela e com o Wi-Fi ligado: o sistema colhe leituras por cerca de 15 segundos e usa a média, bem mais exata que uma leitura só. Calibrar e colar coordenadas salvam na hora; raio e tolerância valem ao clicar em <em>Salvar</em>. Cada escritório tem a própria cerca. O GPS vem do aparelho; a cerca reduz fraudes comuns, e a auditoria e a aprovação de ajustes cobrem o resto.</p>
      </div>
    </>
  );
}
