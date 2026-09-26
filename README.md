# Logoscribe

Convierte la grabación completa de un culto (alabanza + prédica) en una prédica transcrita, organizada en párrafos y lista para estudiar, buscar y exportar a Word o PDF.

## Flujo

1. **Subir** el audio del culto (MP3, M4A, WAV, OGG…) o **pegar el enlace compartido de OneDrive**.
2. **Análisis automático**: la app separa voz de música y propone dónde empieza y termina la prédica.
3. **Revisar el recorte** sobre la forma de onda: escuchar el inicio y el final, ajustar con los botones o arrastrando.
4. **Transcribir** solo ese tramo, con Whisper local (gratis) u OpenAI / Groq (nube).
5. **Organizar**: se divide en párrafos (y títulos de sección si se usa Claude) **sin cambiar ninguna palabra**. El organizador solo decide dónde empieza cada párrafo.
6. **Revisar y editar** con el audio sincronizado: clic en un párrafo para editarlo, Enter para dividir, Retroceso al inicio para unir, ▶ para escuchar desde ahí.
7. **Exportar** a Word o PDF con portada, numeración de páginas, citas bíblicas en negrita e índice de citas.

La biblioteca permite buscar cualquier palabra dicha en cualquier prédica, sin importar las tildes.

## Requisitos

- Node.js 24 o superior (usa el SQLite integrado de Node)
- pnpm
- ffmpeg (`brew install ffmpeg`)
- whisper.cpp para transcribir localmente (`brew install whisper-cpp`)

## Puesta en marcha

```bash
pnpm install
pnpm dev                     # levanta la web (http://localhost:3000) y el worker
```

Luego, en **Ajustes → Whisper local**, descarga el modelo **Large v3 Turbo** (≈1,6 GB, una sola vez). Se activa solo al terminar, junto con el detector de voz (Silero VAD). Desde ahí también se pueden activar o eliminar otros modelos.

`pnpm dev` arranca dos procesos: la aplicación web y el **worker**, que hace el trabajo pesado (descargas, ffmpeg, Whisper, organización). Si el worker no está corriendo, las prédicas se quedan "en cola".

En producción: `pnpm build && pnpm start`.

### Rendimiento de referencia

Mac con chip M4 (16 GB), Large v3 Turbo + VAD: una prédica de 68 minutos se transcribe en unos 4 minutos, sin costo.

## Motores en la nube (opcionales)

Configurables en `.env.local` (ver `.env.example`); las claves solo se leen en el servidor.

| Variable | Para qué |
| --- | --- |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` | Whisper de OpenAI o de un servidor compatible (LiteLLM, etc.) |
| `GROQ_API_KEY` | Groq (muy rápido; la cuenta gratuita permite ~2 h de audio por hora) |
| `ANTHROPIC_API_KEY` | Organizar párrafos por idea y títulos de sección con Claude. Sin ella se usa el organizador básico. |

Con motores en la nube la app reintenta sola cuando se alcanza un límite de uso y repara tramos que Whisper se salta o decodifica mal. En Ajustes, "Probar conexión" verifica cada motor.

## Estructura

```
src/
  app/                 páginas (biblioteca, nueva, predicas/[id], ajustes) y API
  components/          UI: editor de recorte (wavesurfer), editor de transcripción…
  lib/
    detect.ts          detección voz/música y propuesta de la prédica
    transcribe.ts      motores: whisper.cpp local, OpenAI, Groq (por partes de ~10 min cortadas en pausas)
    format.ts          oraciones → párrafos/secciones (Claude o heurística), sin tocar el texto
    bible.ts           detección de citas bíblicas escritas y habladas
    export/            Word (docx) y PDF (pdfkit)
    db.ts, repo.ts     SQLite + búsqueda de texto completo (FTS5)
  worker/              cola de trabajos (analizar, transcribir, organizar)
data/                  audios, base de datos y modelos (no se versiona)
```

## Próximos pasos

- Navegar carpetas de OneDrive con inicio de sesión de Microsoft (hoy se importa pegando el enlace compartido).
- Inicio de sesión para el equipo de medios y despliegue en un servidor.
- Insertar el texto de los versículos citados (Reina-Valera 1909, de dominio público).
