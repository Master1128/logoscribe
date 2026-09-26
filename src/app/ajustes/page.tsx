import { SettingsForm } from "@/components/SettingsForm";

export default function AjustesPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-serif text-3xl font-semibold">Ajustes</h1>
      <p className="mt-1 mb-6 text-sm text-muted">Cómo se transcriben y organizan las prédicas.</p>
      <SettingsForm />
    </div>
  );
}
