# Logoscribe

Convierte la grabación completa de un culto (alabanza + prédica) en una prédica transcrita, organizada en párrafos y lista para estudiar, buscar y exportar a Word o PDF. Todo corre en tu propio computador: sin costos por uso y sin enviar el audio a ningún servicio.

## Instalación

Necesitas acceso a este repositorio en GitHub (pídeselo al administrador) y unos 3 GB libres.

### Mac

1. Descarga el proyecto: botón verde **Code → Download ZIP** en GitHub, y descomprímelo en *Documentos*.
   (Si usas git: `git clone` en la carpeta que prefieras).
2. Abre la carpeta y haz **clic derecho → Abrir** sobre `instalar-mac.command` (la primera vez macOS pide confirmar).
3. Espera a que termine (10–20 minutos la primera vez). Puede pedirte la contraseña del Mac.

### Windows 10/11

1. Descarga el proyecto (**Code → Download ZIP**) y descomprímelo en *Documentos*.
2. Doble clic en `instalar-windows.bat`. Si Windows muestra «Windows protegió tu PC», elige **Más información → Ejecutar de todas formas**.
3. Espera a que termine (10–20 minutos la primera vez).

El instalador deja un acceso directo **Logoscribe** en el Escritorio.

### Primer uso

1. Abre **Logoscribe** desde el Escritorio. Se abre una ventana negra (déjala abierta mientras lo usas) y el navegador en `http://localhost:3131`.
2. Ve a **Ajustes** y descarga el modelo **Large v3 Turbo** (≈1,6 GB, una sola vez). En computadores con 8 GB de memoria o menos, usa el **comprimido**.
3. Listo: **Nueva prédica** → sube el audio del culto.

Para apagar Logoscribe, cierra la ventana negra.

### Actualizar

Cierra Logoscribe y ejecuta `actualizar-mac.command` o `actualizar-windows.bat`. (Requiere haber descargado el proyecto con git; si lo descargaste como ZIP, descarga el ZIP nuevo, descomprímelo encima y vuelve a ejecutar el instalador. Tus prédicas están en la carpeta `data` y no se pierden.)

## Cómo se usa

1. **Subir** el audio del culto (MP3, M4A, WAV…) o pegar el enlace compartido de OneDrive.
2. La app separa voz de música y **propone dónde empieza y termina la prédica**.
3. **Revisar el recorte** sobre la forma de onda: escuchar el inicio y el final, ajustar si hace falta.
4. **Transcribir** ese tramo con Whisper en tu computador.
5. Se organiza en **párrafos sin cambiar ninguna palabra**.
6. **Revisar y editar** con el audio sincronizado: clic en un párrafo para editarlo, Enter divide, Retroceso al inicio une, ▶ escucha desde ahí.
7. **Exportar** a Word o PDF con portada, números de página, citas bíblicas en negrita e índice de citas.

La biblioteca busca cualquier palabra dicha en tus prédicas, sin importar las tildes. Cada computador tiene su propia biblioteca (carpeta `data`).

## Velocidad de referencia

| Computador | Prédica de 1 hora |
| --- | --- |
| Mac con chip M4 (16 GB), Large v3 Turbo | ≈ 4 minutos (medido) |
| Windows con procesador, sin tarjeta gráfica | Bastante más lento (sin medir aún); el modelo comprimido ayuda |

## Opcional: motores en la nube

En `.env.local` (ver `.env.example`) se pueden configurar OpenAI (o un servidor compatible), Groq y Claude (para títulos de sección). No son necesarios.

## Para desarrolladores

```bash
pnpm install
pnpm dev          # web en http://localhost:3000 + worker con recarga
pnpm typecheck && pnpm lint
```

- Next.js 16 (App Router) + un **worker** (`src/worker`) que procesa la tabla `jobs`: importar, analizar, transcribir, organizar y descargar modelos.
- SQLite integrado de Node (`node:sqlite`) con búsqueda FTS5; datos en `data/` (no se versiona).
- Las herramientas (`ffmpeg`, `ffprobe`, `whisper-cli`) se buscan en: variable de entorno → `tools/bin` → PATH (`src/lib/tools.ts`).
- `scripts/`: `smoke.ts` (pipeline completo), `detect.ts` (detección voz/música), `compare.ts` (comparar transcripciones).

```
src/
  app/          páginas (biblioteca, nueva, predicas/[id], ajustes) y API
  components/   editor de recorte (wavesurfer), editor de transcripción, gestor de modelos…
  lib/          detect, transcribe, format, bible, export/, models, repo/db
  worker/       cola de trabajos y descargas de modelos
```
