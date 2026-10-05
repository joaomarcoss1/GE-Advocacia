// Gera tests_60_paridade.sql a partir de src/lib/__fixtures__/casos-regra.json:
// os MESMOS casos usados pelo vitest rodam contra _classificar e _turno_previsto no Postgres.
import { readFileSync, writeFileSync } from 'node:fs';
const j = JSON.parse(readFileSync(new URL('../src/lib/__fixtures__/casos-regra.json', import.meta.url), 'utf8'));
const q = s => `'${String(s).replace(/'/g, "''")}'`;
const min = h => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
let out = `-- GERADO por supabase/gerar_paridade.mjs (não edite): paridade SQL x TypeScript.\n\\set ON_ERROR_STOP on\nselect t.admin_db();\n\\echo == PAR1. _classificar contra os casos de referência\n`;
for (const c of j.classificar) {
  out += `select t.ok((select diferenca = ${c.diferenca} and status = ${q(c.status)} from public._classificar(${q(c.tipo)}, ${c.previsto == null ? 'null::text' : q(c.previsto)}, ${min(c.real)}, ${c.tol}, ${c.lim})), ${q('classificar: ' + c.rotulo)});\n`;
}
out += `\\echo == PAR2. _turno_previsto contra os casos de referência\n`;
for (const c of j.turno) {
  const dias = JSON.stringify(j.escalas[c.dias]);
  out += `select t.ok(public._turno_previsto(${q(dias)}::jsonb, ${c.dow}, ${q(c.tipo)}) is not distinct from ${c.previsto == null ? 'null::text' : q(c.previsto)}, ${q('turno: ' + c.rotulo)});\n`;
}
writeFileSync(new URL('./tests_60_paridade.sql', import.meta.url), out);
console.log(`paridade: ${j.classificar.length + j.turno.length} casos gerados`);
