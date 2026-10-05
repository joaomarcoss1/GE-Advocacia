// Service worker do GE Advocacia. Objetivo: abrir o aplicativo mesmo sem internet (a "casca": telas, estilos e ícones) e carregar mais rápido.
// NUNCA guarda dados: só atende o próprio endereço do aplicativo e ignora o Supabase, as funções e qualquer pedido que não seja GET.
// Atualização controlada: a nova versão espera o usuário tocar em "Atualizar" (mensagem ATUALIZAR) para não trocar o app no meio de um trabalho.
const VERSAO = 'ge-v1';
const BASICOS = ['/index.html', '/offline.html', '/tema.js', '/favicon.svg', '/icons/icon-192.png'];
const SEM_VARY = { ignoreVary: true };            // o mesmo arquivo pedido por <script type=module>, CSS ou fetch deve casar com a cópia guardada

self.addEventListener('install', evento => {
  evento.waitUntil(caches.open(VERSAO).then(cache => cache.addAll(BASICOS)));
});

self.addEventListener('activate', evento => {
  evento.waitUntil((async () => {
    for (const chave of await caches.keys()) if (chave !== VERSAO) await caches.delete(chave);
    await self.clients.claim();
  })());
});

self.addEventListener('message', evento => {
  const dado = evento.data;
  if (dado === 'ATUALIZAR') self.skipWaiting();
  // a página informa o que já carregou (antes de o service worker assumir o controle) para valer offline na próxima abertura
  if (dado && dado.tipo === 'CACHEAR' && Array.isArray(dado.urls)) {
    evento.waitUntil(caches.open(VERSAO).then(cache => Promise.all(dado.urls
      .filter(u => new URL(u).origin === self.location.origin && new URL(u).pathname.startsWith('/assets/'))
      .map(u => cache.add(u).catch(() => undefined)))));
  }
});

const comTempo = (promessa, ms) => new Promise((ok, falha) => { const t = setTimeout(() => falha(new Error('tempo')), ms); promessa.then(v => { clearTimeout(t); ok(v); }, e => { clearTimeout(t); falha(e); }); });

self.addEventListener('fetch', evento => {
  const req = evento.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;                         // Supabase, Google, DataJud: nunca interceptados

  // navegação: rede primeiro (sempre a versão mais nova); sem rede, a casca guardada; por último a página offline
  if (req.mode === 'navigate') {
    evento.respondWith((async () => {
      try {
        const resposta = await comTempo(fetch(req), 5000);
        if (resposta.ok) { const copia = resposta.clone(); caches.open(VERSAO).then(c => c.put('/index.html', copia)); }
        return resposta;
      } catch {
        return (await caches.match('/index.html', SEM_VARY)) || (await caches.match('/offline.html', SEM_VARY)) || Response.error();
      }
    })());
    return;
  }

  // arquivos com hash no nome (imutáveis): cache primeiro
  if (url.pathname.startsWith('/assets/')) {
    evento.respondWith((async () => {
      const guardado = await caches.match(req, SEM_VARY);
      if (guardado) return guardado;
      const resposta = await fetch(req);
      if (resposta.ok) { const copia = resposta.clone(); caches.open(VERSAO).then(c => c.put(req, copia)); }
      return resposta;
    })());
    return;
  }

  // ícones e demais estáticos: usa o guardado e atualiza em segundo plano
  if (/\.(?:png|svg|ico|webmanifest|woff2?|js|css)$/.test(url.pathname)) {
    evento.respondWith((async () => {
      const cache = await caches.open(VERSAO);
      const guardado = await cache.match(req, SEM_VARY);
      const rede = fetch(req).then(r => { if (r.ok) cache.put(req, r.clone()); return r; }).catch(() => guardado);
      return guardado || rede;
    })());
  }
});
