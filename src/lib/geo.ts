import { distanciaMetros } from './ponto';
import type { ConfigPonto } from './types';

/** Tolerância padrão do GPS (m) somada ao raio: o aparelho erra dezenas de metros, sobretudo dentro de prédios. */
export const MARGEM_GPS_PADRAO = 30;
export const MARGEM_GPS_MAX = 150;
/** Mesma regra do servidor (ponto_bater): margem entre 0 e 150 m, 30 m quando não configurada. */
export const margemGps = (m?: number | null) => Math.min(Math.max(Math.round(typeof m === 'number' && Number.isFinite(m) ? m : MARGEM_GPS_PADRAO), 0), MARGEM_GPS_MAX);
/** Distância máxima aceita: raio configurado + tolerância do GPS. */
export const limiteGps = (cfg: Pick<ConfigPonto, 'geofence_raio_m'> & { geofence_margem_m?: number | null }) => cfg.geofence_raio_m + margemGps(cfg.geofence_margem_m);

/** Cerca já com local definido (latitude/longitude obrigatórias). */
export type CercaDefinida = Pick<ConfigPonto, 'geofence_raio_m'> & { geofence_lat: number; geofence_lng: number; geofence_margem_m?: number | null };

export interface Posicao { lat: number; lng: number; precisao: number; amostras: number }
export interface ProgressoGps { precisao: number; amostras: number }
export interface OpcoesLeitura {
  /** Para assim que a precisão chegar a este valor (m). */
  alvoM?: number;
  /** Tempo máximo de refinamento depois da primeira leitura (ms). */
  maxMs?: number;
  aoProgresso?: (p: ProgressoGps) => void;
}

export type EstadoLocal =
  | { estado: 'verificando'; precisao?: number }
  | { estado: 'dentro' | 'fora'; distancia: number; precisao: number; incerto?: boolean; pos?: Posicao; em?: number }
  | { estado: 'negado' | 'indisponivel' | 'erro'; mensagem: string };

const MSG = {
  indisponivel: 'Este aparelho ou navegador não oferece localização (GPS).',
  semResposta: 'Sem resposta da localização. Se o navegador pediu permissão, toque em "Permitir" e depois em "Verificar de novo".',
  negado: 'A permissão de localização foi negada. Libere a localização deste site nas configurações do navegador e tente de novo.',
  tempo: 'Não foi possível obter a localização a tempo. Vá para um local com melhor sinal e tente de novo.',
  erro: 'Não foi possível obter a localização. Ative o GPS do aparelho e tente de novo.',
};

/**
 * Lê a posição do aparelho com ALTA precisão: acompanha o GPS por alguns segundos e fica com a melhor leitura
 * (a primeira costuma vir de antena de celular/Wi-Fi, com centenas de metros de erro). Nunca usa posição antiga.
 */
export function lerPosicao({ alvoM = 25, maxMs = 10000, aoProgresso }: OpcoesLeitura = {}): Promise<Posicao> {
  return new Promise((res, rej) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return rej({ estado: 'indisponivel', mensagem: MSG.indisponivel });
    let melhor: Posicao | null = null, n = 0, fim = false;
    let id: number | undefined, prazo: ReturnType<typeof setTimeout> | undefined;
    const encerrar = (acao: () => void) => {
      if (fim) return;
      fim = true;
      if (id !== undefined) navigator.geolocation.clearWatch(id);
      if (prazo) clearTimeout(prazo);
      acao();
    };
    const concluir = () => encerrar(() => (melhor ? res({ ...melhor, amostras: n }) : rej({ estado: 'erro', mensagem: MSG.tempo })));
    // Se o usuário ignora o pedido de permissão o navegador nunca responde: não deixa a tela "verificando" para sempre.
    prazo = setTimeout(() => encerrar(() => rej({ estado: 'erro', mensagem: MSG.semResposta })), 25000);
    let refino: ReturnType<typeof setTimeout> | undefined;
    id = navigator.geolocation.watchPosition(
      p => {
        n++;
        const atual: Posicao = { lat: p.coords.latitude, lng: p.coords.longitude, precisao: p.coords.accuracy, amostras: n };
        if (!melhor || atual.precisao < melhor.precisao) melhor = atual;
        aoProgresso?.({ precisao: melhor.precisao, amostras: n });
        if (melhor.precisao <= alvoM) { if (refino) clearTimeout(refino); return concluir(); }
        if (!refino) refino = setTimeout(concluir, maxMs);              // primeira leitura: dá um tempo para o GPS refinar
      },
      e => {
        if (e.code === 1) return encerrar(() => rej({ estado: 'negado', mensagem: MSG.negado }));
        if (!melhor) return;                                             // indisponível/tempo esgotado agora: continua tentando até o prazo
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

/**
 * Calibra o CENTRO do escritório: colhe leituras por alguns segundos e faz a média ponderada pela precisão
 * (leituras melhores pesam mais). Muito mais estável do que uma leitura única.
 */
export function calibrarCentro({ duracaoMs = 15000, aoProgresso }: { duracaoMs?: number; aoProgresso?: (p: ProgressoGps) => void } = {}): Promise<Posicao> {
  return new Promise((res, rej) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return rej({ estado: 'indisponivel', mensagem: MSG.indisponivel });
    const leituras: Posicao[] = [];
    let id: number | undefined, fim = false;
    const parar = () => { if (id !== undefined) navigator.geolocation.clearWatch(id); };
    const concluir = () => {
      if (fim) return;
      fim = true; parar();
      if (!leituras.length) return rej({ estado: 'erro', mensagem: MSG.tempo });
      res(mediaPonderada(leituras));
    };
    const espera = setTimeout(concluir, Math.max(duracaoMs, 1000));
    id = navigator.geolocation.watchPosition(
      p => {
        leituras.push({ lat: p.coords.latitude, lng: p.coords.longitude, precisao: Math.max(p.coords.accuracy, 1), amostras: leituras.length + 1 });
        const melhor = Math.min(...leituras.map(l => l.precisao));
        aoProgresso?.({ precisao: melhor, amostras: leituras.length });
        if (leituras.length >= 12 && melhor <= 8) { clearTimeout(espera); concluir(); }
      },
      e => { if (e.code === 1 && !fim) { fim = true; clearTimeout(espera); parar(); rej({ estado: 'negado', mensagem: MSG.negado }); } },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

/** Média ponderada por 1/precisão² das leituras razoáveis (descarta as muito piores que a melhor, que só somam ruído). */
export function mediaPonderada(leituras: Posicao[]): Posicao {
  const melhor = Math.min(...leituras.map(l => l.precisao));
  const uteis = leituras.filter(l => l.precisao <= Math.max(melhor * 2.5, 20));
  let sw = 0, sl = 0, sg = 0;
  for (const l of uteis) { const w = 1 / (l.precisao * l.precisao); sw += w; sl += w * l.lat; sg += w * l.lng; }
  return { lat: sl / sw, lng: sg / sw, precisao: melhor, amostras: leituras.length };
}

/** Decide dentro/fora com a tolerância do GPS. Fora com "incerto" = o erro do aparelho poderia explicar a distância. */
export function avaliarLocal(p: Posicao, cfg: CercaDefinida): Extract<EstadoLocal, { distancia: number }> {
  const distancia = distanciaMetros(p.lat, p.lng, cfg.geofence_lat, cfg.geofence_lng);
  const limite = limiteGps(cfg);
  const dentro = distancia <= limite;
  return { estado: dentro ? 'dentro' : 'fora', distancia, precisao: p.precisao, incerto: !dentro && distancia - p.precisao <= limite, pos: p, em: Date.now() };
}

export async function verificarLocal(cfg: CercaDefinida, aoProgresso?: (p: ProgressoGps) => void): Promise<EstadoLocal> {
  try {
    return avaliarLocal(await lerPosicao({ aoProgresso }), cfg);
  } catch (e) {
    return e as EstadoLocal;
  }
}

/** Aceita "-2,5307, -44,3068", "-2.5307 -44.3068" ou um link do Google Maps/OpenStreetMap com as coordenadas. */
export function lerCoordenadas(texto: string): { lat: number; lng: number } | null {
  const t = decodeURIComponent(texto.trim()).replace(/\s+/g, ' ');
  const candidatos = [
    /@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/,                  // google.com/maps/@lat,lng,17z
    /!3d(-?\d{1,2}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/,              // .../data=!3d..!4d..
    /[?&](?:q|ll|query|mlat)=(-?\d{1,2}(?:\.\d+)?)(?:,|&mlon=)(-?\d{1,3}(?:\.\d+)?)/,
    /^(-?\d{1,2}(?:[.,]\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:[.,]\d+)?)$/,    // "lat, lng"
  ];
  for (const re of candidatos) {
    const m = re.exec(t);
    if (!m) continue;
    const lat = Number(m[1].replace(',', '.')), lng = Number(m[2].replace(',', '.'));
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)) return { lat, lng };
  }
  return null;
}

export const fmtDistancia = (m: number) => (m >= 1000 ? `${(m / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km` : `${Math.round(m)} m`);
export const linkMapa = (lat: number, lng: number) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;
