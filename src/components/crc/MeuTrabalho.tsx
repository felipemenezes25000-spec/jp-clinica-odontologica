/**
 * "Meu trabalho" — item 183, e o objetivo do item 184 (zero inbox).
 *
 * A fila pessoal: o que ESTÁ na sua mão, ordenado por prazo. É a tela que
 * responde "o que eu faço agora?" sem a pessoa precisar decidir entre Inbox,
 * Funil e Pacientes.
 *
 * DUAS LISTAS, E A SEGUNDA É A QUE IMPORTA MAIS DO QUE PARECE: tarefas sem
 * responsável. O item 187 pede o detector de registro órfão, e uma tarefa que
 * a automação criou sem dono não pode ficar invisível — ela apareceria em
 * nenhuma fila e o paciente seria esquecido pelo caminho mais silencioso
 * possível.
 */
import { useCallback, useEffect, useState } from "react";

import { assumirTarefa, carregarMeuTrabalho, concluirTarefa } from "@/lib/crc/api";
import type { Tarefa } from "@/lib/crc/dominio/tipos";
import { tempoRelativo } from "@/lib/crc/dominio/formatar";
import { ROTULO_TIPO_TAREFA } from "@/lib/crc/dominio/rotulos";

import {
  Aviso,
  BarraDeRecado,
  Botao,
  Cartao,
  Etiqueta,
  ListaEsqueleto,
  Vazio,
  useAcao,
} from "./base";

export function MeuTrabalho({
  usuarioId,
  aoAbrirPaciente,
}: {
  usuarioId: string;
  aoAbrirPaciente: (patientId: string) => void;
}) {
  const [tarefas, setTarefas] = useState<Tarefa[] | null>(null);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const acao = useAcao();

  const recarregar = useCallback(async (): Promise<void> => {
    try {
      const r = await carregarMeuTrabalho();
      if (r.ok) {
        setTarefas(r.tarefas);
        setNomes(r.nomes);
        setErro(null);
      } else {
        setErro(r.message);
      }
    } catch {
      setErro("Não conseguimos carregar suas tarefas. Tente atualizar a página.");
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const concluir = useCallback(
    async (taskId: string): Promise<void> => {
      await acao.executar(
        () => concluirTarefa({ data: { taskId } }),
        () => {
          setTarefas((atuais) => (atuais === null ? null : atuais.filter((t) => t.id !== taskId)));
        },
        "Tarefa concluída.",
      );
    },
    [acao],
  );

  const assumir = useCallback(
    async (taskId: string): Promise<void> => {
      await acao.executar(
        () => assumirTarefa({ data: { taskId } }),
        () => {
          setTarefas((atuais) =>
            atuais === null
              ? null
              : atuais.map((t) => (t.id === taskId ? { ...t, assignedTo: usuarioId } : t)),
          );
        },
        "Tarefa atribuída a você.",
      );
    },
    [acao, usuarioId],
  );

  if (erro !== null && tarefas === null) return <Aviso tom="perigo">{erro}</Aviso>;
  if (tarefas === null) return <ListaEsqueleto linhas={4} />;

  const minhas = tarefas.filter((t) => t.assignedTo === usuarioId);
  const semDono = tarefas.filter((t) => t.assignedTo === null);

  return (
    <>
      <BarraDeRecado recado={acao.recado} aoFechar={acao.limpar} />

      <div className="crc-pilha">
        <Cartao titulo={`Suas tarefas (${String(minhas.length)})`}>
          {minhas.length === 0 ? (
            /* Item 184: o "zero inbox" merece ser reconhecido, não um vazio seco. */
            <Vazio
              titulo="Você está em dia."
              explicacao="Nenhuma tarefa esperando você. Quando uma automação precisar de ajuda humana, ela aparece aqui."
            />
          ) : (
            <ListaTarefas
              tarefas={minhas}
              nomes={nomes}
              rodando={acao.rodando}
              aoConcluir={concluir}
              aoAbrirPaciente={aoAbrirPaciente}
            />
          )}
        </Cartao>

        {semDono.length > 0 && (
          <Cartao titulo={`Sem responsável (${String(semDono.length)})`}>
            <p className="crc-corpo" style={{ marginBottom: "var(--crc-e4)" }}>
              Estas tarefas foram criadas pelas automações e ainda não têm dono. Assuma o que puder
              fazer — enquanto ninguém assume, ninguém está cuidando destes pacientes.
            </p>
            <ListaTarefas
              tarefas={semDono}
              nomes={nomes}
              rodando={acao.rodando}
              aoConcluir={concluir}
              aoAssumir={assumir}
              aoAbrirPaciente={aoAbrirPaciente}
            />
          </Cartao>
        )}
      </div>
    </>
  );
}

function ListaTarefas({
  tarefas,
  nomes,
  rodando,
  aoConcluir,
  aoAssumir,
  aoAbrirPaciente,
}: {
  tarefas: Tarefa[];
  nomes: Record<string, string>;
  rodando: boolean;
  aoConcluir: (taskId: string) => Promise<void>;
  aoAssumir?: (taskId: string) => Promise<void>;
  aoAbrirPaciente: (patientId: string) => void;
}) {
  const agora = Date.now();

  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {tarefas.map((t, i) => {
        const vencida =
          t.dueAt !== null && Number.isFinite(Date.parse(t.dueAt)) && Date.parse(t.dueAt) < agora;

        return (
          <li key={t.id}>
            {i > 0 && <hr className="crc-separador" />}
            <div className="crc-linha" style={{ gap: "var(--crc-e3)", alignItems: "flex-start" }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="crc-linha" style={{ gap: "var(--crc-e2)" }}>
                  <strong style={{ fontSize: "0.9375rem" }}>{t.titulo}</strong>
                  <Etiqueta>{ROTULO_TIPO_TAREFA[t.tipo]}</Etiqueta>
                  {/* Atrasada é texto, não só cor vermelha (item 65). */}
                  {vencida && <Etiqueta tom="perigo">Atrasada</Etiqueta>}
                </div>

                {t.patientId !== null && (
                  <p className="crc-meta">{nomes[t.patientId] ?? "Paciente"}</p>
                )}
                {t.motivo !== null && <p className="crc-meta">{t.motivo}</p>}
                {t.dueAt !== null && <p className="crc-meta">Prazo {tempoRelativo(t.dueAt)}</p>}
              </div>

              <div className="crc-linha" style={{ gap: "var(--crc-e2)", flexShrink: 0 }}>
                {t.patientId !== null && (
                  <Botao
                    pequeno
                    variante="discreto"
                    onClick={() => {
                      if (t.patientId !== null) aoAbrirPaciente(t.patientId);
                    }}
                  >
                    Ver paciente
                  </Botao>
                )}

                {aoAssumir !== undefined && (
                  <Botao
                    pequeno
                    carregando={rodando}
                    onClick={() => {
                      void aoAssumir(t.id);
                    }}
                  >
                    Assumir
                  </Botao>
                )}

                <Botao
                  pequeno
                  variante="primario"
                  carregando={rodando}
                  onClick={() => {
                    void aoConcluir(t.id);
                  }}
                >
                  Concluir
                </Botao>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
