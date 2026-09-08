import { NotaDeCena, SeloDeCena, TituloDeCena } from "@/components/CenaBase";
import { PRIORIDADE } from "@/data/conteudo";
import { FATORES_MARIA, FILA } from "@/data/metricas";
import { Em, Palco, Painel } from "@/design-system/primitivas";
import { cor, fonte, raio, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { Barra, Contador } from "@/motion/primitivas";
import { cinema, easeOutQuint, escalonar, interpolar, progresso } from "@/motion/timing";

/**
 * CENA 08 — Prioridade.
 *
 * Quatro pacientes chegam em ordem de chegada e o sistema os reordena em tela.
 * A reordenação precisa ser VISTA acontecendo: se a lista já aparecesse
 * ordenada, a cena viraria "olha uma lista", e o ponto é justamente que alguém
 * — o sistema — decidiu a ordem.
 *
 * O painel da direita responde a pergunta seguinte, que é a que importa para
 * quem vai usar: *por que* 92. Score sem explicação é caixa-preta, e caixa-preta
 * não sustenta uma fila de trabalho.
 */

const LINHA = { x: 170, largura: 800, altura: 96, espaco: 22 };
const TOPO = 336;

/** Ordem em que os quatro entram — a de chegada, não a de prioridade. */
const ORDEM_INICIAL = [3, 2, 0, 1];

const REORDENA_EM = 96;
const REORDENA_DUR = 42;

export function Cena08Prioridade() {
  const frame = useFrame();
  const t = progresso(frame, REORDENA_EM, REORDENA_DUR, cinema);

  return (
    <Palco>
      <SeloDeCena />
      <TituloDeCena
        kicker="Quem vem primeiro"
        titulo={PRIORIDADE.titulo}
        subtitulo="O sistema reordena a fila sozinho, e mostra por quê."
        em={2}
        largura={880}
        nivel={2}
      />

      {/* A fila --------------------------------------------------------- */}
      {FILA.map((paciente, i) => {
        const slotInicial = ORDEM_INICIAL.indexOf(i);
        const y = interpolar(
          t,
          [0, 1],
          [
            TOPO + slotInicial * (LINHA.altura + LINHA.espaco),
            TOPO + i * (LINHA.altura + LINHA.espaco),
          ],
        );
        const entrada = progresso(frame, 26 + escalonar(slotInicial, 12), 22, easeOutQuint);
        const noTopo = i === 0 && t > 0.75;

        return (
          <Em key={paciente.nome} x={LINHA.x} y={y} largura={LINHA.largura} zIndex={noTopo ? 9 : 8}>
            <div
              style={{
                opacity: entrada,
                transform: `translate3d(${(1 - entrada) * -16}px, 0, 0)`,
                height: LINHA.altura,
                background: cor.branco,
                border: `1px solid ${noTopo ? `${cor.verde}66` : cor.borda}`,
                borderRadius: raio.grande,
                padding: "0 26px",
                display: "flex",
                alignItems: "center",
                gap: 22,
                boxShadow: noTopo
                  ? "0 26px 60px -38px rgba(3,47,1,0.6)"
                  : "0 12px 30px -26px rgba(3,47,1,0.45)",
              }}
            >
              {/* O número da posição só existe depois da reordenação. */}
              <span
                style={{
                  width: 30,
                  fontFamily: fonte.mono,
                  fontSize: tamanho.apoio,
                  color: cor.tintaFraca,
                  opacity: t,
                  flex: "none",
                }}
              >
                {i + 1}
              </span>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: fonte.display,
                    fontSize: tamanho.destaque,
                    fontWeight: 700,
                    color: cor.tinta,
                    letterSpacing: "-0.018em",
                  }}
                >
                  {paciente.nome}
                </div>
                <div
                  style={{
                    fontFamily: fonte.texto,
                    fontSize: tamanho.legenda,
                    color: cor.tintaSuave,
                    marginTop: 4,
                  }}
                >
                  {paciente.motivo} · {paciente.sinal}
                </div>
              </div>

              <div style={{ width: 190, flex: "none" }}>
                <Barra
                  razao={paciente.prioridade / 100}
                  em={46 + slotInicial * 8}
                  dur={38}
                  cor={paciente.prioridade >= 80 ? cor.verdeEscuro : cor.verde}
                  altura={8}
                />
              </div>

              <div
                style={{
                  width: 76,
                  textAlign: "right",
                  fontFamily: fonte.display,
                  fontSize: 38,
                  fontWeight: 800,
                  color: paciente.prioridade >= 80 ? cor.verdeEscuro : cor.tintaSuave,
                  fontVariantNumeric: "tabular-nums",
                  letterSpacing: "-0.03em",
                  flex: "none",
                }}
              >
                <Contador ate={paciente.prioridade} em={46 + slotInicial * 8} dur={38} />
              </div>
            </div>
          </Em>
        );
      })}

      {/* Por que 92 ----------------------------------------------------- */}
      <Em x={1050} y={TOPO} largura={700} zIndex={8}>
        <div
          style={{
            opacity: progresso(frame, 138, 26),
            transform: `translate3d(${(1 - progresso(frame, 138, 32, easeOutQuint)) * 22}px, 0, 0)`,
          }}
        >
          <Painel titulo={PRIORIDADE.fatoresTitulo} padding={26}>
            {FATORES_MARIA.map((fator, i) => (
              <div key={fator.rotulo} style={{ marginBottom: i === FATORES_MARIA.length - 1 ? 0 : 18 }}>
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
                    {fator.rotulo}
                  </span>
                  <span
                    style={{
                      fontFamily: fonte.display,
                      fontSize: tamanho.apoio,
                      fontWeight: 700,
                      color: cor.verdeEscuro,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    +{fator.pontos}
                  </span>
                </div>
                <Barra
                  razao={fator.pontos / 30}
                  em={152 + i * 8}
                  dur={30}
                  cor={cor.verde}
                  altura={7}
                />
              </div>
            ))}
          </Painel>
        </div>
      </Em>

      {/* Os critérios --------------------------------------------------- */}
      <Em x={LINHA.x} y={TOPO + 4 * (LINHA.altura + LINHA.espaco) - 6} largura={820} zIndex={8}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {PRIORIDADE.criterios.map((criterio, i) => {
            const tt = progresso(frame, 176 + i * 8, 20, easeOutQuint);
            return (
              <span
                key={criterio}
                style={{
                  opacity: tt,
                  transform: `translate3d(0, ${(1 - tt) * 10}px, 0)`,
                  padding: "10px 18px",
                  borderRadius: 999,
                  background: cor.menta,
                  color: cor.verdeEscuro,
                  fontFamily: fonte.texto,
                  fontSize: tamanho.apoio,
                  fontWeight: 600,
                }}
              >
                {criterio}
              </span>
            );
          })}
        </div>
      </Em>

      <NotaDeCena em={198} x={1050} largura={700} y={786}>
        {PRIORIDADE.nota}
      </NotaDeCena>
    </Palco>
  );
}
