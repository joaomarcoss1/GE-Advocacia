import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'lcov'],
      // piso de 80% nas regras de negócio de src/lib (folha, ponto, feriados, segurança e as regras de integridade)
      include: ['src/lib/folha.ts', 'src/lib/ponto.ts', 'src/lib/feriados.ts', 'src/lib/seguranca.ts', 'src/lib/regras.ts', 'src/lib/erros.ts', 'src/lib/slug.ts', 'src/lib/datetime.ts'],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 70 },
    },
  },
});
