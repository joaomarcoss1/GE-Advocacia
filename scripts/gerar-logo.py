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


saida = f"""// Gerado por scripts/gerar-logo.py — não editar à mão. Quadro 64x64.
export const LETRA_G = '{caminho(G, gx)}';
export const LETRA_E = '{caminho(E, ex)}';
export const ARCO_EXTERNO = '{arco(10, 54, 53, 8)}';
export const ARCO_INTERNO = '{arco(12.6, 51.4, 53, 10.6)}';
export const LINHA_BASE = 'M10 53H54';
"""
(RAIZ / 'src/components/logoPaths.ts').write_text(saida)
print('ok', len(saida), 'bytes')
