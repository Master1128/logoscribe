import fs from "node:fs";
import { getSettings, saveSettings, secretStatus } from "@/lib/settings";

export async function GET() {
  const settings = getSettings();
  return Response.json({ settings, secrets: secretStatus(), localModelFound: fs.existsSync(settings.localModelPath) });
}

export async function PUT(request: Request) {
  saveSettings(await request.json());
  return GET();
}
