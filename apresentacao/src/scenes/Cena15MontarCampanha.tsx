import { CalendarClock, Filter, MessageSquareText } from "lucide-react";
import { Raciocinio, SeloDeCena, TituloDeCena } from "@/components/CenaBase";
import { MONTAR_CAMPANHA } from "@/data/conteudo";
import { ILUSTRATIVO } from "@/data/metricas";
import { Em, Ilustrativo, Palco } from "@/design-system/primitivas";
import { cor, fonte, raio, sombra, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { Contador } from "@/motion/primitivas";
import { easeOutQuint, progresso } from "@/motion/timing";

/**
 * CENA 15 — Como se monta uma campanha.
 *
 * A cena anterior mostra campanhas rodando, e quem assiste conclui na hora que
 * alguém de fora precisa configurar aquilo. Esta desfaz a conclusão: são três
 * passos, na tela, feitos por quem já trabalha na clínica.
 *
 * A prévia embaixo é o argumento de verdade. Ver o tamanho da lista ANTES de
 * enviar é o que diferencia campanha de disparo — e é também o que dá coragem
 * para mexer no filtro, porque o erro aparece antes de virar mensagem.
 *
 * Os três cartões entram em cascata e ficam. Nenhum sai: a pessoa precisa ver
 * os três ao mesmo tempo para entender que é só isso.
 */

const CARTAO = { y: 256, largura: 520, altura: 296 };
const CARTAO_X = [120, 700, 1280];
const ICONES = [Filter, MessageSquareText, CalendarClock];

export function Cena15MontarCampanha() {
  const frame = useFrame();

  return (
    <Palco>
      <SeloDeCena />
      <TituloDeCena
        kicker="Campanhas"
        titulo={MONTAR_CAMPANHA.titulo}
        subtitulo={MONTAR_CAMPANHA.subtitulo}
        em={2}
        y={82}
        nivel={2}
        largura={1200}
      />

      {/* Os três passos -------------------------------------------------- */}
      {MONTAR_CAMPANHA.passos.map((passo, i) => {
        const Icone = ICONES[i]!;
        const t = progresso(frame, 20 + i * 14, 26, easeOutQuint);

        return (
          <Em key={passo.numero} x={CARTAO_X[i]!} y={CARTAO.y} largura={CARTAO.largura} zIndex={8}>
            <div
              style={{
                opacity: t,
                transform: `translate3d(0, ${(1 - t) * 18}px, 0)`,
                minHeight: CARTAO.altura,
                background: cor.branco,
                border: `1px solid ${cor.borda}`,
                borderRadius: raio.enorme,
                boxShadow: sombra.media,
                padding: "28px 30px 30px",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
                <span
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 14,
                    background: cor.menta,
                    color: cor.verdeEscuro,
                    display: "grid",
                    placeItems: "center",
                    flex: "none",
                  }}
                >
                  <Icone size={21} strokeWidth={2.1} />
                </span>
                <span
                  style={{
                    fontFamily: fonte.mono,
                    fontSize: tamanho.micro,
                    letterSpacing: "0.14em",
                    color: cor.tintaFraca,
                    fontWeight: 700,
                  }}
                >
                  PASSO {passo.numero}
                </span>
              </div>

              <div
                style={{
                  fontFamily: fonte.display,
                  fontSize: tamanho.destaque,
                  fontWeight: 800,
                  color: cor.tinta,
                  letterSpacing: "-0.022em",
                }}
              >
                {passo.titulo}
              </div>

              <div
                style={{
                  fontFamily: fonte.texto,
                  fontSize: tamanho.apoio,
                  color: cor.tintaSuave,
                  lineHeight: 1.5,
                  marginTop: 10,
                }}
              >
                {passo.detalhe}
              </div>

              {/* O exemplo concreto. Sem ele o passo vira instrução de manual;
                  com ele a pessoa reconhece a própria clínica na tela. */}
              <div style={{ marginTop: "auto", paddingTop: 20 }}>
                {passo.exemplo.map((linha, j) => (
                  <div
                    key={linha}
                    style={{
                      opacity: progresso(frame, 66 + i * 14 + j * 7, 20),
                      background: cor.fundo,
                      border: `1px solid ${cor.linha}`,
                      borderRadius: raio.medio,
                      padding: "10px 14px",
                      marginBottom: 8,
                      fontFamily: fonte.texto,
                      fontSize: tamanho.legenda,
                      color: cor.tinta,
                      lineHeight: 1.45,
                    }}
                  >
                    {linha}
                  </div>
                ))}
              </div>
            </div>
          </Em>
        );
      })}

      {/* A prévia — o número antes de enviar ------------------------------ */}
      <Em x={120} y={690} largura={1680} zIndex={9}>
        <div
          style={{
            opacity: progresso(frame, 128, 28),
            transform: `translate3d(0, ${(1 - progresso(frame, 128, 34, easeOutQuint)) * 14}px, 0)`,
            background: cor.profundo,
            borderRadius: raio.enorme,
            padding: "26px 34px",
            display: "flex",
            alignItems: "center",
            gap: 28,
          }}
        >
          <span
            style={{
              fontFamily: fonte.display,
              fontSize: 54,
              fontWeight: 800,
              color: cor.branco,
              letterSpacing: "-0.04em",
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
              flex: "none",
            }}
          >
            <Contador ate={MONTAR_CAMPANHA.previa.valor} em={136} dur={44} />
          </span>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: fonte.texto,
                fontSize: tamanho.corpo,
                color: cor.branco,
                fontWeight: 600,
              }}
            >
              {MONTAR_CAMPANHA.previa.rotulo}
            </div>
            <div
              style={{
                fontFamily: fonte.texto,
                fontSize: tamanho.legenda,
                color: "#B8D9A4",
                marginTop: 6,
              }}
            >
              {MONTAR_CAMPANHA.previa.nota}
            </div>
          </div>

          <span
            style={{
              opacity: progresso(frame, 186, 22),
              background: cor.verde,
              color: cor.profundo,
              borderRadius: raio.pilula,
              padding: "14px 26px",
              fontFamily: fonte.texto,
              fontSize: tamanho.apoio,
              fontWeight: 700,
              flex: "none",
            }}
          >
            {MONTAR_CAMPANHA.botao}
          </span>
        </div>
      </Em>

      {ILUSTRATIVO && (
        <Em x={120} y={812} zIndex={9}>
          <div style={{ opacity: progresso(frame, 196, 24) }}>
            <Ilustrativo />
          </div>
        </Em>
      )}

      <Raciocinio em={206}>{MONTAR_CAMPANHA.raciocinio}</Raciocinio>
    </Palco>
  );
}
