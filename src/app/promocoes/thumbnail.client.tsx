"use client";

/**
 * Product thumbnail with broken-image fallback.
 *
 * A thumbnail URL resolved from the ML API can still 404 later (ad removed,
 * image swapped, stale cache entry) — `onError` swaps to the neutral
 * placeholder instead of the browser's default broken-image icon.
 *
 * `size` (px) is optional — defaults to 64 (Vendas cards). Expedição uses a
 * smaller 48 for a denser row.
 */
import { useState } from "react";
import { ImageOff } from "lucide-react";

export function Thumbnail({
  src,
  alt,
  size = 64,
  fit = "cover",
}: {
  src?: string;
  alt: string;
  size?: number;
  /** "cover" preenche e corta; "contain" mostra a imagem inteira sem cortar. */
  fit?: "cover" | "contain";
}) {
  const [failed, setFailed] = useState(false);
  const dimension = { width: size, height: size };

  if (!src || failed) {
    return (
      <div
        style={dimension}
        className="grid shrink-0 place-items-center rounded-xl border border-hairline bg-fundo text-tinta-fraca ring-1 ring-black/[0.02]"
      >
        <ImageOff className="size-5" aria-hidden />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      style={dimension}
      onError={() => setFailed(true)}
      className={`shrink-0 rounded-xl border border-hairline bg-white ring-1 ring-black/[0.02] ${
        fit === "contain" ? "object-contain p-0.5" : "object-cover"
      }`}
    />
  );
}
