import { CalendarDays, ClipboardList, Clock, Stethoscope, Users } from "lucide-react";
import { NotaDeCena, SeloDeCena, TituloDeCena } from "@/components/CenaBase";
import { CamadaDeConexoes, Conexao } from "@/components/Conexao";
import { No } from "@/components/No";
import { DENTAL_OFFICE } from "@/data/conteudo";
import { Em, Palco } from "@/design-system/primitivas";
import { cor, fonte, raio, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { easeOutQuint, progresso } from "@/motion/timing";
import { curvaH } from "@/utils/caminho";

/**
 * CENA 03 — Dental Office.
 *
 * O primeiro nó real do diagrama. O que a cena precisa deixar claro é a relação:
 * o Dental Office continua sendo o sistema da clínica, e o JP CRC lê dele. Por
 * isso o card fica firme à esquerda e são os DADOS que viajam — não o sistema.
 *
 * Item 40: nada de recriar a interface do Dental Office. Só nome, cor de acento
 * e uma representação abstrata do que ele guarda.
 */

const ICONES = [Users, CalendarDays, Stethoscope, ClipboardList, Clock];

const CHIP_X = 780;
const CHIP_Y0 = 292;
const CHIP_PASSO = 92;
const CHIP_LARGURA = 330;
const CONVERGENCIA = { x: 1430, y: 476 };

export function Cena03DentalOffice() {
  const frame = useFrame();

  return (
    <Palco>
      <SeloDeCena />
      <TituloDeCena
        kicker="A fonte"
        titulo={DENTAL_OFFICE.titulo}
        em={2}
      />

      {/* Ligações ------------------------------------------------------- */}
      <CamadaDeConexoes zIndex={4}>
        {DENTAL_OFFICE.entidades.map((_, i) => {
          const y = CHIP_Y0 + i * CHIP_PASSO + 34;
          const doNo = curvaH(620, 476, CHIP_X - 10, y, 0.55);
          const paraFora = curvaH(CHIP_X + CHIP_LARGURA + 10, y, CONVERGENCIA.x, CONVERGENCIA.y, 0.55);
          return (
            <g key={i}>
              <Conexao
                caminho={doNo}
                em={40 + i * 5}
                dur={22}
                cor={`${cor.dentalOffice}55`}
                largura={1.8}
              />
              <Conexao
                caminho={paraFora}
                em={96 + i * 5}
                dur={24}
                cor={cor.bordaForte}
                largura={1.8}
                pulsos={2}
                corPulso={cor.dentalOffice}
                cicloPulso={78}
                raioPulso={4.5}
                semente={i + 3}
              />
            </g>
          );
        })}

        {/* O barramento que sai de quadro — a costura com a cena 4. */}
        <Conexao
          caminho={curvaH(CONVERGENCIA.x, CONVERGENCIA.y, 1900, CONVERGENCIA.y, 0.4)}
          em={150}
          dur={26}
          cor={cor.bordaForte}
          largura={2.6}
          pulsos={4}
          corPulso={cor.verde}
          cicloPulso={64}
          raioPulso={6}
          semente={11}
        />
      </CamadaDeConexoes>

      {/* O sistema ------------------------------------------------------ */}
      <Em x={180} y={352} zIndex={8}>
        <div
          style={{
            opacity: progresso(frame, 14, 26),
            transform: `translate3d(${(1 - progresso(frame, 14, 30, easeOutQuint)) * -24}px, 0, 0)`,
          }}
        >
          <No
            marca="dentalOffice"
            acento={cor.dentalOffice}
            largura={440}
            subtitulo="O sistema que a clínica já usa todo dia. Dele saem os pacientes, a agenda e os horários."
            rodape="O JP CRC só lê. Nada é apagado nem alterado lá."
            ativo
          />
        </div>
      </Em>

      {/* O que ele guarda ----------------------------------------------- */}
      {DENTAL_OFFICE.entidades.map((nome, i) => {
        const Icone = ICONES[i] ?? Users;
        const t = progresso(frame, 54 + i * 8, 22, easeOutQuint);
        return (
          <Em key={nome} x={CHIP_X} y={CHIP_Y0 + i * CHIP_PASSO} largura={CHIP_LARGURA} zIndex={8}>
            <div
              style={{
                opacity: t,
                transform: `translate3d(${(1 - t) * -18}px, 0, 0)`,
                background: cor.branco,
                border: `1px solid ${cor.borda}`,
                borderRadius: raio.medio + 4,
                padding: "16px 20px",
                display: "flex",
                alignItems: "center",
                gap: 14,
                boxShadow: "0 12px 28px -24px rgba(3,47,1,0.5)",
              }}
            >
              <span
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 11,
                  background: cor.dentalOfficeFraco,
                  color: cor.dentalOffice,
                  display: "grid",
                  placeItems: "center",
                  flex: "none",
                }}
              >
                <Icone size={19} strokeWidth={2.1} />
              </span>
              <span
                style={{
                  fontFamily: fonte.texto,
                  fontSize: tamanho.corpo,
                  fontWeight: 600,
                  color: cor.tinta,
                }}
              >
                {nome}
              </span>
            </div>
          </Em>
        );
      })}

      {/* O ponto de convergência: onde tudo vira um fluxo só ------------ */}
      <Em x={CONVERGENCIA.x} y={CONVERGENCIA.y} ancora="centro" zIndex={9}>
        <div
          style={{
            opacity: progresso(frame, 140, 22),
            width: 20,
            height: 20,
            borderRadius: 999,
            background: cor.verde,
            boxShadow: `0 0 0 10px ${cor.verde}1a`,
          }}
        />
      </Em>

      <Em x={CONVERGENCIA.x - 100} y={CONVERGENCIA.y + 34} largura={330} zIndex={9}>
        <div
          style={{
            opacity: progresso(frame, 158, 24),
            fontFamily: fonte.texto,
            fontSize: tamanho.legenda,
            color: cor.tintaSuave,
            textAlign: "center",
            letterSpacing: "0.02em",
          }}
        >
          Tudo isso vira um fluxo só
        </div>
      </Em>

      <NotaDeCena em={186}>{DENTAL_OFFICE.nota}</NotaDeCena>
    </Palco>
  );
}
