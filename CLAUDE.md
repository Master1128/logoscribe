@AGENTS.md

# Logoscribe — notas del proyecto

- Distribución: cada persona instala Logoscribe en su computador (Mac o Windows) con `instalar-*.command/.bat`; corre en http://localhost:3131 (`pnpm start`). Cada instalación tiene su propia biblioteca en la carpeta de datos de aplicaciones (Mac: `~/Library/Application Support/Logoscribe`, Windows: `%LOCALAPPDATA%\Logoscribe`), nunca junto al código: Documentos suele estar sincronizado por iCloud/OneDrive y eso duplica archivos ("archivo 2") y puede dañar SQLite. `./data` de versiones viejas se mueve sola (`db.ts`).
- Build en `.next.nosync` (iCloud no sincroniza carpetas `*.nosync`).
- Texto guardado siempre en NFC (títulos pegados de nombres de archivo de macOS vienen en NFD y rompían el PDF).
- Transcripción por defecto: whisper.cpp local (modelos se descargan desde Ajustes). La transcripción en navegador (WebGPU) se quitó: Chrome no logra cargar los modelos por memoria.
- UI y mensajes en español. Next.js 16 (App Router) + worker en `src/worker` (tsx) que procesa la tabla `jobs`.
- DB: `node:sqlite` (sin dependencias nativas), FTS5 con `remove_diacritics`. Nada de ORM; SQL en `src/lib/repo.ts`.
- Regla de producto: nunca reescribir lo que dijo el predicador. El organizador (heurística local o IA) solo devuelve índices de oración.
- Organizador con IA multi-proveedor (`src/lib/providers.ts`, `src/lib/format.ts`): Claude por SDK de Anthropic; OpenAI, DeepSeek, Gemini, GLM y "custom" (Ollama/LiteLLM) por la API compatible con OpenAI en modo JSON (con reintento sin `response_format`). Claves en la tabla `settings` (`apiKey:<proveedor>`), nunca se devuelven completas al navegador.
- No hay transcripción en la nube: se quitaron OpenAI/Groq para transcribir (quedan en el historial de git).
- Whisper alucina texto sobre música ("Amara.org", etc.): por eso existe el paso de revisión del recorte y `cleanSegments`.
- Worker en dev usa `tsx watch --exclude "data/**"`; `node --watch` se reiniciaba en bucle con los archivos generados.
- pdfkit va en `serverExternalPackages` (lee sus métricas de fuente desde disco).
