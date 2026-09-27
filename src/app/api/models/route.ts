import fs from "node:fs";
import {
  findModel, getDownloads, isDownloaded, modelPath, MODELS, queueDownload, updateDownload, VAD, whisperCliAvailable,
} from "@/lib/models";
import { searchedDirs } from "@/lib/tools";
import { getSettings, saveSettings } from "@/lib/settings";

function state() {
  const settings = getSettings();
  const downloads = new Map(getDownloads().map((d) => [d.model_id, d]));
  const describe = (m: typeof VAD) => {
    const d = downloads.get(m.id);
    return {
      id: m.id,
      label: m.label,
      description: m.description,
      bytes: m.bytes,
      recommended: Boolean(m.recommended),
      downloaded: isDownloaded(m),
      active: modelPath(m) === settings.localModelPath,
      download: d && ["queued", "downloading", "failed"].includes(d.status) ? d : null,
    };
  };
  return {
    whisperCli: whisperCliAvailable(),
    searchedDirs: whisperCliAvailable() ? [] : searchedDirs(),
    activePath: settings.localModelPath,
    models: MODELS.map(describe),
    vad: describe(VAD),
    customModel: !MODELS.some((m) => modelPath(m) === settings.localModelPath) ? settings.localModelPath : null,
    customModelFound: fs.existsSync(settings.localModelPath),
  };
}

export async function GET() {
  return Response.json(state());
}

/** { id, action: "download" | "cancel" | "activate" | "delete" } */
export async function POST(request: Request) {
  const { id, action } = await request.json();
  const model = findModel(String(id));
  if (!model) return Response.json({ error: "Modelo desconocido" }, { status: 400 });

  switch (action) {
    case "download":
      if (isDownloaded(model)) return Response.json({ error: "Ya está descargado" }, { status: 400 });
      queueDownload(model.id);
      break;
    case "cancel":
      updateDownload(model.id, { status: "canceled" });
      break;
    case "activate":
      if (model.id === VAD.id || !isDownloaded(model)) return Response.json({ error: "Primero descarga el modelo" }, { status: 400 });
      saveSettings({ localModelPath: modelPath(model) });
      break;
    case "delete":
      fs.rmSync(modelPath(model), { force: true });
      break;
    default:
      return Response.json({ error: "Acción desconocida" }, { status: 400 });
  }
  return Response.json(state());
}
