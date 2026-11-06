import { caminhoCoroa } from "@/components/site/sistema/geometria";
import "./estrutura.css";

/**
 * A faixa que divide a página em duas metades.
 *
 * Uma arcada de coroas em verde profundo nasce do chão claro e é a própria
 * borda de cima da seção escura que vem depois (a estrutura): onde a arcada
 * termina, o campo continua, sem emenda. Atrás dela, a mesma arcada em
 * verde-maçã aparece deslocada para cima e meia coroa para o lado, como uma
 * impressão fora de registro — o mesmo gesto do eco que sustenta a janela do
 * topo.
 *
 * O TAMANHO ACOMPANHA A TELA, e a conta é de coroas inteiras: o desenho é um
 * SVG com viewBox de N coroas, então ele escala por inteiro com a largura e
 * nunca termina num dente cortado. N muda por faixa de largura (3 no celular,
 * 5 no tablet, 8 no desktop), o que mantém cada coroa entre ~115 e ~200px —
 * um gesto de assinatura, não um friso.
 *
 * O eco entra sozinho quando a faixa aparece (`data-entra`); o motor só mexe em
 * `transform`/`opacity`, e o deslocamento fixo mora em `translate`.
 */

/** Proporção largura/altura de cada coroa da arcada. */
const PROPORCAO = 1.14;
const CAMINHO = caminhoCoroa(PROPORCAO);
const LARGURA = 114;
const ALTURA = 100;
/** Cada coroa invade a vizinha por 1 unidade: sem isso, a suavização do SVG deixa uma costura clara entre elas. */
const SOBRA = 1;

function Arcada({ n, eco = false }: { n: number; eco?: boolean }) {
  // O eco ganha uma coroa a mais de cada lado: o deslocamento lateral não pode
  // deixar a borda da tela vazia.
  const indices = Array.from({ length: n + (eco ? 2 : 0) }, (_, i) => i - (eco ? 1 : 0));
  return (
    <svg
      className={`faixa-arcada faixa-n${n}`}
      viewBox={`0 0 ${n * LARGURA} ${ALTURA}`}
      aria-hidden="true"
      focusable="false"
      style={{ overflow: "visible" }}
    >
      {indices.map((i) => (
        <path
          key={i}
          d={CAMINHO}
          transform={`translate(${i * LARGURA} 0) scale(${LARGURA + SOBRA} ${ALTURA})`}
          fill="currentColor"
        />
      ))}
    </svg>
  );
}

export function FaixaDaPagina() {
  return (
    <div className="faixa-pagina" aria-hidden="true" data-entra>
      <div className="faixa-eco" data-item>
        <Arcada n={3} eco />
        <Arcada n={5} eco />
        <Arcada n={8} eco />
      </div>
      <div className="faixa-campo">
        <Arcada n={3} />
        <Arcada n={5} />
        <Arcada n={8} />
      </div>
    </div>
  );
}
