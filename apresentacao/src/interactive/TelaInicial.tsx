import { Compass, Play } from "lucide-react";
import { motion } from "framer-motion";
import { Marca } from "@/components/Marca";
import { CAPA } from "@/data/conteudo";
import { DURACAO_SEGUNDOS } from "@/data/linhaDoTempo";
import { cor, fonte } from "@/design-system/tokens";
import { formatarTempo } from "@/motion/timing";

/**
 * A capa.
 *
 * Item 51: nada começa sozinho e nada começa com som. A pessoa escolhe entre
 * assistir e explorar — e a existência das duas portas na primeira tela é o que
 * comunica, antes de qualquer cena, que isto não é um vídeo comum.
 *
 * Aqui — e só aqui — o movimento é do Framer Motion, com relógio de parede. O
 * palco continua sendo função de `frame`; o chrome não precisa ser.
 */
export function TelaInicial({
  aoAssistir,
  aoExplorar,
}: {
  aoAssistir: () => void;
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
          style={{ display: "flex", justifyContent: "center", marginBottom: 34 }}
        >
          <Marca chave="jp" altura={62} />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.14 }}
          style={{
            fontFamily: fonte.display,
            fontSize: "clamp(38px, 5.2vw, 68px)",
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
            fontSize: "clamp(15px, 1.35vw, 20px)",
            color: cor.tintaSuave,
            lineHeight: 1.6,
            marginTop: 22,
            maxWidth: 620,
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
            gap: 14,
            justifyContent: "center",
            marginTop: 40,
            flexWrap: "wrap",
          }}
        >
          <button className="jp-botao jp-botao-primario" onClick={aoAssistir}>
            <Play size={18} fill="currentColor" strokeWidth={0} />
            {CAPA.assistir}
          </button>
          <button className="jp-botao jp-botao-secundario" onClick={aoExplorar}>
            <Compass size={18} strokeWidth={2.2} />
            {CAPA.explorar}
          </button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          style={{
            marginTop: 30,
            fontFamily: fonte.texto,
            fontSize: 13,
            color: cor.tintaFraca,
            letterSpacing: "0.02em",
          }}
        >
          {formatarTempo(DURACAO_SEGUNDOS)} · sem som por padrão · espaço para pausar
        </motion.div>
      </div>
    </motion.div>
  );
}
