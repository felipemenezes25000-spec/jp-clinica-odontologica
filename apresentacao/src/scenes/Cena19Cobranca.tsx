import { HandCoins, Shield } from "lucide-react";
import { SeloDeCena, TituloDeCena } from "@/components/CenaBase";
import { Balao, CabecalhoConversa, Conversa, Fone } from "@/components/Fone";
import { COBRANCA } from "@/data/conteudo";
import { ILUSTRATIVO } from "@/data/metricas";
import { Em, Ilustrativo, Palco } from "@/design-system/primitivas";
import { cor, fonte, raio, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { Crescer } from "@/motion/primitivas";
import { easeOutQuint, progresso } from "@/motion/timing";

/**
 * CENA 19 — Cobrança de parcela em atraso.
 *
 * A mensagem mais delicada que o sistema manda, e a que mais estraga
 * relacionamento quando sai errada. Por isso a cena inverte a ordem habitual:
 * primeiro a conversa (para mostrar o TOM), depois as quatro regras que impedem
 * o exagero — e só no fim o número.
 *
 * "Renegociar é com gente" está na lista de propósito. Desconto e parcelamento
 * são decisão comercial; automação que negocia sozinha compromete a clínica.
 */

const FONE = { x: 190, y: 128 };
const COLUNA = { x: 740, largura: 1010 };

const MENSAGENS_EM = [26, 108, 150];

export function Cena19Cobranca() {
  const frame = useFrame();

  return (
    <Palco>
      <SeloDeCena />
      <TituloDeCena
        kicker="Parcela em atraso"
        titulo={COBRANCA.titulo}
        subtitulo={COBRANCA.subtitulo}
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
            <CabecalhoConversa subtitulo="hoje, 10:04" />
            <Conversa>
              {COBRANCA.mensagens.map((mensagem, i) => (
                <Balao
                  key={i}
                  de={mensagem.de}
                  em={MENSAGENS_EM[i] ?? 26}
                  hora={mensagem.hora}
                  {...("autor" in mensagem ? { autor: mensagem.autor } : {})}
                  entregue={mensagem.de === "clinica"}
                  lida={mensagem.de === "clinica" && frame > 108}
                >
                  {mensagem.texto}
                </Balao>
              ))}
            </Conversa>
          </Fone>
        </Crescer>
      </Em>

      {/* As quatro regras ------------------------------------------------ */}
      <Em x={COLUNA.x} y={262} largura={COLUNA.largura} zIndex={8}>
        <div
          style={{
            opacity: progresso(frame, 34, 24),
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontFamily: fonte.texto,
            fontSize: tamanho.micro,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            fontWeight: 700,
            color: cor.tintaSuave,
            marginBottom: 18,
          }}
        >
          <Shield size={16} strokeWidth={2.3} color={cor.verdeEscuro} />
          O que impede a cobrança de virar constrangimento
        </div>
      </Em>

      {COBRANCA.regras.map((regra, i) => {
        const em = 44 + i * 14;
        const t = progresso(frame, em, 24, easeOutQuint);
        const humana = i === COBRANCA.regras.length - 1;

        return (
          <Em key={regra.rotulo} x={COLUNA.x} y={310 + i * 94} largura={COLUNA.largura} zIndex={8}>
            <div
              style={{
                opacity: t,
                transform: `translate3d(${(1 - t) * 18}px, 0, 0)`,
                height: 80,
                background: cor.branco,
                border: `1px solid ${humana ? `${cor.verde}55` : cor.borda}`,
                borderRadius: raio.grande,
                padding: "0 26px",
                display: "flex",
                alignItems: "center",
                gap: 20,
                boxShadow: "0 14px 36px -32px rgba(3,47,1,0.45)",
              }}
            >
              <span
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 999,
                  background: cor.menta,
                  color: cor.verdeEscuro,
                  display: "grid",
                  placeItems: "center",
                  flex: "none",
                  fontFamily: fonte.texto,
                  fontSize: 15,
                  fontWeight: 800,
                }}
              >
                ✓
              </span>
              <span
                style={{
                  fontFamily: fonte.display,
                  fontSize: tamanho.corpo,
                  fontWeight: 700,
                  color: cor.tinta,
                  width: 300,
                  flex: "none",
                  letterSpacing: "-0.015em",
                }}
              >
                {regra.rotulo}
              </span>
              <span
                style={{
                  fontFamily: fonte.texto,
                  fontSize: tamanho.apoio,
                  color: cor.tintaSuave,
                }}
              >
                {regra.detalhe}
              </span>
            </div>
          </Em>
        );
      })}

      {/* O resultado ------------------------------------------------------ */}
      <Em x={COLUNA.x} y={690} largura={COLUNA.largura} zIndex={9}>
        <div
          style={{
            opacity: progresso(frame, 168, 28),
            transform: `translate3d(0, ${(1 - progresso(frame, 168, 32, easeOutQuint)) * 16}px, 0)`,
            background: cor.profundo,
            borderRadius: raio.enorme,
            padding: "26px 30px",
            display: "flex",
            alignItems: "center",
            gap: 20,
          }}
        >
          <HandCoins size={30} strokeWidth={2} color={cor.verde} />
          <div>
            <div
              style={{
                fontFamily: fonte.display,
                fontSize: tamanho.destaque,
                fontWeight: 700,
                color: cor.branco,
                letterSpacing: "-0.018em",
              }}
            >
              {COBRANCA.resultado}
            </div>
            <div
              style={{
                fontFamily: fonte.texto,
                fontSize: tamanho.legenda,
                color: "#B8D9A4",
                marginTop: 8,
              }}
            >
              Dinheiro que já era da clínica e estava só esperando alguém lembrar.
            </div>
          </div>
        </div>
      </Em>

      {ILUSTRATIVO && (
        <Em x={COLUNA.x} y={822} zIndex={9}>
          <div style={{ opacity: progresso(frame, 196, 26) }}>
            <Ilustrativo />
          </div>
        </Em>
      )}
    </Palco>
  );
}
