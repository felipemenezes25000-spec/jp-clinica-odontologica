import type { CSSProperties } from "react";
import { MARCAS, type ChaveMarca } from "@/data/marcas";
import { cor, fonte } from "@/design-system/tokens";
import { asset } from "@/utils/asset";

/**
 * A marca de qualquer sistema que apareça na peça.
 *
 * Existe um componente só, e não um por integração, porque a regra de exibição é
 * a mesma para todos: se há arquivo oficial, mostra o arquivo, na proporção do
 * viewBox e sem recolorir; se não há, mostra um wordmark do design system com o
 * nome escrito por extenso. O que muda é só a linha do registro `MARCAS`.
 *
 * Nunca há esticamento: a largura é derivada da altura pela proporção declarada.
 */

export function Marca({
  chave,
  altura,
  fundo = "claro",
  style,
}: {
  chave: ChaveMarca;
  altura: number;
  /** A cor da SUPERFÍCIE onde a marca pousa — não a cor da arte. */
  fundo?: "claro" | "escuro";
  style?: CSSProperties;
}) {
  const marca = MARCAS[chave];
  const largura = Math.round(altura * marca.proporcao);

  if (marca.arquivo !== null) {
    const caminho =
      fundo === "escuro" && marca.arquivoEscuro !== undefined
        ? marca.arquivoEscuro
        : marca.arquivo;
    return (
      <img
        src={asset(caminho)}
        alt={marca.nome}
        width={largura}
        height={altura}
        draggable={false}
        style={{ display: "block", ...style }}
      />
    );
  }

  return <Wordmark chave={chave} altura={altura} fundo={fundo} style={style} />;
}

/* -------------------------------------------------------------------------- */
/* Wordmark de espera                                                         */
/* -------------------------------------------------------------------------- */

/**
 * O substituto elegante quando não há logo.
 *
 * Deliberadamente tipográfico: um glifo geométrico simples + o nome por extenso.
 * Não tenta lembrar o logo real de ninguém — o briefing proíbe "logo parecido",
 * e um wordmark honesto some assim que o arquivo oficial entra no registro.
 */
function Wordmark({
  chave,
  altura,
  fundo,
  style,
}: {
  chave: ChaveMarca;
  altura: number;
  fundo: "claro" | "escuro";
  style?: CSSProperties;
}) {
  const marca = MARCAS[chave];
  const tinta = fundo === "escuro" ? "#F2F6EE" : cor.tinta;
  const glifo = altura * 0.92;

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: altura * 0.34,
        height: altura,
        ...style,
      }}
      aria-label={marca.nome}
      role="img"
    >
      <Glifo chave={chave} tamanho={glifo} />
      <span
        style={{
          fontFamily: fonte.display,
          fontWeight: 700,
          fontSize: altura * 0.56,
          letterSpacing: "-0.02em",
          color: tinta,
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}
      >
        {marca.nome}
      </span>
    </div>
  );
}

/** O glifo do wordmark. Geometria pura, na cor de acento da integração. */
export function Glifo({ chave, tamanho }: { chave: ChaveMarca; tamanho: number }) {
  const acento = MARCAS[chave].acento;
  const r = tamanho * 0.26;

  return (
    <span
      style={{
        width: tamanho,
        height: tamanho,
        borderRadius: r,
        background: acento,
        display: "grid",
        placeItems: "center",
        flex: "none",
      }}
    >
      <svg width={tamanho * 0.6} height={tamanho * 0.6} viewBox="0 0 24 24" fill="none">
        {chave === "dentalOffice" && (
          // Registros empilhados: é o que o sistema guarda.
          <>
            <ellipse cx="12" cy="5.6" rx="7.4" ry="2.8" stroke="#fff" strokeWidth="1.9" />
            <path d="M4.6 5.6v6.4c0 1.55 3.31 2.8 7.4 2.8s7.4-1.25 7.4-2.8V5.6" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" />
            <path d="M4.6 12v6.4c0 1.55 3.31 2.8 7.4 2.8s7.4-1.25 7.4-2.8V12" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" />
          </>
        )}
        {chave === "whatsapp" && (
          // Balão de conversa genérico. Não é o glifo do WhatsApp — ver
          // public/brands/whatsapp/PLACEHOLDER.md.
          <path
            d="M21 11.4c0 4.4-4.03 7.95-9 7.95-1.16 0-2.27-.19-3.29-.55L3 20.5l1.83-4.2A7.6 7.6 0 0 1 3 11.4C3 7 7.03 3.45 12 3.45S21 7 21 11.4Z"
            stroke="#fff"
            strokeWidth="1.9"
            strokeLinejoin="round"
          />
        )}
        {chave === "n8n" && (
          // Grafo de nós: o que a ferramenta faz, não o logotipo dela.
          <>
            <circle cx="4.5" cy="12" r="2.4" stroke="#fff" strokeWidth="1.9" />
            <circle cx="14" cy="6.5" r="2.4" stroke="#fff" strokeWidth="1.9" />
            <circle cx="14" cy="17.5" r="2.4" stroke="#fff" strokeWidth="1.9" />
            <path d="m6.6 10.8 5.3-3.1M6.6 13.2l5.3 3.1" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" />
            <circle cx="20.5" cy="12" r="1.6" fill="#fff" />
          </>
        )}
        {chave === "ia" && (
          <>
            <path d="M12 3.2v3.1M12 17.7v3.1M4.6 12h3M16.4 12h3" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" />
            <circle cx="12" cy="12" r="5.3" stroke="#fff" strokeWidth="1.9" />
            <circle cx="12" cy="12" r="1.7" fill="#fff" />
          </>
        )}
        {(chave === "jp" || chave === "jpSimbolo") && (
          <circle cx="12" cy="12" r="7" stroke="#fff" strokeWidth="1.9" />
        )}
      </svg>
    </span>
  );
}
