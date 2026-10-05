// Aplica tema e densidade antes da pintura (evita "piscar" claro/escuro). Arquivo externo por causa da CSP.
(function () {
  try {
    var d = document.documentElement;
    var t = localStorage.getItem('ge.tema') || 'claro';       // padrão: claro (o escuro e o automático são escolha da pessoa)
    var escuro = t === 'escuro' || (t === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    d.setAttribute('data-theme', escuro ? 'dark' : 'light');
    if (localStorage.getItem('ge.densidade') === 'compacta') d.setAttribute('data-densidade', 'compacta');
    var cs = document.querySelector('meta[name="color-scheme"]');
    if (cs) cs.setAttribute('content', escuro ? 'dark light' : 'only light');
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', escuro ? '#0b111b' : '#f7f4ec');
  } catch (e) { /* segue com o padrão claro */ }
})();
