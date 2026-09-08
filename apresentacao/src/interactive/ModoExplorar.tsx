import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, PlayCircle, X } from "lucide-react";
import { MapaEcossistema, type ChaveNo } from "@/components/MapaEcossistema";
import { CAMADAS, dicaPor, FLUXOS, type MiniFluxo } from "@/data/explorar";
import { CENAS_POSICIONADAS, cenaPorId, type IdCena } from "@/data/linhaDoTempo";
import { cor, fonte } from "@/design-system/tokens";
import { ProvedorDeCena, ProvedorDeFrame, ProvedorDeMovimento } from "@/motion/frame";
import { Visor } from "./Visor";

/**
 * O modo Explorar.
 *
 * A mesma informação do filme, com o controle invertido: aqui quem escolhe a
 * ordem é quem está olhando. Três camadas, do geral ao específico —
 *
 * 1. o mapa (passe o mouse por um nó e ele se explica);
 * 2. os fluxos (clique e veja o caminho de um tipo de paciente);
 * 3. as cenas (pule direto para qualquer momento do vídeo).
 *
 * O mapa é o MESMO componente da cena 26. Ele pede `useFrame()`, e aqui não há
 * linha do tempo — então o modo o embrulha num relógio parado num frame alto.
 * É um truque pequeno que evita duplicar o mapa em duas versões que
 * inevitavelmente divergiriam.
 */

const FRAME_PARADO = 900;

export function ModoExplorar({
  aberto,
  aoFechar,
  aoIrParaCena,
}: {
  aberto: boolean;
  aoFechar: () => void;
  aoIrParaCena: (id: IdCena) => void;
}) {
  const [destacado, setDestacado] = useState<ChaveNo | null>(null);
  const [ponteiro, setPonteiro] = useState({ x: 0, y: 0 });
  const [fluxo, setFluxo] = useState<MiniFluxo | null>(null);

  const dica = destacado === null ? undefined : dicaPor(destacado);

  return (
    <AnimatePresence>
      {aberto && (
        <motion.div
          className="jp-explorar"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28 }}
          role="dialog"
          aria-modal="true"
          aria-label="Explorar a arquitetura do JP CRC"
        >
          <div style={{ maxWidth: 1400, margin: "0 auto", padding: "34px 32px 70px" }}>
            {/* Cabeçalho ---------------------------------------------- */}
            <header
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 24,
                marginBottom: 28,
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: fonte.texto,
                    fontSize: 12.5,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    fontWeight: 700,
                    color: cor.verdeEscuro,
                  }}
                >
                  Modo explorar
                </div>
                <h2
                  style={{
                    fontFamily: fonte.display,
                    fontSize: "clamp(28px, 3.2vw, 42px)",
                    fontWeight: 800,
                    color: cor.tinta,
                    letterSpacing: "-0.03em",
                    marginTop: 10,
                  }}
                >
                  A arquitetura, no seu ritmo
                </h2>
                <p
                  style={{
                    fontFamily: fonte.texto,
                    fontSize: 15,
                    color: cor.tintaSuave,
                    marginTop: 10,
                    maxWidth: 640,
                    lineHeight: 1.6,
                  }}
                >
                  Passe o mouse nos blocos para ver o que cada um faz, abra um fluxo para seguir um
                  tipo de paciente do início ao fim, ou pule direto para qualquer cena do vídeo.
                </p>
              </div>

              <button
                className="jp-botao-icone"
                onClick={aoFechar}
                aria-label="Fechar o modo explorar"
                title="Fechar (Esc)"
                style={{ flex: "none" }}
              >
                <X size={22} strokeWidth={2.2} />
              </button>
            </header>

            {/* O mapa -------------------------------------------------- */}
            <div
              style={{ position: "relative", aspectRatio: "16 / 9", marginBottom: 34 }}
              onMouseMove={(e) => {
                const caixa = e.currentTarget.getBoundingClientRect();
                setPonteiro({ x: e.clientX - caixa.left, y: e.clientY - caixa.top });
              }}
              onMouseLeave={() => setDestacado(null)}
            >
              <Visor sombra>
                <ProvedorDeFrame frame={FRAME_PARADO} duracaoTotal={FRAME_PARADO + 1}>
                  <ProvedorDeMovimento reduzido>
                    <ProvedorDeCena
                      frameLocal={FRAME_PARADO}
                      duracao={FRAME_PARADO + 1}
                      transicao={1}
                    >
                      <div style={{ position: "absolute", inset: 0, background: cor.fundo }}>
                        <MapaEcossistema
                          em={0}
                          passo={0}
                          interativo
                          destacado={destacado}
                          aoEntrar={(chave) => setDestacado(chave)}
                          aoSair={() => setDestacado(null)}
                          aoClicar={(chave) => {
                            const alvo = dicaPor(chave);
                            if (alvo !== undefined) aoIrParaCena(alvo.cena);
                          }}
                        />
                      </div>
                    </ProvedorDeCena>
                  </ProvedorDeMovimento>
                </ProvedorDeFrame>
              </Visor>

              {dica !== undefined && (
                <div
                  className="jp-dica"
                  style={{
                    left: Math.min(ponteiro.x + 18, 1100),
                    top: ponteiro.y + 18,
                  }}
                >
                  <strong>{dica.titulo}</strong>
                  {dica.texto}
                  <div style={{ marginTop: 8, opacity: 0.72, fontSize: 12 }}>
                    Clique para ver esta parte no vídeo
                  </div>
                </div>
              )}
            </div>

            {/* Camadas ------------------------------------------------- */}
            <div style={{ marginBottom: 38 }}>
              <SecaoTitulo>As seis camadas</SecaoTitulo>
              <div className="jp-explorar-grade">
                {CAMADAS.map((camada) => (
                  <div
                    key={camada.chave}
                    className="jp-explorar-card"
                    style={{ cursor: "default" }}
                  >
                    <div
                      style={{
                        fontFamily: fonte.display,
                        fontSize: 18,
                        fontWeight: 700,
                        color: cor.tinta,
                      }}
                    >
                      {camada.nome}
                    </div>
                    <div
                      style={{
                        fontFamily: fonte.texto,
                        fontSize: 14,
                        color: cor.tintaSuave,
                        marginTop: 8,
                        lineHeight: 1.55,
                      }}
                    >
                      {camada.descricao}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Mini fluxos --------------------------------------------- */}
            <div style={{ marginBottom: 38 }}>
              <SecaoTitulo>Fluxos completos</SecaoTitulo>
              <div className="jp-explorar-grade">
                {FLUXOS.map((f) => (
                  <button
                    key={f.chave}
                    className="jp-explorar-card"
                    aria-pressed={fluxo?.chave === f.chave}
                    onClick={() => setFluxo(fluxo?.chave === f.chave ? null : f)}
                  >
                    <div
                      style={{
                        fontFamily: fonte.display,
                        fontSize: 18,
                        fontWeight: 700,
                        color: cor.tinta,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                      }}
                    >
                      {f.titulo}
                      <ArrowRight
                        size={17}
                        strokeWidth={2.4}
                        color={cor.verdeEscuro}
                        style={{
                          transform: fluxo?.chave === f.chave ? "rotate(90deg)" : "none",
                          transition: "transform .18s ease",
                        }}
                      />
                    </div>
                    <div
                      style={{
                        fontFamily: fonte.texto,
                        fontSize: 14,
                        color: cor.tintaSuave,
                        marginTop: 8,
                        lineHeight: 1.55,
                      }}
                    >
                      {f.resumo}
                    </div>
                  </button>
                ))}
              </div>

              <AnimatePresence mode="wait">
                {fluxo !== null && (
                  <motion.div
                    key={fluxo.chave}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.24 }}
                    style={{ overflow: "hidden" }}
                  >
                    <div
                      style={{
                        marginTop: 16,
                        padding: "26px 28px",
                        borderRadius: 20,
                        background: cor.branco,
                        border: `1px solid ${cor.borda}`,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 18,
                          marginBottom: 22,
                        }}
                      >
                        <div
                          style={{
                            fontFamily: fonte.display,
                            fontSize: 20,
                            fontWeight: 700,
                            color: cor.tinta,
                          }}
                        >
                          {fluxo.titulo}
                        </div>
                        <button
                          className="jp-botao jp-botao-secundario"
                          style={{ padding: "9px 18px", fontSize: 13.5 }}
                          onClick={() => aoIrParaCena(fluxo.cena)}
                        >
                          <PlayCircle size={16} strokeWidth={2.2} />
                          Ver no vídeo
                        </button>
                      </div>

                      <ol
                        style={{
                          listStyle: "none",
                          margin: 0,
                          padding: 0,
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 12,
                        }}
                      >
                        {fluxo.passos.map((passo, i) => (
                          <li
                            key={passo.rotulo}
                            style={{
                              flex: "1 1 210px",
                              minWidth: 210,
                              padding: "16px 18px",
                              borderRadius: 14,
                              background: "#FAFBF7",
                              border: `1px solid ${cor.linha}`,
                            }}
                          >
                            <div
                              style={{
                                fontFamily: fonte.mono,
                                fontSize: 11.5,
                                color: cor.tintaFraca,
                                letterSpacing: "0.1em",
                              }}
                            >
                              {String(i + 1).padStart(2, "0")}
                            </div>
                            <div
                              style={{
                                fontFamily: fonte.texto,
                                fontSize: 15,
                                fontWeight: 700,
                                color: cor.tinta,
                                marginTop: 7,
                              }}
                            >
                              {passo.rotulo}
                            </div>
                            <div
                              style={{
                                fontFamily: fonte.texto,
                                fontSize: 13,
                                color: cor.tintaSuave,
                                marginTop: 6,
                                lineHeight: 1.5,
                              }}
                            >
                              {passo.detalhe}
                            </div>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Cenas --------------------------------------------------- */}
            <div>
              <SecaoTitulo>Ir direto para uma cena</SecaoTitulo>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))",
                  gap: 8,
                }}
              >
                {CENAS_POSICIONADAS.map((cena) => (
                  <button
                    key={cena.id}
                    onClick={() => aoIrParaCena(cena.id)}
                    style={{
                      textAlign: "left",
                      padding: "12px 15px",
                      borderRadius: 12,
                      border: `1px solid ${cor.linha}`,
                      background: cor.branco,
                      display: "flex",
                      alignItems: "center",
                      gap: 11,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: fonte.mono,
                        fontSize: 11.5,
                        color: cor.tintaFraca,
                        flex: "none",
                      }}
                    >
                      {String(cena.indice + 1).padStart(2, "0")}
                    </span>
                    <span
                      style={{
                        fontFamily: fonte.texto,
                        fontSize: 14,
                        color: cor.tinta,
                        fontWeight: 500,
                      }}
                    >
                      {cena.nome}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SecaoTitulo({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: fonte.texto,
        fontSize: 12.5,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        fontWeight: 700,
        color: cor.tintaFraca,
        marginBottom: 16,
      }}
    >
      {children}
    </div>
  );
}

/** Reexportado para o player montar o atalho de "ir para a cena". */
export { cenaPorId };
