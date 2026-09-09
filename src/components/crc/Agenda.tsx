import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  Clock3,
} from "lucide-react";

import { carregarAgenda, type DiaDaAgenda, type ItemDaAgenda } from "@/lib/crc/api";
import { hora } from "@/lib/crc/dominio/formatar";
import { ROTULO_STATUS_AGENDA } from "@/lib/crc/dominio/rotulos";
import { telefoneParaTela } from "@/lib/crc/dominio/telefone";
import type { StatusAgendamento } from "@/lib/crc/dominio/tipos";

import { Aviso, Botao, Etiqueta, ListaEsqueleto, Vazio, type TomEtiqueta } from "./base";
import "./crc-screens.css";
import "./crc-polish.css";
import "./crc-qa.css";
import "./crc-agenda.css";

const TOM: Readonly<Record<StatusAgendamento, TomEtiqueta>> = {
  TO_CONFIRM: "alerta",
  CONFIRMED: "positiva",
  IN_PROGRESS: "info",
  COMPLETED: "neutra",
  MISSED: "perigo",
  CANCELLED: "neutra",
};

function nomeDoDia(dia: string, hoje: string, amanha: string): string {
  if (dia === hoje) return "Hoje";
  if (dia === amanha) return "Amanhã";
  const d = new Date(`${dia}T12:00:00`);
  const texto = d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function diaIso(deslocamento: number): string {
  const d = new Date();
  d.setDate(d.getDate() + deslocamento);
  return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function Agenda({ aoAbrirPaciente }: { aoAbrirPaciente: (patientId: string) => void }) {
  const [dias, setDias] = useState<DiaDaAgenda[] | null>(null);
  const [aConfirmar, setAConfirmar] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [janelaDias, setJanelaDias] = useState(14);

  const recarregar = useCallback(async (): Promise<void> => {
    try {
      const r = await carregarAgenda({ data: { de: diaIso(0), ate: diaIso(janelaDias) } });
      if (r.ok) {
        setDias(r.panorama.dias);
        setAConfirmar(r.panorama.aConfirmar);
        setErro(null);
      } else {
        setErro(r.message);
      }
    } catch {
      setErro("Não conseguimos carregar a agenda. Tente atualizar a página.");
    }
  }, [janelaDias]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  if (erro !== null && dias === null) return <Aviso tom="perigo">{erro}</Aviso>;

  const hoje = diaIso(0);
  const amanha = diaIso(1);
  const total = dias?.reduce((n, d) => n + d.itens.length, 0) ?? 0;
  const confirmadas = dias?.reduce(
    (n, d) => n + d.itens.filter((item) => item.status === "CONFIRMED").length,
    0,
  ) ?? 0;
  const peloCrc = dias?.reduce((n, d) => n + d.itens.filter((item) => item.peloCrc).length, 0) ?? 0;

  return (
    <div className="crc-agenda-v2">
      <section className="crc-agenda-resumo-v2">
        <ResumoAgenda
          icone={AlertTriangle}
          rotulo="A confirmar"
          valor={aConfirmar}
          nota="Pacientes aguardando confirmação"
          tom={aConfirmar > 0 ? "alerta" : "positivo"}
          destaque
        />
        <ResumoAgenda
          icone={CalendarDays}
          rotulo="Consultas"
          valor={total}
          nota={`Próximos ${String(janelaDias)} dias`}
        />
        <ResumoAgenda
          icone={CalendarCheck2}
          rotulo="Confirmadas"
          valor={confirmadas}
          nota="Já responderam"
          tom="positivo"
        />
        <ResumoAgenda
          icone={Bot}
          rotulo="Marcadas pelo CRC"
          valor={peloCrc}
          nota="Originadas pelo relacionamento"
          tom="info"
        />
      </section>

      <section className="crc-agenda-toolbar-v2">
        <div className="crc-agenda-toolbar-copy">
          <span><CalendarClock aria-hidden="true" /></span>
          <div>
            <div className="crc-sobretitulo">Janela de leitura</div>
            <strong>Mostrando somente dias com consulta</strong>
          </div>
        </div>
        <div className="crc-agenda-periodos-v2" role="group" aria-label="Período da agenda">
          {[7, 14, 30].map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={janelaDias === n}
              onClick={() => setJanelaDias(n)}
            >
              {n} dias
            </button>
          ))}
        </div>
      </section>

      {dias === null ? (
        <ListaEsqueleto linhas={5} />
      ) : dias.length === 0 ? (
        <div className="crc-agenda-vazio-v2">
          <Vazio
            titulo="Nenhuma consulta na janela"
            explicacao="Ou a agenda está mesmo vazia, ou o Dental Office ainda não foi sincronizado. A tela de Integrações diz qual dos dois."
          />
        </div>
      ) : (
        <div className="crc-agenda-dias-v2">
          {dias.map((d) => {
            const pendentes = d.itens.filter((item) => item.status === "TO_CONFIRM").length;
            return (
              <section key={d.dia} className="crc-agenda-dia-v2" data-hoje={d.dia === hoje ? "sim" : "nao"}>
                <header className="crc-agenda-dia-topo-v2">
                  <div>
                    <span className="crc-agenda-dia-data-v2">{nomeDoDia(d.dia, hoje, amanha)}</span>
                    <small>{d.itens.length} {d.itens.length === 1 ? "consulta" : "consultas"}</small>
                  </div>
                  <div className="crc-agenda-dia-status-v2">
                    {pendentes > 0 && <span>{pendentes} a confirmar</span>}
                    {d.dia === hoje && <strong>Hoje</strong>}
                  </div>
                </header>

                <ul className="crc-agenda-lista-v2">
                  {d.itens.map((item) => (
                    <LinhaDaAgenda key={item.id} item={item} aoAbrirPaciente={aoAbrirPaciente} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ResumoAgenda({
  icone: Icone,
  rotulo,
  valor,
  nota,
  tom = "neutro",
  destaque = false,
}: {
  icone: typeof CalendarDays;
  rotulo: string;
  valor: number;
  nota: string;
  tom?: "neutro" | "alerta" | "positivo" | "info";
  destaque?: boolean;
}) {
  return (
    <article className={`crc-agenda-resumo-card-v2${destaque ? " crc-agenda-resumo-destaque-v2" : ""}`} data-tom={tom}>
      <span><Icone aria-hidden="true" /></span>
      <div>
        <small>{rotulo}</small>
        <strong>{valor}</strong>
        <em>{nota}</em>
      </div>
    </article>
  );
}

function LinhaDaAgenda({
  item,
  aoAbrirPaciente,
}: {
  item: ItemDaAgenda;
  aoAbrirPaciente: (patientId: string) => void;
}) {
  const corpo = (
    <>
      <div className="crc-agenda-hora-v2">
        <Clock3 aria-hidden="true" />
        <strong>{hora(item.inicioEm)}</strong>
      </div>

      <div className="crc-agenda-paciente-v2">
        <strong>{item.pacienteNome}</strong>
        <span>
          {[item.dentistaNome, item.pacienteTelefone === null ? null : telefoneParaTela(item.pacienteTelefone)]
            .filter((v) => v !== null)
            .join(" · ")}
        </span>
        {item.peloCrc && <small><Bot aria-hidden="true" /> Marcado pelo CRC</small>}
      </div>

      <div className="crc-agenda-status-v2">
        <Etiqueta tom={TOM[item.status]}>{ROTULO_STATUS_AGENDA[item.status]}</Etiqueta>
        {item.patientId !== null && <ArrowUpRight aria-hidden="true" />}
      </div>
    </>
  );

  if (item.patientId === null) return <li className="crc-agenda-item-v2">{corpo}</li>;

  return (
    <li>
      <button
        type="button"
        className="crc-agenda-item-v2 crc-agenda-item-botao-v2"
        onClick={() => aoAbrirPaciente(item.patientId as string)}
      >
        {corpo}
      </button>
    </li>
  );
}
