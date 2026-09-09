import { Sparkles } from "lucide-react";
import { RODAPE, SeloDeCena } from "@/components/CenaBase";
import { Janela } from "@/components/Janela";
import { INBOX } from "@/data/conteudo";
import { FILA } from "@/data/metricas";
import { Em, Palco, Selo } from "@/design-system/primitivas";
import { cor, fonte, raio, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { Crescer } from "@/motion/primitivas";
import { easeOutQuint, progresso } from "@/motion/timing";

/**
 * CENA 26 — O inbox.
 *
 * Três colunas: a fila, a conversa e o contexto. A da direita é a que justifica
 * a cena — sem ela, o atendente abre uma conversa sem saber quem é a pessoa, e
 * a primeira coisa que faz é perguntar algo que o sistema já sabia.
 *
 * O painel de contexto mostra "Resumo da IA" e "Próxima ação" como sugestão
 * visível, não como comando executado. Quem decide continua sendo quem lê.
 */

const CONVERSAS = [
  { nome: "Maria Souza", trecho: "Quero marcar sim", quando: "agora", nao_lida: true },
  { nome: "João Lima", trecho: "Vocês atendem sábado?", quando: "12 min", nao_lida: true },
  { nome: "Ana Costa", trecho: "Estou com dor…", quando: "1 h", nao_lida: false },
  { nome: "Carlos Antunes", trecho: "Vou acertar essa semana", quando: "ontem", nao_lida: false },
] as const;

export function Cena26Inbox() {
  const frame = useFrame();

  return (
    <Palco fundo="#EEF1EA">
      <SeloDeCena />

      <Em x={140} y={96} zIndex={8}>
        <Crescer em={2} dur={36} deEscala={0.968}>
          <Janela ativo="Conversas">
            <div style={{ display: "flex", height: "100%" }}>
              {/* Lista ------------------------------------------------- */}
              <div
                style={{
                  width: 380,
                  flex: "none",
                  borderRight: `1px solid ${cor.linha}`,
                  background: cor.branco,
                  padding: "20px 16px",
                }}
              >
                <div
                  style={{
                    fontFamily: fonte.texto,
                    fontSize: tamanho.micro,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    fontWeight: 700,
                    color: cor.tintaFraca,
                    padding: "0 8px 14px",
                  }}
                >
Conversas do dia
                </div>

                {CONVERSAS.map((conversa, i) => {
                  const t = progresso(frame, 22 + i * 9, 22, easeOutQuint);
                  const ativa = i === 0;
                  return (
                    <div
                      key={conversa.nome}
                      style={{
                        opacity: t,
                        transform: `translate3d(${(1 - t) * -10}px, 0, 0)`,
                        padding: "14px 14px",
                        borderRadius: raio.medio,
                        background: ativa ? cor.menta : "transparent",
                        marginBottom: 4,
                        display: "flex",
                        gap: 12,
                        alignItems: "center",
                      }}
                    >
                      <span
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 999,
                          background: ativa ? cor.branco : "#F1F4EF",
                          color: cor.verdeEscuro,
                          display: "grid",
                          placeItems: "center",
                          fontFamily: fonte.display,
                          fontWeight: 800,
                          fontSize: 15,
                          flex: "none",
                        }}
                      >
                        {conversa.nome.slice(0, 1)}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontFamily: fonte.texto,
                            fontSize: tamanho.legenda + 1,
                            fontWeight: 700,
                            color: cor.tinta,
                          }}
                        >
                          {conversa.nome}
                        </div>
                        <div
                          style={{
                            fontFamily: fonte.texto,
                            fontSize: tamanho.micro,
                            color: cor.tintaSuave,
                            marginTop: 2,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {conversa.trecho}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flex: "none" }}>
                        <div
                          style={{
                            fontFamily: fonte.texto,
                            fontSize: tamanho.micro - 1,
                            color: cor.tintaFraca,
                          }}
                        >
                          {conversa.quando}
                        </div>
                        {conversa.nao_lida && (
                          <span
                            style={{
                              display: "inline-block",
                              width: 8,
                              height: 8,
                              borderRadius: 999,
                              background: cor.verde,
                              marginTop: 6,
                            }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Conversa ---------------------------------------------- */}
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: "24px 28px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  justifyContent: "flex-end",
                  background: "#FAFBF7",
                }}
              >
                {(
                  [
                    { de: "clinica", texto: "Olá, Maria! Vimos que sua consulta de ontem não aconteceu — quer que eu veja um novo horário?", autor: "Automação", em: 46 },
                    { de: "paciente", texto: "Oi! Quero marcar sim", autor: null, em: 66 },
                    { de: "paciente", texto: "De preferência no fim da tarde", autor: null, em: 82 },
                  ] as const
                ).map((mensagem, i) => {
                  const t = progresso(frame, mensagem.em, 20, easeOutQuint);
                  const daClinica = mensagem.de === "clinica";
                  return (
                    <div
                      key={i}
                      style={{
                        opacity: t,
                        transform: `translate3d(${(daClinica ? -10 : 10) * (1 - t)}px, ${8 * (1 - t)}px, 0)`,
                        alignSelf: daClinica ? "flex-start" : "flex-end",
                        maxWidth: "78%",
                      }}
                    >
                      {mensagem.autor !== null && (
                        <div
                          style={{
                            fontFamily: fonte.texto,
                            fontSize: tamanho.micro - 2,
                            color: cor.tintaFraca,
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            fontWeight: 700,
                            marginBottom: 5,
                          }}
                        >
                          {mensagem.autor}
                        </div>
                      )}
                      <div
                        style={{
                          background: daClinica ? cor.branco : cor.whatsappFraco,
                          border: `1px solid ${daClinica ? cor.linha : "#C9EBD7"}`,
                          borderRadius: 18,
                          borderBottomLeftRadius: daClinica ? 6 : 18,
                          borderBottomRightRadius: daClinica ? 18 : 6,
                          padding: "13px 17px",
                          fontFamily: fonte.texto,
                          fontSize: tamanho.apoio,
                          color: cor.tinta,
                          lineHeight: 1.5,
                        }}
                      >
                        {mensagem.texto}
                      </div>
                    </div>
                  );
                })}

                {/* Campo de resposta, desabilitado — a peça não simula digitação. */}
                <div
                  style={{
                    marginTop: 14,
                    opacity: progresso(frame, 100, 24),
                    border: `1px solid ${cor.linha}`,
                    borderRadius: raio.grande,
                    background: cor.branco,
                    padding: "16px 20px",
                    fontFamily: fonte.texto,
                    fontSize: tamanho.apoio,
                    color: cor.tintaFraca,
                  }}
                >
                  Escreva uma resposta…
                </div>
              </div>

              {/* Contexto ---------------------------------------------- */}
              <div
                style={{
                  width: 440,
                  flex: "none",
                  borderLeft: `1px solid ${cor.linha}`,
                  background: cor.branco,
                  padding: "24px 24px",
                }}
              >
                <div
                  style={{
                    opacity: progresso(frame, 34, 24),
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    paddingBottom: 20,
                    borderBottom: `1px solid ${cor.linha}`,
                  }}
                >
                  <span
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 999,
                      background: cor.menta,
                      color: cor.verdeEscuro,
                      display: "grid",
                      placeItems: "center",
                      fontFamily: fonte.display,
                      fontWeight: 800,
                      fontSize: 18,
                    }}
                  >
                    M
                  </span>
                  <div>
                    <div
                      style={{
                        fontFamily: fonte.display,
                        fontSize: tamanho.corpo,
                        fontWeight: 700,
                        color: cor.tinta,
                      }}
                    >
                      {FILA[0]!.nome}
                    </div>
                    <div
                      style={{
                        fontFamily: fonte.texto,
                        fontSize: tamanho.micro,
                        color: cor.tintaSuave,
                        marginTop: 2,
                      }}
                    >
                      Paciente desde 2022 · Ortodontia
                    </div>
                  </div>
                </div>

                {INBOX.contexto.map((linha, i) => {
                  const t = progresso(frame, 62 + i * 11, 22, easeOutQuint);
                  const resumo = linha.rotulo === "Resumo automático";
                  const acao = linha.rotulo === "O que fazer agora";
                  return (
                    <div
                      key={linha.rotulo}
                      style={{
                        opacity: t,
                        transform: `translate3d(${(1 - t) * 12}px, 0, 0)`,
                        padding: "16px 0",
                        borderBottom:
                          i === INBOX.contexto.length - 1 ? "none" : `1px solid ${cor.linha}`,
                      }}
                    >
                      <div
                        style={{
                          fontFamily: fonte.texto,
                          fontSize: tamanho.micro - 1,
                          letterSpacing: "0.1em",
                          textTransform: "uppercase",
                          fontWeight: 700,
                          color: resumo ? cor.ia : cor.tintaFraca,
                          display: "flex",
                          alignItems: "center",
                          gap: 7,
                        }}
                      >
                        {resumo && <Sparkles size={13} strokeWidth={2.4} />}
                        {linha.rotulo}
                      </div>
                      <div
                        style={{
                          fontFamily: fonte.texto,
                          fontSize: tamanho.apoio,
                          color: cor.tinta,
                          marginTop: 7,
                          fontWeight: acao ? 700 : 500,
                          lineHeight: 1.45,
                        }}
                      >
                        {acao ? <Selo>{linha.valor}</Selo> : linha.valor}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Janela>
        </Crescer>
      </Em>

      {/* A frase da cena vem embaixo, porque em cima quem manda é a tela do
          produto. y=872 e não 906: a legenda ocupa de 915 para baixo e é
          desenhada por cima, então a 906 esta linha existia sem ser lida. */}
      <Em x={140} y={RODAPE} largura={1640} zIndex={9}>
        <div
          style={{
            opacity: progresso(frame, 132, 26),
            fontFamily: fonte.texto,
            fontSize: tamanho.corpo,
            color: cor.tintaSuave,
          }}
        >
          {INBOX.titulo}
        </div>
      </Em>
    </Palco>
  );
}
