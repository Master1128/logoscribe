# Logoscribe

Convierte la grabación completa de un culto (alabanza + prédica) en una prédica transcrita, organizada en párrafos y lista para estudiar, buscar y exportar a Word o PDF. Todo corre en tu propio computador: sin costos por uso y sin enviar el audio a ningún servicio.

## Instalación

Necesitas unos 3 GB libres y conexión a internet durante la instalación. No hace falta cuenta de GitHub.

### Mac

1. Abre la app **Terminal** (búscala con ⌘ + espacio escribiendo «Terminal»).
2. Copia esta línea, pégala en la Terminal y pulsa Enter:

   ```bash
   curl -fsSL https://raw.githubusercontent.com/Master1128/logoscribe/main/scripts/instalar-mac.sh | bash
   ```

3. Espera a que termine (10–20 minutos la primera vez). Puede pedirte la contraseña del Mac (al escribirla no se ven los caracteres; es normal).

Se instala en la carpeta `Logoscribe` de tu carpeta personal y deja un acceso directo **Logoscribe** en el Escritorio.

### Windows 10/11

1. Abre **PowerShell** (menú Inicio → escribe «PowerShell»).
2. Copia esta línea, pégala y pulsa Enter:

   ```powershell
   irm https://raw.githubusercontent.com/Master1128/logoscribe/main/scripts/windows/instalar-web.ps1 | iex
   ```

3. Espera a que termine (10–20 minutos la primera vez).

Se instala en `C:\Users\<tu usuario>\Logoscribe` y deja un acceso directo **Logoscribe** en el Escritorio.

### Alternativa: descargar el ZIP

**[⬇ Descargar Logoscribe (ZIP)](https://github.com/Master1128/logoscribe/archive/refs/heads/main.zip)**, descomprímelo y abre `instalar-mac.command` (Mac) o `instalar-windows.bat` (Windows).

Como el programa no está firmado por un desarrollador de pago, el sistema avisa la primera vez:

- **Mac:** si dice «Apple no pudo verificar…», pulsa **Listo**, ve a **Configuración del Sistema → Privacidad y seguridad**, baja hasta el final y pulsa **Abrir de todas formas**. Luego vuelve a abrir el instalador.
- **Windows:** si dice «Windows protegió tu PC», elige **Más información → Ejecutar de todas formas**.

### Primer uso

1. Abre **Logoscribe** desde el Escritorio. Se abre una ventana negra (déjala abierta mientras lo usas) y el navegador en `http://localhost:3131`.
2. Ve a **Ajustes** y descarga el modelo **Large v3 Turbo** (≈1,6 GB, una sola vez). En computadores con 8 GB de memoria o menos, usa el **comprimido**.
3. Listo: **Nueva prédica** → sube el audio del culto.

Para apagar Logoscribe, cierra la ventana negra.

### Actualizar

Cierra Logoscribe y ejecuta `actualizar-mac.command` o `actualizar-windows.bat`: descargan la última versión y la instalan. Tus prédicas no se tocan (ver «Dónde se guardan las prédicas»).

### Dónde se guardan las prédicas

La biblioteca, los audios y el modelo se guardan fuera de la carpeta del programa, en una carpeta que iCloud y OneDrive no sincronizan (sincronizarla mientras se escribe puede dañar la biblioteca):

- **Mac:** `~/Library/Application Support/Logoscribe`
- **Windows:** `%LOCALAPPDATA%\Logoscribe`

Las versiones anteriores usaban la carpeta `data` del proyecto; se mueve sola la primera vez que abres la nueva versión.

## Cómo se usa

1. **Agregar** la grabación del culto, de tres formas (en **Nueva prédica**):
   - **Archivo:** sube el MP3, M4A, WAV…
   - **Enlace:** pega un video de **YouTube**, un episodio del **podcast** (Spotify), un enlace directo a un audio o un archivo compartido de **OneDrive**. El título, la fecha, el predicador y la serie se llenan solos.
   - **Podcast:** explora todos los episodios del podcast de la iglesia, búscalos e impórtalos con un clic; los que ya están en tu biblioteca aparecen marcados.
2. La app separa voz de música y **propone dónde empieza y termina la prédica**.
3. **Revisar el recorte** sobre la forma de onda: escuchar el inicio y el final, ajustar si hace falta.
4. **Transcribir** ese tramo con Whisper en tu computador.
5. Se organiza en **párrafos sin cambiar ninguna palabra** (ver abajo).
6. **Revisar y editar** con el audio sincronizado: clic en un párrafo para editarlo, Enter divide, Retroceso al inicio une, ▶ escucha desde ahí.
7. **Exportar** a Word o PDF con portada, números de página, citas bíblicas en negrita e índice de citas.

La biblioteca busca cualquier palabra dicha en tus prédicas, sin importar las tildes. Cada computador tiene su propia biblioteca.

## Velocidad de referencia

| Computador | Prédica de 1 hora |
| --- | --- |
| Mac con chip M4 (16 GB), Large v3 Turbo | ≈ 4 minutos (medido) |
| Windows con procesador, sin tarjeta gráfica | Bastante más lento (sin medir aún); el modelo comprimido ayuda |

## Organización del texto

Después de transcribir, el texto se divide en párrafos. Hay dos opciones en **Ajustes → Organización del texto**:

- **Básico** (por defecto, sin internet): párrafos por pausas y longitud.
- **Con IA**: agrupa por ideas y agrega títulos de sección. Elige el proveedor — Claude, OpenAI, DeepSeek, Gemini, GLM u otro compatible con OpenAI (por ejemplo Ollama en el mismo computador) —, pega la clave y pulsa «Probar con un texto de ejemplo». La clave se guarda solo en ese computador. Se envía el texto transcrito, nunca el audio.

En ambos casos la IA solo decide dónde empieza cada párrafo: **nunca cambia lo que dijo el predicador**. Si el proveedor falla, se usa el organizador básico y la prédica queda igual de lista.

## Para desarrolladores

```bash
pnpm install
pnpm dev          # web en http://localhost:3000 + worker con recarga
pnpm typecheck && pnpm lint
```

- Next.js 16 (App Router) + un **worker** (`src/worker`) que procesa la tabla `jobs`: importar, analizar, transcribir, organizar y descargar modelos.
- SQLite integrado de Node (`node:sqlite`) con búsqueda FTS5; datos en la carpeta de datos de aplicaciones del sistema (`src/lib/paths.ts`, o `LOGOSCRIBE_DATA_DIR`).
- La compilación va a `.next.nosync` para que iCloud Drive no la sincronice.
- Las herramientas (`ffmpeg`, `ffprobe`, `whisper-cli`) se buscan en: variable de entorno → `tools/bin` → PATH (`src/lib/tools.ts`).
- `scripts/`: `smoke.ts` (pipeline completo), `detect.ts` (detección voz/música), `compare.ts` (comparar transcripciones).

```
src/
  app/          páginas (biblioteca, nueva, predicas/[id], ajustes) y API
  components/   editor de recorte (wavesurfer), editor de transcripción, gestor de modelos…
  lib/          detect, transcribe, format, bible, export/, models, repo/db
  worker/       cola de trabajos y descargas de modelos
```

## Licencia

[MIT](LICENSE): puedes usarlo, modificarlo y compartirlo libremente.
