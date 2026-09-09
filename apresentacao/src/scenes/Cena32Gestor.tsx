import { SeloDeCena } from "@/components/CenaBase";
import { Anel } from "@/components/Graficos";
import { Janela } from "@/components/Janela";
import { GESTOR_TEXTO } from "@/data/conteudo";
import { GESTOR, ILUSTRATIVO } from "@/data/metricas";
import { Em, Ilustrativo, Palco } from "@/design-system/primitivas";
import { cor, fonte, raio, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { Contador, Crescer } from "@/motion/primitivas";
import { easeOutQuint, formatarMoeda, progresso } from "@/motion/timing";

/**
 * CENA 32 — O painel do gestor.
 *
 * A última tela de produto, e a mais delicada em termos do que pode ser
 * afirmado. Ela mostra "valor potencial na fila", não "receita atribuída": sem
 * integração financeira fechada, o sistema conhece o valor dos orçamentos em
 * aberto, e não o que entrou no caixa.
 *
 * A distinção está escrita na tela, não escondida numa nota de rodapé — quem
 * assiste precisa saber a diferença antes de repetir o número numa reunião.
 */

const METRICAS = [
  { rotulo: "Pacientes que voltaram", valor: GESTOR.pacientesReativados, sufixo: "", detalhe: "da base antiga, em 90 dias" },
  { rotulo: "Consultas recuperadas", valor: GESTOR.consultasRecuperadas, sufixo: "", detalhe: "de faltas e cancelamentos" },
  {
    rotulo: "Parcelas em atraso resolvidas",
    valor: GESTOR.cobrancasResolvidas,
    sufixo: "",
    detalhe: "depois do lembrete no WhatsApp",
  },
  {
    rotulo: "Tempo médio de resposta",
    valor: GESTOR.tempoMedioRespostaMin,
    sufixo: " min",
    detalhe: "entre a pergunta e a resposta",
  },
] as const;

export function Cena32Gestor() {
  const frame = useFrame();

  return (
    <Palco fundo="#EEF1EA">
      <SeloDeCena />

      <Em x={140} y={118} zIndex={8}>
        <Crescer em={2} dur={36} deEscala={0.968}>
          <Janela ativo="Relatórios" usuario="Juliana">
            <div style={{ padding: "34px 40px", height: "100%" }}>
              <div
                style={{
                  opacity: progresso(frame, 16, 24),
                  fontFamily: fonte.display,
                  fontSize: 40,
                  fontWeight: 800,
                  color: cor.tinta,
                  letterSpacing: "-0.03em",
                }}
              >
                {GESTOR_TEXTO.titulo}
              </div>

              <div style={{ display: "flex", gap: 26, marginTop: 30 }}>
                {/* Métricas simples ---------------------------------- */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 13 }}>
                  {METRICAS.map((metrica, i) => {
                    const t = progresso(frame, 34 + i * 12, 24, easeOutQuint);
                    return (
                      <div
                        key={metrica.rotulo}
                        style={{
                          opacity: t,
                          transform: `translate3d(0, ${(1 - t) * 14}px, 0)`,
                          background: cor.branco,
                          border: `1px solid ${cor.linha}`,
                          borderRadius: raio.grande,
                          padding: "17px 26px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontFamily: fonte.texto,
                              fontSize: tamanho.apoio,
                              color: cor.tinta,
                              fontWeight: 600,
                            }}
                          >
                            {metrica.rotulo}
                          </div>
                          <div
                            style={{
                              fontFamily: fonte.texto,
                              fontSize: tamanho.micro,
                              color: cor.tintaFraca,
                              marginTop: 5,
                            }}
                          >
                            {metrica.detalhe}
                          </div>
                        </div>
                        <div
                          style={{
                            fontFamily: fonte.display,
                            fontSize: 40,
                            fontWeight: 800,
                            color: cor.verdeEscuro,
                            letterSpacing: "-0.03em",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {metrica.sufixo === " min" ? (
                            <>
                              <Contador ate={metrica.valor} em={46 + i * 12} dur={44} casas={1} />
                              {metrica.sufixo}
                            </>
                          ) : (
                            <Contador ate={metrica.valor} em={46 + i * 12} dur={44} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Conversão ----------------------------------------- */}
                <div
                  style={{
                    width: 340,
                    flex: "none",
                    opacity: progresso(frame, 62, 26),
                    background: cor.branco,
                    border: `1px solid ${cor.linha}`,
                    borderRadius: raio.enorme,
                    padding: 28,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 18,
                  }}
                >
                  <Anel razao={GESTOR.conversao} em={74} tamanho={190} rotulo="conversão" />
                  <div
                    style={{
                      fontFamily: fonte.texto,
                      fontSize: tamanho.legenda,
                      color: cor.tintaSuave,
                      textAlign: "center",
                      lineHeight: 1.5,
                    }}
                  >
de quem responde,
                    <br />
quantos marcam consulta
                  </div>
                </div>

                {/* Valor potencial ----------------------------------- */}
                <div
                  style={{
                    width: 420,
                    flex: "none",
                    opacity: progresso(frame, 86, 26),
                    transform: `translate3d(0, ${(1 - progresso(frame, 86, 32, easeOutQuint)) * 16}px, 0)`,
                    // #032F01 e não #095902: o verde claro do rótulo mede
                    // 2,87:1 sobre o verde oficial e 4,96:1 sobre este.
                    background: cor.profundo,
                    borderRadius: raio.enorme,
                    padding: 30,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontFamily: fonte.texto,
                        fontSize: tamanho.micro,
                        letterSpacing: "0.13em",
                        textTransform: "uppercase",
                        fontWeight: 700,
                        color: cor.verde,
                      }}
                    >
                      Valor parado na fila
                    </div>
                    <div
                      style={{
                        fontFamily: fonte.display,
                        fontSize: 56,
                        fontWeight: 800,
                        color: cor.branco,
                        letterSpacing: "-0.04em",
                        marginTop: 16,
                        fontVariantNumeric: "tabular-nums",
                        lineHeight: 1,
                      }}
                    >
                      <Contador ate={GESTOR.valorPotencial} em={96} dur={58} moeda />
                    </div>
                    <div
                      style={{
                        fontFamily: fonte.texto,
                        fontSize: tamanho.legenda,
                        color: "#B8D9A4",
                        marginTop: 16,
                        lineHeight: 1.55,
                      }}
                    >
                      A soma dos tratamentos que foram orçados e ainda não começaram.
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: 24,
                      paddingTop: 20,
                      borderTop: "1px solid rgba(255,255,255,0.14)",
                      fontFamily: fonte.texto,
                      fontSize: tamanho.micro,
                      color: "#9FCB88",
                      lineHeight: 1.5,
                      opacity: progresso(frame, 128, 26),
                    }}
                  >
                    Não é dinheiro que já entrou. É o que está
esperando uma decisão do paciente.
                  </div>
                </div>
              </div>

              {/* Rodapé ------------------------------------------------ */}
              <div
                style={{
                  marginTop: 28,
                  opacity: progresso(frame, 142, 26),
                  display: "flex",
                  alignItems: "center",
                  gap: 18,
                  fontFamily: fonte.texto,
                  fontSize: tamanho.legenda,
                  color: cor.tintaSuave,
                }}
              >
                <span>
                  Em atraso na fila:{" "}
                  <strong style={{ color: cor.tinta }}>{formatarMoeda(GESTOR.valorEmAtraso)}</strong>
                </span>
                <span style={{ color: cor.bordaForte }}>·</span>
                <span>
                  Custo do sistema no período:{" "}
                  <strong style={{ color: cor.tinta }}>
                    {formatarMoeda(GESTOR.investimentoMensal)}
                  </strong>
                </span>
                <span style={{ color: cor.bordaForte }}>·</span>
                <span>{GESTOR_TEXTO.notaValor}</span>
              </div>
            </div>
          </Janela>
        </Crescer>
      </Em>

      {ILUSTRATIVO && (
        <Em x={1466} y={74} zIndex={9}>
          <div style={{ opacity: progresso(frame, 160, 26) }}>
            <Ilustrativo />
          </div>
        </Em>
      )}
    </Palco>
  );
}
