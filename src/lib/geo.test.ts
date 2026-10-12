import { afterEach, describe, expect, it, vi } from 'vitest';
import { avaliarLocal, calibrarCentro, lerCoordenadas, lerPosicao, limiteGps, margemGps, mediaPonderada } from './geo';

const CERCA = { geofence_lat: -2.5307, geofence_lng: -44.3068, geofence_raio_m: 100, geofence_margem_m: 30 };
/** ~1 m em graus de latitude */
const M = 1 / 111195;

describe('tolerância do GPS', () => {
  it('margem: padrão 30 m, entre 0 e 150 e arredondada (igual ao servidor)', () => {
    expect(margemGps(undefined)).toBe(30);
    expect(margemGps(null)).toBe(30);
    expect(margemGps(0)).toBe(0);
    expect(margemGps(-5)).toBe(0);
    expect(margemGps(500)).toBe(150);
    expect(margemGps(12.6)).toBe(13);
    expect(margemGps(Number.NaN)).toBe(30);
  });
  it('limite = raio + margem', () => {
    expect(limiteGps({ geofence_raio_m: 100 })).toBe(130);
    expect(limiteGps({ geofence_raio_m: 100, geofence_margem_m: 0 })).toBe(100);
  });
  it('dentro até raio + margem; além disso fora', () => {
    const ponto = (m: number, precisao = 10) => ({ lat: CERCA.geofence_lat - m * M, lng: CERCA.geofence_lng, precisao, amostras: 3 });
    expect(avaliarLocal(ponto(50), CERCA).estado).toBe('dentro');
    expect(avaliarLocal(ponto(125), CERCA).estado).toBe('dentro');     // 100 + 30
    expect(avaliarLocal(ponto(140), CERCA).estado).toBe('fora');
    expect(avaliarLocal(ponto(125), { ...CERCA, geofence_margem_m: 0 }).estado).toBe('fora');
  });
  it('fora "incerto" quando o erro do GPS poderia explicar a distância; fora "certo" quando não', () => {
    const p = (m: number, precisao: number) => ({ lat: CERCA.geofence_lat - m * M, lng: CERCA.geofence_lng, precisao, amostras: 1 });
    expect(avaliarLocal(p(160, 60), CERCA)).toMatchObject({ estado: 'fora', incerto: true });
    expect(avaliarLocal(p(400, 20), CERCA)).toMatchObject({ estado: 'fora', incerto: false });
  });
});

describe('coordenadas coladas', () => {
  it.each([
    ['-2.5307, -44.3068', -2.5307, -44.3068],
    ['-2,5307; -44,3068', -2.5307, -44.3068],
    ['-2.5307 -44.3068', -2.5307, -44.3068],
    ['https://www.google.com/maps/@-2.5307,-44.3068,17z', -2.5307, -44.3068],
    ['https://www.google.com/maps/place/X/data=!3d-2.5307!4d-44.3068', -2.5307, -44.3068],
    ['https://www.google.com/maps?q=-2.5307,-44.3068', -2.5307, -44.3068],
    ['https://www.openstreetmap.org/?mlat=-2.5307&mlon=-44.3068#map=17/-2.5307/-44.3068', -2.5307, -44.3068],
  ])('%s', (texto, lat, lng) => { expect(lerCoordenadas(texto)).toEqual({ lat, lng }); });
  it('recusa lixo, fora de faixa e zero/zero', () => {
    for (const t of ['', 'rua das flores 12', '95, 10', '10, 200', '0, 0', 'https://exemplo.com']) expect(lerCoordenadas(t)).toBeNull();
  });
});

describe('média ponderada', () => {
  it('leituras melhores pesam mais e as muito ruins são descartadas', () => {
    const base = { lat: -2.5307, lng: -44.3068, amostras: 0 };
    const r = mediaPonderada([
      { ...base, precisao: 5 }, { ...base, lat: base.lat + 2 * M, precisao: 10 },
      { ...base, lat: base.lat + 900 * M, precisao: 800 },        // leitura de antena: ignorada
    ]);
    expect(Math.abs(r.lat - base.lat) / M).toBeLessThan(2);
    expect(r.precisao).toBe(5);
  });
});

describe('leitura do GPS (várias amostras)', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  function falsoGps(leituras: Array<{ t: number; acc: number; lat?: number }>, falha?: { t: number; code: number }) {
    let ok: PositionCallback = () => undefined, erro: PositionErrorCallback = () => undefined;
    const limpar = vi.fn();
    vi.stubGlobal('navigator', { geolocation: {
      watchPosition: (a: PositionCallback, b: PositionErrorCallback) => {
        ok = a; erro = b;
        for (const l of leituras) setTimeout(() => ok({ coords: { latitude: l.lat ?? -2.5307, longitude: -44.3068, accuracy: l.acc } } as GeolocationPosition), l.t);
        if (falha) setTimeout(() => erro({ code: falha.code, message: '' } as GeolocationPositionError), falha.t);
        return 7;
      },
      clearWatch: limpar,
    } });
    return limpar;
  }

  it('fica com a melhor leitura e para quando atinge a precisão-alvo', async () => {
    vi.useFakeTimers();
    const limpar = falsoGps([{ t: 100, acc: 400 }, { t: 1500, acc: 60 }, { t: 3000, acc: 18 }, { t: 4000, acc: 5 }]);
    const p = lerPosicao({ alvoM: 25 });
    await vi.advanceTimersByTimeAsync(3100);
    await expect(p).resolves.toMatchObject({ precisao: 18, amostras: 3 });
    expect(limpar).toHaveBeenCalledWith(7);
  });
  it('sem atingir o alvo, entrega a melhor leitura ao fim do tempo de refino', async () => {
    vi.useFakeTimers();
    falsoGps([{ t: 100, acc: 300 }, { t: 2000, acc: 90 }, { t: 5000, acc: 120 }]);
    const p = lerPosicao({ alvoM: 20, maxMs: 6000 });
    await vi.advanceTimersByTimeAsync(7000);
    await expect(p).resolves.toMatchObject({ precisao: 90 });
  });
  it('permissão negada é informada na hora', async () => {
    vi.useFakeTimers();
    falsoGps([], { t: 50, code: 1 });
    const p = lerPosicao();
    const r = p.catch(e => e);
    await vi.advanceTimersByTimeAsync(100);
    await expect(r).resolves.toMatchObject({ estado: 'negado' });
  });
  it('sem nenhuma resposta, desiste com mensagem clara', async () => {
    vi.useFakeTimers();
    falsoGps([]);
    const r = lerPosicao().catch(e => e);
    await vi.advanceTimersByTimeAsync(26000);
    await expect(r).resolves.toMatchObject({ estado: 'erro' });
  });
  it('calibração: média das leituras durante o tempo definido', async () => {
    vi.useFakeTimers();
    falsoGps([{ t: 500, acc: 12, lat: -2.5307 }, { t: 1500, acc: 12, lat: -2.5307 + 4 * M }, { t: 2500, acc: 12, lat: -2.5307 + 2 * M }]);
    const p = calibrarCentro({ duracaoMs: 4000 });
    await vi.advanceTimersByTimeAsync(4100);
    const r = await p;
    expect(r.amostras).toBe(3);
    expect(Math.abs(r.lat - (-2.5307 + 2 * M)) / M).toBeLessThan(0.5);
  });
});
