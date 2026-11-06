import { Star } from "lucide-react";

import { AVALIACOES } from "@/lib/jp";

/**
 * As cinco estrelas da nota do Google, com a última pintada na proporção da
 * casa decimal (4,6 → quatro cheias e 60% da quinta).
 *
 * Só para a NOTA GERAL. Depoimento individual não ganha estrelas: o site não
 * sabe quantas estrelas cada pessoa deu, e inventar seria publicar avaliação
 * que ninguém fez.
 *
 * Decorativo: quem lê a nota é o texto ao lado ("4,6 no Google").
 */
export function Estrelas({
  nota = AVALIACOES.nota,
  tamanho = "1rem",
  className = "",
}: {
  nota?: number;
  tamanho?: string;
  className?: string;
}) {
  const cheias = Math.floor(nota);
  const parcial = Math.round((nota - cheias) * 100);
  const lado = { width: tamanho, height: tamanho };

  return (
    <span className={`inline-flex items-center gap-[0.12em] ${className}`} aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => {
        const preenchimento = i < cheias ? 100 : i === cheias ? parcial : 0;
        return (
          <span key={i} className="relative inline-block shrink-0" style={lado}>
            <Star
              className="absolute inset-0 text-[var(--estrela-vazia)]"
              style={lado}
              fill="currentColor"
              strokeWidth={0}
            />
            {preenchimento > 0 && (
              <span
                className="absolute inset-0 overflow-hidden"
                style={{ width: `${preenchimento}%` }}
              >
                <Star
                  className="text-[var(--estrela)]"
                  style={lado}
                  fill="currentColor"
                  strokeWidth={0}
                />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}
