import type { ReactNode } from "react";
import { Marca } from "./Marca";
import { cor, fonte, raio, sombra, tamanho } from "@/design-system/tokens";

/**
 * A janela do produto.
 *
 * Quatro cenas mostram telas do JP CRC (home, inbox, paciente, painel do
 * gestor). Se cada uma desenhasse a própria moldura, o corte entre elas
 * pareceria troca de aplicativo. Com uma moldura só — mesma barra, mesma
 * navegação, mesmo item ativo mudando —, as quatro lêem como quatro páginas do
 * mesmo sistema, que é o que são.
 */

const NAVEGACAO = ["Home", "Conversas", "Pacientes", "Oportunidades", "Automações", "Relatórios"];

export function Janela({
  ativo,
  children,
  usuario = "Raphaela",
  largura = 1640,
  altura = 762,
}: {
  /** Item da navegação em destaque. Precisa existir em NAVEGACAO. */
  ativo: string;
  children: ReactNode;
  usuario?: string;
  largura?: number;
  altura?: number;
}) {
  return (
    <div
      style={{
        width: largura,
        height: altura,
        background: cor.branco,
        border: `1px solid ${cor.borda}`,
        borderRadius: raio.enorme + 6,
        boxShadow: sombra.alta,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Barra superior */}
      <div
        style={{
          height: 76,
          borderBottom: `1px solid ${cor.linha}`,
          background: "linear-gradient(180deg, #FFFFFF 0%, #FBFDF8 100%)",
          display: "flex",
          alignItems: "center",
          padding: "0 30px",
          gap: 34,
          flex: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 13, flex: "none" }}>
          <Marca chave="jpSimbolo" altura={28} />
          <span
            style={{
              fontFamily: fonte.display,
              fontWeight: 800,
              fontSize: tamanho.apoio,
              color: cor.verdeEscuro,
              letterSpacing: "-0.015em",
            }}
          >
            JP CRC
          </span>
        </div>

        <nav style={{ display: "flex", gap: 4, flex: 1 }}>
          {NAVEGACAO.map((item) => {
            const selecionado = item === ativo;
            return (
              <span
                key={item}
                style={{
                  padding: "9px 16px",
                  borderRadius: 999,
                  fontFamily: fonte.texto,
                  fontSize: tamanho.legenda,
                  fontWeight: selecionado ? 700 : 500,
                  color: selecionado ? cor.verdeEscuro : cor.tintaSuave,
                  background: selecionado ? cor.menta : "transparent",
                }}
              >
                {item}
              </span>
            );
          })}
        </nav>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: "none" }}>
          <span
            style={{
              fontFamily: fonte.texto,
              fontSize: tamanho.legenda,
              color: cor.tintaSuave,
            }}
          >
            {usuario}
          </span>
          <span
            style={{
              width: 34,
              height: 34,
              borderRadius: 999,
              background: cor.menta,
              color: cor.verdeEscuro,
              display: "grid",
              placeItems: "center",
              fontFamily: fonte.display,
              fontWeight: 800,
              fontSize: 15,
            }}
          >
            {usuario.slice(0, 1)}
          </span>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, background: "#FAFBF7" }}>{children}</div>
    </div>
  );
}

/** Uma linha da fila do dia. Repetida na home e no inbox. */
export function LinhaDeFila({
  nome,
  motivo,
  sinal,
  prioridade,
  destacada = false,
  opacidade = 1,
  deslocamento = 0,
}: {
  nome: string;
  motivo: string;
  sinal: string;
  prioridade: number;
  destacada?: boolean;
  opacidade?: number;
  deslocamento?: number;
}) {
  return (
    <div
      style={{
        opacity: opacidade,
        transform: `translate3d(${deslocamento}px, 0, 0)`,
        display: "flex",
        alignItems: "center",
        gap: 18,
        padding: "16px 20px",
        borderRadius: raio.medio,
        background: destacada ? cor.menta : cor.branco,
        border: `1px solid ${destacada ? "#CDE7B4" : cor.linha}`,
      }}
    >
      <span
        style={{
          width: 40,
          height: 40,
          borderRadius: 999,
          background: destacada ? cor.branco : "#F1F4EF",
          color: cor.verdeEscuro,
          display: "grid",
          placeItems: "center",
          fontFamily: fonte.display,
          fontWeight: 800,
          fontSize: 16,
          flex: "none",
        }}
      >
        {nome.slice(0, 1)}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: fonte.display,
            fontSize: tamanho.apoio + 1,
            fontWeight: 700,
            color: cor.tinta,
            letterSpacing: "-0.012em",
          }}
        >
          {nome}
        </div>
        <div
          style={{
            fontFamily: fonte.texto,
            fontSize: tamanho.legenda - 1,
            color: cor.tintaSuave,
            marginTop: 2,
          }}
        >
          {motivo}
        </div>
      </div>

      <span
        style={{
          fontFamily: fonte.texto,
          fontSize: tamanho.micro,
          fontWeight: 600,
          color: cor.tintaSuave,
          padding: "5px 11px",
          borderRadius: 999,
          background: destacada ? cor.branco : "#F1F4EF",
          flex: "none",
        }}
      >
        {sinal}
      </span>

      <span
        style={{
          fontFamily: fonte.display,
          fontSize: tamanho.corpo,
          fontWeight: 800,
          color: prioridade >= 80 ? cor.verdeEscuro : cor.tintaSuave,
          fontVariantNumeric: "tabular-nums",
          width: 42,
          textAlign: "right",
          flex: "none",
        }}
      >
        {prioridade}
      </span>
    </div>
  );
}
