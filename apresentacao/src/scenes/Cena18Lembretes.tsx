import { BellRing, CalendarClock, RefreshCcw } from "lucide-react";
import { SeloDeCena, TituloDeCena } from "@/components/CenaBase";
import {
  Balao,
  CabecalhoConversa,
  CartaoNaConversa,
  Conversa,
  Fone,
  Horario,
} from "@/components/Fone";
import { LEMBRETES } from "@/data/conteudo";
import { Em, Palco } from "@/design-system/primitivas";
import { cor, fonte, raio, sombra, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { Crescer } from "@/motion/primitivas";
import { easeOutQuint, progresso } from "@/motion/timing";

/**
 * CENA 18 — Lembrete e confirmação.
 *
 * A consulta marcada não é o fim da história: entre marcar e comparecer existe
 * a maior fonte de perda da clínica, que é a falta. Esta cena mostra os três
 * lembretes e — o que de fato importa para o caixa — o que acontece quando a
 * pessoa avisa que não pode vir.
 *
 * "O horário volta para a agenda" é o argumento mais forte da peça inteira para
 * quem gerencia: uma cadeira vazia às 16h é prejuízo que ninguém contabiliza.
 */

const FONE = { x: 190, y: 128 };
const COLUNA = { x: 740, largura: 1010 };

const ICONES = [CalendarClock, BellRing, RefreshCcw];

const LEMBRETE = 26;
const OPCOES = 60;
const CONFIRMA = 132;
const FECHA = 186;

export function Cena18Lembretes() {
  const frame = useFrame();

  return (
    <Palco>
      <SeloDeCena />
      <TituloDeCena
        kicker="Lembrete e confirmação"
        titulo={LEMBRETES.titulo}
        em={2}
        y={92}
        x={COLUNA.x}
        largura={COLUNA.largura}
        nivel={3}
      />

      {/* A conversa ------------------------------------------------------ */}
      <Em x={FONE.x} y={FONE.y} zIndex={10}>
        <Crescer em={4} dur={34} deEscala={0.96}>
          <Fone altura={752}>
            <CabecalhoConversa subtitulo="quarta-feira, 18:00" />
            <Conversa>
              <Balao
                de="clinica"
                em={LEMBRETE}
                hora="18:00"
                autor="Automação"
                entregue
                lida={frame > CONFIRMA - 20}
              >
                {LEMBRETES.mensagem}
              </Balao>

              <CartaoNaConversa titulo="Confirma sua presença?" em={OPCOES}>
                <div style={{ display: "flex", gap: 10 }}>
                  {LEMBRETES.opcoes.map((opcao, i) => (
                    <Horario key={opcao} hora={opcao} escolhido={i === 0 && frame >= CONFIRMA} />
                  ))}
                </div>
              </CartaoNaConversa>

              <Balao de="paciente" em={CONFIRMA} hora="18:14">
                {LEMBRETES.resposta}
              </Balao>

              <Balao de="clinica" em={FECHA} hora="18:14" autor="Sistema" entregue>
                {LEMBRETES.fechamento}
              </Balao>
            </Conversa>
          </Fone>
        </Crescer>
      </Em>

      {/* Quando cada lembrete sai ---------------------------------------- */}
      {LEMBRETES.quando.map((etapa, i) => {
        const Icone = ICONES[i] ?? BellRing;
        const em = 30 + i * 14;
        const t = progresso(frame, em, 24, easeOutQuint);
        const principal = i === 1;

        return (
          <Em key={etapa.rotulo} x={COLUNA.x} y={244 + i * 92} largura={COLUNA.largura} zIndex={8}>
            <div
              style={{
                opacity: t,
                transform: `translate3d(${(1 - t) * 20}px, 0, 0)`,
                height: 78,
                background: principal ? cor.menta : cor.branco,
                border: `1px solid ${principal ? "#CDE7B4" : cor.borda}`,
                borderRadius: raio.grande,
                padding: "0 26px",
                display: "flex",
                alignItems: "center",
                gap: 18,
                boxShadow: principal ? "0 18px 44px -34px rgba(3,47,1,0.5)" : "none",
              }}
            >
              <span
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  background: principal ? cor.branco : cor.menta,
                  color: cor.verdeEscuro,
                  display: "grid",
                  placeItems: "center",
                  flex: "none",
                }}
              >
                <Icone size={19} strokeWidth={2.1} />
              </span>
              <span
                style={{
                  fontFamily: fonte.display,
                  fontSize: tamanho.corpo,
                  fontWeight: 700,
                  color: cor.tinta,
                  width: 190,
                  flex: "none",
                  letterSpacing: "-0.015em",
                }}
              >
                {etapa.rotulo}
              </span>
              <span
                style={{
                  fontFamily: fonte.texto,
                  fontSize: tamanho.apoio,
                  color: cor.tintaSuave,
                }}
              >
                {etapa.detalhe}
              </span>
            </div>
          </Em>
        );
      })}

      {/* A vaga que volta para a agenda ---------------------------------- */}
      <Em x={COLUNA.x} y={548} largura={COLUNA.largura} zIndex={9}>
        <div
          style={{
            opacity: progresso(frame, 128, 28),
            transform: `translate3d(0, ${(1 - progresso(frame, 128, 34, easeOutQuint)) * 18}px, 0)`,
            background: cor.branco,
            border: `1px solid ${cor.borda}`,
            borderRadius: raio.enorme,
            boxShadow: sombra.media,
            overflow: "hidden",
          }}
        >
          <div style={{ height: 4, background: cor.verde }} />
          <div style={{ padding: "26px 30px" }}>
            <div
              style={{
                fontFamily: fonte.display,
                fontSize: tamanho.destaque,
                fontWeight: 700,
                color: cor.tinta,
                letterSpacing: "-0.018em",
              }}
            >
              {LEMBRETES.vaga.titulo}
            </div>
            <div
              style={{
                fontFamily: fonte.texto,
                fontSize: tamanho.corpo,
                color: cor.tintaSuave,
                marginTop: 12,
                lineHeight: 1.5,
                maxWidth: 860,
              }}
            >
              {LEMBRETES.vaga.texto}
            </div>

            {/* A vaga liberada, desenhada: 16:00 sai de "ocupado" e volta a
                "livre" — o gesto que a frase acima descreve. */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 22 }}>
              {(
                [
                  { hora: "16:00", estado: "cancelada" },
                  { hora: "16:00", estado: "livre" },
                ] as const
              ).map((slot, i) => {
                const t = progresso(frame, 176 + i * 22, 22, easeOutQuint);
                const livre = slot.estado === "livre";
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <div
                      style={{
                        opacity: t,
                        minWidth: 128,
                        padding: "14px 20px",
                        borderRadius: raio.medio,
                        border: `1.5px solid ${livre ? cor.verdeEscuro : "#EDD9C6"}`,
                        background: livre ? cor.menta : cor.alertaFraco,
                        textAlign: "center",
                      }}
                    >
                      <div
                        style={{
                          fontFamily: fonte.display,
                          fontSize: tamanho.destaque,
                          fontWeight: 700,
                          color: livre ? cor.verdeEscuro : cor.alerta,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {slot.hora}
                      </div>
                      <div
                        style={{
                          fontFamily: fonte.texto,
                          fontSize: tamanho.micro,
                          color: livre ? cor.verdeEscuro : cor.alerta,
                          marginTop: 4,
                        }}
                      >
                        {livre ? "livre de novo" : "não pode vir"}
                      </div>
                    </div>
                    {i === 0 && (
                      <span style={{ color: cor.bordaForte, fontSize: 26, opacity: t }}>→</span>
                    )}
                  </div>
                );
              })}

              <span
                style={{
                  opacity: progresso(frame, 224, 24),
                  fontFamily: fonte.texto,
                  fontSize: tamanho.apoio,
                  color: cor.tintaSuave,
                  marginLeft: 8,
                }}
              >
                oferecido para quem está na espera
              </span>
            </div>
          </div>
        </div>
      </Em>
    </Palco>
  );
}
