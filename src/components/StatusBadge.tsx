import { STATUS_LABEL } from "@/lib/ui";
import type { SermonStatus } from "@/lib/types";

const TONE: Record<SermonStatus, string> = {
  importing: "bg-accent-soft text-accent",
  uploaded: "bg-accent-soft text-accent",
  analyzing: "bg-accent-soft text-accent",
  transcribing: "bg-accent-soft text-accent",
  formatting: "bg-accent-soft text-accent",
  review: "bg-gold-soft text-gold",
  ready: "bg-ok/10 text-ok",
  failed: "bg-danger/10 text-danger",
};

export function StatusBadge({ status }: { status: SermonStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE[status]}`}>
      {["importing", "uploaded", "analyzing", "transcribing", "formatting"].includes(status) && (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
      )}
      {STATUS_LABEL[status]}
    </span>
  );
}
