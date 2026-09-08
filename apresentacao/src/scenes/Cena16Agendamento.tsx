import { CalendarCheck, Loader2 } from "lucide-react";
import { NotaDeCena, SeloDeCena, TituloDeCena } from "@/components/CenaBase";
import {
  Balao,
  CabecalhoConversa,
  CartaoNaConversa,
  Conversa,
  Fone,
  Horario,
} from "@/components/Fone";
import { Marca } from "@/components/Marca";
import { AGENDAMENTO } from "@/data/conteudo";
import { Em, Palco, Selo } from "@/design-system/primitivas";
import { cor, fonte, raio, sombra, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { Crescer } from "@/motion/primitivas";
import { easeOutQuint, mola, progresso } from "@/motion/timing";

/**
 * CENA 16 — Agendamento automático.
 *
 * A cena mais longa da peça, e a única que se dá ao trabalho de mostrar um
 * passo chato: a revalidação. Ela existe porque é ela que separa "o robô marca
 * consulta" de um sistema que dá para ligar em produção — entre oferecer o
 * horário e confirmar, alguém na recepção pode ter ocupado a vaga.
 *
 * `SLOT_NO_LONGER_AVAILABLE` é um código de erro real do domínio, com mensagem
 * pronta para o paciente. A cena mostra o caminho feliz; o outro existe.
 */

const FONE = { x: 190, y: 132 };
const PAINEL = { x: 740, y: 250, largura: 1010 };

const OFERTA = 34;
const ESCOLHA = 108;
const REVALIDA = 150;
const CONFIRMA = 210;
const CRIADO = 246;

export function Cena16Agendamento() {
  const frame = useFrame();

  const revalidando =
    progresso(frame, REVALIDA, 12) * (1 - progresso(frame, CONFIRMA, 12));

  return (
    <Palco>
      <SeloDeCena numero={16} />
      <TituloDeCena
        kicker="Agendamento"
        titulo={AGENDAMENTO.titulo}
        em={2}
        y={92}
        x={740}
        largura={1010}
        nivel={3}
      />

      {/* A conversa ------------------------------------------------------ */}
      <Em x={FONE.x} y={FONE.y} zIndex={10}>
        <Crescer em={4} dur={34} deEscala={0.96}>
          <Fone>
            <CabecalhoConversa />
            <Conversa>
              <Balao de="clinica" em={OFERTA} hora="09:33" autor="IA" entregue lida={frame > ESCOLHA}>
                {AGENDAMENTO.oferta}
              </Balao>

              <CartaoNaConversa titulo="Horários disponíveis" em={OFERTA + 16}>
                <div style={{ display: "flex", gap: 10 }}>
                  {AGENDAMENTO.horarios.map((hora) => (
                    <Horario key={hora} hora={hora} escolhido={frame >= ESCOLHA && hora === "16:00"} />
                  ))}
                </div>
              </CartaoNaConversa>

              <Balao de="paciente" em={ESCOLHA} hora="09:34">
                {AGENDAMENTO.escolha}
              </Balao>

              <Balao de="clinica" em={CRIADO} hora="09:34" autor="Sistema" entregue>
                Pronto, Maria. Sua consulta ficou para <strong>quinta, 16:00</strong>. Se precisar
                mudar, é só me avisar por aqui.
              </Balao>
            </Conversa>
          </Fone>
        </Crescer>
      </Em>

      {/* O que acontece do lado do sistema ------------------------------- */}
      <Em x={PAINEL.x} y={PAINEL.y} largura={PAINEL.largura} zIndex={9}>
        <div
          style={{
            opacity: progresso(frame, 22, 26),
            background: cor.branco,
            border: `1px solid ${cor.borda}`,
            borderRadius: raio.enorme,
            boxShadow: sombra.media,
            overflow: "hidden",
          }}
        >
          {/* Cabeçalho: quem está sendo consultado */}
          <div
            style={{
              padding: "22px 30px",
              borderBottom: `1px solid ${cor.linha}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <Marca chave="dentalOffice" altura={28} />
              <span
                style={{
                  fontFamily: fonte.texto,
                  fontSize: tamanho.legenda,
                  color: cor.tintaSuave,
                }}
              >
                agenda de quinta-feira · Ortodontia
              </span>
            </div>
            <Selo fundo={cor.dentalOfficeFraco} cor={cor.dentalOffice}>
              Disponibilidade real
            </Selo>
          </div>

          {/* Os horários do dia */}
          <div style={{ padding: "28px 30px" }}>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              {(
                [
                  { hora: "08:00", livre: false },
                  { hora: "09:00", livre: true },
                  { hora: "10:00", livre: false },
                  { hora: "11:00", livre: false },
                  { hora: "14:30", livre: true },
                  { hora: "15:00", livre: false },
                  { hora: "16:00", livre: true },
                  { hora: "17:00", livre: false },
                ] as const
              ).map((slot, i) => {
                const t = progresso(frame, 30 + i * 5, 18, easeOutQuint);
                const escolhido = slot.hora === "16:00" && frame >= CONFIRMA;
                return (
                  <div
                    key={slot.hora}
                    style={{
                      opacity: t,
                      transform: `translate3d(0, ${(1 - t) * 10}px, 0) scale(${escolhido ? 1 + 0.05 * Math.min(1, mola(frame, CONFIRMA)) : 1})`,
                      minWidth: 110,
                      padding: "18px 20px",
                      borderRadius: raio.medio,
                      border: `1.5px solid ${escolhido ? cor.verdeEscuro : slot.livre ? cor.borda : "#EDEFE9"}`,
                      background: escolhido ? cor.menta : slot.livre ? cor.branco : "#F4F5F1",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        fontFamily: fonte.display,
                        fontSize: tamanho.destaque,
                        fontWeight: 700,
                        color: slot.livre ? (escolhido ? cor.verdeEscuro : cor.tinta) : "#AAB4A8",
                        letterSpacing: "-0.02em",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {slot.hora}
                    </div>
                    <div
                      style={{
                        fontFamily: fonte.texto,
                        fontSize: tamanho.micro,
                        color: slot.livre ? cor.tintaSuave : "#B7C0B5",
                        marginTop: 5,
                      }}
                    >
                      {slot.livre ? "livre" : "ocupado"}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* A revalidação */}
            <div
              style={{
                marginTop: 30,
                padding: "22px 26px",
                borderRadius: raio.grande,
                background: revalidando > 0.05 ? cor.alertaFraco : cor.menta,
                border: `1px solid ${revalidando > 0.05 ? "#F3DFC0" : "#CDE7B4"}`,
                display: "flex",
                alignItems: "center",
                gap: 16,
                opacity: progresso(frame, REVALIDA - 6, 16),
                minHeight: 82,
              }}
            >
              {revalidando > 0.05 ? (
                <>
                  <Loader2
                    size={26}
                    strokeWidth={2.3}
                    color={cor.alerta}
                    style={{ transform: `rotate(${frame * 7}deg)` }}
                  />
                  <span
                    style={{
                      fontFamily: fonte.texto,
                      fontSize: tamanho.destaque,
                      color: cor.alerta,
                      fontWeight: 600,
                    }}
                  >
                    {AGENDAMENTO.revalidando}
                  </span>
                </>
              ) : (
                <>
                  <CalendarCheck size={26} strokeWidth={2.3} color={cor.verdeEscuro} />
                  <span
                    style={{
                      fontFamily: fonte.texto,
                      fontSize: tamanho.destaque,
                      color: cor.verdeEscuro,
                      fontWeight: 700,
                    }}
                  >
                    {AGENDAMENTO.confirmado}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </Em>

      {/* O agendamento criado -------------------------------------------- */}
      <Em x={PAINEL.x} y={790} largura={PAINEL.largura} zIndex={12}>
        <div
          style={{
            opacity: progresso(frame, CRIADO, 20),
            transform: `translate3d(0, ${(1 - progresso(frame, CRIADO, 26, easeOutQuint)) * 18}px, 0)`,
            background: cor.verdeEscuro,
            borderRadius: raio.enorme,
            padding: "28px 34px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxShadow: sombra.alta,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: fonte.texto,
                fontSize: tamanho.micro,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                fontWeight: 700,
                color: cor.verde,
              }}
            >
              {AGENDAMENTO.criado}
            </div>
            <div
              style={{
                fontFamily: fonte.display,
                fontSize: 38,
                fontWeight: 800,
                color: cor.branco,
                marginTop: 10,
                letterSpacing: "-0.025em",
              }}
            >
              Maria Souza · quinta, 16:00 · Ortodontia
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <Selo fundo="#0E4A05" cor={cor.verde}>
              Dental Office
            </Selo>
            <Selo fundo="#0E4A05" cor={cor.verde}>
              JP CRC
            </Selo>
          </div>
        </div>
      </Em>

      <NotaDeCena em={CRIADO + 18} x={PAINEL.x} largura={PAINEL.largura} y={942}>
        {AGENDAMENTO.nota}
      </NotaDeCena>
    </Palco>
  );
}
