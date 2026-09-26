"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/ui";

interface ModelsState {
  whisperCli: boolean;
  models: { downloaded: boolean; active: boolean }[];
  customModel: string | null;
  customModelFound: boolean;
}

/** First-run guidance: whisper.cpp and a model are needed before transcribing. */
export function SetupNotice() {
  const [state, setState] = useState<ModelsState | null>(null);
  useEffect(() => {
    api<ModelsState>("/api/models").then(setState).catch(() => {});
  }, []);
  if (!state) return null;

  const hasModel = state.models.some((m) => m.active && m.downloaded) || (state.customModel && state.customModelFound);
  if (state.whisperCli && hasModel) return null;

  return (
    <div className="card mb-6 border-gold/40 bg-gold-soft/40 p-4">
      <h2 className="font-semibold">Falta un paso para transcribir</h2>
      {!state.whisperCli ? (
        <p className="mt-1 text-sm text-muted">
          No se encontró whisper.cpp en este computador. Vuelve a ejecutar el instalador de Logoscribe
          (<code>instalar-mac.command</code> o <code>instalar-windows.bat</code>).
        </p>
      ) : (
        <p className="mt-1 text-sm text-muted">
          Descarga el modelo de transcripción (una sola vez, ≈1,6 GB). Después todo funciona sin internet y sin costo.
        </p>
      )}
      {state.whisperCli && <Link href="/ajustes" className="btn-primary mt-3">Ir a Ajustes y descargar el modelo</Link>}
    </div>
  );
}
