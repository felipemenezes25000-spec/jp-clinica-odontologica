/**
 * O que a automação fez — e, em simulação, o que ela TERIA feito.
 *
 * POR QUE ISTO É O CENTRO DO ROLLOUT, e não um extra
 * O item 95 manda toda automação nascer em simulação, e o 96 manda a simulação
 * registrar exatamente o que teria sido enviado. As duas coisas existiam no
 * servidor desde o começo: cada passo grava o template, o texto já com as
 * variáveis substituídas e o telefone.
 *
 * O que não existia era a porta. Sem ela, o passo mais importante da ativação
 * — "leia o que a automação quer mandar antes de deixar ela mandar" — só se
 * fazia por SQL. Uma simulação que ninguém consegue ler não protege ninguém:
 * ela só adia o momento em que o erro aparece, e o adia até depois do erro ter
 * ido para o WhatsApp de um paciente.
 *
 * O TEXTO INTEGRAL É O PONTO. Mostrar "Teria enviado (automação em modo
 * simulação)" seria repetir o que a tela já diz. O que quem decide precisa ver
 * é a frase: se o primeiro nome saiu certo, se sobrou `{{variavel}}` cru, se o
 * tom está adequado para alguém que acabou de faltar a uma consulta.
 */
import { useCallback, useEffect, useState } from "react";

import {
  carregarHistoricoJornada,
  carregarJornadasDaAutomacao,
  type JornadaDaAutomacaoDto,
  type PassoJornadaDto,
} from "@/lib/crc/api";

import { Aviso, Botao, Etiqueta, ListaEsqueleto, Vazio } from "./base";

/** O rótulo humano de cada tipo de linha do log. */
const ROTULO_TIPO: Record<string, string> = {
  entrou: "Entrou",
  condicao: "Condição",
  espera: "Espera",
  acao: "Ação",
  saida: "Saída",
  erro: "Erro",
  shadow: "Simulação",
};

function tomDoTipo(tipo: string): "neutra" | "positiva" | "alerta" | "perigo" | "info" {
  if (tipo === "erro") return "perigo";
  if (tipo === "shadow") return "info";
  if (tipo === "acao") return "positiva";
  if (tipo === "saida") return "alerta";
  return "neutra";
}

function horario(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function JornadasDaAutomacao({
  automationId,
  emSimulacao,
}: {
  automationId: string;
  /** Muda o texto do vazio: em simulação, "nada ainda" quer dizer outra coisa. */
  emSimulacao: boolean;
}) {
  const [jornadas, setJornadas] = useState<JornadaDaAutomacaoDto[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const [passos, setPassos] = useState<PassoJornadaDto[]>([]);
  const [carregandoPassos, setCarregandoPassos] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const r = await carregarJornadasDaAutomacao({ data: { automationId } });
        if (r.ok) {
          setJornadas(r.jornadas);
          setErro(null);
        } else {
          setErro(r.message);
        }
      } catch {
        setErro("Não conseguimos carregar as jornadas desta automação.");
      }
    })();
  }, [automationId]);

  const abrir = useCallback(
    async (id: string): Promise<void> => {
      if (aberta === id) {
        setAberta(null);
        return;
      }
      setAberta(id);
      setPassos([]);
      setCarregandoPassos(true);
      try {
        const r = await carregarHistoricoJornada({ data: { enrollmentId: id } });
        if (r.ok) setPassos(r.passos);
      } catch {
        setPassos([]);
      } finally {
        setCarregandoPassos(false);
      }
    },
    [aberta],
  );

  if (erro !== null) return <Aviso tom="perigo">{erro}</Aviso>;
  if (jornadas === null) return <ListaEsqueleto linhas={3} />;

  if (jornadas.length === 0) {
    return (
      <Vazio
        titulo="Nenhuma jornada ainda."
        explicacao={
          emSimulacao
            ? "Quando um paciente se encaixar no gatilho desta automação, a jornada aparece aqui — e você vai poder ler a mensagem que ela mandaria antes de liberar o envio."
            : "Quando um paciente se encaixar no gatilho desta automação, a jornada dele aparece aqui com o passo a passo."
        }
      />
    );
  }

  return (
    <div className="crc-pilha" style={{ gap: "var(--crc-e2)" }}>
      {jornadas.map((j) => {
        const estaAberta = aberta === j.id;
        return (
          <div key={j.id} className="crc-cartao-compacto">
            <button
              type="button"
              className="crc-botao crc-botao-discreto"
              aria-expanded={estaAberta}
              style={{ width: "100%", justifyContent: "flex-start", textAlign: "left" }}
              onClick={() => {
                void abrir(j.id);
              }}
            >
              <span style={{ minWidth: 0, flex: 1 }}>
                <strong style={{ display: "block" }}>{j.paciente}</strong>
                <span className="crc-meta">
                  {j.statusRotulo} · passo {j.passoAtual + 1} · {horario(j.criadoEm)}
                  {j.saiuPor !== null && ` · saiu por: ${j.saiuPor.replace(/_/gu, " ")}`}
                </span>
              </span>
              <span aria-hidden="true">{estaAberta ? "▾" : "▸"}</span>
            </button>

            {estaAberta && (
              <div style={{ marginTop: "var(--crc-e3)" }}>
                {carregandoPassos ? (
                  <ListaEsqueleto linhas={3} />
                ) : passos.length === 0 ? (
                  <p className="crc-meta">Esta jornada ainda não registrou nenhum passo.</p>
                ) : (
                  <ol className="crc-pilha" style={{ gap: "var(--crc-e2)", listStyle: "none" }}>
                    {passos.map((p, i) => (
                      <li key={`${p.em}-${String(i)}`}>
                        <div className="crc-linha" style={{ gap: "var(--crc-e2)" }}>
                          <Etiqueta tom={tomDoTipo(p.tipo)}>
                            {ROTULO_TIPO[p.tipo] ?? p.tipo}
                          </Etiqueta>
                          <span className="crc-meta">{horario(p.em)}</span>
                        </div>
                        <p className="crc-corpo" style={{ marginTop: "var(--crc-e1)" }}>
                          {p.descricao}
                        </p>

                        {/* O texto integral. Ver o cabeçalho do arquivo: é ele
                            que transforma "teria enviado" em algo que dá para
                            julgar. */}
                        {p.texto !== null && (
                          <blockquote
                            className="crc-balao crc-balao-saida"
                            style={{ marginTop: "var(--crc-e2)", whiteSpace: "pre-wrap" }}
                          >
                            {p.texto}
                            {p.template !== null && (
                              <span
                                className="crc-meta"
                                style={{ display: "block", marginTop: "var(--crc-e2)" }}
                              >
                                template: {p.template}
                              </span>
                            )}
                          </blockquote>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** O botão que abre e fecha o painel, para o cartão da automação usar. */
export function BotaoJornadas({ aberto, aoAlternar }: { aberto: boolean; aoAlternar: () => void }) {
  return (
    <Botao pequeno variante="discreto" aria-expanded={aberto} onClick={aoAlternar}>
      {aberto ? "Ocultar o que ela fez" : "Ver o que ela fez"}
    </Botao>
  );
}
