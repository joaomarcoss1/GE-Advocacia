import { MapPin, MapPinOff } from 'lucide-react';
import { fmtDistancia, type EstadoLocal } from '@/lib/geo';

/** Situação da cerca de GPS: dentro, fora, verificando ou localização indisponível. */
export default function StatusLocal({ local, raio, onVerificar, compacto }: { local: EstadoLocal; raio: number; onVerificar: () => void; compacto?: boolean }) {
  const ok = local.estado === 'dentro';
  const carregando = local.estado === 'verificando';
  const Ic = ok ? MapPin : MapPinOff;
  let titulo = 'Verificando sua localização…', detalhe = 'Autorize o acesso à localização se o navegador pedir.';
  if (local.estado === 'dentro') { titulo = 'Você está no escritório'; detalhe = `A ${fmtDistancia(local.distancia)} do ponto central · limite ${fmtDistancia(raio)}${local.precisao > 100 ? ` · sinal de GPS impreciso (±${fmtDistancia(local.precisao)})` : ''}`; }
  else if (local.estado === 'fora') { titulo = 'Fora da área permitida'; detalhe = `Você está a ${fmtDistancia(local.distancia)} do escritório e o limite é ${fmtDistancia(raio)}. O registro de ponto está bloqueado.${local.precisao > 100 ? ` Sinal de GPS impreciso (±${fmtDistancia(local.precisao)}): vá para um local aberto e verifique de novo.` : ''}`; }
  else if (local.estado === 'negado' || local.estado === 'indisponivel' || local.estado === 'erro') { titulo = local.estado === 'negado' ? 'Localização bloqueada' : 'Localização indisponível'; detalhe = local.mensagem; }
  return (
    <div className={`geo ${carregando ? 'wait' : ok ? 'ok' : 'bad'} ${compacto ? 'compacto' : ''}`} role="status" aria-live="polite">
      <span className="geo-ic"><Ic size={compacto ? 18 : 22} strokeWidth={1.8} /></span>
      <span className="grow"><strong>{titulo}</strong><br /><span className="geo-d">{detalhe}</span></span>
      {!carregando && <button type="button" className="btn ghost sm" onClick={onVerificar}>Verificar de novo</button>}
    </div>
  );
}
