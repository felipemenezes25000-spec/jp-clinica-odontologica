/**
 * Metas — o objetivo do dono, com a régua à vista.
 *
 * ============================================================================
 *  `comoMede` APARECE ANTES DE A META SER CRIADA, e não depois.
 *
 *  É o que separa uma meta de uma anotação: a pessoa vê exatamente o que o
 *  sistema vai contar antes de escolher o alvo. Sem isso, ela cria "90% de
 *  ocupação" imaginando uma régua, o sistema mede por outra, e a divergência
 *  só aparece no fim do mês — quando já não dá para discutir.
 * ============================================================================
 *
 * E O RASCUNHO É UM ESTADO DE VERDADE. A meta nasce com plano montado e não
 * faz nada até alguém aprovar. Os limites — quantos contatos por dia, até que
 * nível de autonomia — ficam visíveis na hora de aprovar, que é onde o dono
 * realmente decide se autoriza.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  carregarMetas,
  criarMetaNova,
  medirMetaAgora,
  mudarStatusDaMeta,
  replanejarMeta,
  type MetaUI,
  type TipoDeMetaUI,
} from "@/lib/crc/api";

import {
  Aviso,
  BarraDeRecado,
  Botao,
  Campo,
  Cartao,
  Entrada,
  Etiqueta,
  ListaEsqueleto,
  Modal,
  Vazio,
  useAcao,
} from "./base";

/** Formata na unidade da meta. Somar percentual com dinheiro é o erro clássico. */
function valorNaUnidade(valor: number, unidade: string): string {
  if (unidade === "REAIS") {
    return valor.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 0,
    });
  }
  if (unidade === "PERCENTUAL") return `${String(Math.round(valor * 10) / 10)}%`;
  return String(Math.round(valor));
}

function prazoLegivel(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString("pt-BR") : "—";
}

const TOM_DA_SITUACAO: Record<string, "positiva" | "alerta" | "info" | "neutra"> = {
  ATINGIDA: "positiva",
  ADIANTADA: "positiva",
  NO_RITMO: "info",
  ATRASADA: "alerta",
};

const ROTULO_DA_SITUACAO: Record<string, string> = {
  ATINGIDA: "atingida",
  ADIANTADA: "à frente",
  NO_RITMO: "no ritmo",
  ATRASADA: "atrasada",
};

/* -------------------------------------------------------------------------- */

export function Metas({ podeGerenciar }: { podeGerenciar: boolean }) {
  const [metas, setMetas] = useState<MetaUI[] | null>(null);
  const [catalogo, setCatalogo] = useState<TipoDeMetaUI[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const acao = useAcao();

  const recarregar = useCallback(async (): Promise<void> => {
    try {
      const r = await carregarMetas();
      if (r.ok) {
        setMetas(r.metas);
        setCatalogo(r.catalogo);
        setErro(null);
      } else setErro(r.message);
    } catch {
      setErro("Não conseguimos carregar as metas agora.");
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const agir = useCallback(
    async (m: MetaUI, para: string, frase: string): Promise<void> => {
      await acao.executar(
        () => mudarStatusDaMeta({ data: { goalId: m.id, para } }),
        () => void recarregar(),
        frase,
      );
    },
    [acao, recarregar],
  );

  if (erro !== null && metas === null) return <Aviso tom="perigo">{erro}</Aviso>;
  if (metas === null) return <ListaEsqueleto linhas={4} />;

  const correndo = metas.filter((m) => m.status === "ATIVA");
  const rascunhos = metas.filter((m) => m.status === "RASCUNHO");
  const resto = metas.filter((m) => m.status !== "ATIVA" && m.status !== "RASCUNHO");

  return (
    <>
      <BarraDeRecado recado={acao.recado} aoFechar={acao.limpar} />

      {metas.length === 0 ? (
        <Cartao titulo="Metas">
          <Vazio
            titulo="Nenhuma meta ainda"
            explicacao="Uma meta aqui não é uma anotação: o sistema mede o progresso sozinho, todo dia, e monta um plano com as ações que ele já sabe executar. Por isso o tipo é escolhido de uma lista — cada um tem uma régua definida, que aparece antes de você escolher o alvo."
            acao={
              podeGerenciar ? (
                <Botao variante="primario" onClick={() => setCriando(true)}>
                  Criar a primeira meta
                </Botao>
              ) : undefined
            }
          />
        </Cartao>
      ) : (
        <>
          {rascunhos.length > 0 && (
            <Cartao
              titulo="Esperando aprovação"
              acao={
                podeGerenciar ? (
                  <Botao variante="primario" pequeno onClick={() => setCriando(true)}>
                    Nova meta
                  </Botao>
                ) : undefined
              }
            >
              <p className="crc-meta" style={{ marginBottom: "var(--crc-e4)" }}>
                {/*
                  O RASCUNHO NÃO AGE. Dizer isso em voz alta evita a suposição
                  contrária — que é a suposição perigosa, porque envolve o
                  sistema falando com paciente.
                */}
                O plano já está montado, e <strong>nada acontece até alguém aprovar</strong>. Os
                limites de cada meta estão logo abaixo dela.
              </p>

              <ul className="crc-pilha">
                {rascunhos.map((m) => (
                  <CartaoDaMeta
                    key={m.id}
                    meta={m}
                    podeGerenciar={podeGerenciar}
                    ocupado={acao.rodando}
                    aoAgir={agir}
                    aoRecarregar={recarregar}
                    acao={acao}
                  />
                ))}
              </ul>
            </Cartao>
          )}

          <Cartao
            titulo="Em andamento"
            acao={
              podeGerenciar && rascunhos.length === 0 ? (
                <Botao variante="primario" pequeno onClick={() => setCriando(true)}>
                  Nova meta
                </Botao>
              ) : undefined
            }
          >
            {correndo.length === 0 ? (
              <Vazio
                titulo="Nenhuma meta correndo"
                explicacao="As metas aprovadas aparecem aqui, com a medição do dia."
              />
            ) : (
              <ul className="crc-pilha">
                {correndo.map((m) => (
                  <CartaoDaMeta
                    key={m.id}
                    meta={m}
                    podeGerenciar={podeGerenciar}
                    ocupado={acao.rodando}
                    aoAgir={agir}
                    aoRecarregar={recarregar}
                    acao={acao}
                  />
                ))}
              </ul>
            )}
          </Cartao>

          {resto.length > 0 && (
            <Cartao titulo="Encerradas">
              <ul className="crc-pilha">
                {resto.map((m) => (
                  <CartaoDaMeta
                    key={m.id}
                    meta={m}
                    podeGerenciar={podeGerenciar}
                    ocupado={acao.rodando}
                    aoAgir={agir}
                    aoRecarregar={recarregar}
                    acao={acao}
                  />
                ))}
              </ul>
            </Cartao>
          )}
        </>
      )}

      <NovaMeta
        aberto={criando}
        catalogo={catalogo}
        ocupado={acao.rodando}
        aoFechar={() => setCriando(false)}
        aoCriar={async (dados) => {
          await acao.executar(
            () => criarMetaNova({ data: dados }),
            () => {
              setCriando(false);
              void recarregar();
            },
            "Meta criada em rascunho, com o plano montado. Aprove para ela começar.",
          );
        }}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */

type Acao = ReturnType<typeof useAcao>;

function CartaoDaMeta({
  meta,
  podeGerenciar,
  ocupado,
  aoAgir,
  aoRecarregar,
  acao,
}: {
  meta: MetaUI;
  podeGerenciar: boolean;
  ocupado: boolean;
  aoAgir: (m: MetaUI, para: string, frase: string) => Promise<void>;
  aoRecarregar: () => Promise<void>;
  acao: Acao;
}) {
  const [abertas, setAbertas] = useState(false);
  const p = meta.progresso;

  return (
    <li className="crc-cartao-compacto">
      <div className="crc-linha" style={{ gap: "var(--crc-e2)", flexWrap: "wrap" }}>
        <strong>{meta.titulo}</strong>
        <Etiqueta tom="neutra">{meta.rotuloDoTipo}</Etiqueta>
        {p !== null && (
          <Etiqueta tom={TOM_DA_SITUACAO[p.situacao] ?? "neutra"}>
            {ROTULO_DA_SITUACAO[p.situacao] ?? p.situacao}
          </Etiqueta>
        )}
        {meta.status !== "ATIVA" && meta.status !== "RASCUNHO" && (
          <Etiqueta tom="neutra">{meta.status.toLowerCase()}</Etiqueta>
        )}
      </div>

      <small className="crc-meta" style={{ display: "block", marginTop: 4 }}>
        Alvo {valorNaUnidade(meta.alvo, meta.unidade)} até {prazoLegivel(meta.prazoEm)}
        {" · "}
        {/*
          O BASELINE MUDA DE NOME CONFORME O TIPO, e isso não é firula.

          Para ocupação, ele é o PONTO DE PARTIDA: a clínica está em 61%.
          Para contagem, ele é REFERÊNCIA: o mês passado fez 20, mas este mês
          começa do zero. Chamar os dois de "ponto de partida" faria a pessoa
          achar que já tem 20 consultas marcadas.
        */}
        {meta.ehAcumulado
          ? `período anterior: ${valorNaUnidade(meta.baseline, meta.unidade)}`
          : `partiu de ${valorNaUnidade(meta.baseline, meta.unidade)}`}
      </small>

      {p === null ? (
        <small className="crc-meta" style={{ display: "block", marginTop: 6 }}>
          {/*
            "AINDA NÃO MEDIMOS" É DIFERENTE DE "ZERO". A primeira é uma meta
            recém-criada; a segunda é notícia ruim.
          */}
          Ainda não medimos esta meta.
        </small>
      ) : (
        <>
          <div
            aria-hidden="true"
            style={{
              height: 6,
              borderRadius: 999,
              background: "var(--crc-superficie-3)",
              marginTop: 8,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${String(Math.min(100, Math.max(0, Math.round(p.fracao * 100))))}%`,
                height: "100%",
                background: p.situacao === "ATRASADA" ? "var(--crc-alerta)" : "var(--crc-primaria)",
              }}
            />
          </div>
          {/*
            O NÚMERO VEM ESCRITO AO LADO DA BARRA: gráfico que só existe como
            forma é invisível para quem usa leitor de tela.
          */}
          <small className="crc-meta" style={{ display: "block", marginTop: 4 }}>
            {meta.atual === null ? "—" : valorNaUnidade(meta.atual, meta.unidade)} · {p.resumo}
          </small>
        </>
      )}

      <details
        open={abertas}
        onToggle={(e) => setAbertas((e.currentTarget as HTMLDetailsElement).open)}
        style={{ marginTop: "var(--crc-e3)" }}
      >
        <summary className="crc-meta" style={{ cursor: "pointer" }}>
          Como isto é medido, e o plano ({String(meta.acoes.length)})
        </summary>

        <p className="crc-meta" style={{ marginTop: 6 }}>
          <strong>Régua:</strong> {meta.comoMede}
        </p>

        <p className="crc-meta">
          <strong>Limites desta meta:</strong> no máximo {String(meta.maxContatosDia)} contatos por
          dia, e autonomia até o nível {String(meta.maxAutonomia)} — mesmo que o Centro de Autonomia
          permita mais.
        </p>

        {meta.acoes.length === 0 ? (
          <p className="crc-meta">
            O plano está vazio: hoje o CRC não tem recurso para atacar esta meta — sem hora vaga,
            sem orçamento aberto, sem quem chamar.
          </p>
        ) : (
          <ul className="crc-pilha" style={{ gap: "var(--crc-e1)", marginTop: 6 }}>
            {meta.acoes.map((a) => (
              <li key={a.id} className="crc-meta">
                <strong>{a.titulo}</strong> — espera-se{" "}
                {valorNaUnidade(a.contribuicaoEstimada, meta.unidade)}, com{" "}
                {String(Math.round(a.confianca * 100))}% de confiança
                {a.alcanceEstimado > 0
                  ? `, falando com até ${String(a.alcanceEstimado)} pessoa(s)`
                  : ""}
                .
              </li>
            ))}
          </ul>
        )}
      </details>

      {podeGerenciar && (
        <div
          className="crc-linha"
          style={{ gap: "var(--crc-e2)", marginTop: "var(--crc-e3)", flexWrap: "wrap" }}
        >
          {meta.status === "RASCUNHO" && (
            <Botao
              variante="primario"
              pequeno
              disabled={ocupado}
              onClick={() => void aoAgir(meta, "ATIVA", `"${meta.titulo}" começou.`)}
            >
              Aprovar e começar
            </Botao>
          )}

          {meta.status === "ATIVA" && (
            <>
              <Botao
                pequeno
                disabled={ocupado}
                onClick={() => {
                  void acao.executar(
                    () => medirMetaAgora({ data: { goalId: meta.id } }),
                    () => void aoRecarregar(),
                    "Medida agora.",
                  );
                }}
              >
                Medir agora
              </Botao>
              <Botao
                pequeno
                disabled={ocupado}
                onClick={() => {
                  void acao.executar(
                    () => replanejarMeta({ data: { goalId: meta.id } }),
                    () => void aoRecarregar(),
                    "Plano refeito com os recursos de hoje.",
                  );
                }}
              >
                Refazer o plano
              </Botao>
              <Botao
                pequeno
                disabled={ocupado}
                onClick={() => void aoAgir(meta, "PAUSADA", `"${meta.titulo}" pausada.`)}
              >
                Pausar
              </Botao>
            </>
          )}

          {meta.status === "PAUSADA" && (
            <Botao
              pequeno
              disabled={ocupado}
              onClick={() => void aoAgir(meta, "ATIVA", `"${meta.titulo}" retomada.`)}
            >
              Retomar
            </Botao>
          )}

          {(meta.status === "RASCUNHO" || meta.status === "ATIVA" || meta.status === "PAUSADA") && (
            <Botao
              pequeno
              variante="perigo"
              disabled={ocupado}
              onClick={() => void aoAgir(meta, "CANCELADA", `"${meta.titulo}" cancelada.`)}
            >
              Cancelar
            </Botao>
          )}
        </div>
      )}
    </li>
  );
}

/* -------------------------------------------------------------------------- */

type DadosDaNovaMeta = {
  titulo: string;
  tipo: string;
  alvo: number;
  prazoEm: string;
  maxContatosDia: number;
  maxAutonomia: number;
};

function NovaMeta({
  aberto,
  catalogo,
  ocupado,
  aoFechar,
  aoCriar,
}: {
  aberto: boolean;
  catalogo: readonly TipoDeMetaUI[];
  ocupado: boolean;
  aoFechar: () => void;
  aoCriar: (dados: DadosDaNovaMeta) => Promise<void>;
}) {
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState("");
  const [alvo, setAlvo] = useState("");
  const [prazo, setPrazo] = useState("");
  const [contatos, setContatos] = useState("50");
  const [autonomia, setAutonomia] = useState("2");

  const escolhido = useMemo(() => catalogo.find((c) => c.tipo === tipo) ?? null, [catalogo, tipo]);

  // Um prazo padrão de 30 dias: é o horizonte em que uma meta de clínica
  // ainda cabe na cabeça de quem a criou.
  useEffect(() => {
    if (!aberto) return;
    const trintaDias = new Date(Date.now() + 30 * 86_400_000);
    setPrazo(trintaDias.toISOString().slice(0, 10));
  }, [aberto]);

  return (
    <Modal
      titulo="Nova meta"
      aberto={aberto}
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao
            variante="primario"
            carregando={ocupado}
            disabled={escolhido === null}
            onClick={() => {
              void aoCriar({
                titulo,
                tipo,
                alvo: Number(alvo),
                // O prazo vem como data; vira fim do dia, senão "até dia 12"
                // terminaria à meia-noite do dia 11 para quem preencheu.
                prazoEm: new Date(`${prazo}T23:59:59.000Z`).toISOString(),
                maxContatosDia: Number(contatos),
                maxAutonomia: Number(autonomia),
              });
            }}
          >
            Criar em rascunho
          </Botao>
        </>
      }
    >
      <div className="crc-pilha">
        <Campo
          rotulo="O que você quer"
          dica="Um nome curto, do jeito que você chamaria numa reunião."
        >
          {(id) => (
            <Entrada
              id={id}
              value={titulo}
              maxLength={120}
              placeholder="Encher a agenda de outubro"
              onChange={(e) => setTitulo(e.target.value)}
            />
          )}
        </Campo>

        <Campo
          rotulo="Tipo"
          dica="A lista é fechada de propósito: cada tipo tem uma régua que o sistema sabe medir sozinho."
        >
          {(id) => (
            <select
              id={id}
              className="crc-entrada"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
            >
              <option value="">Escolha…</option>
              {catalogo.map((c) => (
                <option key={c.tipo} value={c.tipo}>
                  {c.rotulo}
                </option>
              ))}
            </select>
          )}
        </Campo>

        {escolhido !== null && (
          <>
            {/*
              ============================================================================
                A RÉGUA APARECE ANTES DO ALVO, e é a razão de esta tela existir.

                Sem ela, a pessoa escolhe "90%" imaginando uma definição de
                ocupação, o sistema mede por outra, e a divergência só aparece no
                fim do mês — quando já não dá para discutir.
              ============================================================================
            */}
            <Aviso tom="info">
              <strong>Como isto vai ser medido:</strong> {escolhido.comoMede}
              {escolhido.ehAcumulado ? (
                <>
                  {" "}
                  O período começa do zero — o resultado do período anterior fica só como
                  referência.
                </>
              ) : (
                <> O progresso parte de onde a clínica está hoje.</>
              )}
            </Aviso>

            <Campo
              rotulo={`Alvo (${escolhido.unidade === "REAIS" ? "R$" : escolhido.unidade === "PERCENTUAL" ? "%" : "quantidade"})`}
              /*
                A dica só existe quando há o que dizer. Com
                `exactOptionalPropertyTypes`, passar `undefined` explícito é
                diferente de não passar — e o espalhamento condicional é a
                forma de dizer "não passe".
              */
              {...(escolhido.menorEhMelhor
                ? { dica: "Nesta meta, MENOR é melhor — informe o teto que você quer alcançar." }
                : {})}
            >
              {(id) => (
                <Entrada
                  id={id}
                  type="number"
                  min={1}
                  value={alvo}
                  onChange={(e) => setAlvo(e.target.value)}
                />
              )}
            </Campo>
          </>
        )}

        <Campo rotulo="Prazo">
          {(id) => (
            <Entrada id={id} type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
          )}
        </Campo>

        {/*
          OS DOIS LIMITES FICAM NO FORMULÁRIO, e não escondidos num "avançado".

          "Vou encher a agenda" sem teto é uma licença para disparar mensagem
          para a base inteira. Quem cria a meta é quem decide o teto — e decide
          vendo o número, não descobrindo depois.
        */}
        <Campo
          rotulo="Máximo de contatos por dia"
          dica="O teto de pessoas que esta meta pode incomodar num dia, somando todas as ações dela."
        >
          {(id) => (
            <Entrada
              id={id}
              type="number"
              min={1}
              max={5000}
              value={contatos}
              onChange={(e) => setContatos(e.target.value)}
            />
          )}
        </Campo>

        <Campo
          rotulo="Autonomia máxima desta meta"
          dica="O freio da própria meta: mesmo que o Centro de Autonomia permita mais, ela não passa daqui."
        >
          {(id) => (
            <Entrada
              id={id}
              type="number"
              min={0}
              max={5}
              value={autonomia}
              onChange={(e) => setAutonomia(e.target.value)}
            />
          )}
        </Campo>
      </div>
    </Modal>
  );
}
