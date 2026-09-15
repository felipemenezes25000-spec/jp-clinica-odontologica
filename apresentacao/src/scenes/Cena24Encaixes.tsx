import { AlertTriangle, CalendarClock, Users } from "lucide-react";
import { Raciocinio, SeloDeCena, TituloDeCena } from "@/components/CenaBase";
import { ENCAIXES } from "@/data/conteudo";
import { Em, Palco } from "@/design-system/primitivas";
import { cor, fonte, raio, sombra, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { easeOutQuint, progresso } from "@/motion/timing";

/**
 * CENA 24 — A cadeira que vagou, e a que vai vagar.
 *
 * As duas listas lado a lado, como na tela de verdade — e por isso: separadas,
 * a segunda nunca seria aberta, porque ninguém procura "previsão de falta" de
 * manhã. Juntas, a pergunta é uma só, e é a que a recepção faz: quais horas
 * desta semana estão em perigo?
 *
 * O LOTE DE TRÊS É O FECHO DA CENA, e é o detalhe que separa este sistema de um
 * disparador: oferecer a hora vaga para quarenta pessoas preenche a hora e
 * queima a lista.
 */

const ESQ = { x: 120, y: 338, largura: 810 };
const DIR = { x: 990, y: 338, largura: 810 };

function Cabecalho({
  icone: Icone,
  texto,
  cor: c,
  fundo,
  em,
  frame,
}: {
  icone: typeof Users;
  texto: string;
  cor: string;
  fundo: string;
  em: number;
  frame: number;
}) {
  return (
    <div
      style={{
        opacity: progresso(frame, em, 22),
        display: "flex",
        alignItems: "center",
        gap: 13,
        marginBottom: 16,
      }}
    >
      <span
        style={{
          width: 34,
          height: 34,
          borderRadius: 11,
          background: fundo,
          color: c,
          display: "grid",
          placeItems: "center",
          flex: "none",
        }}
      >
        <Icone size={17} strokeWidth={2.3} />
      </span>
      <span
        style={{
          fontFamily: fonte.texto,
          fontSize: tamanho.micro,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          fontWeight: 700,
          color: cor.tintaSuave,
        }}
      >
        {texto}
      </span>
    </div>
  );
}

export function Cena24Encaixes() {
  const frame = useFrame();

  return (
    <Palco>
      <SeloDeCena />
      <TituloDeCena
        kicker="A agenda"
        titulo={ENCAIXES.titulo}
        subtitulo={ENCAIXES.subtitulo}
        em={2}
        y={82}
        nivel={2}
        largura={1150}
      />

      {/* Já vagou --------------------------------------------------------- */}
      <Em x={ESQ.x} y={ESQ.y} largura={ESQ.largura} zIndex={8}>
        <Cabecalho
          icone={CalendarClock}
          texto="Já vagou"
          cor={cor.verdeEscuro}
          fundo={cor.menta}
          em={16}
          frame={frame}
        />
        {ENCAIXES.vagou.map((item, i) => {
          const t = progresso(frame, 28 + i * 14, 24, easeOutQuint);
          return (
            <div
              key={item.quando}
              style={{
                opacity: t,
                transform: `translate3d(${(1 - t) * -12}px, 0, 0)`,
                background: cor.branco,
                border: `1px solid ${cor.borda}`,
                borderRadius: raio.grande,
                padding: "20px 24px",
                marginBottom: 10,
                display: "flex",
                alignItems: "center",
                gap: 18,
                boxShadow: "0 12px 32px -28px rgba(3,47,1,0.4)",
              }}
            >
              <span
                style={{
                  fontFamily: fonte.display,
                  fontSize: tamanho.corpo,
                  fontWeight: 800,
                  color: cor.verdeEscuro,
                  width: 150,
                  flex: "none",
                  letterSpacing: "-0.018em",
                }}
              >
                {item.quando}
              </span>
              <span
                style={{
                  fontFamily: fonte.texto,
                  fontSize: tamanho.apoio,
                  color: cor.tinta,
                  flex: 1,
                }}
              >
                {item.motivo}
              </span>
              <span
                style={{
                  fontFamily: fonte.texto,
                  fontSize: tamanho.legenda,
                  color: cor.tintaSuave,
                  flex: "none",
                }}
              >
                {item.situacao}
              </span>
            </div>
          );
        })}
      </Em>

      {/* Provavelmente vai vagar ----------------------------------------- */}
      <Em x={DIR.x} y={DIR.y} largura={DIR.largura} zIndex={8}>
        <Cabecalho
          icone={AlertTriangle}
          texto="Provavelmente vai vagar"
          cor={cor.alerta}
          fundo={cor.alertaFraco}
          em={20}
          frame={frame}
        />
        {ENCAIXES.vaiVagar.map((item, i) => {
          const t = progresso(frame, 56 + i * 14, 24, easeOutQuint);
          return (
            <div
              key={item.quando}
              style={{
                opacity: t,
                transform: `translate3d(${(1 - t) * 12}px, 0, 0)`,
                background: cor.alertaFraco,
                border: `1px solid #F3DFC0`,
                borderRadius: raio.grande,
                padding: "20px 24px",
                marginBottom: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                <span
                  style={{
                    fontFamily: fonte.display,
                    fontSize: tamanho.corpo,
                    fontWeight: 800,
                    color: cor.alerta,
                    width: 150,
                    flex: "none",
                    letterSpacing: "-0.018em",
                  }}
                >
                  {item.quando}
                </span>
                <span
                  style={{
                    fontFamily: fonte.texto,
                    fontSize: tamanho.apoio,
                    color: cor.tinta,
                    fontWeight: 600,
                    flex: 1,
                  }}
                >
                  {item.paciente}
                </span>
              </div>
              <div
                style={{
                  fontFamily: fonte.texto,
                  fontSize: tamanho.legenda,
                  color: cor.alerta,
                  marginTop: 8,
                  paddingLeft: 168,
                }}
              >
                {item.risco}
              </div>
            </div>
          );
        })}
      </Em>

      {/* O lote de três --------------------------------------------------- */}
      <Em x={ESQ.x} y={666} largura={1680} zIndex={9}>
        <div
          style={{
            opacity: progresso(frame, 110, 26),
            transform: `translate3d(0, ${(1 - progresso(frame, 110, 32, easeOutQuint)) * 14}px, 0)`,
            background: cor.profundo,
            borderRadius: raio.enorme,
            padding: "26px 32px",
            display: "flex",
            alignItems: "center",
            gap: 26,
          }}
        >
          <span
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              background: "#0B4A05",
              color: cor.verde,
              display: "grid",
              placeItems: "center",
              flex: "none",
            }}
          >
            <Users size={21} strokeWidth={2.1} />
          </span>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontFamily: fonte.display,
                fontSize: tamanho.destaque,
                fontWeight: 800,
                color: cor.branco,
                letterSpacing: "-0.022em",
              }}
            >
              {ENCAIXES.lote.titulo}
            </div>
            <div
              style={{
                fontFamily: fonte.texto,
                fontSize: tamanho.apoio,
                color: "#B8D9A4",
                marginTop: 7,
              }}
            >
              {ENCAIXES.lote.detalhe}
            </div>
          </div>

          {/* Três acesos, o resto esperando. */}
          <span style={{ display: "flex", gap: 7, flex: "none" }}>
            {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => (
              <span
                key={n}
                style={{
                  opacity: progresso(frame, 130 + n * 5, 16),
                  width: 13,
                  height: 13,
                  borderRadius: 999,
                  background: n < 3 ? cor.verde : "#0B4A05",
                }}
              />
            ))}
          </span>
        </div>
      </Em>

      <Raciocinio em={186}>{ENCAIXES.raciocinio}</Raciocinio>
    </Palco>
  );
}
