export type SermonStatus =
  | "importing" // downloading from OneDrive
  | "uploaded" // waiting for analysis
  | "analyzing"
  | "review" // analysis done, team confirms the sermon boundaries
  | "transcribing"
  | "formatting"
  | "ready"
  | "failed";

/** Transcription always runs with whisper.cpp on this computer. */
export type EngineId = "local";

export interface Sermon {
  id: string;
  title: string;
  preacher: string | null;
  series: string | null;
  service_date: string | null;
  source_name: string | null;
  source_path: string | null;
  /** OneDrive/SharePoint sharing link the audio is imported from. */
  source_url: string | null;
  status: SermonStatus;
  duration: number | null;
  trim_start: number | null;
  trim_end: number | null;
  detected_start: number | null;
  detected_end: number | null;
  engine: EngineId | null;
  /** Leave songs inside the trim out of the transcript; null = automatic (on for podcasts/devotionals). */
  skip_music: 0 | 1 | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface Job {
  id: number;
  sermon_id: string;
  type: "import" | "analyze" | "transcribe" | "format";
  status: "queued" | "running" | "done" | "failed" | "canceled";
  progress: number;
  message: string | null;
}

export interface Segment {
  start: number;
  end: number;
  text: string;
}

export interface Block {
  kind: "heading" | "paragraph";
  text: string;
  start: number | null;
  end: number | null;
}

/** A span of the service classified by the audio analysis. */
export interface Region {
  start: number;
  end: number;
  kind: "speech" | "music" | "silence";
}

export interface Analysis {
  duration: number;
  /** Per-second RMS energy (dB), used to pick quiet cut points. */
  energyDb: number[];
  regions: Region[];
  sermon: { start: number; end: number } | null;
  /**
   * "service": worship + sermon, the sermon is the longest speech block.
   * "message": podcast, devotional… mostly speech, maybe intro/outro music;
   * everything from the first to the last spoken passage.
   */
  kind?: "service" | "message";
}
