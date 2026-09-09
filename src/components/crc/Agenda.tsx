/**
 * A Agenda — a agenda vista pelo lado do relacionamento.
 *
 * POR QUE ESTA TELA EXISTE, se o Dental Office já tem uma agenda: porque a
 * pergunta é outra. Lá, a agenda responde "quem vem". Aqui ela responde "o que
 * a agenda está pedindo de nós": quem não confirmou, quem o CRC marcou sozinho,
 * quem tem horário e mesmo assim continua na fila de alguém.
 *
 * TRÊS DECISÕES QUE MUDAM O USO DIÁRIO:
 *
 *   O NÚMERO DO TOPO É "A CONFIRMAR", e não "total de consultas". O total é
 *   informação; o que não foi confirmado é trabalho — e é o único número aqui
 *   sobre o qual alguém age antes do almoço.
 *
 *   HOJE E AMANHÃ TÊM NOME. "hoje", "amanhã" e depois a data: quem olha a
 *   agenda às 8h não deveria precisar conferir o calendário para saber se a
 *   primeira coluna é o dia de hoje.
 *
 *   DIA SEM CONSULTA NÃO APARECE. Uma grade com sábados vazios e feriados em
 *   branco gasta metade da tela dizendo que não há nada — e empurra para baixo
 *   justamente o que importa.
 *
 * A TELA É DE LEITURA. Marcar e desmarcar acontece na conversa (onde o paciente
 * está) ou no Dental Office (onde a recepção já trabalha). Uma terceira porta
 * para editar agenda seria uma terceira chance de as duas discordarem.
 */
import { useCallback, useEffect, useState } from "react";

import { carregarAgenda, type DiaDaAgenda, type ItemDaAgenda } from "@/lib/crc/api";
import { hora } from "@/lib/crc/dominio/formatar";
import { ROTULO_STATUS_AGENDA } from "@/lib/crc/dominio/rotulos";
import { telefoneParaTela } from "@/lib/crc/dominio/telefone";
import type { StatusAgendamento } from "@/lib/crc/dominio/tipos";

import { Aviso, Botao, Etiqueta, Kpi, ListaEsqueleto, Vazio, type TomEtiqueta } from "./base";
import "./crc-screens.css";

/**
 * O tom de cada status.
 *
 * `TO_CONFIRM` é ALERTA e não neutro: ele é a única linha da agenda que pede
 * ação de alguém. `MISSED` é perigo porque falta é dinheiro que já saiu da
 * cadeira. O resto é neutro de propósito — a tela não pode gritar em cinco
 * cores ao mesmo tempo, senão nenhuma delas é vista.
 */
const TOM: Readonly<Record<StatusAgendamento, TomEtiqueta>> = {
  TO_CONFIRM: "alerta",
  CONFIRMED: "positiva",
  IN_PROGRESS: "info",
  COMPLETED: "neutra",
  MISSED: "perigo",
  CANCELLED: "neutra",
};

/** "AAAA-MM-DD" → "hoje" / "amanhã" / "qui, 11 set". */
function nomeDoDia(dia: string, hoje: string, amanha: string): string {
  if (dia === hoje) return "hoje";
  if (dia === amanha) return "amanhã";

  // `T12:00` no meio do dia: construir a partir da meia-noite faz o fuso
  // negativo puxar a data para o dia anterior na formatação.
  const d = new Date(`${dia}T12:00:00`);
  return d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
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
      const r = await carregarAgenda({
        data: { de: diaIso(0), ate: diaIso(janelaDias) },
      });
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

  if (erro !== null && dias === null) {
    return <Aviso tom="perigo">{erro}</Aviso>;
  }

  const hoje = diaIso(0);
  const amanha = diaIso(1);
  const total = dias?.reduce((n, d) => n + d.itens.length, 0) ?? 0;

  return (
    <div className="crc-pilha">
      <div className="crc-grade">
        <Kpi
          rotulo="A confirmar"
          valor={String(aConfirmar)}
          nota="pacientes que ainda não responderam"
        />
        <Kpi
          rotulo="Consultas na janela"
          valor={String(total)}
          nota={`próximos ${String(janelaDias)} dias`}
        />
        <Kpi
          rotulo="Dias com atendimento"
          valor={String(dias?.length ?? 0)}
          nota="dias vazios não são listados"
        />
      </div>

      <div className="crc-linha">
        {[7, 14, 30].map((n) => (
          <Botao
            key={n}
            pequeno
            variante={janelaDias === n ? "primario" : "discreto"}
            onClick={() => {
              setJanelaDias(n);
            }}
          >
            {n} dias
          </Botao>
        ))}
      </div>

      {dias === null ? (
        <ListaEsqueleto linhas={5} />
      ) : dias.length === 0 ? (
        <Vazio
          titulo="Nenhuma consulta na janela"
          explicacao={
            "Ou a agenda está mesmo vazia, ou o Dental Office ainda não foi sincronizado. " +
            "A tela de Integrações diz qual dos dois."
          }
        />
      ) : (
        dias.map((d) => (
          <section key={d.dia} className="crc-cartao">
            <header
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                marginBottom: "var(--crc-e3)",
              }}
            >
              <h2 style={{ fontSize: "1rem", margin: 0, textTransform: "capitalize" }}>
                {nomeDoDia(d.dia, hoje, amanha)}
              </h2>
              <span className="crc-meta">
                {d.itens.length} {d.itens.length === 1 ? "consulta" : "consultas"}
              </span>
            </header>

            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {d.itens.map((item) => (
                <LinhaDaAgenda key={item.id} item={item} aoAbrirPaciente={aoAbrirPaciente} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function LinhaDaAgenda({
  item,
  aoAbrirPaciente,
}: {
  item: ItemDaAgenda;
  aoAbrirPaciente: (patientId: string) => void;
}) {
  const conteudo = (
    <>
      <span className="crc-numero" style={{ minWidth: "3.5rem", fontWeight: 600 }}>
        {hora(item.inicioEm)}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ fontSize: "0.9375rem" }}>{item.pacienteNome}</strong>
        <span className="crc-meta" style={{ display: "block" }}>
          {[
            item.dentistaNome,
            item.pacienteTelefone === null ? null : telefoneParaTela(item.pacienteTelefone),
            // Só marca o que o CRC fez. "Marcado pela recepção" é o caso
            // comum, e etiquetar o comum enche a tela de ruído.
            item.peloCrc ? "marcado pelo CRC" : null,
          ]
            .filter((v) => v !== null)
            .join(" · ")}
        </span>
      </span>
      <Etiqueta tom={TOM[item.status]}>{ROTULO_STATUS_AGENDA[item.status]}</Etiqueta>
    </>
  );

  // Sem paciente vinculado não há ficha para abrir: a linha vira texto, e não
  // um botão que não faz nada.
  if (item.patientId === null) {
    return (
      <li
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--crc-e3)",
          padding: "var(--crc-e2) var(--crc-e3)",
        }}
      >
        {conteudo}
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        className="crc-conversa-item"
        style={{ display: "flex", alignItems: "center", gap: "var(--crc-e3)", width: "100%" }}
        onClick={() => {
          aoAbrirPaciente(item.patientId as string);
        }}
      >
        {conteudo}
      </button>
    </li>
  );
}
