/**
 * Busca de pacientes e a Central do Paciente — item 16 do Mega Prompt.
 *
 * "Ao abrir paciente, não criar uma página gigante. Criar workspace organizado.
 * Usar accordions ou tabs. Nunca poluir a tela inteira."
 *
 * A ficha aqui é uma coluna de blocos, e não uma parede de campos. O cabeçalho
 * responde as quatro perguntas do item 44 antes de qualquer detalhe: quem é,
 * como está, quando veio, quando volta. Só depois vêm oportunidades, tarefas e
 * a linha do tempo.
 *
 * A LINHA DO TEMPO (item 24) É O CENTRO. Ela junta consulta, mensagem, tarefa,
 * oportunidade e automação em ordem cronológica — que é como a pessoa lembra
 * do paciente ("ela faltou, aí mandamos mensagem, aí ela respondeu"), e não
 * separado por tipo de registro.
 *
 * A BUSCA É POR NOME OU TELEFONE, com debounce. Sem o debounce, cada tecla
 * digitada vira uma consulta ao banco — e o item 88 pede busca rápida, o que
 * inclui não estrangular o próprio servidor.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import {
  buscarPacientes,
  carregarFichaPaciente,
  concluirTarefa,
  type FichaPaciente,
} from "@/lib/crc/api";
import type { Paciente } from "@/lib/crc/dominio/tipos";
import { data, dataHora, dinheiro, tempoRelativo } from "@/lib/crc/dominio/formatar";
import {
  ROTULO_SITUACAO,
  ROTULO_STATUS_JORNADA,
  ROTULO_TIPO_OPORTUNIDADE,
  ROTULO_TIPO_TAREFA,
} from "@/lib/crc/dominio/rotulos";
import { telefoneParaTela } from "@/lib/crc/dominio/telefone";

import {
  Aviso,
  BarraDeRecado,
  Botao,
  Cartao,
  Entrada,
  Etiqueta,
  ListaEsqueleto,
  Vazio,
  useAcao,
} from "./base";

/* -------------------------------------------------------------------------- */
/* Busca                                                                      */
/* -------------------------------------------------------------------------- */

export function BuscaPacientes({
  aoAbrirPaciente,
}: {
  aoAbrirPaciente: (patientId: string) => void;
}) {
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<Paciente[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (relogio.current !== null) clearTimeout(relogio.current);

    const limpo = termo.trim();
    if (limpo.length < 2) {
      setResultados(null);
      setBuscando(false);
      return;
    }

    // 280ms: rápido o bastante para parecer instantâneo, longo o bastante para
    // não disparar uma consulta por tecla.
    setBuscando(true);
    relogio.current = setTimeout(() => {
      void (async () => {
        try {
          const r = await buscarPacientes({ data: { termo: limpo } });
          if (r.ok) {
            setResultados(r.itens);
            setErro(null);
          } else {
            setErro(r.message);
          }
        } catch {
          setErro("Não conseguimos buscar agora. Tente de novo.");
        } finally {
          setBuscando(false);
        }
      })();
    }, 280);

    return () => {
      if (relogio.current !== null) clearTimeout(relogio.current);
    };
  }, [termo]);

  return (
    <>
      <div style={{ maxWidth: 520, marginBottom: "var(--crc-e5)" }}>
        <label className="crc-so-leitor" htmlFor="crc-busca-paciente">
          Buscar paciente por nome ou telefone
        </label>
        <Entrada
          id="crc-busca-paciente"
          type="search"
          placeholder="Nome ou telefone do paciente…"
          value={termo}
          autoComplete="off"
          onChange={(e) => {
            setTermo(e.target.value);
          }}
        />
      </div>

      {erro !== null && <Aviso tom="perigo">{erro}</Aviso>}

      {termo.trim().length < 2 ? (
        <Vazio
          titulo="Procure por um paciente"
          explicacao="Digite pelo menos duas letras do nome, ou o telefone com DDD. A busca considera as duas formas de escrever o celular, com e sem o nono dígito."
        />
      ) : buscando && resultados === null ? (
        <ListaEsqueleto linhas={3} />
      ) : resultados !== null && resultados.length === 0 ? (
        <Vazio
          titulo="Nenhum paciente com esse nome ou telefone."
          explicacao="Confira a grafia. Se o paciente foi cadastrado agora no Dental Office, ele aparece aqui depois da próxima sincronização."
        />
      ) : (
        <div className="crc-tabela-caixa">
          <table className="crc-tabela">
            <thead>
              <tr>
                <th scope="col">Paciente</th>
                <th scope="col">Situação</th>
                <th scope="col">Telefone</th>
                <th scope="col">Última consulta</th>
                <th scope="col">Próxima</th>
                <th scope="col">
                  <span className="crc-so-leitor">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {(resultados ?? []).map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.nome}</strong>
                    {p.optOutEm !== null && (
                      <>
                        {" "}
                        <Etiqueta tom="perigo">Não quer mensagens</Etiqueta>
                      </>
                    )}
                  </td>
                  <td className="crc-meta">{ROTULO_SITUACAO[p.situacao]}</td>
                  <td className="crc-meta">
                    {p.telefone === null ? "—" : telefoneParaTela(p.telefone)}
                  </td>
                  <td className="crc-meta">{data(p.ultimaConsultaEm)}</td>
                  <td className="crc-meta">
                    {p.proximaConsultaEm === null ? "Nenhuma" : data(p.proximaConsultaEm)}
                  </td>
                  <td>
                    <Botao
                      pequeno
                      onClick={() => {
                        aoAbrirPaciente(p.id);
                      }}
                    >
                      Abrir
                    </Botao>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Central do paciente                                                        */
/* -------------------------------------------------------------------------- */

export function CentralDoPaciente({
  patientId,
  aoVoltar,
}: {
  patientId: string;
  aoVoltar: () => void;
}) {
  const [ficha, setFicha] = useState<FichaPaciente | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const acao = useAcao();

  const recarregar = useCallback(async (): Promise<void> => {
    try {
      const r = await carregarFichaPaciente({ data: { patientId } });
      if (r.ok) {
        setFicha(r.ficha);
        setErro(null);
      } else {
        setErro(r.message);
      }
    } catch {
      setErro("Não conseguimos carregar esta ficha.");
    }
  }, [patientId]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const concluir = useCallback(
    async (taskId: string): Promise<void> => {
      await acao.executar(
        () => concluirTarefa({ data: { taskId } }),
        () => {
          void recarregar();
        },
        "Tarefa concluída.",
      );
    },
    [acao, recarregar],
  );

  if (erro !== null) {
    return (
      <>
        <Botao onClick={aoVoltar}>← Voltar</Botao>
        <div style={{ marginTop: "var(--crc-e4)" }}>
          <Aviso tom="perigo">{erro}</Aviso>
        </div>
      </>
    );
  }

  if (ficha === null) return <ListaEsqueleto linhas={4} />;

  const p = ficha.paciente;
  const tarefasAbertas = ficha.tarefas.filter(
    (t) => t.status !== "COMPLETED" && t.status !== "CANCELLED",
  );
  const oportunidadesAbertas = ficha.oportunidades.filter((o) => o.fechadaEm === null);
  const jornadaAtiva = ficha.jornadas.find((j) => j.status === "ACTIVE" || j.status === "WAITING");

  return (
    <>
      <Botao onClick={aoVoltar}>← Voltar</Botao>

      <BarraDeRecado recado={acao.recado} aoFechar={acao.limpar} />

      {/* ---- Cabeçalho: quem é, como está, quando veio, quando volta ---- */}
      <header style={{ margin: "var(--crc-e4) 0 var(--crc-e6)" }}>
        <div className="crc-linha" style={{ gap: "var(--crc-e3)" }}>
          <h1 className="crc-titulo-pagina">{p.nome}</h1>
          <Etiqueta tom={p.ativo && !p.arquivado ? "positiva" : "neutra"}>
            {p.arquivado ? "Arquivado" : p.ativo ? "Ativo" : "Inativo"}
          </Etiqueta>
          <Etiqueta>{ROTULO_SITUACAO[p.situacao]}</Etiqueta>
          {p.especialidade !== null && <Etiqueta tom="info">{p.especialidade}</Etiqueta>}
        </div>

        {/*
          O opt-out aparece no TOPO, em vermelho, e não escondido nos dados
          cadastrais. É a informação que muda o que o atendente pode fazer.
        */}
        {p.optOutEm !== null && (
          <div style={{ marginTop: "var(--crc-e3)" }}>
            <Aviso tom="perigo">
              Este paciente pediu para não receber mensagens em {data(p.optOutEm)}. Nenhuma
              automação fala com ele, e mensagens promocionais estão bloqueadas.
            </Aviso>
          </div>
        )}

        <div className="crc-linha" style={{ marginTop: "var(--crc-e3)", gap: "var(--crc-e6)" }}>
          <Dado
            rotulo="Telefone"
            valor={p.telefone === null ? "—" : telefoneParaTela(p.telefone)}
          />
          <Dado rotulo="Última consulta" valor={data(p.ultimaConsultaEm)} />
          <Dado
            rotulo="Próxima consulta"
            valor={p.proximaConsultaEm === null ? "Nenhuma marcada" : dataHora(p.proximaConsultaEm)}
          />
          {p.nascimento !== null && <Dado rotulo="Nascimento" valor={data(p.nascimento)} />}
        </div>
      </header>

      <div className="crc-pilha">
        {/* ---- O que o sistema está fazendo sozinho (item 44) ----------- */}
        {jornadaAtiva !== undefined && (
          <Aviso tom="info">
            Uma automação está cuidando deste paciente agora (
            {ROTULO_STATUS_JORNADA[jornadaAtiva.status]}
            {jornadaAtiva.resumeAt !== null
              ? `, próximo passo ${tempoRelativo(jornadaAtiva.resumeAt)}`
              : ""}
            ). Se você entrar em contato, ela para sozinha.
          </Aviso>
        )}

        {/* ---- Oportunidades -------------------------------------------- */}
        <Cartao titulo="Oportunidades abertas">
          {oportunidadesAbertas.length === 0 ? (
            <p className="crc-corpo">
              Nenhuma oportunidade aberta. Este paciente não está pendente de nada agora.
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {oportunidadesAbertas.map((o, i) => (
                <li key={o.id}>
                  {i > 0 && <hr className="crc-separador" />}
                  <div className="crc-linha" style={{ gap: "var(--crc-e2)" }}>
                    <strong style={{ fontSize: "0.9375rem" }}>
                      {ROTULO_TIPO_OPORTUNIDADE[o.tipo]}
                    </strong>
                    <Etiqueta tom={o.priorityScore >= 65 ? "perigo" : "neutra"}>
                      {o.priorityScore}/100
                    </Etiqueta>
                    {o.potentialValue !== null && (
                      <span className="crc-meta crc-empurra crc-numero">
                        {dinheiro(o.potentialValue)}
                      </span>
                    )}
                  </div>
                  {o.motivo !== null && <p className="crc-meta">{o.motivo}</p>}
                  {o.nextAction !== null && (
                    <p className="crc-meta">Próxima ação: {o.nextAction}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Cartao>

        {/* ---- Tarefas --------------------------------------------------- */}
        <Cartao titulo="Tarefas">
          {tarefasAbertas.length === 0 ? (
            <p className="crc-corpo">Nenhuma tarefa aberta para este paciente.</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {tarefasAbertas.map((t, i) => (
                <li key={t.id}>
                  {i > 0 && <hr className="crc-separador" />}
                  <div
                    className="crc-linha"
                    style={{ gap: "var(--crc-e3)", alignItems: "flex-start" }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="crc-linha" style={{ gap: "var(--crc-e2)" }}>
                        <strong style={{ fontSize: "0.9375rem" }}>{t.titulo}</strong>
                        <Etiqueta>{ROTULO_TIPO_TAREFA[t.tipo]}</Etiqueta>
                      </div>
                      {t.dueAt !== null && (
                        <p className="crc-meta">Prazo {tempoRelativo(t.dueAt)}</p>
                      )}
                      {t.motivo !== null && <p className="crc-meta">{t.motivo}</p>}
                    </div>

                    <Botao
                      pequeno
                      carregando={acao.rodando}
                      onClick={() => {
                        void concluir(t.id);
                      }}
                    >
                      Concluir
                    </Botao>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Cartao>

        {/* ---- Linha do tempo (item 24) ---------------------------------- */}
        <Cartao titulo="Linha do tempo">
          {ficha.timeline.length === 0 ? (
            <p className="crc-corpo">Ainda não há histórico registrado para este paciente.</p>
          ) : (
            <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {ficha.timeline.slice(0, 40).map((item, i) => (
                <li
                  key={`${item.em}-${String(i)}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto minmax(0, 1fr)",
                    gap: "var(--crc-e3)",
                    paddingBottom: "var(--crc-e4)",
                  }}
                >
                  {/* A coluna do marcador, com a linha vertical ligando os itens. */}
                  <div style={{ display: "grid", justifyItems: "center", gap: 2 }}>
                    <span
                      aria-hidden="true"
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: "var(--crc-borda-forte)",
                        marginTop: 6,
                      }}
                    />
                    {i < Math.min(ficha.timeline.length, 40) - 1 && (
                      <span
                        aria-hidden="true"
                        style={{ width: 1, flex: 1, background: "var(--crc-borda)", minHeight: 20 }}
                      />
                    )}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div className="crc-linha" style={{ gap: "var(--crc-e2)" }}>
                      <strong style={{ fontSize: "0.9375rem" }}>{item.titulo}</strong>
                      <span className="crc-meta">{dataHora(item.em)}</span>
                    </div>
                    {item.detalhe.length > 0 && <p className="crc-meta">{item.detalhe}</p>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Cartao>
      </div>
    </>
  );
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <span className="crc-kpi-rotulo">{rotulo}</span>
      <div style={{ fontSize: "0.9375rem", fontWeight: 500 }}>{valor}</div>
    </div>
  );
}
