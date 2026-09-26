import type { Metadata } from "next";
import { Inter, Literata } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const literata = Literata({ variable: "--font-literata", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Logoscribe — Prédicas transcritas",
  description: "Recorta, transcribe y organiza las prédicas de la iglesia para estudiarlas.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${inter.variable} ${literata.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <header className="border-b border-line bg-surface/80 backdrop-blur">
          <nav className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-serif text-lg font-semibold text-accent">
              <span aria-hidden className="grid h-7 w-7 place-items-center rounded-md bg-accent text-sm text-surface">L</span>
              Logoscribe
            </Link>
            <div className="ml-auto flex items-center gap-1 text-sm">
              <Link href="/" className="hidden rounded-md px-3 py-1.5 text-muted hover:bg-accent-soft hover:text-ink sm:block">Biblioteca</Link>
              <Link href="/ajustes" className="rounded-md px-3 py-1.5 text-muted hover:bg-accent-soft hover:text-ink">Ajustes</Link>
              <Link href="/nueva" className="btn-primary ml-1 px-3 py-1.5 whitespace-nowrap"><span>Nueva<span className="hidden sm:inline"> prédica</span></span></Link>
            </div>
          </nav>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
