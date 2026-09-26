import { UploadForm } from "@/components/UploadForm";

export default function NuevaPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-serif text-3xl font-semibold">Nueva prédica</h1>
      <p className="mt-1 mb-6 text-sm text-muted">
        Sube la grabación completa del culto, con alabanza y todo, o pega el enlace de OneDrive. En el siguiente paso confirmas dónde empieza y
        termina la prédica.
      </p>
      <UploadForm />
    </div>
  );
}
