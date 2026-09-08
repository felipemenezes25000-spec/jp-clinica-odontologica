import type { CSSProperties, ReactNode } from "react";
import { Marca } from "./Marca";
import type { ChaveMarca } from "@/data/marcas";
import { cor, fonte, raio, sombra, tamanho } from "@/design-system/tokens";

/**
 * O nó do diagrama — o tijolo mais repetido da peça.
 *
 * Um componente só para Dental Office, n8n, JP CRC, IA e WhatsApp, porque a
 * diferença entre eles é dado (nome, cor de acento, se tem logo), não estrutura.
 * Assim as cinco caixas têm exatamente o mesmo peso visual, e o olho lê o
 * diagrama como um sistema em vez de cinco desenhos parecidos.
 *
 * A cor de terceiro aparece em três lugares e só neles: o fio superior, o glifo
 * e o ponto de status. O corpo do card é sempre branco — item 6 do briefing, a
 * página não vira carnaval.
 */
export function No({
  titulo,
  subtitulo,
  marca,
  acento = cor.verdeEscuro,
  largura = 300,
  icone,
  ativo = false,
  apagado = false,
  rodape,
  style,
  children,
}: {
  titulo?: string;
  subtitulo?: string;
  /** Quando presente, o cabeçalho vira o logo em vez do texto. */
  marca?: ChaveMarca;
  acento?: string;
  largura?: number;
  icone?: ReactNode;
  /** Halo de atividade. Um por cena — é o que diz "é aqui que está acontecendo". */
  ativo?: boolean;
  apagado?: boolean;
  rodape?: ReactNode;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <div
      style={{
        width: largura,
        background: apagado ? "#F2F4F0" : cor.branco,
        border: `1px solid ${ativo ? `${acento}55` : apagado ? "#E7EAE4" : cor.borda}`,
        borderRadius: raio.enorme,
        boxShadow: ativo
          ? `${sombra.alta}, 0 0 0 6px ${acento}14`
          : apagado
            ? "none"
            : sombra.suave,
        overflow: "hidden",
        opacity: apagado ? 0.55 : 1,
        ...style,
      }}
    >
      <div style={{ height: 4, background: acento, opacity: apagado ? 0.35 : 1 }} />

      <div style={{ padding: "20px 22px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {icone !== undefined && (
            <span
              style={{
                width: 42,
                height: 42,
                borderRadius: 13,
                background: `${acento}18`,
                color: acento,
                display: "grid",
                placeItems: "center",
                flex: "none",
              }}
            >
              {icone}
            </span>
          )}

          {marca !== undefined ? (
            <Marca chave={marca} altura={30} />
          ) : (
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontFamily: fonte.display,
                  fontWeight: 700,
                  fontSize: tamanho.destaque,
                  color: cor.tinta,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.15,
                }}
              >
                {titulo}
              </div>
              {subtitulo !== undefined && (
                <div
                  style={{
                    fontFamily: fonte.texto,
                    fontSize: tamanho.legenda,
                    color: cor.tintaSuave,
                    marginTop: 3,
                  }}
                >
                  {subtitulo}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quando há logo, o subtítulo desce para baixo dele: encostado ao lado
            ele competiria com o wordmark pela mesma linha de base. */}
        {marca !== undefined && subtitulo !== undefined && (
          <div
            style={{
              fontFamily: fonte.texto,
              fontSize: tamanho.legenda,
              color: cor.tintaSuave,
              marginTop: 12,
              lineHeight: 1.45,
            }}
          >
            {subtitulo}
          </div>
        )}

        {children !== undefined && <div style={{ marginTop: 16 }}>{children}</div>}
      </div>

      {rodape !== undefined && (
        <div
          style={{
            padding: "13px 22px",
            borderTop: `1px solid ${cor.linha}`,
            background: "#FBFCF9",
            fontFamily: fonte.texto,
            fontSize: tamanho.micro + 1,
            color: cor.tintaSuave,
          }}
        >
          {rodape}
        </div>
      )}
    </div>
  );
}

/**
 * Item de lista dentro de um nó. Ponto + rótulo, alinhados.
 * Existe para as cinco cenas que listam entidades não escreverem cinco flexbox.
 */
export function ItemDeNo({
  rotulo,
  cor: ponto = cor.verde,
  detalhe,
}: {
  rotulo: string;
  cor?: string;
  detalhe?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 11, padding: "5px 0" }}>
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: ponto,
          flex: "none",
          transform: "translateY(-2px)",
        }}
      />
      <span
        style={{
          fontFamily: fonte.texto,
          fontSize: tamanho.apoio,
          color: cor.tinta,
          fontWeight: 500,
        }}
      >
        {rotulo}
      </span>
      {detalhe !== undefined && (
        <span
          style={{
            fontFamily: fonte.texto,
            fontSize: tamanho.legenda,
            color: cor.tintaFraca,
            marginLeft: "auto",
          }}
        >
          {detalhe}
        </span>
      )}
    </div>
  );
}

/**
 * Cápsula pequena de módulo — os oito quadrados que acendem dentro do núcleo na
 * cena 5. Menor que um `<No>` e sem borda de acento: eles são partes de uma
 * coisa só, não sistemas independentes.
 */
export function Modulo({
  nome,
  detalhe,
  aceso,
  acento = cor.verdeEscuro,
}: {
  nome: string;
  detalhe?: string;
  aceso: boolean;
  acento?: string;
}) {
  return (
    <div
      style={{
        padding: "14px 16px",
        borderRadius: raio.medio,
        background: aceso ? cor.branco : "#F4F6F1",
        border: `1px solid ${aceso ? `${acento}33` : "#EAEEE6"}`,
        boxShadow: aceso ? "0 10px 26px -20px rgba(3,47,1,0.4)" : "none",
        transform: `translateY(${aceso ? 0 : 3}px)`,
      }}
    >
      <div
        style={{
          fontFamily: fonte.display,
          fontWeight: 700,
          fontSize: tamanho.apoio,
          color: aceso ? cor.tinta : cor.tintaFraca,
          letterSpacing: "-0.01em",
        }}
      >
        {nome}
      </div>
      {detalhe !== undefined && (
        <div
          style={{
            fontFamily: fonte.texto,
            fontSize: tamanho.micro,
            color: aceso ? cor.tintaSuave : "#A7B0A6",
            marginTop: 3,
          }}
        >
          {detalhe}
        </div>
      )}
    </div>
  );
}
