import { Pause, SlidersHorizontal, TrendingUp } from "lucide-react";
import { SeloDeCena, TituloDeCena } from "@/components/CenaBase";
import { MIDIA } from "@/data/conteudo";
import { ILUSTRATIVO } from "@/data/metricas";
import { Em, Ilustrativo, Palco } from "@/design-system/primitivas";
import { cor, fonte, raio, sombra, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { easeOutQuint, progresso } from "@/motion/timing";

/**
 * CENA 17 — Quanto custa cada paciente que apareceu.
 *
 * A cena que fecha o argumento do tráfego pago. Toda ferramenta de anúncio sabe
 * dizer quantos cliques deu; nenhuma sabe se a pessoa sentou na cadeira — porque
 * isso acontece do lado da clínica, semanas depois. É o registro de origem da
 * cena anterior que fecha esse laço.
 *
 * Por isso a última linha do funil não é "conversões": é PACIENTES QUE
 * COMPARECERAM, com o custo real de cada um. É o único número que permite
 * decidir se a campanha continua.
 *
 * A coluna da direita existe para desarmar o medo de perder o controle: cinco
 * chaves que a clínica liga e desliga, incluindo a mais importante — se a
 * automação pode marcar consulta sozinha ou só qualificar.
 */

/**
 * A coluna da esquerda é a mais apertada da peça: título de duas linhas com
 * subtítulo, seis etapas de funil e mais duas linhas de comparação, tudo entre
 * a y=300 (onde o subtítulo termina) e a y=915 (onde começa a área da legenda).
 * Daí a linha de 62 px em vez dos 76 confortáveis — são seis etapas, e cada
 * píxel a mais na linha custa seis no total.
 */
const FUNIL = { x: 170, y: 300, largura: 900, altura: 62, espaco: 8 };
const COLUNA = { x: 1130, largura: 620 };

/**
 * Quanto a barra estreita do topo até o fim do funil.
 *
 * Não vai muito longe de propósito: a última etapa é a que carrega o número que
 * interessa (o custo por paciente que apareceu), e uma barra estreita demais
 * espreme as três colunas até o texto se atropelar.
 */
const ESTREITAMENTO = 28;

export function Cena17Midia() {
  const frame = useFrame();

  return (
    <Palco>
      <SeloDeCena />
      <TituloDeCena
        kicker="Tráfego pago"
        titulo={MIDIA.titulo}
        subtitulo={MIDIA.subtitulo}
        em={2}
        y={82}
        nivel={2}
        largura={1000}
      />

      {/* O funil do dinheiro -------------------------------------------- */}
      {MIDIA.funil.map((etapa, i) => {
        const em = 22 + i * 11;
        const t = progresso(frame, em, 24, easeOutQuint);
        const ultimo = i === MIDIA.funil.length - 1;
        const primeiro = i === 0;
        const largura = 100 - (i / (MIDIA.funil.length - 1)) * ESTREITAMENTO;

        return (
          <Em
            key={etapa.etapa}
            x={FUNIL.x}
            y={FUNIL.y + i * (FUNIL.altura + FUNIL.espaco)}
            largura={FUNIL.largura}
            zIndex={8}
          >
            <div
              style={{
                opacity: t,
                transform: `translate3d(${(1 - t) * -16}px, 0, 0)`,
                width: `${largura}%`,
                height: FUNIL.altura,
                background: ultimo ? cor.profundo : primeiro ? cor.menta : cor.branco,
                border: `1px solid ${ultimo ? cor.profundo : primeiro ? "#CDE7B4" : cor.borda}`,
                borderRadius: raio.grande,
                padding: "0 22px",
                display: "flex",
                alignItems: "center",
                gap: 16,
                boxShadow: ultimo
                  ? sombra.alta
                  : primeiro
                    ? "none"
                    : "0 12px 32px -28px rgba(3,47,1,0.45)",
              }}
            >
              <span
                style={{
                  fontFamily: fonte.texto,
                  fontSize: tamanho.apoio,
                  color: ultimo ? "#D7EAC8" : cor.tintaSuave,
                  fontWeight: 500,
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {etapa.etapa}
              </span>
              <span
                style={{
                  fontFamily: fonte.display,
                  fontSize: ultimo ? 28 : tamanho.corpo,
                  fontWeight: 800,
                  color: ultimo ? cor.branco : cor.verdeEscuro,
                  letterSpacing: "-0.025em",
                  fontVariantNumeric: "tabular-nums",
                  flex: "none",
                }}
              >
                {etapa.valor}
              </span>
              <span
                style={{
                  fontFamily: fonte.texto,
                  fontSize: tamanho.legenda,
                  color: ultimo ? cor.verde : cor.tintaFraca,
                  width: 196,
                  textAlign: "right",
                  flex: "none",
                  fontWeight: ultimo ? 700 : 400,
                }}
              >
                {etapa.detalhe}
              </span>
            </div>
          </Em>
        );
      })}

      {/* Qual campanha vale a pena -------------------------------------- */}
      <Em x={FUNIL.x} y={FUNIL.y + 6 * (FUNIL.altura + FUNIL.espaco) + 16} largura={900} zIndex={8}>
        <div style={{ opacity: progresso(frame, 122, 26) }}>
          <div
            style={{
              fontFamily: fonte.texto,
              fontSize: tamanho.micro,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              fontWeight: 700,
              color: cor.tintaSuave,
              marginBottom: 14,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <TrendingUp size={15} strokeWidth={2.4} color={cor.verdeEscuro} />
            {MIDIA.comparacao.titulo}
          </div>

          {MIDIA.comparacao.linhas.map((linha, i) => {
            const t = progresso(frame, 132 + i * 12, 22, easeOutQuint);
            return (
              <div
                key={linha.nome}
                style={{
                  opacity: t,
                  transform: `translate3d(${(1 - t) * 12}px, 0, 0)`,
                  display: "flex",
                  alignItems: "center",
                  gap: 18,
                  padding: "12px 20px",
                  marginBottom: 8,
                  borderRadius: raio.medio,
                  background: linha.boa ? cor.menta : cor.alertaFraco,
                  border: `1px solid ${linha.boa ? "#CDE7B4" : "#F3DFC0"}`,
                }}
              >
                {!linha.boa && <Pause size={16} strokeWidth={2.4} color={cor.alerta} />}
                <span
                  style={{
                    fontFamily: fonte.texto,
                    fontSize: tamanho.apoio,
                    color: cor.tinta,
                    fontWeight: 600,
                    flex: 1,
                  }}
                >
                  {linha.nome}
                </span>
                <span
                  style={{
                    fontFamily: fonte.texto,
                    fontSize: tamanho.legenda,
                    color: cor.tintaSuave,
                    flex: "none",
                  }}
                >
                  {linha.pacientes} pacientes
                </span>
                <span
                  style={{
                    fontFamily: fonte.display,
                    fontSize: tamanho.corpo,
                    fontWeight: 800,
                    color: linha.boa ? cor.verdeEscuro : cor.alerta,
                    width: 110,
                    textAlign: "right",
                    flex: "none",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {linha.custo}
                </span>
              </div>
            );
          })}
        </div>
      </Em>

      {/* O que a clínica controla --------------------------------------- */}
      <Em x={COLUNA.x} y={FUNIL.y} largura={COLUNA.largura} zIndex={8}>
        <div
          style={{
            opacity: progresso(frame, 88, 28),
            transform: `translate3d(${(1 - progresso(frame, 88, 34, easeOutQuint)) * 20}px, 0, 0)`,
            background: cor.branco,
            border: `1px solid ${cor.borda}`,
            borderRadius: raio.enorme,
            boxShadow: sombra.media,
            overflow: "hidden",
          }}
        >
          <div style={{ height: 4, background: cor.verdeEscuro }} />
          <div style={{ padding: "26px 30px 30px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                marginBottom: 20,
              }}
            >
              <span
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 13,
                  background: cor.menta,
                  color: cor.verdeEscuro,
                  display: "grid",
                  placeItems: "center",
                  flex: "none",
                }}
              >
                <SlidersHorizontal size={20} strokeWidth={2.1} />
              </span>
              <span
                style={{
                  fontFamily: fonte.display,
                  fontSize: tamanho.destaque,
                  fontWeight: 800,
                  color: cor.tinta,
                  letterSpacing: "-0.022em",
                }}
              >
                {MIDIA.controles.titulo}
              </span>
            </div>

            {MIDIA.controles.itens.map((item, i) => {
              const t = progresso(frame, 100 + i * 11, 22, easeOutQuint);
              return (
                <div
                  key={item}
                  style={{
                    opacity: t,
                    transform: `translate3d(0, ${(1 - t) * 10}px, 0)`,
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    padding: "15px 0",
                    borderBottom:
                      i === MIDIA.controles.itens.length - 1 ? "none" : `1px solid ${cor.linha}`,
                  }}
                >
                  {/* Uma chavinha, e não um marcador: o ponto é que isto liga e
                      desliga, não que já venha ligado. */}
                  <span
                    style={{
                      width: 38,
                      height: 22,
                      borderRadius: 999,
                      background: cor.verde,
                      flex: "none",
                      position: "relative",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        top: 3,
                        left: 19,
                        width: 16,
                        height: 16,
                        borderRadius: 999,
                        background: cor.branco,
                      }}
                    />
                  </span>
                  <span
                    style={{
                      fontFamily: fonte.texto,
                      fontSize: tamanho.apoio,
                      color: cor.tinta,
                      fontWeight: 500,
                      lineHeight: 1.35,
                    }}
                  >
                    {item}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </Em>

      {ILUSTRATIVO && (
        <Em x={COLUNA.x} y={772} zIndex={9}>
          <div style={{ opacity: progresso(frame, 176, 26) }}>
            <Ilustrativo />
          </div>
        </Em>
      )}
    </Palco>
  );
}
