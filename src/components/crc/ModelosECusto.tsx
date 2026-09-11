/**
 * Modelos e custo — a tela do dinheiro da IA.
 *
 * TRÊS PERGUNTAS, NESTA ORDEM, porque é a ordem em que elas aparecem na cabeça
 * de quem abre isto:
 *
 *   1. QUANTO ESTÁ GASTANDO? Primeiro elemento da tela. Uma clínica que só
 *      descobre o gasto na fatura do cartão descobre tarde demais.
 *   2. QUANTO PODE GASTAR? O teto, e o que acontece quando ele acaba.
 *   3. QUAL MODELO, COM QUAL CHAVE? A parte técnica, por último — é a que menos
 *      gente vai mexer.
 *
 * O QUE ESTA TELA NUNCA MOSTRA: a chave de API. Ela entra uma vez e sai da vida;
 * o que fica é o começo e o fim, que bastam para conferir que a chave certa foi
 * colada.
 */
import { useCallback, useEffect, useState } from "react";
import { CircleDollarSign, KeyRound } from "lucide-react";

import {
  cadastrarChaveDeIa,
  carregarModelosEOrcamento,
  limparRotaDeModelo,
  removerChaveDeIa,
  revogarChaveDeIa,
  salvarOrcamentoDeIa,
  salvarRotaDeModelo,
  type PainelDeModelosDto,
} from "@/lib/crc/api";
import { tempoRelativo } from "@/lib/crc/dominio/formatar";

import {
  Aviso,
  BarraDeRecado,
  Botao,
  Campo,
  Cartao,
  Entrada,
  Etiqueta,
  Kpi,
  ListaEsqueleto,
  useAcao,
} from "./base";

const reais = (v: number): string =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PROVEDORES: readonly { valor: string; rotulo: string }[] = [
  { valor: "openai", rotulo: "OpenAI" },
  { valor: "anthropic", rotulo: "Anthropic (Claude)" },
];

export function ModelosECusto() {
  const [painel, setPainel] = useState<PainelDeModelosDto | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const acao = useAcao();

  const recarregar = useCallback(async (): Promise<void> => {
    try {
      const r = await carregarModelosEOrcamento();
      if (r.ok) {
        setPainel(r.painel);
        setErro(null);
      } else {
        setErro(r.message);
      }
    } catch {
      setErro("Não conseguimos carregar os modelos e o orçamento.");
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  if (erro !== null && painel === null) return <Aviso tom="perigo">{erro}</Aviso>;
  if (painel === null) return <ListaEsqueleto linhas={4} />;

  const o = painel.orcamento;

  return (
    <>
      <BarraDeRecado recado={acao.recado} aoFechar={acao.limpar} />

      {/*
        A SITUAÇÃO ANTES DOS NÚMEROS. Quem abre esta tela com a IA parada precisa
        descobrir isso na primeira linha, e não somando duas colunas.
      */}
      {o.situacao !== "livre" && (
        <div style={{ marginBottom: "var(--crc-e5)" }}>
          <Aviso tom={o.situacao === "bloqueado" ? "perigo" : "alerta"}>
            <strong>
              {o.situacao === "bloqueado"
                ? "A IA está parada por limite de gasto."
                : "Chegando no limite."}
            </strong>{" "}
            {o.motivo}{" "}
            {o.situacao === "bloqueado" &&
              (o.abrirCaso
                ? "Cada paciente que escrever vira um caso na fila da recepção, para alguém responder à mão."
                : "As mensagens que chegarem não serão respondidas pela IA.")}
          </Aviso>
        </div>
      )}

      <div className="crc-grade" style={{ marginBottom: "var(--crc-e6)" }}>
        <Kpi
          rotulo="Gasto de hoje"
          valor={reais(o.gastoDiaReais)}
          nota="somando todas as chamadas"
        />
        <Kpi rotulo="Gasto do mês" valor={reais(o.gastoMesReais)} nota="do dia 1 até agora" />
        <Kpi
          rotulo="Limite do dia"
          valor={o.tetoDiaReais === null ? "sem limite" : reais(o.tetoDiaReais)}
          nota={o.tetoDiaReais === null ? "nada barra a IA por custo" : "a IA para ao atingir"}
        />
        <Kpi
          rotulo="Limite do mês"
          valor={o.tetoMesReais === null ? "sem limite" : reais(o.tetoMesReais)}
          nota={o.tetoMesReais === null ? "nada barra a IA por custo" : "a IA para ao atingir"}
        />
      </div>

      <FormularioDeOrcamento
        painel={painel}
        rodando={acao.rodando}
        aoSalvar={(dados) => {
          void acao.executar(
            () => salvarOrcamentoDeIa({ data: dados }),
            () => {
              void recarregar();
            },
            "Limite salvo. Ele passa a valer na próxima mensagem que chegar.",
          );
        }}
      />

      <Cartao titulo="Qual modelo para cada tarefa">
        <p className="crc-corpo" style={{ marginTop: "var(--crc-e2)" }}>
          A IA do CRC faz quatro coisas diferentes, e elas não precisam do mesmo modelo. Conversar
          com o paciente é a única que alguém lê; classificar mensagem acontece a cada mensagem que
          chega e pode usar um modelo mais barato. Deixar no padrão funciona — mexa aqui só se
          souber qual modelo quer.
        </p>

        <ul className="crc-pilha" style={{ marginTop: "var(--crc-e4)" }}>
          {painel.rotas.map((r) => (
            <LinhaDeRota
              key={r.finalidade}
              rota={r}
              chaves={painel.chaves}
              rodando={acao.rodando}
              aoSalvar={(dados) => {
                void acao.executar(
                  () => salvarRotaDeModelo({ data: { finalidade: r.finalidade, ...dados } }),
                  () => {
                    void recarregar();
                  },
                  "Pronto. A próxima mensagem já usa este modelo.",
                );
              }}
              aoLimpar={() => {
                void acao.executar(
                  () => limparRotaDeModelo({ data: { finalidade: r.finalidade } }),
                  () => {
                    void recarregar();
                  },
                  "Voltou para o padrão.",
                );
              }}
            />
          ))}
        </ul>
      </Cartao>

      <Chaves
        painel={painel}
        rodando={acao.rodando}
        aoCadastrar={(dados) => {
          void acao.executar(
            () => cadastrarChaveDeIa({ data: dados }),
            (r) => {
              void recarregar();
              acao.avisar(`Chave guardada (${r.dica}). Ela não aparece mais em lugar nenhum.`);
            },
          );
        }}
        aoRevogar={(id) => {
          void acao.executar(
            () => revogarChaveDeIa({ data: { id } }),
            () => {
              void recarregar();
            },
            "Chave revogada. A IA para de usá-la agora.",
          );
        }}
        aoRemover={(id) => {
          void acao.executar(
            () => removerChaveDeIa({ data: { id } }),
            () => {
              void recarregar();
            },
            "Chave apagada.",
          );
        }}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Orçamento                                                                  */
/* -------------------------------------------------------------------------- */

function FormularioDeOrcamento({
  painel,
  rodando,
  aoSalvar,
}: {
  painel: PainelDeModelosDto;
  rodando: boolean;
  aoSalvar: (dados: {
    tetoDiaReais: number | null;
    tetoMesReais: number | null;
    abrirCaso: boolean;
  }) => void;
}) {
  const [dia, setDia] = useState(
    painel.orcamento.tetoDiaReais === null ? "" : String(painel.orcamento.tetoDiaReais),
  );
  const [mes, setMes] = useState(
    painel.orcamento.tetoMesReais === null ? "" : String(painel.orcamento.tetoMesReais),
  );
  const [abrirCaso, setAbrirCaso] = useState(painel.orcamento.abrirCaso);

  const numero = (v: string): number | null => {
    const limpo = v.replace(",", ".").trim();
    if (limpo.length === 0) return null;
    const n = Number(limpo);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  return (
    <Cartao titulo="Quanto a IA pode gastar">
      <p className="crc-corpo" style={{ marginTop: "var(--crc-e2)" }}>
        Quando o limite é atingido, a IA <strong>para de responder</strong> — e ela verifica isso{" "}
        <strong>antes</strong> de cada consulta, não depois. Deixar em branco significa sem limite.
        Escrever zero significa desligar a IA por aqui.
      </p>

      <div className="crc-grade" style={{ marginTop: "var(--crc-e4)" }}>
        <Campo rotulo="Limite por dia (R$)" dica="Em branco = sem limite">
          {(id) => (
            <Entrada
              id={id}
              inputMode="decimal"
              value={dia}
              placeholder="ex.: 20"
              onChange={(e) => {
                setDia(e.target.value);
              }}
            />
          )}
        </Campo>
        <Campo rotulo="Limite por mês (R$)" dica="Em branco = sem limite">
          {(id) => (
            <Entrada
              id={id}
              inputMode="decimal"
              value={mes}
              placeholder="ex.: 300"
              onChange={(e) => {
                setMes(e.target.value);
              }}
            />
          )}
        </Campo>
      </div>

      {/*
        A ESCOLHA QUE ESTA CAIXA OFERECE É REAL, e por isso ela existe. Do outro
        lado tem um paciente que escreveu: "a IA acabou o orçamento" é problema da
        clínica, não dele.
      */}
      <label className="crc-linha" style={{ marginTop: "var(--crc-e4)", gap: "var(--crc-e2)" }}>
        <input
          type="checkbox"
          checked={abrirCaso}
          onChange={(e) => {
            setAbrirCaso(e.target.checked);
          }}
        />
        <span className="crc-corpo">
          Quando o limite acabar, colocar cada paciente que escrever na fila da recepção, para
          alguém responder à mão. Desmarcado, as mensagens ficam sem resposta.
        </span>
      </label>

      <div className="crc-linha" style={{ marginTop: "var(--crc-e4)" }}>
        <Botao
          disabled={rodando}
          onClick={() => {
            aoSalvar({ tetoDiaReais: numero(dia), tetoMesReais: numero(mes), abrirCaso });
          }}
        >
          Salvar limites
        </Botao>
      </div>
    </Cartao>
  );
}

/* -------------------------------------------------------------------------- */
/* Rotas                                                                      */
/* -------------------------------------------------------------------------- */

function LinhaDeRota({
  rota,
  chaves,
  rodando,
  aoSalvar,
  aoLimpar,
}: {
  rota: PainelDeModelosDto["rotas"][number];
  chaves: PainelDeModelosDto["chaves"];
  rodando: boolean;
  aoSalvar: (dados: { provedor: string; modelo: string; credentialId: string | null }) => void;
  aoLimpar: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [provedor, setProvedor] = useState(rota.provedor);
  const [modelo, setModelo] = useState(rota.modelo);
  const [credentialId, setCredentialId] = useState(rota.credentialId ?? "");

  const ativas = chaves.filter((c) => c.status === "ATIVA" && c.provedor === provedor);

  return (
    <li className="crc-cartao-compacto">
      <div className="crc-linha" style={{ gap: "var(--crc-e2)", flexWrap: "wrap" }}>
        <strong>{rota.rotulo}</strong>
        {rota.padrao && <Etiqueta tom="neutra">padrão</Etiqueta>}
        <span className="crc-meta crc-empurra">
          {rota.provedor} · {rota.modelo}
        </span>
        <Botao
          pequeno
          variante="discreto"
          onClick={() => {
            setAberto((a) => !a);
          }}
        >
          {aberto ? "Fechar" : "Mudar"}
        </Botao>
      </div>

      {aberto && (
        <div style={{ marginTop: "var(--crc-e3)" }}>
          <div className="crc-grade">
            <Campo rotulo="Provedor">
              {(id) => (
                <select
                  id={id}
                  className="crc-entrada"
                  value={provedor}
                  onChange={(e) => {
                    setProvedor(e.target.value);
                    setCredentialId("");
                  }}
                >
                  {PROVEDORES.map((p) => (
                    <option key={p.valor} value={p.valor}>
                      {p.rotulo}
                    </option>
                  ))}
                </select>
              )}
            </Campo>

            <Campo rotulo="Modelo" dica="O nome exato, como o provedor publica.">
              {(id) => (
                <Entrada
                  id={id}
                  value={modelo}
                  onChange={(e) => {
                    setModelo(e.target.value);
                  }}
                />
              )}
            </Campo>

            <Campo
              rotulo="Chave"
              dica="Sem escolher, usa a chave do sistema — e o consumo é cobrado dele."
            >
              {(id) => (
                <select
                  id={id}
                  className="crc-entrada"
                  value={credentialId}
                  onChange={(e) => {
                    setCredentialId(e.target.value);
                  }}
                >
                  <option value="">Chave do sistema</option>
                  {ativas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.apelido} ({c.dica})
                    </option>
                  ))}
                </select>
              )}
            </Campo>
          </div>

          <div className="crc-linha" style={{ marginTop: "var(--crc-e3)", gap: "var(--crc-e3)" }}>
            <Botao
              pequeno
              disabled={rodando}
              onClick={() => {
                aoSalvar({
                  provedor,
                  modelo,
                  credentialId: credentialId.length === 0 ? null : credentialId,
                });
              }}
            >
              Salvar
            </Botao>
            {!rota.padrao && (
              <Botao pequeno variante="discreto" disabled={rodando} onClick={aoLimpar}>
                Voltar ao padrão
              </Botao>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* Chaves                                                                     */
/* -------------------------------------------------------------------------- */

function Chaves({
  painel,
  rodando,
  aoCadastrar,
  aoRevogar,
  aoRemover,
}: {
  painel: PainelDeModelosDto;
  rodando: boolean;
  aoCadastrar: (dados: { provedor: string; apelido: string; segredo: string }) => void;
  aoRevogar: (id: string) => void;
  aoRemover: (id: string) => void;
}) {
  const [provedor, setProvedor] = useState("openai");
  const [apelido, setApelido] = useState("");
  const [segredo, setSegredo] = useState("");

  return (
    <Cartao titulo="Chaves de IA da clínica">
      <p className="crc-corpo" style={{ marginTop: "var(--crc-e2)" }}>
        Por padrão, o sistema usa a chave dele e o consumo é dele. Cadastrando uma chave aqui, a
        clínica passa a pagar direto ao provedor — e a conta vai para o cartão cadastrado lá, não
        para o sistema. A chave é guardada embaralhada e{" "}
        <strong>nunca mais aparece nesta tela</strong>: fica só o começo e o fim, para você conferir
        que colou a certa.
      </p>

      {!painel.cifraConfigurada && (
        <div style={{ marginTop: "var(--crc-e4)" }}>
          <Aviso tom="perigo">
            <strong>Não dá para guardar chave agora.</strong> {painel.motivoCifra} Enquanto isso, o
            sistema continua usando a chave dele normalmente.
          </Aviso>
        </div>
      )}

      {painel.chaves.length > 0 && (
        <ul className="crc-pilha" style={{ marginTop: "var(--crc-e4)" }}>
          {painel.chaves.map((c) => (
            <li key={c.id} className="crc-cartao-compacto" data-status={c.status}>
              <div className="crc-linha" style={{ gap: "var(--crc-e2)", flexWrap: "wrap" }}>
                <strong>{c.apelido}</strong>
                <Etiqueta tom={c.status === "ATIVA" ? "positiva" : "neutra"}>
                  {c.status === "ATIVA" ? "em uso" : "revogada"}
                </Etiqueta>
                <span className="crc-meta">{c.provedor}</span>
                <span className="crc-meta">{c.dica}</span>
                <span className="crc-meta crc-empurra">
                  {c.ultimoUsoEm === null ? "nunca usada" : `usada ${tempoRelativo(c.ultimoUsoEm)}`}
                </span>
              </div>

              <div
                className="crc-linha"
                style={{ marginTop: "var(--crc-e2)", gap: "var(--crc-e3)" }}
              >
                {c.status === "ATIVA" ? (
                  <Botao
                    pequeno
                    variante="perigo"
                    disabled={rodando}
                    onClick={() => {
                      aoRevogar(c.id);
                    }}
                  >
                    Parar de usar
                  </Botao>
                ) : (
                  <Botao
                    pequeno
                    variante="discreto"
                    disabled={rodando}
                    onClick={() => {
                      aoRemover(c.id);
                    }}
                  >
                    Apagar
                  </Botao>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="crc-grade" style={{ marginTop: "var(--crc-e5)" }}>
        <Campo rotulo="Provedor">
          {(id) => (
            <select
              id={id}
              className="crc-entrada"
              value={provedor}
              onChange={(e) => {
                setProvedor(e.target.value);
              }}
            >
              {PROVEDORES.map((p) => (
                <option key={p.valor} value={p.valor}>
                  {p.rotulo}
                </option>
              ))}
            </select>
          )}
        </Campo>

        <Campo rotulo="Nome desta chave" dica="Para saber depois de quem ela é.">
          {(id) => (
            <Entrada
              id={id}
              value={apelido}
              placeholder="Conta da clínica"
              onChange={(e) => {
                setApelido(e.target.value);
              }}
            />
          )}
        </Campo>

        <Campo rotulo="A chave" dica="Cole inteira. Ela não volta a aparecer.">
          {(id) => (
            <Entrada
              id={id}
              type="password"
              autoComplete="off"
              value={segredo}
              placeholder="sk-…"
              onChange={(e) => {
                setSegredo(e.target.value);
              }}
            />
          )}
        </Campo>
      </div>

      <div className="crc-linha" style={{ marginTop: "var(--crc-e4)" }}>
        <Botao
          disabled={rodando || !painel.cifraConfigurada || segredo.trim().length < 20}
          onClick={() => {
            aoCadastrar({ provedor, apelido, segredo });
            setSegredo("");
            setApelido("");
          }}
        >
          <KeyRound size={14} /> Guardar chave
        </Botao>
      </div>
    </Cartao>
  );
}

/** Só para o shell saber que existe sem importar o resto. */
export const ICONE_MODELOS = CircleDollarSign;
