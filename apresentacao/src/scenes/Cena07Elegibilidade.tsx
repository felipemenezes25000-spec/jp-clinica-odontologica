import { Check, ShieldCheck } from "lucide-react";
import { NotaDeCena, SeloDeCena, TituloDeCena } from "@/components/CenaBase";
import { CamadaDeConexoes, Conexao } from "@/components/Conexao";
import { ELEGIBILIDADE } from "@/data/conteudo";
import { Cartao, Em, Palco, Selo } from "@/design-system/primitivas";
import { cor, fonte, raio, sombra, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { easeOutQuint, mola, progresso } from "@/motion/timing";
import { curvaH } from "@/utils/caminho";

/**
 * CENA 07 — O motor de regras.
 *
 * Um evento não vira mensagem sozinho. Esta cena existe porque é ela que separa
 * "automação" de "disparo em massa": cinco checagens, uma de cada vez, e só
 * então o veredicto.
 *
 * As cinco são as mesmas de `avaliarRecall` e `podeContatar` em
 * `src/lib/crc/dominio/regras.ts`. A ordem também: as recusas baratas e
 * definitivas primeiro, porque em produção elas descartam a maioria da base
 * antes de qualquer cálculo de data.
 */

const CHECK_X = 900;
const CHECK_Y0 = 322;
const CHECK_PASSO = 86;
const CHECK_LARGURA = 620;
const PRIMEIRA = 52;
const PASSO = 22;

export function Cena07Elegibilidade() {
  const frame = useFrame();
  const totalChecagens = ELEGIBILIDADE.checagens.length;
  const veredictoEm = PRIMEIRA + totalChecagens * PASSO + 12;

  return (
    <Palco>
      <SeloDeCena numero={7} />
      <TituloDeCena kicker="Motor de regras" titulo={ELEGIBILIDADE.titulo} em={2} />

      <CamadaDeConexoes zIndex={4}>
        {ELEGIBILIDADE.checagens.map((_, i) => (
          <Conexao
            key={i}
            caminho={curvaH(700, 470, CHECK_X - 14, CHECK_Y0 + i * CHECK_PASSO + 32, 0.6)}
            em={PRIMEIRA + i * PASSO - 10}
            dur={18}
            cor="#DDE5D7"
            largura={1.6}
          />
        ))}
      </CamadaDeConexoes>

      {/* O paciente ----------------------------------------------------- */}
      <Em x={200} y={352} largura={500} zIndex={8}>
        <div
          style={{
            opacity: progresso(frame, 12, 24),
            transform: `translate3d(${(1 - progresso(frame, 12, 30, easeOutQuint)) * -20}px, 0, 0)`,
          }}
        >
          <Cartao acento={cor.verde} elevado padding={30}>
            <div
              style={{
                fontFamily: fonte.texto,
                fontSize: tamanho.legenda,
                color: cor.tintaSuave,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                fontWeight: 600,
              }}
            >
              Oportunidade criada
            </div>
            <div
              style={{
                fontFamily: fonte.display,
                fontSize: 44,
                fontWeight: 800,
                color: cor.tinta,
                marginTop: 14,
                letterSpacing: "-0.03em",
              }}
            >
              {ELEGIBILIDADE.paciente.nome}
            </div>
            <div
              style={{
                fontFamily: fonte.texto,
                fontSize: tamanho.corpo,
                color: cor.tintaSuave,
                marginTop: 10,
              }}
            >
              {ELEGIBILIDADE.paciente.situacao}
            </div>

            <div style={{ marginTop: 22, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Selo>Faltou</Selo>
              <Selo fundo="#F1F4EF" cor={cor.tintaSuave}>
                appointment.missed
              </Selo>
            </div>
          </Cartao>
        </div>
      </Em>

      {/* As checagens --------------------------------------------------- */}
      {ELEGIBILIDADE.checagens.map((checagem, i) => {
        const em = PRIMEIRA + i * PASSO;
        const t = progresso(frame, em, 18, easeOutQuint);
        const marca = progresso(frame, em + 8, 14, easeOutQuint);
        return (
          <Em key={checagem} x={CHECK_X} y={CHECK_Y0 + i * CHECK_PASSO} largura={CHECK_LARGURA} zIndex={8}>
            <div
              style={{
                opacity: t,
                transform: `translate3d(${(1 - t) * 22}px, 0, 0)`,
                background: cor.branco,
                border: `1px solid ${marca > 0.6 ? `${cor.verde}55` : cor.borda}`,
                borderRadius: raio.medio + 4,
                padding: "18px 24px",
                display: "flex",
                alignItems: "center",
                gap: 18,
                boxShadow: "0 12px 30px -26px rgba(3,47,1,0.45)",
              }}
            >
              <span
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  background: marca > 0.3 ? cor.verde : "#EEF2EA",
                  color: cor.branco,
                  display: "grid",
                  placeItems: "center",
                  flex: "none",
                  transform: `scale(${0.7 + 0.3 * marca})`,
                }}
              >
                <Check size={19} strokeWidth={3} style={{ opacity: marca }} />
              </span>
              <span
                style={{
                  fontFamily: fonte.texto,
                  fontSize: tamanho.corpo,
                  color: cor.tinta,
                  fontWeight: 500,
                }}
              >
                {checagem}
              </span>
            </div>
          </Em>
        );
      })}

      {/* O veredicto ---------------------------------------------------- */}
      <Em x={CHECK_X} y={CHECK_Y0 + totalChecagens * CHECK_PASSO + 14} largura={CHECK_LARGURA} zIndex={9}>
        <div
          style={{
            opacity: progresso(frame, veredictoEm, 18),
            transform: `scale(${0.92 + 0.08 * Math.min(1, mola(frame, veredictoEm))})`,
            transformOrigin: "left center",
            background: cor.verdeEscuro,
            borderRadius: raio.medio + 4,
            padding: "22px 28px",
            display: "flex",
            alignItems: "center",
            gap: 16,
            boxShadow: sombra.alta,
          }}
        >
          <ShieldCheck size={28} strokeWidth={2.2} color={cor.verde} />
          <span
            style={{
              fontFamily: fonte.display,
              fontSize: tamanho.cabecalho,
              fontWeight: 800,
              color: cor.branco,
              letterSpacing: "0.02em",
              textTransform: "uppercase",
            }}
          >
            {ELEGIBILIDADE.veredicto}
          </span>
        </div>
      </Em>

      <NotaDeCena em={veredictoEm + 16}>{ELEGIBILIDADE.nota}</NotaDeCena>
    </Palco>
  );
}
