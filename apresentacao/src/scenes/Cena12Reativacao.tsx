import { Layers, MessageSquare, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { SeloDeCena, TituloDeCena } from "@/components/CenaBase";
import { CamadaDeConexoes, Conexao } from "@/components/Conexao";
import { No } from "@/components/No";
import { REATIVACAO } from "@/data/conteudo";
import { Em, Palco, Painel } from "@/design-system/primitivas";
import { cor, fonte, raio, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { Barra, Contador } from "@/motion/primitivas";
import { easeOutQuint, progresso } from "@/motion/timing";
import { curvaH } from "@/utils/caminho";

/**
 * CENA 12 — Reativação em escala.
 *
 * Escala assusta com razão: 4.281 mensagens num dia seria spam, e spam queima a
 * base que a clínica levou anos para construir. Por isso a cena mostra o lote
 * ANTES das proteções — primeiro o "250 por dia", depois o porquê.
 *
 * As cinco proteções não são promessa de marketing: são as regras de
 * `podeContatar` (limite diário, cooldown, opt-out, janela de horário) que já
 * existem no domínio.
 */

const CADEIA_Y = 296;
const CADEIA_LARGURA = 470;
const CADEIA_X = [170, 725, 1280];

export function Cena12Reativacao() {
  const frame = useFrame();

  return (
    <Palco>
      <SeloDeCena numero={12} />
      <TituloDeCena kicker="Reativação" titulo={REATIVACAO.titulo} em={2} />

      <CamadaDeConexoes zIndex={4}>
        <Conexao
          caminho={curvaH(CADEIA_X[0]! + CADEIA_LARGURA, CADEIA_Y + 92, CADEIA_X[1]!, CADEIA_Y + 92, 0.8)}
          em={44}
          dur={20}
          cor={cor.bordaForte}
          largura={2.2}
          pulsos={2}
          corPulso={cor.verde}
          cicloPulso={56}
          semente={3}
        />
        <Conexao
          caminho={curvaH(CADEIA_X[1]! + CADEIA_LARGURA, CADEIA_Y + 92, CADEIA_X[2]!, CADEIA_Y + 92, 0.8)}
          em={62}
          dur={20}
          cor={cor.bordaForte}
          largura={2.2}
          pulsos={2}
          corPulso={cor.whatsapp}
          cicloPulso={56}
          semente={6}
        />
      </CamadaDeConexoes>

      {/* A cadeia -------------------------------------------------------- */}
      <Em x={CADEIA_X[0]!} y={CADEIA_Y} zIndex={8}>
        <div style={{ opacity: progresso(frame, 16, 22) }}>
          <No
            titulo="Segmentação"
            subtitulo="Tempo parado, especialidade e situação do tratamento."
            icone={<SlidersHorizontal size={20} strokeWidth={2.1} />}
            largura={CADEIA_LARGURA}
          />
        </div>
      </Em>

      <Em x={CADEIA_X[1]!} y={CADEIA_Y} zIndex={8}>
        <div style={{ opacity: progresso(frame, 34, 22) }}>
          <No
            titulo="Lotes diários"
            subtitulo="Volume controlado, priorizando quem tem mais chance de responder."
            icone={<Layers size={20} strokeWidth={2.1} />}
            largura={CADEIA_LARGURA}
            ativo
          />
        </div>
      </Em>

      <Em x={CADEIA_X[2]!} y={CADEIA_Y} zIndex={8}>
        <div style={{ opacity: progresso(frame, 52, 22) }}>
          <No
            marca="whatsapp"
            acento={cor.whatsapp}
            subtitulo="Só em horário comercial, uma mensagem por paciente por dia."
            largura={CADEIA_LARGURA}
          />
        </div>
      </Em>

      {/* Os lotes -------------------------------------------------------- */}
      <Em x={170} y={584} largura={760} zIndex={8}>
        <div style={{ opacity: progresso(frame, 86, 26) }}>
          <Painel titulo="O lote de cada dia" padding={26}>
            {REATIVACAO.lotes.map((lote, i) => (
              <div key={lote.rotulo} style={{ marginBottom: i === REATIVACAO.lotes.length - 1 ? 0 : 22 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    marginBottom: 9,
                  }}
                >
                  <span
                    style={{
                      fontFamily: fonte.texto,
                      fontSize: tamanho.corpo,
                      color: cor.tinta,
                      fontWeight: 500,
                    }}
                  >
                    {lote.rotulo}
                  </span>
                  <span
                    style={{
                      fontFamily: fonte.display,
                      fontSize: tamanho.destaque,
                      fontWeight: 800,
                      color: cor.verdeEscuro,
                      fontVariantNumeric: "tabular-nums",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    <Contador ate={lote.quantidade} em={100 + i * 12} dur={36} />
                  </span>
                </div>
                <Barra
                  razao={1}
                  em={100 + i * 12}
                  dur={36}
                  cor={i === 0 ? cor.verdeEscuro : cor.verde}
                  altura={10}
                  style={{ opacity: 1 - i * 0.22 }}
                />
              </div>
            ))}
          </Painel>
        </div>
      </Em>

      {/* As proteções ---------------------------------------------------- */}
      <Em x={990} y={584} largura={760} zIndex={8}>
        <div style={{ opacity: progresso(frame, 108, 26) }}>
          <Painel
            titulo="O que impede isso de virar spam"
            acao={<ShieldCheck size={26} strokeWidth={2.1} color={cor.verdeEscuro} />}
            padding={26}
          >
            {REATIVACAO.protecoes.map((protecao, i) => {
              const t = progresso(frame, 122 + i * 10, 20, easeOutQuint);
              return (
                <div
                  key={protecao}
                  style={{
                    opacity: t,
                    transform: `translate3d(${(1 - t) * 12}px, 0, 0)`,
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "13px 0",
                    borderBottom:
                      i === REATIVACAO.protecoes.length - 1 ? "none" : `1px solid ${cor.linha}`,
                  }}
                >
                  <span
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 999,
                      background: cor.menta,
                      color: cor.verdeEscuro,
                      display: "grid",
                      placeItems: "center",
                      flex: "none",
                      fontSize: 15,
                      fontWeight: 800,
                      fontFamily: fonte.texto,
                    }}
                  >
                    ✓
                  </span>
                  <span
                    style={{
                      fontFamily: fonte.texto,
                      fontSize: tamanho.corpo,
                      color: cor.tinta,
                      fontWeight: 500,
                    }}
                  >
                    {protecao}
                  </span>
                </div>
              );
            })}
          </Painel>
        </div>
      </Em>

      {/* Um lembrete do canal, para a costura com a cena 13. */}
      <Em x={1280} y={188} zIndex={9}>
        <div
          style={{
            opacity: progresso(frame, 190, 24),
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            padding: "9px 16px",
            borderRadius: raio.pilula,
            background: cor.whatsappFraco,
          }}
        >
          <MessageSquare size={16} strokeWidth={2.2} color={cor.whatsappEscuro} />
          <span
            style={{
              fontFamily: fonte.texto,
              fontSize: tamanho.legenda,
              fontWeight: 600,
              color: cor.whatsappEscuro,
            }}
          >
            A próxima parada é a conversa
          </span>
        </div>
      </Em>
    </Palco>
  );
}
