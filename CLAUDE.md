@AGENTS.md

# Logoscribe — notas del proyecto

- Distribución: cada persona instala Logoscribe en su computador (Mac o Windows) con `instalar-*.command/.bat`; corre en http://localhost:3131 (`pnpm start`). Cada instalación tiene su propia biblioteca en `data/`.
- Transcripción por defecto: whisper.cpp local (modelos se descargan desde Ajustes). La transcripción en navegador (WebGPU) se quitó: Chrome no logra cargar los modelos por memoria.
- UI y mensajes en español. Next.js 16 (App Router) + worker en `src/worker` (tsx) que procesa la tabla `jobs`.
- DB: `node:sqlite` (sin dependencias nativas), FTS5 con `remove_diacritics`. Nada de ORM; SQL en `src/lib/repo.ts`.
- Regla de producto: nunca reescribir lo que dijo el predicador. El organizador (Claude o heurística) solo devuelve índices de oración.
- Whisper alucina texto sobre música ("Amara.org", etc.): por eso existe el paso de revisión del recorte y `cleanSegments`.
- Worker en dev usa `tsx watch --exclude "data/**"`; `node --watch` se reiniciaba en bucle con los archivos generados.
- pdfkit va en `serverExternalPackages` (lee sus métricas de fuente desde disco).
