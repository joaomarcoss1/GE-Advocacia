// Edge Function "processos" (Deno): acompanhamento dos processos pela API pública do DataJud (CNJ).
//
//   fonte           → a consulta automática está configurada?
//   buscar          → dados públicos do processo (classe, assunto, órgão) para preencher o cadastro
//   consultar       → consulta UM processo do escritório do chamador e grava os andamentos novos
//   consultar_todos → o mesmo para todos os processos monitorados do escritório do chamador
//   varredura       → TODOS os escritórios (chamada agendada com o cabeçalho x-cron-secret; sem login)
//
// Segurança: o JWT do chamador e o papel (administrador, gerência ou coordenação) são conferidos aqui; a service_role fica só
// neste arquivo. Cada escritório só alcança os próprios processos. Andamentos já gravados nunca se repetem e nunca se alteram.
// Segredos: DATAJUD_API_KEY (chave pública divulgada pelo CNJ), CRON_SECRET (para a varredura agendada).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { segredoConfere } from '../_shared/cripto.ts';
import {
  chaveMovimento, classificarMovimento, corpoConsultaDatajud, lerRespostaDatajud, tarefaDoMovimento, tribunalDeCnj, urlDatajud, type DadosProcesso,
} from '../_shared/processos.ts';

const URL_BASE = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CHAVE = Deno.env.get('DATAJUD_API_KEY') ?? '';
const CRON = Deno.env.get('CRON_SECRET');
const LIMITE_VARREDURA = 60;           // processos por execução (os mais antigos primeiro)
const LIMITE_USUARIO = 120;

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const falha = (erro: string, status = 400) => json({ erro }, status);

interface ProcessoLinha { id: string; escritorio_id: string; numero: string; titulo: string | null; cliente_id: string | null; responsavel_id: string | null; area: string | null; ultima_consulta: string | null; classe: string | null; assunto: string | null; orgao_julgador: string | null; grau: string | null; data_ajuizamento: string | null }
interface Resultado { processos: number; novos: number; tarefas: number; erros: number }

// ---------------------------------------------------------------- DataJud
async function consultarDatajud(numero: string): Promise<DadosProcesso | null> {
  const t = tribunalDeCnj(numero);
  if (!t) throw new Error('Este tribunal não tem consulta automática.');
  if (!CHAVE) throw new Error('A consulta automática não está configurada (DATAJUD_API_KEY).');
  // O DataJud às vezes passa de 20 s (medido em 08/10/2026): espera até 35 s e tenta de novo uma vez antes de desistir da rodada.
  let ultimo: Error = new Error('O DataJud não respondeu.');
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 35_000);
    try {
      const r = await fetch(urlDatajud(t.alias), { method: 'POST', signal: ctl.signal, headers: { Authorization: `APIKey ${CHAVE}`, 'Content-Type': 'application/json' }, body: JSON.stringify(corpoConsultaDatajud(numero)) });
      if (r.status === 401 || r.status === 403) throw new Error('A chave do DataJud foi recusada. Confira DATAJUD_API_KEY.');
      if (r.status === 429 || r.status >= 500) { ultimo = new Error(r.status === 429 ? 'Limite de consultas do DataJud atingido. Tentaremos de novo na próxima rodada.' : `O DataJud respondeu ${r.status}. Tentaremos de novo na próxima rodada.`); await new Promise(res => setTimeout(res, 2000)); continue; }
      if (!r.ok) throw new Error(`O DataJud respondeu ${r.status}. Tentaremos de novo na próxima rodada.`);
      return lerRespostaDatajud(await r.json());
    } catch (e) {
      if ((e as Error).name === 'AbortError') { ultimo = new Error('O DataJud demorou para responder. Tentaremos de novo na próxima rodada.'); continue; }
      throw e;
    } finally { clearTimeout(timer); }
  }
  throw ultimo;
}

// ---------------------------------------------------------------- um processo: grava andamentos novos e cria a tarefa (uma vez por andamento)
async function atualizarProcesso(sb: SupabaseClient, p: ProcessoLinha): Promise<{ novos: number; tarefas: number }> {
  let dados: DadosProcesso | null;
  try { dados = await consultarDatajud(p.numero); }
  catch (e) { await sb.from('processos').update({ ultima_consulta_erro: (e as Error).message.slice(0, 300) }).eq('id', p.id); throw e; }
  if (!dados) {
    await sb.from('processos').update({ ultima_consulta: new Date().toISOString(), ultima_consulta_erro: 'Processo não encontrado na base pública (segredo de justiça ou ainda não publicado).' }).eq('id', p.id);
    return { novos: 0, tarefas: 0 };
  }
  const baseline = !p.ultima_consulta;                                  // primeira leitura: o histórico entra como lido e sem tarefas
  const { data: ja } = await sb.from('processo_movimentos').select('chave').eq('processo_id', p.id);
  const conhecidas = new Set<string>((ja ?? []).map((m: { chave: string }) => m.chave));
  const { data: cfg } = await sb.from('configuracoes').select('dados').eq('escritorio_id', p.escritorio_id).maybeSingle();
  const criarTarefa = (cfg?.dados as { automacao?: { tarefa_andamento?: boolean } } | undefined)?.automacao?.tarefa_andamento !== false;
  const { data: fer } = await sb.from('feriados').select('data').eq('escritorio_id', p.escritorio_id);
  const feriados = new Set<string>((fer ?? []).map((f: { data: string }) => f.data));
  const cliente = p.cliente_id ? (await sb.from('clientes').select('nome').eq('id', p.cliente_id).maybeSingle()).data?.nome ?? null : null;

  let novos = 0, tarefas = 0, ultima: string | null = null;
  for (const b of dados.movimentos) {
    const chave = chaveMovimento('dj', b);
    if (conhecidas.has(chave)) continue;
    conhecidas.add(chave);
    const c = classificarMovimento(b);
    const recente = Date.now() - Date.parse(b.dataHora) <= 7 * 86_400_000;
    const { data: m, error } = await sb.from('processo_movimentos').upsert({
      escritorio_id: p.escritorio_id, processo_id: p.id, origem: 'datajud', codigo: b.codigo ?? null, nome: b.nome.slice(0, 300), complemento: b.complemento?.slice(0, 2000) ?? null,
      data_hora: b.dataHora, categoria: c.categoria, exige_acao: c.exige_acao, prazo_sugerido_dias: c.prazo_sugerido_dias, lido: baseline && !(recente && c.exige_acao), chave,
    }, { onConflict: 'processo_id,chave', ignoreDuplicates: true }).select('id').maybeSingle();
    if (error || !m) continue;                                          // já existia (outra execução gravou antes)
    novos++;
    if (!ultima || b.dataHora > ultima) ultima = b.dataHora;
    if (criarTarefa && c.exige_acao && (!baseline || recente)) {
      const t = tarefaDoMovimento({ id: p.id, numero: p.numero, titulo: p.titulo, cliente, responsavel_id: p.responsavel_id }, b, c, feriados);
      const { data: nova } = await sb.from('tarefas').insert({
        escritorio_id: p.escritorio_id, tipo: t.tipo, titulo: t.titulo, descricao: t.descricao, prioridade: t.prioridade, responsavel_id: t.responsavel_id, processo_id: p.id,
        origem_movimento_id: m.id, area: p.area, criado_por_nome: 'Acompanhamento de processos',
      }).select('id').maybeSingle();
      if (nova) { tarefas++; await sb.from('processo_movimentos').update({ tarefa_id: nova.id }).eq('id', m.id); }
    }
  }
  await sb.from('processos').update({
    ultima_consulta: new Date().toISOString(), ultima_consulta_erro: null,
    classe: p.classe ?? dados.classe, assunto: p.assunto ?? dados.assunto, orgao_julgador: p.orgao_julgador ?? dados.orgao_julgador, grau: p.grau ?? dados.grau,
    data_ajuizamento: p.data_ajuizamento ?? dados.data_ajuizamento, ...(dados.sigiloso ? { sigiloso: true } : {}),
  }).eq('id', p.id);
  return { novos, tarefas };
}

async function lote(sb: SupabaseClient, lista: ProcessoLinha[]): Promise<Resultado> {
  const r: Resultado = { processos: 0, novos: 0, tarefas: 0, erros: 0 };
  let i = 0;
  const fim = Date.now() + 100_000;                                     // orçamento de tempo da função; o que sobrar fica para a próxima rodada (os mais antigos vêm primeiro)
  const trabalhador = async () => {
    while (i < lista.length && Date.now() < fim) {
      const p = lista[i++];
      r.processos++;
      try { const x = await atualizarProcesso(sb, p); r.novos += x.novos; r.tarefas += x.tarefas; } catch { r.erros++; }
      await new Promise(res => setTimeout(res, 150));                   // educado com a API pública
    }
  };
  await Promise.all([trabalhador(), trabalhador(), trabalhador()]);
  return r;
}
const COLS = 'id,escritorio_id,numero,titulo,cliente_id,responsavel_id,area,ultima_consulta,classe,assunto,orgao_julgador,grau,data_ajuizamento';

// ---------------------------------------------------------------- identificação do chamador
async function chamador(req: Request) {
  const auth = req.headers.get('Authorization');
  if (!auth) throw new Error('SEM_PERMISSAO');
  const sbUser = createClient(URL_BASE, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: u } = await sbUser.auth.getUser();
  if (!u.user) throw new Error('SEM_PERMISSAO');
  const { data: ok } = await sbUser.rpc('eh_delegante');
  const { data: esc } = await sbUser.rpc('meu_escritorio');
  if (!ok || !esc) throw new Error('SEM_PERMISSAO');
  return { sbUser, escId: esc as string };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return falha('Método não permitido.', 405);
  const sb = createClient(URL_BASE, SERVICE, { auth: { persistSession: false } });
  try {
    const corpo = await req.json().catch(() => ({}));
    const acao = String(corpo.acao ?? '');

    // varredura agendada (todos os escritórios): só com o segredo
    if (acao === 'varredura') {
      if (!segredoConfere(req.headers.get('x-cron-secret'), CRON)) return falha('Não autorizado.', 401);
      if (!CHAVE) return falha('DATAJUD_API_KEY não configurada.', 503);
      // diagnóstico do DJEN (só com o segredo): tenta a API de comunicações de DENTRO do servidor e diz de onde a chamada saiu
      if (corpo.teste_djen && typeof corpo.teste_djen === 'object') {
        const sigla = String((corpo.teste_djen as { sigla?: string }).sigla ?? 'TJMA').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12);
        const hoje = new Date(), ini = new Date(Date.now() - 7 * 86_400_000);
        const dia = (d: Date) => d.toISOString().slice(0, 10);
        const origem = await fetch('https://ipinfo.io/json', { signal: AbortSignal.timeout(8000) }).then(r => r.json()).catch(() => ({}));
        let djen: { status: number; trecho: string; amostra?: unknown };
        try {
          const r = await fetch(`https://comunicaapi.pje.jus.br/api/v1/comunicacao?siglaTribunal=${sigla}&dataDisponibilizacaoInicio=${dia(ini)}&dataDisponibilizacaoFim=${dia(hoje)}&itensPorPagina=3&pagina=1`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(30_000) });
          djen = { status: r.status, trecho: (await r.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400) };
        } catch (e) { djen = { status: 0, trecho: (e as Error).message }; }
        return json({ ok: true, origem: { pais: origem.country ?? null, regiao: origem.region ?? null, cidade: origem.city ?? null, org: origem.org ?? null }, regiao_funcao: Deno.env.get('SB_REGION') ?? Deno.env.get('DENO_REGION') ?? null, djen });
      }
      // teste de ponta a ponta (só com o segredo): consulta UM número no DataJud, de dentro do servidor, sem gravar nada
      if (typeof corpo.teste_numero === 'string') {
        const t = tribunalDeCnj(corpo.teste_numero);
        if (!t) return json({ ok: false, erro: 'Número sem tribunal consultável.' });
        const d = await consultarDatajud(corpo.teste_numero);
        return json({ ok: true, tribunal: t.sigla, encontrado: !!d, classe: d?.classe ?? null, orgao_julgador: d?.orgao_julgador ?? null, andamentos: d?.movimentos.length ?? 0 });
      }
      const { data } = await sb.from('processos').select(COLS).eq('monitorar', true).eq('situacao', 'ativo').order('ultima_consulta', { ascending: true, nullsFirst: true }).limit(LIMITE_VARREDURA);
      const { data: ativos } = await sb.from('escritorios').select('id').eq('ativo', true);              // escritório suspenso não é consultado
      const vivos = new Set<string>((ativos ?? []).map((e: { id: string }) => e.id));
      return json({ ok: true, ...(await lote(sb, ((data ?? []) as ProcessoLinha[]).filter(p => vivos.has(p.escritorio_id)))) });
    }

    const { sbUser, escId } = await chamador(req);
    if (acao === 'fonte') return json({ disponivel: !!CHAVE });
    if (acao === 'buscar') {
      const t = tribunalDeCnj(String(corpo.numero ?? ''));
      if (!t) return json({ dados: null });
      const d = await consultarDatajud(String(corpo.numero));
      return json({ dados: d ? { classe: d.classe, assunto: d.assunto, orgao_julgador: d.orgao_julgador, tribunal: d.tribunal, grau: d.grau, data_ajuizamento: d.data_ajuizamento, sigiloso: d.sigiloso } : null });
    }
    if (acao === 'consultar') {
      const { data: p } = await sbUser.from('processos').select(COLS).eq('id', corpo.processo_id).maybeSingle();     // RLS: só do escritório do chamador
      if (!p) return falha('NAO_ENCONTRADO', 404);
      try { const x = await atualizarProcesso(sb, p as ProcessoLinha); return json({ processos: 1, ...x, erros: 0 }); }
      catch (e) { return json({ processos: 1, novos: 0, tarefas: 0, erros: 1, mensagem: (e as Error).message }); }
    }
    if (acao === 'consultar_todos') {
      const { data } = await sbUser.from('processos').select(COLS).eq('monitorar', true).eq('situacao', 'ativo').order('ultima_consulta', { ascending: true, nullsFirst: true }).limit(LIMITE_USUARIO);
      return json(await lote(sb, ((data ?? []) as ProcessoLinha[]).filter(p => p.escritorio_id === escId)));
    }
    return falha('Ação desconhecida.');
  } catch (x) {
    const m = (x as Error).message;
    return falha(m === 'SEM_PERMISSAO' ? 'Você não tem permissão para esta ação.' : m, m === 'SEM_PERMISSAO' ? 403 : 400);
  }
});
