import { distinctValues } from "@/lib/repo";

/** Known preachers and series, for autocomplete and library filters. */
export async function GET() {
  return Response.json({ preachers: distinctValues("preacher"), series: distinctValues("series") });
}
