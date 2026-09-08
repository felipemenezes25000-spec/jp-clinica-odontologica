import { Cake, CalendarRange, Sparkles, Users } from "lucide-react";
import { NotaDeCena, SeloDeCena, TituloDeCena } from "@/components/CenaBase";
import { Balao, CabecalhoConversa, Conversa, Fone } from "@/components/Fone";
import { CAMPANHAS } from "@/data/conteudo";
import { ILUSTRATIVO } from "@/data/metricas";
import { Em, Ilustrativo, Palco } from "@/design-system/primitivas";
import { cor, fonte, raio, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { Contador, Crescer } from "@/motion/primitivas";
import { easeOutQuint, progresso } from "@/motion/timing";

/**
 * CENA 13 — Campanhas e aniversariantes.
 *
 * "Campanha" costuma soar a disparo em massa, e é justamente o que esta cena
 * precisa desmentir. Por isso os quatro cartões dizem QUEM entra e QUANTOS são,
 * e a faixa de baixo lista as regras antes de mostrar qualquer resultado.
 *
 * O celular à direita existe por um motivo específico: a mensagem de aniversário
 * é a única da peça que não pede nada. Mostrar isso vale mais do que explicar —
 * é o que separa uma campanha de relacionamento de uma campanha de venda.
 */

const ICONES = [Cake, Users, Sparkles, CalendarRange];

const CARTAO = { largura: 424, altura: 152 };
const GRADE_X = 170;
const GRADE_Y = 352;
const ESPACO = 28;

const FONE = { x: 1290, y: 156 };

export function Cena13Campanhas() {
  const frame = useFrame();

  return (
    <Palco>
      <SeloDeCena />
      <TituloDeCena
        kicker="Campanhas"
        titulo={CAMPANHAS.titulo}
        subtitulo={CAMPANHAS.subtitulo}
        em={2}
        largura={1000}
        nivel={2}
      />

      {/* Os tipos de campanha ------------------------------------------- */}
      {CAMPANHAS.tipos.map((tipo, i) => {
        const Icone = ICONES[i] ?? Users;
        const em = 26 + i * 13;
        const t = progresso(frame, em, 24, easeOutQuint);
        const aniversario = i === 0;

        return (
          <Em
            key={tipo.nome}
            x={GRADE_X + (i % 2) * (CARTAO.largura + ESPACO)}
            y={GRADE_Y + Math.floor(i / 2) * (CARTAO.altura + ESPACO)}
            largura={CARTAO.largura}
            zIndex={8}
          >
            <div
              style={{
                opacity: t,
                transform: `translate3d(0, ${(1 - t) * 16}px, 0)`,
                height: CARTAO.altura,
                background: cor.branco,
                border: `1px solid ${aniversario ? `${cor.verde}55` : cor.borda}`,
                borderRadius: raio.grande,
                padding: "20px 24px",
                boxShadow: aniversario
                  ? `0 22px 52px -36px rgba(3,47,1,0.55)`
                  : "0 14px 36px -30px rgba(3,47,1,0.5)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                <span
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 12,
                    background: cor.menta,
                    color: cor.verdeEscuro,
                    display: "grid",
                    placeItems: "center",
                    flex: "none",
                  }}
                >
                  <Icone size={19} strokeWidth={2.1} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: fonte.display,
                      fontSize: tamanho.corpo,
                      fontWeight: 700,
                      color: cor.tinta,
                      letterSpacing: "-0.015em",
                      lineHeight: 1.2,
                    }}
                  >
                    {tipo.nome}
                  </div>
                  <div
                    style={{
                      fontFamily: fonte.texto,
                      fontSize: tamanho.legenda,
                      color: cor.tintaSuave,
                      marginTop: 5,
                    }}
                  >
                    Sai {tipo.quando}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
                <span
                  style={{
                    fontFamily: fonte.display,
                    fontSize: 32,
                    fontWeight: 800,
                    color: cor.verdeEscuro,
                    fontVariantNumeric: "tabular-nums",
                    letterSpacing: "-0.03em",
                  }}
                >
                  <Contador ate={tipo.fila} em={em + 16} dur={38} />
                </span>
                <span
                  style={{
                    fontFamily: fonte.texto,
                    fontSize: tamanho.legenda,
                    color: cor.tintaSuave,
                  }}
                >
                  pessoas nesta lista
                </span>
              </div>
            </div>
          </Em>
        );
      })}

      {/* A regra que vale para todas ------------------------------------ */}
      <Em x={GRADE_X} y={GRADE_Y + 2 * (CARTAO.altura + ESPACO) + 6} largura={876} zIndex={8}>
        <div
          style={{
            opacity: progresso(frame, 96, 26),
            transform: `translate3d(0, ${(1 - progresso(frame, 96, 30, easeOutQuint)) * 14}px, 0)`,
            background: cor.menta,
            border: "1px solid #CDE7B4",
            borderRadius: raio.grande,
            padding: "22px 26px",
          }}
        >
          <div
            style={{
              fontFamily: fonte.texto,
              fontSize: tamanho.apoio,
              color: cor.verdeEscuro,
              lineHeight: 1.5,
              fontWeight: 500,
            }}
          >
            {CAMPANHAS.regra}
          </div>
        </div>
      </Em>

      <Em x={GRADE_X} y={GRADE_Y + 2 * (CARTAO.altura + ESPACO) + 128} largura={876} zIndex={8}>
        <div
          style={{
            opacity: progresso(frame, 150, 26),
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontFamily: fonte.texto,
            fontSize: tamanho.legenda,
            color: cor.tintaSuave,
          }}
        >
          <span>{CAMPANHAS.resultado}</span>
          {ILUSTRATIVO && <Ilustrativo />}
        </div>
      </Em>

      {/* O aniversário, escrito ----------------------------------------- */}
      <Em x={FONE.x} y={FONE.y} zIndex={10}>
        <Crescer em={44} dur={36} deEscala={0.96}>
          <Fone largura={400} altura={664}>
            <CabecalhoConversa subtitulo="hoje, 09:00" />
            <Conversa>
              <Balao
                de="clinica"
                em={122}
                hora={CAMPANHAS.aniversario.hora}
                autor={CAMPANHAS.aniversario.autor}
                entregue
                lida={frame > 200}
              >
                {CAMPANHAS.aniversario.texto}
              </Balao>
            </Conversa>
          </Fone>
        </Crescer>
      </Em>

      <NotaDeCena em={196} x={FONE.x - 40} largura={520} y={848}>
        {CAMPANHAS.aniversario.nota}
      </NotaDeCena>
    </Palco>
  );
}
