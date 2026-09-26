import { SermonView } from "@/components/SermonView";

export default async function SermonPage(props: PageProps<"/predicas/[id]">) {
  const { id } = await props.params;
  return <SermonView id={id} />;
}
