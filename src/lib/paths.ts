import path from "node:path";

export const DATA_DIR = path.resolve(process.env.LOGOSCRIBE_DATA_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "data"));

export function sermonDir(id: string) {
  return path.join(DATA_DIR, "sermons", id);
}

export const sermonFiles = (id: string) => {
  const dir = sermonDir(id);
  return {
    dir,
    /** Browser-friendly transcode used for playback and trimming UI. */
    preview: path.join(dir, "preview.mp3"),
    peaks: path.join(dir, "peaks.json"),
    analysis: path.join(dir, "analysis.json"),
    work: path.join(dir, "work"),
  };
};
