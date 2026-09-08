import type { ReactNode } from "react";
import {
  Bot,
  CalendarCheck,
  MessageSquare,
  TrendingUp,
  UserRound,
  Workflow,
} from "lucide-react";
import { CamadaDeConexoes, Conexao } from "./Conexao";
import { Marca } from "./Marca";
import type { ChaveMarca } from "@/data/marcas";
import { Em } from "@/design-system/primitivas";
import { cor, fonte, raio, sombra, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { easeOutQuint, progresso } from "@/motion/timing";
import { curvaH, curvaV } from "@/utils/caminho";

/**
 * O mapa do ecossistema inteiro.
 *
 * Usado em dois lugares: a cena 26 (onde a câmera se afasta e ele aparece
 * montado) e o modo Explorar (onde a pessoa clica nele). É o mesmo componente
 * nos dois — se fossem dois, o mapa do vídeo e o mapa interativo divergiriam na
 * primeira alteração, e a peça passaria a contar duas arquiteturas.
 *
 * O traçado é uma serpentina: quatro nós da esquerda para a direita, desce, e
 * mais quatro da direita para a esquerda. Cabe em 1920×1080 sem miniaturizar os
 * cards, e a leitura continua sendo uma linha só.
 */

export type ChaveNo =
  | "dentalOffice"
  | "n8n"
  | "jp"
  | "ia"
  | "whatsapp"
  | "paciente"
  | "agendamento"
  | "resultado";

type DefinicaoNo = {
  chave: ChaveNo;
  titulo: string;
  legenda: string;
  marca?: ChaveMarca;
  icone?: ReactNode;
  acento: string;
  x: number;
  y: number;
};

const LARGURA = 380;
const ALTURA = 178;
const LINHA_1 = 300;
const LINHA_2 = 620;
const COLUNAS = [110, 550, 990, 1430];

export const NOS: readonly DefinicaoNo[] = [
  {
    chave: "dentalOffice",
    titulo: "Dental Office",
    legenda: "Pacientes, agenda, status",
    marca: "dentalOffice",
    acento: cor.dentalOffice,
    x: COLUNAS[0]!,
    y: LINHA_1,
  },
  {
    chave: "n8n",
    titulo: "Backend + n8n",
    legenda: "Sync, webhooks, jobs",
    icone: <Workflow size={20} strokeWidth={2.1} />,
    acento: cor.n8n,
    x: COLUNAS[1]!,
    y: LINHA_1,
  },
  {
    chave: "jp",
    titulo: "JP CRC",
    legenda: "Eventos, oportunidades, fila",
    marca: "jpSimbolo",
    acento: cor.verdeEscuro,
    x: COLUNAS[2]!,
    y: LINHA_1,
  },
  {
    chave: "ia",
    titulo: "Automação + IA",
    legenda: "Regras, jornadas, intenção",
    icone: <Bot size={20} strokeWidth={2.1} />,
    acento: cor.ia,
    x: COLUNAS[3]!,
    y: LINHA_1,
  },
  {
    chave: "whatsapp",
    titulo: "WhatsApp",
    legenda: "Entrega, leitura, resposta",
    marca: "whatsapp",
    acento: cor.whatsapp,
    x: COLUNAS[3]!,
    y: LINHA_2,
  },
  {
    chave: "paciente",
    titulo: "Paciente",
    legenda: "Responde, decide, comparece",
    icone: <UserRound size={20} strokeWidth={2.1} />,
    acento: cor.tintaSuave,
    x: COLUNAS[2]!,
    y: LINHA_2,
  },
  {
    chave: "agendamento",
    titulo: "Agendamento",
    legenda: "Horário revalidado e criado",
    icone: <CalendarCheck size={20} strokeWidth={2.1} />,
    acento: cor.verde,
    x: COLUNAS[1]!,
    y: LINHA_2,
  },
  {
    chave: "resultado",
    titulo: "Resultados",
    legenda: "Métricas e valor potencial",
    icone: <TrendingUp size={20} strokeWidth={2.1} />,
    acento: cor.verdeEscuro,
    x: COLUNAS[0]!,
    y: LINHA_2,
  },
];

/** Os trechos do caminho, na ordem em que se desenham. */
function trechos() {
  const meioY1 = LINHA_1 + ALTURA / 2;
  const meioY2 = LINHA_2 + ALTURA / 2;
  return [
    curvaH(COLUNAS[0]! + LARGURA, meioY1, COLUNAS[1]!, meioY1, 0.8),
    curvaH(COLUNAS[1]! + LARGURA, meioY1, COLUNAS[2]!, meioY1, 0.8),
    curvaH(COLUNAS[2]! + LARGURA, meioY1, COLUNAS[3]!, meioY1, 0.8),
    curvaV(COLUNAS[3]! + LARGURA / 2, LINHA_1 + ALTURA, COLUNAS[3]! + LARGURA / 2, LINHA_2, 0.7),
    curvaH(COLUNAS[3]!, meioY2, COLUNAS[2]! + LARGURA, meioY2, 0.8),
    curvaH(COLUNAS[2]!, meioY2, COLUNAS[1]! + LARGURA, meioY2, 0.8),
    curvaH(COLUNAS[1]!, meioY2, COLUNAS[0]! + LARGURA, meioY2, 0.8),
  ];
}

export function MapaEcossistema({
  em = 0,
  passo = 12,
  destacado,
  aoEntrar,
  aoSair,
  aoClicar,
  interativo = false,
}: {
  em?: number;
  passo?: number;
  destacado?: ChaveNo | null;
  aoEntrar?: (chave: ChaveNo, x: number, y: number) => void;
  aoSair?: () => void;
  aoClicar?: (chave: ChaveNo) => void;
  interativo?: boolean;
}) {
  const frame = useFrame();
  const caminhos = trechos();

  return (
    <>
      <CamadaDeConexoes zIndex={4}>
        {caminhos.map((caminho, i) => (
          <Conexao
            key={i}
            caminho={caminho}
            em={em + 20 + i * passo}
            dur={22}
            cor={cor.bordaForte}
            largura={2.2}
            pulsos={2}
            corPulso={cor.verde}
            cicloPulso={80}
            raioPulso={5}
            semente={i + 1}
          />
        ))}
      </CamadaDeConexoes>

      {NOS.map((no, i) => {
        const t = progresso(frame, em + i * passo, 24, easeOutQuint);
        const ativo = destacado === no.chave;

        return (
          <Em key={no.chave} x={no.x} y={no.y} largura={LARGURA} zIndex={ativo ? 12 : 8}>
            <div
              role={interativo ? "button" : undefined}
              tabIndex={interativo ? 0 : undefined}
              aria-label={interativo ? `${no.titulo}: ${no.legenda}` : undefined}
              onMouseEnter={
                interativo && aoEntrar !== undefined
                  ? () => aoEntrar(no.chave, no.x + LARGURA / 2, no.y)
                  : undefined
              }
              onMouseLeave={interativo ? aoSair : undefined}
              onFocus={
                interativo && aoEntrar !== undefined
                  ? () => aoEntrar(no.chave, no.x + LARGURA / 2, no.y)
                  : undefined
              }
              onBlur={interativo ? aoSair : undefined}
              onClick={
                interativo && aoClicar !== undefined ? () => aoClicar(no.chave) : undefined
              }
              onKeyDown={
                interativo && aoClicar !== undefined
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        aoClicar(no.chave);
                      }
                    }
                  : undefined
              }
              style={{
                opacity: t,
                transform: `translate3d(0, ${(1 - t) * 16}px, 0) scale(${ativo ? 1.03 : 1})`,
                height: ALTURA,
                background: cor.branco,
                border: `1px solid ${ativo ? `${no.acento}77` : cor.borda}`,
                borderRadius: raio.enorme,
                boxShadow: ativo
                  ? `${sombra.alta}, 0 0 0 5px ${no.acento}18`
                  : "0 18px 44px -34px rgba(3,47,1,0.5)",
                overflow: "hidden",
                cursor: interativo ? "pointer" : "default",
                textAlign: "left",
              }}
            >
              <div style={{ height: 4, background: no.acento }} />
              <div style={{ padding: "22px 24px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 13, minHeight: 42 }}>
                  {no.marca !== undefined ? (
                    <Marca chave={no.marca} altura={no.marca === "jpSimbolo" ? 34 : 26} />
                  ) : (
                    <span
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 12,
                        background: `${no.acento}18`,
                        color: no.acento,
                        display: "grid",
                        placeItems: "center",
                        flex: "none",
                      }}
                    >
                      {no.icone}
                    </span>
                  )}
                  {no.marca !== "dentalOffice" && no.marca !== "whatsapp" && (
                    <span
                      style={{
                        fontFamily: fonte.display,
                        fontSize: tamanho.destaque,
                        fontWeight: 700,
                        color: cor.tinta,
                        letterSpacing: "-0.02em",
                      }}
                    >
                      {no.titulo}
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontFamily: fonte.texto,
                    fontSize: tamanho.legenda,
                    color: cor.tintaSuave,
                    marginTop: 14,
                    lineHeight: 1.45,
                  }}
                >
                  {no.legenda}
                </div>
              </div>
            </div>
          </Em>
        );
      })}
    </>
  );
}
