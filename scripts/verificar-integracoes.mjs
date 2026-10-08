// Verifica, com a internet de verdade, as fontes oficiais que o sistema usa: DataJud (andamentos) e DJEN (comunicações/intimações).
// Não grava nada. Pensado para rodar no GitHub Actions (workflow "Verificar integrações"), que tem acesso à internet.
// Variáveis: DATAJUD_API_KEY (chave pública do CNJ), PROCESSO (número CNJ, opcional), OAB_NUMERO e OAB_UF (opcionais, para o DJEN).
import { readFileSync } from 'node:fs';

const ok = m => console.log(`✓ ${m}`);
const falha = m => { console.log(`✗ ${m}`); process.exitCode = 1; };
const aviso = m => console.log(`• ${m}`);
// o DataJud às vezes demora: espera até 60 s e tenta de novo uma vez antes de dar o problema como real
const tempo = async (url, init = {}) => { try { return await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) }); } catch (e) { if (!/timeout|aborted/i.test(String(e.message))) throw e; return await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) }); } };

// o mesmo código de leitura que a Edge Function usa (se o Node não entender TypeScript, só mostra a resposta bruta)
let lib = null;
try { lib = await import('../supabase/functions/_shared/processos.ts'); } catch { aviso('Leitura do sistema indisponível neste Node (só a resposta bruta será mostrada).'); }

// ---------------------------------------------------------------- DataJud
console.log('\n== DataJud (CNJ)');
const chave = process.env.DATAJUD_API_KEY;
const cnj = (process.env.PROCESSO || '').trim();
if (!chave) falha('DATAJUD_API_KEY não informada (cadastre no GitHub: Settings > Secrets > Actions).');
else {
  const alias = lib && cnj ? lib.tribunalDeCnj(cnj)?.alias : 'tjma';
  if (cnj && !alias) falha(`Tribunal do número ${cnj} sem consulta automática.`);
  else {
    const corpo = cnj && lib ? lib.corpoConsultaDatajud(cnj) : { size: 1, query: { match_all: {} } };
    try {
      const r = await tempo(`https://api-publica.datajud.cnj.jus.br/api_publica_${alias}/_search`, { method: 'POST', headers: { Authorization: `APIKey ${chave}`, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
      if (r.status === 401 || r.status === 403) falha(`Chave recusada (HTTP ${r.status}). Confira o valor de DATAJUD_API_KEY.`);
      else if (!r.ok) falha(`DataJud respondeu HTTP ${r.status}.`);
      else {
        const j = await r.json();
        const total = j?.hits?.total?.value ?? 0;
        ok(`DataJud respondeu (${alias}): ${total} resultado(s) em ${j.took} ms.`);
        if (cnj && lib) {
          const d = lib.lerRespostaDatajud(j);
          if (!d) aviso('Processo não encontrado na base pública (segredo de justiça ou ainda não publicado).');
          else { ok(`Processo lido: ${d.classe ?? '—'} · ${d.orgao_julgador ?? '—'} · ${d.movimentos.length} andamento(s). Último: ${d.movimentos.at(-1)?.nome ?? '—'} (${d.movimentos.at(-1)?.dataHora ?? '—'}).`); }
        }
      }
    } catch (e) { falha(`Não foi possível falar com o DataJud: ${e.message}`); }
  }
}

// Testa TODOS os endpoints da API pública (91 tribunais) com uma consulta mínima. Ligado por TODOS_TRIBUNAIS=1.
if (chave && process.env.TODOS_TRIBUNAIS === '1' && lib?.TRIBUNAIS_DATAJUD) {
  console.log('\n== DataJud: todos os tribunais');
  const resultado = [];
  const fila = [...lib.TRIBUNAIS_DATAJUD];
  const pausa = ms => new Promise(r => setTimeout(r, ms));
  // até 3 tentativas: o DataJud limita o ritmo (HTTP 429) e alguns tribunais demoram a responder
  async function sonda(x) {
    let ultimo = { status: 0, erro: 'sem resposta' };
    for (let t = 1; t <= 3; t++) {
      try {
        const r = await fetch(lib.urlDatajud(x.alias), { method: 'POST', signal: AbortSignal.timeout(45_000), headers: { Authorization: `APIKey ${chave}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ size: 1, query: { match_all: {} } }) });
        const j = r.ok ? await r.json() : null;
        ultimo = { status: r.status, total: j?.hits?.total?.value ?? null };
        if (r.ok || (r.status !== 429 && r.status < 500)) return ultimo;
      } catch (e) { ultimo = { status: 0, erro: e.message }; }
      await pausa(3000 * t);
    }
    return ultimo;
  }
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (fila.length) { const x = fila.shift(); resultado.push({ x, ...(await sonda(x)) }); }
  }));
  resultado.sort((a, b) => a.x.alias.localeCompare(b.x.alias));
  const bons = resultado.filter(r => r.status === 200);
  bons.length === resultado.length ? ok(`${bons.length}/${resultado.length} tribunais responderam.`) : falha(`${bons.length}/${resultado.length} tribunais responderam.`);
  for (const r of resultado) console.log(`  ${r.status === 200 ? '✓' : '✗'} ${r.x.sigla.padEnd(8)} ${String(r.status).padEnd(4)} ${r.total != null ? `${r.total} processo(s) na base` : (r.erro ?? '')}  — ${r.x.nome}`);
}

if (chave && process.env.TODOS_TRIBUNAIS === '1') {
  console.log('\n== DataJud: nomes alternativos (TRE do Distrito Federal)');
  for (const alias of ['tre-df', 'tre-dft']) {
    try {
      const r = await fetch(`https://api-publica.datajud.cnj.jus.br/api_publica_${alias}/_search`, { method: 'POST', signal: AbortSignal.timeout(45_000), headers: { Authorization: `APIKey ${chave}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ size: 1, query: { match_all: {} } }) });
      console.log(`  api_publica_${alias}: HTTP ${r.status}`);
    } catch (e) { console.log(`  api_publica_${alias}: ${e.message}`); }
  }
}

// ---------------------------------------------------------------- DJEN
console.log('\n== DJEN (comunicações processuais)');
const oab = (process.env.OAB_NUMERO || '').trim(), uf = (process.env.OAB_UF || '').trim().toUpperCase();
const params = new URLSearchParams({ itensPorPagina: '3', pagina: '1' });
if (oab && uf) { params.set('numeroOab', oab); params.set('ufOab', uf); } else if (cnj) params.set('numeroProcesso', cnj.replace(/\D/g, ''));
else aviso('Sem OAB nem processo informados: faz só um teste de conectividade.');
try {
  const r = await tempo(`https://comunicaapi.pje.jus.br/api/v1/comunicacao?${params}`, { headers: { Accept: 'application/json' } });
  const texto = await r.text();
  if (!r.ok) falha(`DJEN respondeu HTTP ${r.status}: ${texto.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300)} (cabeçalhos: server=${r.headers.get("server")}, via=${r.headers.get("via")}, x-cache=${r.headers.get("x-cache")})`);
  else {
    let j = null; try { j = JSON.parse(texto); } catch { /* resposta não é JSON */ }
    ok(`DJEN respondeu HTTP ${r.status}${j ? ` (JSON; campos de topo: ${Object.keys(j).join(', ')})` : ' (não é JSON)'}.`);
    const lista = j?.items ?? j?.comunicacoes ?? (Array.isArray(j) ? j : []);
    if (lista[0]) ok(`Campos de cada comunicação: ${Object.keys(lista[0]).join(', ')}`);
    else aviso('Nenhuma comunicação retornada para o filtro (ou a estrutura é outra). Copie a saída acima para análise.');
  }
} catch (e) { falha(`Não foi possível falar com o DJEN: ${e.message}`); }

// ---------------------------------------------------------------- Supabase (funções publicadas e configuração do Google)
console.log('\n== Supabase e Google');
const url = (process.env.SUPABASE_URL || 'https://zkyxvwdxyocgneizcfiz.supabase.co').replace(/\/$/, ''), anon = process.env.SUPABASE_ANON_KEY || '';
const cab = { 'Content-Type': 'application/json', ...(anon ? { apikey: anon, Authorization: `Bearer ${anon}` } : {}) };
async function chama(funcao, corpo) {
  const r = await tempo(`${url}/functions/v1/${funcao}`, { method: 'POST', headers: cab, body: JSON.stringify(corpo) });
  const texto = await r.text(); let json = null; try { json = JSON.parse(texto); } catch { /* não é JSON */ }
  return { status: r.status, json, texto: texto.slice(0, 160) };
}
try {
  const auth = await tempo(`${url}/auth/v1/health`, { headers: anon ? { apikey: anon } : {} });
  auth.ok ? ok('Autenticação do Supabase no ar.') : aviso(`Autenticação respondeu HTTP ${auth.status}${anon ? '' : ' (sem a chave anon informada)'}.`);

  // 1) as quatro funções estão publicadas? (404 = não publicada; qualquer resposta JSON = no ar)
  for (const [nome, corpo] of [['anexos', { acao: 'x' }], ['google-agenda', { acao: 'x' }], ['processos', { acao: 'x' }], ['documentos', { acao: 'publico_info', token: '0'.repeat(48) }]]) {
    const r = await chama(nome, corpo);
    r.status === 404 || (r.status >= 500 && !r.json) ? falha(`Função "${nome}" NÃO está publicada ou caiu (HTTP ${r.status}): ${r.texto}`) : ok(`Função "${nome}" publicada (HTTP ${r.status}).`);
  }

  // 2) o Google está configurado nas funções? (a função responde 503 GOOGLE_INDISPONIVEL enquanto faltarem as credenciais)
  for (const [funcao, acao, rotulo] of [['google-agenda', 'conectar', 'Google Agenda'], ['documentos', 'drive_conectar', 'Google Drive']]) {
    const r = await chama(funcao, { acao, retorno: 'https://exemplo.invalid/' });
    if (r.json?.erro === 'GOOGLE_INDISPONIVEL') falha(`${rotulo}: faltam GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET nos segredos (a função está no ar, mas sem as credenciais do Google).`);
    else ok(`${rotulo}: credenciais do Google presentes nas funções (resposta: HTTP ${r.status} ${r.json?.erro ?? ''}).`);
  }

  // 3) rotina de acompanhamento: o segredo CRON_SECRET existe e confere?
  if (process.env.CRON_SECRET) {
    const teste = cnj || '0000832-35.2018.4.01.3202';       // sem processo informado, usa um número público de exemplo só para testar o caminho
    const r = await tempo(`${url}/functions/v1/processos`, { method: 'POST', headers: { ...cab, 'x-cron-secret': process.env.CRON_SECRET }, body: JSON.stringify({ acao: 'varredura', teste_numero: teste }) });
    const j = await r.json().catch(() => null);
    if (r.status === 401) falha('CRON_SECRET do GitHub não confere com o do Supabase (cadastre o mesmo valor nos dois lugares e rode a publicação de novo).');
    else if (r.status === 503) falha(`DataJud não configurado dentro da função: ${j?.erro ?? ''}`);
    else if (j?.ok) ok(`DataJud pelo Supabase: ${j.tribunal} · ${j.encontrado ? `${j.classe ?? 'processo'} · ${j.orgao_julgador ?? ''} · ${j.andamentos} andamento(s)` : 'número não encontrado na base pública (esperado para um número de exemplo)'}.`);
    else falha(`Varredura/teste respondeu HTTP ${r.status}: ${j?.erro ?? r.status}`);
  } else aviso('CRON_SECRET não informado: a varredura automática de processos (a cada 6 horas) ainda não pode rodar.');
} catch (e) { falha(`Não foi possível falar com o Supabase: ${e.message}`); }
console.log(process.exitCode ? '\nHá itens a corrigir (marcados com ✗).' : '\nTudo respondeu como esperado.');
