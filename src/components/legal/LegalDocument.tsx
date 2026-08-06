/**
 * Casca comum dos documentos legais.
 *
 * Termos e política precisam parecer o mesmo documento e envelhecer juntos.
 * Com o cabeçalho, o aviso de pendências e o espaçamento duplicados em cada
 * rota, uma correção feita em um lado silenciosamente deixaria o outro
 * diferente — e num documento legal a divergência não é só estética.
 */

import { Link } from "@tanstack/react-router";
import { ArrowLeft, FileWarning } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/flycontrol-logo.png";

export function LegalSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 space-y-2">
      <h2 className="text-lg font-bold">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

/** Bloco em destaque para o que ainda depende de redação jurídica. */
export function PendingLegalNotice({
  intro,
  sections,
}: {
  intro: string;
  sections: readonly string[];
}) {
  if (sections.length === 0) return null;

  return (
    <div className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
      <FileWarning className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
      <div className="space-y-2 text-sm">
        <p className="font-semibold text-foreground">Documento em elaboração</p>
        <p className="text-muted-foreground">{intro}</p>
        <ul className="list-inside list-disc text-muted-foreground">
          {sections.map((section) => (
            <li key={section}>{section}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function LegalDocument({
  title,
  version,
  lastUpdated,
  pendingIntro,
  pendingSections,
  children,
  footer,
}: {
  title: string;
  version: string;
  lastUpdated: string;
  pendingIntro: string;
  pendingSections: readonly string[];
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="safe-x sticky top-0 z-[var(--z-sticky-header)] border-b border-border bg-background">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4">
          <Link to="/">
            <img src={logo} alt="FlyControl" className="h-8 w-auto" />
          </Link>
          <Button asChild variant="ghost" size="sm" className="h-11">
            <Link to="/plans">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar aos planos
            </Link>
          </Button>
        </div>
      </header>

      <main className="safe-x mx-auto max-w-3xl space-y-8 px-4 py-8 sm:py-12">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
          <p className="text-sm text-muted-foreground">
            Versão {version} · atualizado em {lastUpdated}
          </p>
        </div>

        {/* O aviso vai no topo, e não no rodapé: quem precisa saber que o
            documento está incompleto precisa saber antes de ler, não depois. */}
        <PendingLegalNotice intro={pendingIntro} sections={pendingSections} />

        {children}

        {footer}
      </main>
    </div>
  );
}
