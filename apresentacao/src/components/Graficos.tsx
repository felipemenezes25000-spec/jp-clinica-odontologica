import { cor, fonte, raio, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { Contador } from "@/motion/primitivas";
import { aleatorio, easeOutQuint, escalonar, interpolar, progresso } from "@/motion/timing";

/**
 * Os gráficos da peça.
 *
 * Item 54: nada de biblioteca genérica. Não por purismo — é que gráfico de
 * biblioteca vem com eixo, grade, tooltip e legenda, e aqui cada um desses
 * elementos seria ruído: a peça mostra UMA relação por vez, para um olho que
 * está assistindo, não explorando. Um `<div>` com largura calculada comunica
 * melhor do que um SVG com cinco camadas.
 *
 * Todos animam por `frame`, como o resto.
 */

/* -------------------------------------------------------------------------- */
/* Funil                                                                      */
/* -------------------------------------------------------------------------- */

export function Funil({
  etapas,
  em = 0,
  largura = 980,
  alturaEtapa = 74,
  espaco = 12,
}: {
  etapas: readonly { etapa: string; valor: number }[];
  em?: number;
  largura?: number;
  alturaEtapa?: number;
  espaco?: number;
}) {
  const frame = useFrame();
  const topo = etapas[0]?.valor ?? 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: espaco }}>
      {etapas.map((etapa, i) => {
        const inicio = em + escalonar(i, 9);
        const t = progresso(frame, inicio, 34, easeOutQuint);
        const razao = etapa.valor / topo;
        // A escada de cor escurece conforme o funil aperta: o olho lê que a
        // etapa é mais rara sem precisar comparar dois números.
        const mistura = i / Math.max(1, etapas.length - 1);
        const fundo = `color-mix(in srgb, ${cor.verde} ${Math.round((1 - mistura) * 100)}%, ${cor.verdeEscuro})`;
        const percentual = topo > 0 ? (etapa.valor / topo) * 100 : 0;

        return (
          <div
            key={etapa.etapa}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 22,
              opacity: t,
              transform: `translate3d(${-18 * (1 - t)}px, 0, 0)`,
            }}
          >
            <div
              style={{
                width: 260,
                textAlign: "right",
                fontFamily: fonte.texto,
                fontSize: tamanho.apoio,
                color: cor.tintaSuave,
                fontWeight: 500,
                flex: "none",
              }}
            >
              {etapa.etapa}
            </div>

            <div style={{ width: largura, position: "relative", height: alturaEtapa }}>
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: raio.medio,
                  background: "#EFF3EB",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: 0,
                  width: `${razao * t * 100}%`,
                  borderRadius: raio.medio,
                  background: fundo,
                  display: "flex",
                  alignItems: "center",
                  paddingLeft: 22,
                  minWidth: 130,
                }}
              >
                <span
                  style={{
                    fontFamily: fonte.display,
                    fontWeight: 800,
                    fontSize: tamanho.destaque,
                    color: cor.branco,
                    fontVariantNumeric: "tabular-nums",
                    letterSpacing: "-0.02em",
                  }}
                >
                  <Contador ate={etapa.valor} em={inicio} dur={34} />
                </span>
              </div>
            </div>

            <div
              style={{
                width: 74,
                fontFamily: fonte.texto,
                fontSize: tamanho.legenda,
                color: cor.tintaFraca,
                fontVariantNumeric: "tabular-nums",
                flex: "none",
              }}
            >
              {percentual.toFixed(percentual >= 10 ? 0 : 1)}%
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Barras horizontais (segmentação)                                           */
/* -------------------------------------------------------------------------- */

export function Segmentos({
  itens,
  em = 0,
  largura = 620,
}: {
  itens: readonly { rotulo: string; quantidade: number; cor: string }[];
  em?: number;
  largura?: number;
}) {
  const frame = useFrame();
  const maior = Math.max(...itens.map((i) => i.quantidade), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {itens.map((item, i) => {
        const inicio = em + escalonar(i, 7);
        const t = progresso(frame, inicio, 30, easeOutQuint);
        return (
          <div key={item.rotulo} style={{ opacity: t }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: 7,
              }}
            >
              <span
                style={{
                  fontFamily: fonte.texto,
                  fontSize: tamanho.apoio,
                  color: cor.tinta,
                  fontWeight: 500,
                }}
              >
                {item.rotulo}
              </span>
              <span
                style={{
                  fontFamily: fonte.display,
                  fontSize: tamanho.apoio,
                  fontWeight: 700,
                  color: cor.tintaSuave,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                <Contador ate={item.quantidade} em={inicio} dur={30} />
              </span>
            </div>
            <div
              style={{
                width: largura,
                height: 12,
                borderRadius: 999,
                background: "#EFF3EB",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${(item.quantidade / maior) * t * 100}%`,
                  background: item.cor,
                  borderRadius: 999,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Nuvem de pacientes                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Os pontos da base antiga.
 *
 * `posicoes` é calculado por semente determinística, nunca por `Math.random()`:
 * o ponto 417 precisa estar no mesmo pixel no preview e no render, senão a
 * nuvem inteira treme entre um frame e o seguinte.
 *
 * `agrupar` reorganiza os pontos em colunas por segmento — é a animação central
 * da cena 11: a mesma população, agora organizada.
 */
export function NuvemDePacientes({
  quantidade,
  largura,
  altura,
  em = 0,
  agruparEm,
  grupos,
  corPadrao = "#C3D2B9",
}: {
  quantidade: number;
  largura: number;
  altura: number;
  em?: number;
  /** Frame em que a nuvem se reorganiza em colunas. */
  agruparEm?: number;
  grupos?: readonly { rotulo: string; quantidade: number; cor: string }[];
  corPadrao?: string;
}) {
  const frame = useFrame();

  const total = quantidade;
  const colunas = grupos?.length ?? 0;
  const somaGrupos = grupos?.reduce((s, g) => s + g.quantidade, 0) ?? 1;

  // Quanto da reorganização já aconteceu.
  const t =
    agruparEm === undefined || grupos === undefined
      ? 0
      : progresso(frame, agruparEm, 46, easeOutQuint);

  const pontos: { x: number; y: number; c: string; atraso: number }[] = [];

  // Pré-cálculo de quantos pontos cabem em cada coluna, proporcional ao grupo.
  const porGrupo: number[] = grupos
    ? grupos.map((g) => Math.round((g.quantidade / somaGrupos) * total))
    : [];

  let acumulado = 0;
  let grupoAtual = 0;

  for (let i = 0; i < total; i++) {
    // Posição dispersa: grade jitterada, não aleatório puro — aleatório puro
    // agrupa por acaso e a nuvem fica com buracos que parecem intenção.
    const porLinha = Math.ceil(Math.sqrt(total * (largura / altura)));
    const linha = Math.floor(i / porLinha);
    const coluna = i % porLinha;
    const passoX = largura / porLinha;
    const passoY = altura / Math.ceil(total / porLinha);
    const dispersoX = coluna * passoX + (aleatorio(i * 3.7) - 0.5) * passoX * 0.85;
    const dispersoY = linha * passoY + (aleatorio(i * 5.1 + 11) - 0.5) * passoY * 0.85;

    // Posição agrupada.
    let x = dispersoX;
    let y = dispersoY;
    let c = corPadrao;

    if (grupos !== undefined && colunas > 0) {
      while (grupoAtual < porGrupo.length - 1 && i >= acumulado + (porGrupo[grupoAtual] ?? 0)) {
        acumulado += porGrupo[grupoAtual] ?? 0;
        grupoAtual++;
      }
      const noGrupo = i - acumulado;
      const grupo = grupos[grupoAtual]!;
      const larguraColuna = largura / colunas;
      const porLinhaColuna = Math.max(6, Math.floor(larguraColuna / 15));
      const gx =
        grupoAtual * larguraColuna +
        (noGrupo % porLinhaColuna) * (larguraColuna / porLinhaColuna) +
        6;
      const gy = altura - Math.floor(noGrupo / porLinhaColuna) * 13 - 14;

      x = interpolar(t, [0, 1], [dispersoX, gx]);
      y = interpolar(t, [0, 1], [dispersoY, Math.max(6, gy)]);
      c = t > 0.15 ? grupo.cor : corPadrao;
    }

    pontos.push({ x, y, c, atraso: (i % 90) * 0.5 });
  }

  return (
    <div style={{ position: "relative", width: largura, height: altura }}>
      {pontos.map((p, i) => {
        const aparecer = progresso(frame, em + p.atraso, 16);
        return (
          <span
            key={i}
            style={{
              position: "absolute",
              left: p.x,
              top: p.y,
              width: 7,
              height: 7,
              borderRadius: 999,
              background: p.c,
              opacity: aparecer * (0.55 + aleatorio(i) * 0.45),
            }}
          />
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Cadeia de crescimento                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A escada da cena 24. Cada degrau é um elo da cadeia, e a altura cresce — mas
 * sem número no eixo, de propósito: a peça mostra o mecanismo, não uma projeção
 * (item 55). Prometer percentual sem dado seria mentira com gráfico.
 */
export function Escada({
  etapas,
  em = 0,
  largura = 1280,
  altura = 380,
}: {
  etapas: readonly string[];
  em?: number;
  largura?: number;
  altura?: number;
}) {
  const frame = useFrame();
  const larguraDegrau = largura / etapas.length;

  return (
    <div style={{ position: "relative", width: largura, height: altura + 90 }}>
      {etapas.map((etapa, i) => {
        const inicio = em + i * 11;
        const t = progresso(frame, inicio, 30, easeOutQuint);
        const alturaDegrau = ((i + 1) / etapas.length) * altura * t;
        const mistura = i / Math.max(1, etapas.length - 1);
        return (
          <div
            key={etapa}
            style={{
              position: "absolute",
              left: i * larguraDegrau,
              bottom: 90,
              width: larguraDegrau - 12,
            }}
          >
            <div
              style={{
                height: alturaDegrau,
                borderRadius: `${raio.medio}px ${raio.medio}px 0 0`,
                background: `color-mix(in srgb, ${cor.verde} ${Math.round((1 - mistura) * 80 + 20)}%, ${cor.verdeEscuro})`,
                opacity: 0.24 + mistura * 0.76,
              }}
            />
            <div
              style={{
                marginTop: 14,
                fontFamily: fonte.texto,
                fontSize: tamanho.legenda,
                color: t > 0.5 ? cor.tinta : cor.tintaFraca,
                fontWeight: 500,
                lineHeight: 1.35,
                opacity: t,
              }}
            >
              {etapa}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Anel de progresso                                                          */
/* -------------------------------------------------------------------------- */

export function Anel({
  razao,
  em = 0,
  dur = 44,
  tamanho: t = 150,
  espessura = 12,
  cor: traco = cor.verdeEscuro,
  rotulo,
}: {
  razao: number;
  em?: number;
  dur?: number;
  tamanho?: number;
  espessura?: number;
  cor?: string;
  rotulo?: string;
}) {
  const frame = useFrame();
  const avanco = progresso(frame, em, dur, easeOutQuint);
  const r = (t - espessura) / 2;
  const circunferencia = 2 * Math.PI * r;

  return (
    <div style={{ position: "relative", width: t, height: t }}>
      <svg width={t} height={t} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={t / 2} cy={t / 2} r={r} fill="none" stroke="#EFF3EB" strokeWidth={espessura} />
        <circle
          cx={t / 2}
          cy={t / 2}
          r={r}
          fill="none"
          stroke={traco}
          strokeWidth={espessura}
          strokeLinecap="round"
          strokeDasharray={circunferencia}
          strokeDashoffset={circunferencia * (1 - razao * avanco)}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          textAlign: "center",
        }}
      >
        <div>
          <div
            style={{
              fontFamily: fonte.display,
              fontWeight: 800,
              fontSize: t * 0.22,
              color: traco,
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1,
            }}
          >
            <Contador ate={razao * 100} em={em} dur={dur} sufixo="%" />
          </div>
          {rotulo !== undefined && (
            <div
              style={{
                fontFamily: fonte.texto,
                fontSize: t * 0.093,
                color: cor.tintaSuave,
                marginTop: 5,
              }}
            >
              {rotulo}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
