#!/usr/bin/env python3
"""Gera src/components/logoPaths.ts: contornos das letras "G" e "E" (Cormorant Garamond Bold) já posicionados no quadro 64x64 da logo.
Requer: pip install fonttools. Uso: python3 scripts/gerar-logo.py"""
import pathlib
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

RAIZ = pathlib.Path(__file__).resolve().parent.parent
FONTE = RAIZ / 'node_modules/@fontsource/cormorant-garamond/files/cormorant-garamond-latin-700-normal.woff'
ESCALA, BASE, CX, KERN = 0.0275, 42.2, 32.0, -70

f = TTFont(FONTE)
gs, cmap = f.getGlyphSet(), f.getBestCmap()
G, E = cmap[ord('G')], cmap[ord('E')]
adv_g = gs[G].width
from fontTools.pens.boundsPen import BoundsPen
bg, be = BoundsPen(gs), BoundsPen(gs)
gs[G].draw(bg); gs[E].draw(be)
total = adv_g + KERN + be.bounds[2] - bg.bounds[0]
gx = CX - total * ESCALA / 2 - bg.bounds[0] * ESCALA
ex = gx + (adv_g + KERN) * ESCALA


def caminho(glifo, dx):
    pen = SVGPathPen(gs, ntos=lambda v: f'{v:.2f}'.rstrip('0').rstrip('.'))
    gs[glifo].draw(TransformPen(pen, (ESCALA, 0, 0, -ESCALA, dx, BASE)))
    return pen.getCommands()


def arco(x0, x1, base, topo):
    r = (x1 - x0) / 2
    return f'M{x0} {base}V{topo + r}a{r} {r} 0 0 1 {x1 - x0} 0V{base}'


def miolo():
    """Conteúdo do SVG da logo (quadro 64x64). `GEID` vira um identificador único por instância, para os gradientes não colidirem."""
    ouro = '<linearGradient id="GEIDb" gradientUnits="userSpaceOnUse" x1="13" y1="10" x2="51" y2="55"><stop offset="0" stop-color="#fff3c4"/><stop offset=".28" stop-color="#f6cf6e"/><stop offset=".62" stop-color="#dba645"/><stop offset="1" stop-color="#b27a22"/></linearGradient>'
    fundo = '<radialGradient id="GEIDf" cx=".28" cy=".1" r="1.08"><stop offset="0" stop-color="#2a5a9f"/><stop offset=".42" stop-color="#12305c"/><stop offset="1" stop-color="#07142b"/></radialGradient>'
    brilho = '<linearGradient id="GEIDs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".26"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>'
    recorte = '<clipPath id="GEIDc"><rect width="64" height="64" rx="15"/></clipPath>'
    luz = '<filter id="GEIDg" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy=".25" stdDeviation=".3" flood-color="#f6cf6e" flood-opacity=".38"/></filter>'
    defs = f'<defs>{ouro}{fundo}{brilho}{recorte}{luz}</defs>'
    base = (
        '<rect width="64" height="64" rx="15" fill="url(#GEIDf)"/>'
        '<g clip-path="url(#GEIDc)"><ellipse cx="18" cy="2" rx="40" ry="22" fill="url(#GEIDs)"/></g>'
        '<rect x=".9" y=".9" width="62.2" height="62.2" rx="14.2" fill="none" stroke="url(#GEIDb)" stroke-width=".9"/>'
        '<rect x="3.6" y="3.6" width="56.8" height="56.8" rx="11.4" fill="none" stroke="url(#GEIDb)" stroke-width=".35" stroke-opacity=".55"/>'
    )
    emblema = (
        f'<g fill="none" stroke="url(#GEIDb)"><path d="{arco(10, 54, 53, 8)}" stroke-width="1.05"/><path d="{arco(12.6, 51.4, 53, 10.6)}" stroke-width=".4" stroke-opacity=".75"/><path d="M10 53H54" stroke-width="1.05" stroke-linecap="round"/></g>'
        '<path d="M32 4.4l2.3 3.7L32 11.8 29.7 8.1z" fill="url(#GEIDb)" stroke="#07142b" stroke-width=".5" stroke-linejoin="round"/>'
        f'<g fill="url(#GEIDb)" filter="url(#GEIDg)"><path d="{caminho(G, gx)}"/><path d="{caminho(E, ex)}"/></g>'
        '<path d="M52.4 15.2l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z" fill="#fff3c4" opacity=".9"/>'
    )
    pleno = '<rect width="64" height="64" fill="url(#GEIDf)"/><g clip-path="url(#GEIDc)"><ellipse cx="18" cy="2" rx="40" ry="22" fill="url(#GEIDs)"/></g>'
    return defs + base + emblema, defs + pleno + '<g transform="translate(32 32) scale(.72) translate(-32 -32)">' + emblema + '</g>'


COMPLETO, MASCARAVEL = miolo()


saida = f"""// Gerado por scripts/gerar-logo.py — não editar à mão. Quadro 64x64.
export const LETRA_G = '{caminho(G, gx)}';
export const LETRA_E = '{caminho(E, ex)}';
export const ARCO_EXTERNO = '{arco(10, 54, 53, 8)}';
export const ARCO_INTERNO = '{arco(12.6, 51.4, 53, 10.6)}';
export const LINHA_BASE = 'M10 53H54';
/** Miolo do SVG da logo completa; GEID é trocado por um identificador único em cada uso. */
export const LOGO_MIOLO = `{COMPLETO}`;
/** Versão de fundo pleno (sem cantos) com a logo na zona segura: ícones adaptáveis do Android e do iOS. */
export const LOGO_PLENA = `{MASCARAVEL}`;
"""
(RAIZ / 'src/components/logoPaths.ts').write_text(saida)
print('ok', len(saida), 'bytes')
