import { falaNoFrame } from "@/data/narracao";

/**
 * As legendas.
 *
 * Ficam FORA do palco escalado, na caixa do visor — se estivessem dentro,
 * encolheriam junto com o filme e ficariam ilegíveis em tela pequena, que é
 * justamente onde legenda mais importa.
 *
 * `aria-live="polite"` faz o leitor de tela anunciar a frase quando ela troca,
 * sem interromper o que já está sendo lido.
 */
export function Legendas({ frame, visivel }: { frame: number; visivel: boolean }) {
  const fala = falaNoFrame(Math.round(frame));
  if (!visivel || fala === null) return null;

  return (
    <div className="jp-legenda" role="status" aria-live="polite">
      {fala.texto}
    </div>
  );
}
