"use client";

import { useState } from "react";
import { api } from "@/lib/ui";
import type { Sermon } from "@/lib/types";

const PROCESSING = ["importing", "uploaded", "analyzing", "transcribing", "formatting"];

/** Deletes a sermon (audio, transcript and exports data) after confirming. */
export function DeleteSermonButton({
  sermon,
  onDeleted,
  variant = "button",
  className = "",
}: {
  sermon: Pick<Sermon, "id" | "title" | "status">;
  onDeleted: () => void;
  variant?: "button" | "icon";
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function remove(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const running = PROCESSING.includes(sermon.status) ? "\nSe cancelará el proceso en curso." : "";
    if (!confirm(`¿Eliminar «${sermon.title}»?\nSe borran el audio y la transcripción de este computador. No se puede deshacer.${running}`)) return;
    setBusy(true);
    try {
      await api(`/api/sermons/${sermon.id}`, { method: "DELETE" });
      onDeleted();
    } catch (err) {
      alert(`No se pudo eliminar: ${(err as Error).message}`);
      setBusy(false);
    }
  }

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={remove}
        disabled={busy}
        title="Eliminar prédica"
        aria-label={`Eliminar ${sermon.title}`}
        className={`grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-danger/10 hover:text-danger disabled:opacity-50 ${className}`}
      >
        <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4 fill-current">
          <path d="M8 2h4a1 1 0 011 1v1h4v2H3V4h4V3a1 1 0 011-1zm-3 6h10l-.8 9.1a1 1 0 01-1 .9H6.8a1 1 0 01-1-.9L5 8zm3 2v6h1.5v-6H8zm2.5 0v6H12v-6h-1.5z" />
        </svg>
      </button>
    );
  }
  return (
    <button type="button" onClick={remove} disabled={busy} className={`btn-ghost text-danger ${className}`}>
      {busy ? "Eliminando…" : "Eliminar prédica"}
    </button>
  );
}
