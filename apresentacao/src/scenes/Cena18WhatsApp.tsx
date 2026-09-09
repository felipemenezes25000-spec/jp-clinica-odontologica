import { NotaDeCena, SeloDeCena, TituloDeCena } from "@/components/CenaBase";
import { Balao, CabecalhoConversa, Conversa, Digitando, Fone } from "@/components/Fone";
import { Marca } from "@/components/Marca";
import { CONVERSA } from "@/data/conteudo";
import { Em, Halo, Palco } from "@/design-system/primitivas";
import { cor, fonte, raio, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { Crescer, Entrar } from "@/motion/primitivas";
import { easeOutQuint, progresso } from "@/motion/timing";

/**
 * CENA 18 — WhatsApp.
 *
 * O momento em que o sistema deixa de ser diagrama e vira conversa. Depois de
 * doze cenas de arquitetura, ver uma frase escrita para uma pessoa recoloca a
 * peça no chão.
 *
 * A etiqueta "Automação" acima do balão não é detalhe: ela é a diferença entre
 * o sistema fingir ser gente e o sistema dizer o que é. Quando a Raphaela
 * assume a conversa na cena 20, a etiqueta muda — e isso conta a história
 * sozinho.
 */

const FONE = { x: 1210, y: 130 };

export function Cena18WhatsApp() {
  const frame = useFrame();

  return (
    <Palco>
      <SeloDeCena />
      <Halo x={1420} y={520} raio={420} cor={cor.whatsapp} intensidade={0.1} />

      <TituloDeCena kicker="O canal" titulo={CONVERSA.titulo} em={2} largura={900} nivel={2} />

      {/* Explicação do lado esquerdo ------------------------------------ */}
      <Em x={170} y={366} largura={880} zIndex={9}>
        <Entrar em={34} dur={28} de="baixo" distancia={18}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 14,
              padding: "12px 20px",
              borderRadius: raio.pilula,
              background: cor.whatsappFraco,
              marginBottom: 32,
            }}
          >
            <Marca chave="whatsapp" altura={26} />
          </div>
        </Entrar>

        {(
          [
            {
              titulo: "A mensagem tem contexto",
              texto:
                "Ele sabe que a consulta era ontem, às 14:30, e de qual especialidade. A mensagem não é genérica.",
              em: 52,
            },
            {
              titulo: "A entrega é observada",
              texto: "Dá para ver se foi entregue e se a pessoa leu.",
              em: 74,
            },
            {
              titulo: "E a resposta volta para o sistema",
              texto:
                "O que o paciente escreve não fica no celular de ninguém: entra na ficha dele.",
              em: 96,
            },
          ] as const
        ).map((bloco) => (
          <Entrar key={bloco.titulo} em={bloco.em} dur={26} de="baixo" distancia={14}>
            <div style={{ marginBottom: 20, display: "flex", gap: 18 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: cor.whatsapp,
                  marginTop: 12,
                  flex: "none",
                }}
              />
              <div>
                <div
                  style={{
                    fontFamily: fonte.display,
                    fontSize: tamanho.destaque,
                    fontWeight: 700,
                    color: cor.tinta,
                    letterSpacing: "-0.018em",
                  }}
                >
                  {bloco.titulo}
                </div>
                <div
                  style={{
                    fontFamily: fonte.texto,
                    fontSize: tamanho.corpo,
                    color: cor.tintaSuave,
                    marginTop: 7,
                    lineHeight: 1.5,
                    maxWidth: 700,
                  }}
                >
                  {bloco.texto}
                </div>
              </div>
            </div>
          </Entrar>
        ))}
      </Em>

      {/* O aparelho ------------------------------------------------------ */}
      <Em x={FONE.x} y={FONE.y} zIndex={10}>
        <Crescer em={18} dur={40} deEscala={0.955}>
          <Fone altura={748}>
            <CabecalhoConversa />
            <Conversa>
              <Balao
                de="clinica"
                em={62}
                hora={CONVERSA.mensagens[0]!.hora}
                autor="Automação"
                entregue
                lida={frame > 140}
              >
                {CONVERSA.mensagens[0]!.texto}
              </Balao>

              <Digitando em={132} ate={168} />

              <Balao de="paciente" em={168} hora={CONVERSA.mensagens[1]!.hora}>
                {CONVERSA.mensagens[1]!.texto}
              </Balao>
            </Conversa>
          </Fone>
        </Crescer>
      </Em>

      {/* O realce que leva para a próxima cena ---------------------------- */}
      {/* Fica À ESQUERDA do aparelho, não sobre ele: a seta aponta para a
          resposta do paciente, e uma etiqueta em cima do balão esconde
          justamente a frase que ela está mandando ler. Cabe na faixa entre o
          texto da esquerda (que termina em 896) e o aparelho (que começa em
          1210) — foi por isso que a frase encurtou. */}
      <Em x={920} y={FONE.y + 560} zIndex={14}>
        <div
          style={{
            opacity: progresso(frame, 208, 20) * (1 - progresso(frame, 258, 12)),
            transform: `translate3d(${(1 - progresso(frame, 208, 26, easeOutQuint)) * 18}px, 0, 0)`,
            display: "inline-flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 20px",
            borderRadius: raio.pilula,
            background: cor.ia,
            boxShadow: `0 18px 40px -22px ${cor.ia}aa`,
          }}
        >
          <span
            style={{
              fontFamily: fonte.texto,
              fontSize: tamanho.apoio,
              fontWeight: 700,
              color: cor.branco,
              letterSpacing: "0.04em",
            }}
          >
            O sistema lê esta resposta →
          </span>
        </div>
      </Em>

      <NotaDeCena em={140} largura={880} y={860}>
        {CONVERSA.nota}
      </NotaDeCena>
    </Palco>
  );
}
