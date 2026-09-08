/**
 * Criar tarefa à mão — item 149 (o atalho `c`) sobre uma função que já
 * existia no servidor e não tinha porta.
 *
 * POR QUE A TAREFA MANUAL IMPORTA NUM SISTEMA DE AUTOMAÇÃO
 * Porque a automação cobre o previsível e a operação vive do resto. "A mãe da
 * paciente ligou pedindo para remarcar quinta" não é gatilho de nada — é uma
 * coisa que alguém precisa lembrar de fazer. Sem esta tela, esse lembrete
 * volta para o papel na recepção, e o sistema perde justamente o que ele
 * existe para não deixar cair.
 *
 * A TAREFA EXIGE UM PACIENTE, e isso é decisão, não limitação. Uma tarefa solta
 * ("ligar para alguém") não entra na ficha de ninguém, não aparece na timeline
 * e não vira histórico — ela seria um post-it dentro do sistema. Amarrar ao
 * paciente é o que faz a tarefa contar depois.
 *
 * A BUSCA TEM DEBOUNCE de 220ms pelo mesmo motivo da paleta: cada tecla vira
 * consulta ao banco, e o intervalo é imperceptível para quem digita.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { buscarPacientes, criarTarefaManual } from "@/lib/crc/api";
import { ROTULO_SITUACAO, ROTULO_TIPO_TAREFA } from "@/lib/crc/dominio/rotulos";
import { telefoneParaTela } from "@/lib/crc/dominio/telefone";
import { TIPOS_TAREFA, type Paciente, type TipoTarefa } from "@/lib/crc/dominio/tipos";

import { Botao, Campo, Entrada, Modal } from "./base";

/** Os prazos que a recepção realmente usa. Um campo de data seria mais preciso
 *  e mais lento — e "amanhã" é o prazo de nove em cada dez tarefas. */
const PRAZOS: { horas: number; rotulo: string }[] = [
  { horas: 2, rotulo: "Daqui a 2 horas" },
  { horas: 24, rotulo: "Amanhã" },
  { horas: 72, rotulo: "Em 3 dias" },
  { horas: 168, rotulo: "Em 1 semana" },
];

export function NovaTarefa({
  aberto,
  aoFechar,
  aoCriar,
  pacienteFixo,
}: {
  aberto: boolean;
  aoFechar: () => void;
  aoCriar: (mensagem: string) => void;
  /** Quando a tarefa nasce de dentro da ficha, o paciente já está decidido. */
  pacienteFixo?: { id: string; nome: string };
}) {
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<Paciente[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [escolhido, setEscolhido] = useState<{ id: string; nome: string } | null>(null);

  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState<TipoTarefa>("LIGAR");
  const [prazoHoras, setPrazoHoras] = useState(24);

  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);

  // O paciente fixo entra assim que o modal abre; o campo de busca nem aparece.
  useEffect(() => {
    if (aberto && pacienteFixo !== undefined) setEscolhido(pacienteFixo);
  }, [aberto, pacienteFixo]);

  useEffect(() => {
    if (!aberto) {
      setTermo("");
      setResultados([]);
      setEscolhido(pacienteFixo ?? null);
      setTitulo("");
      setTipo("LIGAR");
      setPrazoHoras(24);
      setErro(null);
    }
  }, [aberto, pacienteFixo]);

  useEffect(() => {
    if (relogio.current !== null) clearTimeout(relogio.current);

    const limpo = termo.trim();
    if (limpo.length < 2 || escolhido !== null) {
      setResultados([]);
      setBuscando(false);
      return;
    }

    setBuscando(true);
    relogio.current = setTimeout(() => {
      void (async () => {
        try {
          const r = await buscarPacientes({ data: { termo: limpo } });
          if (r.ok) setResultados(r.itens.slice(0, 6));
        } catch {
          setResultados([]);
        } finally {
          setBuscando(false);
        }
      })();
    }, 220);

    return () => {
      if (relogio.current !== null) clearTimeout(relogio.current);
    };
  }, [termo, escolhido]);

  const salvar = useCallback(async (): Promise<void> => {
    if (escolhido === null) return;
    setSalvando(true);
    setErro(null);
    try {
      const r = await criarTarefaManual({
        data: { patientId: escolhido.id, titulo, tipo, prazoHoras },
      });
      if (r.ok) {
        aoCriar(`Tarefa criada para ${escolhido.nome}.`);
        aoFechar();
      } else {
        setErro(r.message);
      }
    } catch {
      setErro("Não conseguimos criar a tarefa. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }, [aoCriar, aoFechar, escolhido, prazoHoras, tipo, titulo]);

  const pronto = escolhido !== null && titulo.trim().length >= 3;

  return (
    <Modal
      titulo="Nova tarefa"
      aberto={aberto}
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao
            variante="primario"
            carregando={salvando}
            disabled={!pronto}
            onClick={() => {
              void salvar();
            }}
          >
            Criar tarefa
          </Botao>
        </>
      }
    >
      {escolhido === null ? (
        <Campo rotulo="Para qual paciente?" dica="Digite o nome ou o telefone.">
          {(id) => (
            <>
              <Entrada
                id={id}
                value={termo}
                autoComplete="off"
                placeholder="Maria Souza"
                onChange={(e) => {
                  setTermo(e.target.value);
                }}
              />
              <div
                className="crc-pilha"
                style={{ gap: "var(--crc-e1)", marginTop: "var(--crc-e2)" }}
              >
                {buscando && <p className="crc-meta">Buscando…</p>}
                {!buscando && termo.trim().length >= 2 && resultados.length === 0 && (
                  <p className="crc-meta">Nenhum paciente com esse nome ou telefone.</p>
                )}
                {resultados.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="crc-conversa-item"
                    onClick={() => {
                      setEscolhido({ id: p.id, nome: p.nome });
                    }}
                  >
                    <strong style={{ fontSize: "0.9375rem" }}>{p.nome}</strong>
                    <span className="crc-meta" style={{ display: "block" }}>
                      {ROTULO_SITUACAO[p.situacao]}
                      {p.telefone !== null && ` · ${telefoneParaTela(p.telefone)}`}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </Campo>
      ) : (
        <p className="crc-corpo">
          Para <strong>{escolhido.nome}</strong>
          {pacienteFixo === undefined && (
            <>
              {" "}
              <button
                type="button"
                className="crc-botao crc-botao-discreto crc-botao-pequeno"
                onClick={() => {
                  setEscolhido(null);
                  setTermo("");
                }}
              >
                trocar
              </button>
            </>
          )}
        </p>
      )}

      <Campo rotulo="O que precisa ser feito?" dica="Quem for pegar esta tarefa amanhã lê isto.">
        {(id) => (
          <Entrada
            id={id}
            value={titulo}
            maxLength={200}
            placeholder="Ligar para confirmar a remarcação de quinta"
            onChange={(e) => {
              setTitulo(e.target.value);
            }}
          />
        )}
      </Campo>

      <div className="crc-linha" style={{ gap: "var(--crc-e3)", alignItems: "flex-start" }}>
        <Campo rotulo="Tipo">
          {(id) => (
            <select
              id={id}
              className="crc-selecao"
              value={tipo}
              onChange={(e) => {
                setTipo(e.target.value as TipoTarefa);
              }}
            >
              {TIPOS_TAREFA.map((t) => (
                <option key={t} value={t}>
                  {ROTULO_TIPO_TAREFA[t]}
                </option>
              ))}
            </select>
          )}
        </Campo>

        <Campo rotulo="Prazo">
          {(id) => (
            <select
              id={id}
              className="crc-selecao"
              value={String(prazoHoras)}
              onChange={(e) => {
                setPrazoHoras(Number.parseInt(e.target.value, 10));
              }}
            >
              {PRAZOS.map((p) => (
                <option key={p.horas} value={String(p.horas)}>
                  {p.rotulo}
                </option>
              ))}
            </select>
          )}
        </Campo>
      </div>

      {erro !== null && (
        <p className="crc-meta" role="alert" style={{ marginTop: "var(--crc-e3)" }}>
          {erro}
        </p>
      )}
    </Modal>
  );
}
