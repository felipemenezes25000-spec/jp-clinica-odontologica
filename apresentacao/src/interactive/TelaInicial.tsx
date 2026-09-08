import { Compass, Play, VolumeX } from "lucide-react";
import { motion } from "framer-motion";
import { Marca } from "@/components/Marca";
import { CAPA } from "@/data/conteudo";
import { DURACAO_SEGUNDOS } from "@/data/linhaDoTempo";
import { cor, fonte } from "@/design-system/tokens";
import { formatarTempo } from "@/motion/timing";

/**
 * A capa.
 *
 * Três portas, e a ordem delas é a mensagem: assistir com narração é o caminho
 * principal, porque a voz é o que faz a peça se explicar para quem não é da
 * área. As outras duas existem porque nem todo mundo pode ligar o som — numa
 * recepção, numa reunião — e ninguém deveria ser obrigado a.
 *
 * Nada começa sozinho e nada começa com som antes do clique: o navegador exige
 * o gesto, e é o certo de qualquer forma.
 *
 * Aqui — e só aqui — o movimento é do Framer Motion, com relógio de parede. O
 * palco continua sendo função de `frame`; o chrome não precisa ser.
 */
export function TelaInicial({
  aoAssistir,
  aoAssistirSemSom,
  aoExplorar,
}: {
  aoAssistir: () => void;
  aoAssistirSemSom: () => void;
  aoExplorar: () => void;
}) {
  return (
    <motion.div
      className="jp-inicio"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="jp-inicio-conteudo">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
          style={{ display: "flex", justifyContent: "center", marginBottom: 30 }}
        >
          <Marca chave="jp" altura={58} />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.14 }}
          style={{
            fontFamily: fonte.display,
            fontSize: "clamp(34px, 4.8vw, 62px)",
            fontWeight: 800,
            letterSpacing: "-0.035em",
            color: cor.verdeEscuro,
            lineHeight: 1.05,
          }}
        >
          {CAPA.chamada}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.24 }}
          style={{
            fontFamily: fonte.texto,
            fontSize: "clamp(15px, 1.3vw, 19px)",
            color: cor.tintaSuave,
            lineHeight: 1.6,
            marginTop: 20,
            maxWidth: 600,
            marginInline: "auto",
          }}
        >
          {CAPA.subtitulo}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.34 }}
          style={{
            display: "flex",
            gap: 12,
            justifyContent: "center",
            marginTop: 34,
            flexWrap: "wrap",
          }}
        >
          <button className="jp-botao jp-botao-primario" onClick={aoAssistir}>
            <Play size={18} fill="currentColor" strokeWidth={0} />
            {CAPA.assistir}
          </button>
          <button className="jp-botao jp-botao-secundario" onClick={aoAssistirSemSom}>
            <VolumeX size={17} strokeWidth={2.2} />
            {CAPA.semSom}
          </button>
          <button className="jp-botao jp-botao-secundario" onClick={aoExplorar}>
            <Compass size={17} strokeWidth={2.2} />
            {CAPA.explorar}
          </button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          style={{
            marginTop: 26,
            fontFamily: fonte.texto,
            fontSize: 13,
            color: cor.tintaFraca,
            letterSpacing: "0.02em",
          }}
        >
          {formatarTempo(DURACAO_SEGUNDOS)} · com narração e legenda · barra de espaço pausa
        </motion.div>
      </div>
    </motion.div>
  );
}
