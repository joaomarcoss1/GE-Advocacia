import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getDb, type ArquivoAnexo, type ContextoPonto, type JustificativaFunc, type MarcacaoHistorico, type PessoaPonto, type PontoApi } from '@/data/db';
import { addDays, agoraBR, definirFuso, isoParaBR, type AgoraBR } from '@/lib/datetime';
import { PONTO_ERRO_MSG } from '@/lib/erros';
import { semAcento } from '@/lib/format';
import { lerPosicao, verificarLocal, type EstadoLocal } from '@/lib/geo';
import { classificar, previstoDoTipo, proximoTipo, sequenciaDoDia, turnoDaData } from '@/lib/ponto';
import type { Escala, TipoMarcacao, TipoOcorrencia } from '@/lib/types';

export type Etapa = 'pessoa' | 'pin' | 'painel';
export type FalhaEscritorio = 'ESCRITORIO_NAO_ENCONTRADO' | 'ESCRITORIO_SUSPENSO';
export interface SucessoPonto { tipo: TipoMarcacao; status: string; hora: string; dif: number; analise?: string | null; aviso?: string }

/**
 * Estado e ações da tela pública de ponto de UM escritório (o endereço /ponto/<slug> define qual).
 * Proteção contra duplo toque: toda ação que grava passa por `comTrava`, que ignora um segundo clique
 * enquanto o primeiro não terminou (o banco também barra a duplicidade por índice único).
 */
export function usePonto(slug: string) {
  const [api, setApi] = useState<PontoApi | null>(null);
  const [modo, setModo] = useState<'local' | 'supabase'>('local');
  const [ctx, setCtx] = useState<ContextoPonto | null>(null);
  const [falhaEsc, setFalhaEsc] = useState<FalhaEscritorio | null>(null);
  const [achadas, setAchadas] = useState<PessoaPonto[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [busca, setBusca] = useState('');
  const [tentou, setTentou] = useState(false);
  const [etapa, setEtapa] = useState<Etapa>('pessoa');
  const [pessoa, setPessoa] = useState<PessoaPonto | null>(null);
  const [escala, setEscala] = useState<Escala | null>(null);
  const [pin, setPin] = useState('');
  const [erro, setErro] = useState('');
  const [hist, setHist] = useState<MarcacaoHistorico[]>([]);
  const [agora, setAgora] = useState<AgoraBR>(agoraBR());
  const [escolha, setEscolha] = useState<TipoMarcacao | null>(null);
  const [just, setJust] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [sucesso, setSucesso] = useState<SucessoPonto | null>(null);
  const [retro, setRetro] = useState(false);
  const [retroForm, setRetroForm] = useState({ data: '', tipo: 'entrada' as TipoMarcacao, hora: '', justificativa: '' });
  const [retroOk, setRetroOk] = useState(false);
  const [arqAtraso, setArqAtraso] = useState<ArquivoAnexo[]>([]);
  const [justs, setJusts] = useState<JustificativaFunc[]>([]);
  const [aus, setAus] = useState(false);
  const [ausForm, setAusForm] = useState({ tipo: 'atestado' as TipoOcorrencia, inicio: '', fim: '', obs: '' });
  const [ausArq, setAusArq] = useState<ArquivoAnexo[]>([]);
  const [ausOk, setAusOk] = useState(false);
  const [local, setLocal] = useState<EstadoLocal>({ estado: 'verificando' });
  const [volta, setVolta] = useState<number | null>(null);
  const ocioso = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const trava = useRef(false);

  // Modo quiosque (tablet na recepção): relógio grande, botões maiores e reinício rápido. Guardado neste aparelho.
  const [params] = useSearchParams();
  const [quiosque, setQuiosque] = useState(() => { try { return params.get('quiosque') === '1' || localStorage.getItem('ge.quiosque') === '1'; } catch { return false; } });
  const tempoVolta = quiosque ? 6 : 8;
  function alternarQuiosque() {
    const novo = !quiosque;
    setQuiosque(novo);
    try { localStorage.setItem('ge.quiosque', novo ? '1' : '0'); } catch { /* sem armazenamento */ }
    if (novo) document.documentElement.requestFullscreen?.().catch(() => undefined);
    else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
  }

  const cerca = !!ctx?.ponto.geofence_ativo;
  const dentro = !cerca || local.estado === 'dentro';

  /** Executa uma ação de gravação uma única vez por vez (protege contra duplo toque). */
  async function comTrava(acao: () => Promise<void>) {
    if (trava.current) return;
    trava.current = true; setEnviando(true);
    try { await acao(); }
    catch (e) { setErro((e as Error).message); }
    finally { trava.current = false; setEnviando(false); }
  }

  const checarLocal = useCallback(async () => {
    if (!ctx?.ponto.geofence_ativo || ctx.ponto.geofence_lat == null || ctx.ponto.geofence_lng == null) return;
    setLocal({ estado: 'verificando' });
    setLocal(await verificarLocal({ ...ctx.ponto, geofence_lat: ctx.ponto.geofence_lat, geofence_lng: ctx.ponto.geofence_lng }));
  }, [ctx]);

  // Carrega o escritório do endereço
  useEffect(() => {
    let vivo = true;
    getDb().then(async db => {
      const a = db.ponto.para(slug);
      const r = await a.contexto();
      if (!vivo) return;
      setApi(a); setModo(db.modo);
      if (r.ok) { definirFuso(r.ctx.fuso); setCtx(r.ctx); setAgora(agoraBR()); } else setFalhaEsc(r.erro);
    });
    const t = setInterval(() => setAgora(agoraBR()), 1000);
    return () => { vivo = false; clearInterval(t); };
  }, [slug]);

  // Ao abrir o app (e sempre que o aparelho volta para esta tela), confere se o funcionário está dentro do raio.
  useEffect(() => {
    if (!cerca) return;
    checarLocal();
    const aoVoltar = () => { if (document.visibilityState === 'visible') checarLocal(); };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => document.removeEventListener('visibilitychange', aoVoltar);
  }, [cerca, checarLocal]);

  const voltar = useCallback(() => {
    setEtapa('pessoa'); setPessoa(null); setPin(''); setErro(''); setHist([]); setEscolha(null); setJust('');
    setSucesso(null); setRetro(false); setRetroOk(false); setBusca(''); setTentou(false);
    setArqAtraso([]); setJusts([]); setAus(false); setAusArq([]); setAusOk(false);
  }, []);

  // Trava de segurança: volta à lista após 2 min sem interação no painel
  useEffect(() => {
    if (etapa === 'pessoa') return;
    clearTimeout(ocioso.current);
    ocioso.current = setTimeout(voltar, quiosque ? 45_000 : 120_000);
    return () => clearTimeout(ocioso.current);
  }, [etapa, escolha, just, sucesso, retro, hist, pin, voltar, quiosque]);

  // Depois de registrar: vibra (celular) e volta sozinho à tela inicial, para o próximo funcionário não ficar com a sessão aberta.
  useEffect(() => {
    if (!sucesso) { setVolta(null); return; }
    try { navigator.vibrate?.([35, 60, 35]); } catch { /* aparelho sem vibração */ }
    setVolta(tempoVolta);
  }, [sucesso, tempoVolta]);
  useEffect(() => {
    if (volta === null) return;
    if (volta <= 0) { voltar(); return; }
    const t = setTimeout(() => setVolta(v => (v === null ? v : v - 1)), 1000);
    return () => clearTimeout(t);
  }, [volta, voltar]);
  useEffect(() => { if (erro) { try { navigator.vibrate?.(140); } catch { /* sem vibração */ } } }, [erro]);

  useEffect(() => {
    if (etapa !== 'pin') return;
    const h = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) setPin(p => (p.length < 8 ? p + e.key : p));
      else if (e.key === 'Backspace') setPin(p => p.slice(0, -1));
      else if (e.key === 'Escape') voltar();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [etapa, voltar]);

  // A equipe nunca é baixada por inteira: a busca roda no servidor (mín. 3 letras, no máx. 5 resultados).
  const termo = semAcento(busca.trim());
  useEffect(() => {
    if (!api || termo.length < 3) { setAchadas([]); setBuscando(false); return; }
    setBuscando(true);
    let vivo = true;
    const t = setTimeout(async () => {
      try { const r = await api.buscar(busca.trim()); if (vivo) setAchadas(r); }
      catch { if (vivo) setAchadas([]); }
      finally { if (vivo) setBuscando(false); }
    }, 250);
    return () => { vivo = false; clearTimeout(t); };
  }, [api, busca, termo.length]);
  const filtradas = termo.length < 3 ? [] : achadas;

  async function escolherPessoa(p: PessoaPonto) {
    setPessoa(p); setEtapa('pin'); setPin(''); setErro('');
    setEscala(p.escala_id && api ? await api.escala(p.escala_id) : null);
  }
  async function buscar() {
    setTentou(true);
    if (!api || termo.length < 3) return;
    // busca imediata (sem esperar o intervalo da digitação); se houver um único resultado, já segue
    setBuscando(true);
    try {
      const r = await api.buscar(busca.trim());
      setAchadas(r);
      if (r.length === 1) escolherPessoa(r[0]);
    } catch { setAchadas([]); }
    finally { setBuscando(false); }
  }

  async function carregarHistorico(fid: string, pinAtual: string) {
    if (!api) return false;
    const r = await api.historico(fid, pinAtual, 30);
    if (!r.ok) { setErro(PONTO_ERRO_MSG[r.erro]); return false; }
    setHist(r.registros); setJusts(r.justificativas ?? []);
    return true;
  }
  const validarPin = () => comTrava(async () => {
    if (!pessoa) return;
    setErro('');
    if (await carregarHistorico(pessoa.id, pin)) setEtapa('painel'); else setPin('');
  });

  const turnoHoje = turnoDaData(escala, agora.data);
  const hojeRegs = hist.filter(r => r.data === agora.data && r.status_aprovacao !== 'rejeitado');
  const proximo = proximoTipo(hojeRegs, turnoHoje);
  const sequencia = sequenciaDoDia(turnoHoje);
  const previa = useMemo(() => {
    if (!escolha || !ctx) return null;
    const previsto = previstoDoTipo(turnoHoje, escolha);
    return { previsto, ...classificar(escolha, previsto, agora.minutos, ctx.ponto) };
  }, [escolha, ctx, turnoHoje, agora.minutos]);

  /** Leitura nova no momento do registro (a do carregamento pode estar velha). */
  async function obterGps(): Promise<{ lat: number; lng: number } | null> {
    if (!ctx?.ponto.geofence_ativo) return null;
    try { const p = await lerPosicao(); return { lat: p.lat, lng: p.lng }; }
    catch (e) { throw new Error((e as { mensagem?: string }).mensagem ?? PONTO_ERRO_MSG.GPS_OBRIGATORIO); }
  }

  const confirmar = () => comTrava(async () => {
    if (!pessoa || !escolha || !api) return;
    setErro('');
    const gps = await obterGps();
    const r = await api.bater({ funcionario_id: pessoa.id, pin, tipo: escolha, justificativa: just, lat: gps?.lat, lng: gps?.lng });
    if (!r.ok) {
      setErro(PONTO_ERRO_MSG[r.erro] + (r.detalhe && r.erro === 'FORA_DA_AREA' ? ` (${r.detalhe})` : ''));
      if (r.erro === 'PIN_INVALIDO' || r.erro === 'PIN_BLOQUEADO') voltar();
      if (r.erro === 'FORA_DA_AREA' || r.erro === 'GPS_OBRIGATORIO') { setEscolha(null); checarLocal(); }
      if (r.erro === 'JA_REGISTRADO') { setEscolha(null); await carregarHistorico(pessoa.id, pin); }
      return;
    }
    // anexos do atraso (atestado etc.): vão para o administrador junto com a justificativa
    let aviso: string | undefined;
    for (const arq of arqAtraso) {
      const a = await api.anexar({ funcionario_id: pessoa.id, pin, registro_id: r.id, arquivo: arq });
      if (!a.ok) { aviso = `Ponto registrado, mas o arquivo "${arq.nome}" não foi enviado: ${PONTO_ERRO_MSG[a.erro]}`; break; }
    }
    setSucesso({ tipo: escolha, status: r.status, hora: isoParaBR(r.horario_real).hhmm, dif: r.diferenca_minutos, analise: r.analise, aviso });
    setEscolha(null); setJust(''); setArqAtraso([]);
    await carregarHistorico(pessoa.id, pin);
  });

  const enviarAusencia = () => comTrava(async () => {
    if (!pessoa || !api) return;
    setErro('');
    const r = await api.justificarAusencia({ funcionario_id: pessoa.id, pin, inicio: ausForm.inicio, fim: ausForm.fim, tipo: ausForm.tipo, observacao: ausForm.obs });
    if (!r.ok) { setErro(r.erro === 'JA_REGISTRADO' ? 'Já existe um envio ou ocorrência para esse período.' : PONTO_ERRO_MSG[r.erro]); return; }
    for (const arq of ausArq) {
      const a = await api.anexar({ funcionario_id: pessoa.id, pin, ocorrencia_id: r.id, arquivo: arq });
      if (!a.ok) { setErro(`Justificativa enviada, mas o arquivo "${arq.nome}" não foi: ${PONTO_ERRO_MSG[a.erro]}`); break; }
    }
    setAusOk(true); setAus(false); setAusArq([]);
    await carregarHistorico(pessoa.id, pin);
  });

  const enviarRetro = () => comTrava(async () => {
    if (!pessoa || !api) return;
    setErro('');
    const r = await api.retroativo({ funcionario_id: pessoa.id, pin, ...retroForm });
    if (!r.ok) { setErro(PONTO_ERRO_MSG[r.erro]); return; }
    setRetroOk(true); setRetro(false);
    await carregarHistorico(pessoa.id, pin);
  });

  const abrirAusencia = () => { setAus(true); setErro(''); setAusOk(false); setSucesso(null); setAusArq([]); setAusForm({ tipo: 'atestado', inicio: agora.data, fim: agora.data, obs: '' }); };
  const abrirRetro = () => { setRetro(true); setErro(''); setRetroOk(false); setSucesso(null); setRetroForm({ data: addDays(agora.data, -1), tipo: 'entrada', hora: '', justificativa: '' }); };
  const escolherTipo = (t: TipoMarcacao) => { setEscolha(t); setErro(''); setSucesso(null); };
  const cancelarEscolha = () => { setEscolha(null); setJust(''); setArqAtraso([]); };

  return {
    slug, modo, api, ctx, falhaEsc, carregando: !ctx && !falhaEsc,
    busca, setBusca, tentou, setTentou, termo, buscando, filtradas, buscar, escolherPessoa,
    etapa, pessoa, escala, pin, setPin, erro, hist, justs, agora, voltar,
    escolha, previa, just, setJust, enviando, sucesso, volta, setVolta, confirmar, escolherTipo, cancelarEscolha,
    retro, setRetro, retroForm, setRetroForm, retroOk, enviarRetro, abrirRetro,
    aus, setAus, ausForm, setAusForm, ausArq, setAusArq, ausOk, enviarAusencia, abrirAusencia,
    arqAtraso, setArqAtraso, validarPin,
    local, checarLocal, cerca, dentro, quiosque, alternarQuiosque,
    turnoHoje, hojeRegs, proximo, sequencia,
  };
}
export type Ponto = ReturnType<typeof usePonto>;
