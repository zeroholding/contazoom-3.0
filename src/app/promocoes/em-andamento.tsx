import { LockKeyhole } from "lucide-react";
import Link from "next/link";

export function PromocoesEmAndamento() {
  return (
    <section className="mx-auto mt-8 max-w-md rounded-2xl border border-hairline bg-superficie p-6 text-center shadow-sm sm:p-8">
      <span className="mx-auto mb-4 grid size-12 place-items-center rounded-xl bg-marca-suave text-marca-forte">
        <LockKeyhole className="size-6" aria-hidden="true" />
      </span>
      <h1 className="cz-titulo text-xl">Promoções em andamento</h1>
      <p className="mt-2 text-sm text-tinta-suave">
        Estamos preparando esta área. O acesso será liberado em breve.
      </p>
      <Link
        href="/dashboard"
        className="mt-5 inline-flex min-h-10 items-center rounded-lg bg-marca-suave px-4 text-sm font-semibold text-marca-forte hover:bg-marca-borda"
      >
        Voltar ao painel
      </Link>
    </section>
  );
}
