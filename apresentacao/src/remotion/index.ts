import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root";

/**
 * Ponto de entrada do Remotion.
 *
 * `npm run video:preview` (Studio) e `npm run video:render` (MP4) apontam para
 * este arquivo. Ele não importa nada do visualizador web — as duas metades só se
 * encontram em `src/film/Filme.tsx`.
 */
registerRoot(RemotionRoot);
