// Edge Function "processos" (Deno): acompanhamento dos processos pela API pública do DataJud (CNJ).
//
//   fonte           → a consulta automática está configurada?
//   buscar          → dados públicos do processo (classe, assunto, órgão) para preencher o cadastro
//   consultar       → consulta UM processo do escritório do chamador e grava os andamentos novos
//   consultar_todos → o mesmo para todos os processos monitorados do escritório do chamador
//   varredura       → TODOS os escritórios (chamada agendada com o cabeçalho x-cron-secret; sem login)
//   intimacoes_buscar     → lê no DJEN (CNJ) as intimações dos advogados do escritório do chamador (pela OAB cadastrada)
//   intimacoes_varredura  → o mesmo para TODOS os escritórios (agendada, com x-cron-secret)
//   O DJEN só responde ao Brasil: estas ações devem ser chamadas com o cabeçalho  x-region: sa-east-1  (função rodando em São Paulo).
//
// Segurança: o JWT do chamador e o papel (administrador, gerência ou coordenação) são conferidos aqui; a service_role fica só
// neste arquivo. Cada escritório só alcança os próprios processos. Andamentos já gravados nunca se repetem e nunca se alteram.
// Segredos: DATAJUD_API_KEY (chave pública divulgada pelo CNJ), CRON_SECRET (para a varredura agendada).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { segredoConfere } from '../_shared/cripto.ts';
import {
  calcularPrazo, chaveMovimento, classificarMovimento, corpoConsultaDatajud, lerRespostaDatajud, tarefaDoMovimento, tribunalDeCnj, urlDatajud, type DadosProcesso,
} from '../_shared/processos.ts';
import { exigeProvidencia, lerComunicacao, parseOab, prazoNoTexto, urlDjen, type IntimacaoLinha, type OabBusca } from '../_shared/intimacoes.ts';

const URL_BASE = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CHAVE = Deno.env.get('DATAJUD_API_KEY') ?? '';
const CRON = Deno.env.get('CRON_SECRET');
const LIMITE_VARREDURA = 60;           // processos por execução (os mais antigos primeiro)
const LIMITE_USUARIO = 120;

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret, x-region', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
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


// ---------------------------------------------------------------- Intimações (DJEN)
interface ResultadoIntimacoes { oabs: number; novas: number; tarefas: number; erros: number; mensagem: string }
const DIAS_TAREFA = 10;                 // só vira tarefa a intimação publicada nos últimos 10 dias (o resto entra na caixa, sem tarefa)
const MAX_TAREFAS_POR_RODADA = 30;
const MAX_PAGINAS = 5;                  // 500 comunicações por OAB por rodada

async function lerDjen(oab: OabBusca, inicio: string, fim: string): Promise<{ itens: IntimacaoLinha[]; erro?: string }> {
  const itens: IntimacaoLinha[] = [];
  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    let r: Response | null = null;
    for (let t = 1; t <= 2 && !r?.ok; t++) {
      try { r = await fetch(urlDjen({ oab, inicio, fim, pagina, porPagina: 100 }), { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(25_000) }); }
      catch { r = null; }
      if (r && (r.status === 429 || r.status >= 500)) { await new Promise(res => setTimeout(res, 1500)); continue; }
      break;
    }
    if (!r) return { itens, erro: 'O DJEN não respondeu.' };
    if (r.status === 403) return { itens, erro: 'O DJEN bloqueou a consulta (acesso só do Brasil). Chame a função na região sa-east-1.' };
    if (r.status === 429) return { itens, erro: 'Limite de consultas do DJEN atingido. Tentaremos de novo na próxima rodada.' };
    if (!r.ok) return { itens, erro: `O DJEN respondeu ${r.status}.` };
    const j = await r.json().catch(() => null) as { items?: unknown[] } | null;
    const lote = (j?.items ?? []).map(lerComunicacao).filter((x): x is IntimacaoLinha => !!x);
    itens.push(...lote);
    if ((j?.items ?? []).length < 100) break;
    await new Promise(res => setTimeout(res, 300));                       // educado com a API pública
  }
  return { itens };
}

async function sincronizarIntimacoes(sb: SupabaseClient, escId: string, dias: number): Promise<ResultadoIntimacoes> {
  const r: ResultadoIntimacoes = { oabs: 0, novas: 0, tarefas: 0, erros: 0, mensagem: '' };
  const { data: func } = await sb.from('funcionarios').select('id,nome,oab').eq('escritorio_id', escId).is('data_desligamento', null).not('oab', 'is', null);
  const porOab = new Map<string, { oab: OabBusca; funcionario_id: string }>();
  for (const f of (func ?? []) as { id: string; nome: string; oab: string }[]) {
    const o = parseOab(f.oab);
    if (o && !porOab.has(`${o.numero}/${o.uf}`)) porOab.set(`${o.numero}/${o.uf}`, { oab: o, funcionario_id: f.id });
  }
  r.oabs = porOab.size;
  if (!porOab.size) { r.mensagem = 'Nenhum advogado com OAB e UF cadastradas em Funcionários (ex.: OAB/MA 12345).'; await sb.from('intimacoes_sync').upsert({ escritorio_id: escId, executada_em: new Date().toISOString(), oabs: [], novas: 0, erros: 0, mensagem: r.mensagem }); return r; }

  const hoje = new Date(), ini = new Date(Date.now() - Math.min(Math.max(dias, 1), 60) * 86_400_000);
  const dia = (d: Date) => d.toISOString().slice(0, 10);
  const achadas = new Map<number, { l: IntimacaoLinha; oab: string; funcionario_id: string }>();
  const erros: string[] = [];
  for (const [chave, { oab, funcionario_id }] of porOab) {
    const x = await lerDjen(oab, dia(ini), dia(hoje));
    if (x.erro) { r.erros++; erros.push(`OAB ${chave}: ${x.erro}`); }
    for (const l of x.itens) if (!achadas.has(l.djen_id)) achadas.set(l.djen_id, { l, oab: chave, funcionario_id });
    await new Promise(res => setTimeout(res, 300));
  }

  const ids = [...achadas.keys()];
  const jaExistem = new Set<number>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await sb.from('intimacoes').select('djen_id').eq('escritorio_id', escId).in('djen_id', ids.slice(i, i + 200));
    for (const x of (data ?? []) as { djen_id: number }[]) jaExistem.add(x.djen_id);
  }
  const novas = [...achadas.values()].filter(x => !jaExistem.has(x.l.djen_id));
  if (novas.length) {
    const numeros = [...new Set(novas.map(x => x.l.numero_processo).filter((n): n is string => !!n))];
    const { data: procs } = numeros.length ? await sb.from('processos').select('id,numero,titulo,responsavel_id,area,cliente_id').eq('escritorio_id', escId).in('numero', numeros) : { data: [] };
    const processos = new Map<string, { id: string; titulo: string | null; responsavel_id: string | null; area: string | null; cliente_id: string | null }>(((procs ?? []) as { id: string; numero: string; titulo: string | null; responsavel_id: string | null; area: string | null; cliente_id: string | null }[]).map(p => [p.numero, p]));
    const { data: fer } = await sb.from('feriados').select('data').eq('escritorio_id', escId);
    const feriados = new Set<string>((fer ?? []).map((f: { data: string }) => f.data));
    const { data: cfg } = await sb.from('configuracoes').select('dados').eq('escritorio_id', escId).maybeSingle();
    const criarTarefa = (cfg?.dados as { automacao?: { tarefa_andamento?: boolean } } | undefined)?.automacao?.tarefa_andamento !== false;
    const limiteTarefa = dia(new Date(Date.now() - DIAS_TAREFA * 86_400_000));

    for (const { l, oab, funcionario_id } of novas) {
      const proc = l.numero_processo ? processos.get(l.numero_processo) : undefined;
      const providencia = !l.cancelada && exigeProvidencia(l.tipo_comunicacao, l.texto);
      const pz = providencia ? prazoNoTexto(l.texto) : null;
      const calc = pz ? calcularPrazo({ marco: l.data_disponibilizacao, tipo: 'disponibilizacao', dias: pz.dias, regime: pz.regime, feriados }) : null;
      const { data: ins, error } = await sb.from('intimacoes').upsert({
        escritorio_id: escId, djen_id: l.djen_id, hash: l.hash, tribunal: l.tribunal, tipo_comunicacao: l.tipo_comunicacao, tipo_documento: l.tipo_documento, orgao: l.orgao, classe: l.classe,
        numero_processo: l.numero_processo, processo_id: proc?.id ?? null, texto: l.texto, link: l.link, data_disponibilizacao: l.data_disponibilizacao, meio: l.meio, cancelada: l.cancelada,
        destinatarios: l.destinatarios, advogados: l.advogados, oab_busca: oab, exige_providencia: providencia, prazo_dias: pz?.dias ?? null, prazo_regime: pz?.regime ?? null, prazo_fim: calc?.vencimento ?? null,
        status: l.cancelada ? 'descartada' : 'nova', responsavel_id: proc?.responsavel_id ?? funcionario_id,
      }, { onConflict: 'escritorio_id,djen_id', ignoreDuplicates: true }).select('id').maybeSingle();
      if (error || !ins) { if (error) r.erros++; continue; }
      r.novas++;
      if (criarTarefa && providencia && l.data_disponibilizacao >= limiteTarefa && r.tarefas < MAX_TAREFAS_POR_RODADA) {
        const alvo = proc?.titulo || l.numero_processo || l.tribunal;
        const linhas = [`${l.tipo_comunicacao}${l.tipo_documento ? ` — ${l.tipo_documento}` : ''} (${l.tribunal}${l.orgao ? ` · ${l.orgao}` : ''})`, `Processo ${l.numero_processo ?? '—'} · disponibilizada em ${l.data_disponibilizacao.split('-').reverse().join('/')}.`, '', l.texto.slice(0, 700)];
        if (calc && pz) linhas.push('', `Prazo identificado no texto: ${pz.dias} dias ${pz.regime === 'uteis' ? 'úteis' : 'corridos'}, vencendo em ${calc.vencimento.split('-').reverse().join('/')}. Sugestão pela regra geral (CPC e Lei 11.419): confira no ato e ajuste a data.`);
        const { data: t } = await sb.from('tarefas').insert({
          escritorio_id: escId, tipo: calc ? 'prazo' : 'tarefa', titulo: `Intimação: ${l.classe || l.tipo_comunicacao} — ${alvo}`.slice(0, 200), descricao: linhas.join('\n').slice(0, 3900),
          prioridade: calc ? 'alta' : 'normal', responsavel_id: proc?.responsavel_id ?? funcionario_id, processo_id: proc?.id ?? null, processo_numero: l.numero_processo, area: proc?.area ?? null,
          ...(calc ? { inicio: `${calc.vencimento}T00:00:00-03:00`, fim: `${calc.vencimento}T00:00:00-03:00`, dia_inteiro: true } : {}), criado_por_nome: 'Caixa de intimações',
        }).select('id').maybeSingle();
        if (t) { r.tarefas++; await sb.from('intimacoes').update({ tarefa_id: t.id }).eq('id', ins.id); }
      }
    }
  }
  r.mensagem = erros.length ? erros.join(' · ').slice(0, 480) : r.novas ? `${r.novas} intimação(ões) nova(s).` : 'Nenhuma intimação nova.';
  await sb.from('intimacoes_sync').upsert({ escritorio_id: escId, executada_em: new Date().toISOString(), oabs: [...porOab.keys()], novas: r.novas, erros: r.erros, mensagem: r.mensagem });
  return r;
}

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

    // intimações de todos os escritórios (agendada): só com o segredo
    if (acao === 'intimacoes_varredura') {
      if (!segredoConfere(req.headers.get('x-cron-secret'), CRON)) return falha('Não autorizado.', 401);
      const { data: escs } = await sb.from('escritorios').select('id').eq('ativo', true);
      const total: ResultadoIntimacoes = { oabs: 0, novas: 0, tarefas: 0, erros: 0, mensagem: '' };
      const fim = Date.now() + 110_000;
      for (const e of (escs ?? []) as { id: string }[]) {
        if (Date.now() > fim) break;
        const x = await sincronizarIntimacoes(sb, e.id, Number(corpo.dias) || 5).catch(() => ({ oabs: 0, novas: 0, tarefas: 0, erros: 1, mensagem: '' }));
        total.oabs += x.oabs; total.novas += x.novas; total.tarefas += x.tarefas; total.erros += x.erros;
      }
      return json({ ok: true, ...total });
    }

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
          const bruto = await r.text();
          djen = { status: r.status, trecho: bruto.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400) };
          try {
            const j = JSON.parse(bruto) as { items?: Record<string, unknown>[] };
            const it = j.items?.[0];
            if (it) djen.amostra = { chaves_topo: Object.keys(j), chaves_item: Object.fromEntries(Object.entries(it).map(([k, v]) => [k, Array.isArray(v) ? `array(${v.length})${v[0] && typeof v[0] === 'object' ? ' ' + JSON.stringify(Object.keys(v[0] as object)) : ''}` : typeof v === 'string' ? `string(${v.length})` : typeof v])), exemplo_curto: { tipoComunicacao: it.tipoComunicacao, tipoDocumento: it.tipoDocumento, meio: it.meio, nomeClasse: it.nomeClasse, numero_processo: it.numero_processo, numeroprocessocommascara: it.numeroprocessocommascara, link: it.link, destinatarioadvogados: it.destinatarioadvogados } };
          } catch { /* não era JSON */ }
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
    if (acao === 'intimacoes_buscar') return json(await sincronizarIntimacoes(sb, escId, Number(corpo.dias) || 15));
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
