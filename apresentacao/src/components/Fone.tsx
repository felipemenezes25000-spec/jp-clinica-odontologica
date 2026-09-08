import type { CSSProperties, ReactNode } from "react";
import { Check, CheckCheck } from "lucide-react";
import { Marca } from "./Marca";
import { cor, fonte, raio, sombra, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { easeOutQuint, progresso } from "@/motion/timing";

/**
 * O aparelho e a conversa.
 *
 * Item 41 do briefing, e é uma decisão de risco, não de estética: a peça NÃO
 * reproduz a interface do WhatsApp. O que ela mostra é um mockup do próprio
 * design system — mesma tipografia, mesmas bordas e mesmo verde de canal do
 * resto do vídeo. Identifica o canal sem copiar produto de terceiro.
 */

export function Fone({
  children,
  largura = 420,
  altura = 790,
  style,
}: {
  children: ReactNode;
  largura?: number;
  altura?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        width: largura,
        height: altura,
        borderRadius: 52,
        background: "#E9EDE6",
        padding: 11,
        boxShadow: `${sombra.alta}, inset 0 0 0 1px rgba(3,47,1,0.06)`,
        ...style,
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 42,
          background: "#F6F8F3",
          border: `1px solid ${cor.borda}`,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          position: "relative",
        }}
      >
        {/* A ilha da câmera. Um detalhe só, e escuro: qualquer coisa além disso
            vira desenho de aparelho, e o assunto da cena não é o aparelho. */}
        <div
          style={{
            position: "absolute",
            top: 12,
            left: "50%",
            transform: "translateX(-50%)",
            width: 96,
            height: 26,
            borderRadius: 999,
            background: "#1C231C",
            zIndex: 5,
          }}
        />
        {children}
      </div>
    </div>
  );
}

/** Cabeçalho da conversa: quem está falando com o paciente. */
export function CabecalhoConversa({ subtitulo = "on-line" }: { subtitulo?: string }) {
  return (
    <div
      style={{
        padding: "50px 22px 16px",
        borderBottom: `1px solid ${cor.linha}`,
        background: cor.branco,
        display: "flex",
        alignItems: "center",
        gap: 14,
        flex: "none",
      }}
    >
      <div
        style={{
          width: 46,
          height: 46,
          borderRadius: 999,
          background: cor.menta,
          display: "grid",
          placeItems: "center",
          flex: "none",
        }}
      >
        <Marca chave="jpSimbolo" altura={26} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily: fonte.display,
            fontWeight: 700,
            fontSize: 19,
            color: cor.tinta,
            letterSpacing: "-0.01em",
          }}
        >
          JP Clínica Odontológica
        </div>
        <div
          style={{
            fontFamily: fonte.texto,
            fontSize: 14,
            color: cor.whatsappEscuro,
            marginTop: 2,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: 999,
              background: cor.whatsapp,
              display: "inline-block",
            }}
          />
          {subtitulo}
        </div>
      </div>
    </div>
  );
}

/** A área rolável da conversa. */
export function Conversa({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        flex: 1,
        padding: "22px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        justifyContent: "flex-end",
        background: "#F6F8F3",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Um balão.
 *
 * A entrada é deslocamento + escala a partir do lado de quem fala — é o que faz
 * a conversa parecer conversa, e não lista que apareceu. `entregue` e `lida`
 * existem porque o sistema real registra os dois estados (`StatusEntrega`), e
 * mostrá-los é o que diferencia "mandamos" de "chegou".
 */
export function Balao({
  de,
  children,
  hora,
  em = 0,
  entregue = false,
  lida = false,
  autor,
}: {
  de: "clinica" | "paciente";
  children: ReactNode;
  hora?: string;
  em?: number;
  entregue?: boolean;
  lida?: boolean;
  /** "Automação", "IA", "Raphaela" — quem escreveu do lado da clínica. */
  autor?: string;
}) {
  const frame = useFrame();
  const t = progresso(frame, em, 20, easeOutQuint);
  const daClinica = de === "clinica";

  if (t <= 0.001) return null;

  return (
    <div
      style={{
        alignSelf: daClinica ? "flex-start" : "flex-end",
        maxWidth: "84%",
        opacity: t,
        transform: `translate3d(${(daClinica ? -14 : 14) * (1 - t)}px, ${10 * (1 - t)}px, 0) scale(${0.97 + 0.03 * t})`,
        transformOrigin: daClinica ? "left bottom" : "right bottom",
      }}
    >
      {autor !== undefined && daClinica && (
        <div
          style={{
            fontFamily: fonte.texto,
            fontSize: 12.5,
            color: cor.tintaFraca,
            marginBottom: 5,
            marginLeft: 4,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          {autor}
        </div>
      )}
      <div
        style={{
          background: daClinica ? cor.branco : cor.whatsappFraco,
          border: `1px solid ${daClinica ? cor.borda : "#C9EBD7"}`,
          borderRadius: 20,
          borderBottomLeftRadius: daClinica ? 6 : 20,
          borderBottomRightRadius: daClinica ? 20 : 6,
          padding: "13px 16px 10px",
          boxShadow: "0 6px 18px -14px rgba(3,47,1,0.4)",
        }}
      >
        <div
          style={{
            fontFamily: fonte.texto,
            fontSize: 17,
            lineHeight: 1.5,
            color: cor.tinta,
          }}
        >
          {children}
        </div>
        {hora !== undefined && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 5,
              marginTop: 6,
              fontFamily: fonte.texto,
              fontSize: 12,
              color: cor.tintaFraca,
            }}
          >
            {hora}
            {daClinica && entregue && !lida && <Check size={14} strokeWidth={2.5} />}
            {daClinica && lida && (
              <CheckCheck size={14} strokeWidth={2.5} color={cor.whatsappEscuro} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Os três pontinhos de "digitando".
 *
 * Ciclo derivado do frame, e não de animação CSS: no render do Remotion uma
 * animação com relógio congelaria no primeiro estado e os três pontos sairiam
 * parados no vídeo inteiro.
 */
export function Digitando({ em = 0, ate }: { em?: number; ate?: number }) {
  const frame = useFrame();
  if (frame < em || (ate !== undefined && frame >= ate)) return null;

  return (
    <div
      style={{
        alignSelf: "flex-start",
        background: cor.branco,
        border: `1px solid ${cor.borda}`,
        borderRadius: 20,
        borderBottomLeftRadius: 6,
        padding: "15px 18px",
        display: "flex",
        gap: 6,
      }}
    >
      {[0, 1, 2].map((i) => {
        const fase = ((frame - em) / 8 - i * 0.4) % 3;
        const o = 0.28 + 0.62 * Math.max(0, Math.sin(fase * Math.PI));
        return (
          <span
            key={i}
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: cor.tintaSuave,
              opacity: o,
            }}
          />
        );
      })}
    </div>
  );
}

/**
 * Um cartão de ação dentro da conversa — os horários oferecidos, por exemplo.
 * Não é balão: é o sistema propondo, e a diferença visual importa.
 */
export function CartaoNaConversa({
  titulo,
  children,
  em = 0,
  acento = cor.verdeEscuro,
}: {
  titulo: string;
  children: ReactNode;
  em?: number;
  acento?: string;
}) {
  const frame = useFrame();
  const t = progresso(frame, em, 22, easeOutQuint);
  if (t <= 0.001) return null;

  return (
    <div
      style={{
        alignSelf: "flex-start",
        width: "88%",
        opacity: t,
        transform: `translate3d(${-12 * (1 - t)}px, ${8 * (1 - t)}px, 0)`,
        background: cor.branco,
        border: `1px solid ${acento}33`,
        borderRadius: raio.grande,
        overflow: "hidden",
        boxShadow: "0 10px 26px -18px rgba(3,47,1,0.4)",
      }}
    >
      <div
        style={{
          padding: "10px 16px",
          background: `${acento}10`,
          fontFamily: fonte.texto,
          fontSize: 12.5,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: acento,
        }}
      >
        {titulo}
      </div>
      <div style={{ padding: "14px 16px" }}>{children}</div>
    </div>
  );
}

/** Chip de horário. Fica realçado quando o paciente escolhe. */
export function Horario({
  hora,
  escolhido = false,
  indisponivel = false,
}: {
  hora: string;
  escolhido?: boolean;
  indisponivel?: boolean;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 82,
        padding: "10px 14px",
        borderRadius: raio.pequeno + 2,
        border: `1.5px solid ${escolhido ? cor.verdeEscuro : cor.borda}`,
        background: escolhido ? cor.menta : indisponivel ? "#F3F4F0" : cor.branco,
        color: indisponivel ? cor.tintaFraca : escolhido ? cor.verdeEscuro : cor.tinta,
        fontFamily: fonte.texto,
        fontWeight: escolhido ? 700 : 500,
        fontSize: tamanho.apoio,
        textDecoration: indisponivel ? "line-through" : "none",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {hora}
    </span>
  );
}
