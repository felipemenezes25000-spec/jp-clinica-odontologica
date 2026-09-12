/**
 * Briefing — a manhã do dono da clínica, dentro da tela de Gestão.
 *
 * ============================================================================
 *  ISTO NÃO É UMA TELA NOVA, e a decisão é do item 1.
 *
 *  O CRC já tem uma tela de Gestão, e ela responde "quanto isso está trazendo
 *  de volta". O que faltava era a outra metade da pergunta da manhã: "o que
 *  mudou desde a semana passada, e onde tem cadeira vazia?".
 *
 *  Essas duas metades numa aba cada seria um segundo dashboard — e dois
 *  dashboards na mesma clínica viram dois números para a mesma coisa. Por isso
 *  este bloco é montado DENTRO de `Gestao`, acima dos painéis de resultado: a
 *  página passa a ler "o que está acontecendo agora" e depois "o que isso já
 *  produziu".
 * ============================================================================
 *
 * ESTE BLOCO NÃO AGE. Nenhum botão daqui envia mensagem, marca consulta ou muda
 * cadastro. Um painel gerencial que age é um painel que vai agir sobre a
 * própria métrica; o lugar de agir é a tela do assunto — a hora vaga se resolve
 * em Encaixes, a objeção em Tratamentos, a conversa em Recepção. Aqui a pessoa
 * descobre PARA ONDE ir.
 *
 * A única exceção é o simulador, e ele não age: ele calcula e some.
 */
import { useCallback, useEffect, useState } from "react";

import {
  carregarGestao,
  simularHorario,
  type AnomaliaNaTela,
  type CapacidadeNaTela,
  type PainelDaGestao,
  type SimulacaoNaTela,
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
  Vazio,
  useAcao,
} from "./base";

/** Reais sem centavos — em painel gerencial, centavo é ruído. */
function reais(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

/* -------------------------------------------------------------------------- */

export function Briefing() {
  const [painel, setPainel] = useState<PainelDaGestao | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async (): Promise<void> => {
    try {
      const r = await carregarGestao();
      if (r.ok) {
        setPainel(r.painel);
        setErro(null);
      } else {
        setErro(r.message);
      }
    } catch {
      setErro("Não conseguimos montar o briefing agora.");
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  /*
   * O ERRO AQUI NÃO DERRUBA A PÁGINA INTEIRA.
   *
   * Este bloco mora dentro da tela de Gestão, que tem os próprios painéis de
   * resultado. Se o briefing falhar, o aviso ocupa o lugar dele e o resto da
   * página continua — quem entrou para ver o funil não perde o funil porque a
   * contagem de anomalias deu erro.
   */
  if (erro !== null && painel === null) return <Aviso tom="alerta">{erro}</Aviso>;
  if (painel === null) return <ListaEsqueleto linhas={4} />;

  return (
    <>
      <Cartao titulo="Hoje">
        <p style={{ marginBottom: painel.linhas.length === 0 ? 0 : "var(--crc-e4)" }}>
          {painel.abertura}
        </p>

        {painel.linhas.length > 0 && (
          <ul className="crc-pilha">
            {painel.linhas.map((l) => (
              <li key={l.chave} className="crc-linha" style={{ gap: "var(--crc-e2)" }}>
                {/*
                  A LINHA QUE NÃO É ACIONÁVEL FICA EM CINZA, sem etiqueta.

                  Marcar todas com o mesmo peso faria a manhã começar com sete
                  coisas urgentes — e uma lista em que tudo é urgente não é
                  lida. O cinza diz "isto é contexto, não é tarefa sua".
                */}
                <span className={l.acionavel ? undefined : "crc-meta"}>{l.texto}</span>
                {l.acionavel && <Etiqueta tom="alerta">é com alguém</Etiqueta>}
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      <Anomalias lista={painel.anomalias} />
      <Capacidade lista={painel.capacidades} ocupacaoAtualPct={painel.ocupacaoAtualPct} />
      <Simulador
        ocupacaoAtualPct={painel.ocupacaoAtualPct}
        taxaDeFaltaPct={painel.taxaDeFaltaPct}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* O que mudou                                                                */
/* -------------------------------------------------------------------------- */

function Anomalias({ lista }: { lista: readonly AnomaliaNaTela[] }) {
  return (
    <Cartao titulo="O que mudou">
      {lista.length === 0 ? (
        <Vazio
          titulo="Nada fora do normal"
          /*
            O VAZIO DIZ O LIMIAR. Sem isso, "nada mudou" pode significar tanto
            "a clínica está estável" quanto "o detector está quebrado" — e a
            pessoa não tem como saber qual dos dois.
          */
          explicacao="Comparamos os últimos 7 dias com a média das 4 semanas anteriores. Nada variou mais de 30%, que é o limiar para virar alerta. Abaixo disso, a variação normal de uma clínica — feriado, férias do dentista, chuva — dispararia aviso toda semana, e um aviso que aparece toda semana deixa de ser lido em duas."
        />
      ) : (
        <ul className="crc-pilha">
          {lista.map((a) => (
            <li key={a.chave} className="crc-cartao-compacto">
              <div className="crc-linha" style={{ gap: "var(--crc-e2)", flexWrap: "wrap" }}>
                <strong>{a.rotulo}</strong>
                <Etiqueta tom={a.gravidade === "ALTA" ? "perigo" : "alerta"}>
                  {a.direcao === "SUBIU" ? "+" : "−"}
                  {String(Math.abs(a.variacaoPct))}%
                </Etiqueta>
              </div>
              {/*
                O FATO VEM SEMPRE, e não só a porcentagem.

                "+180%" sozinho é um número que ninguém pode contestar. Com os
                dois valores na frente, a pessoa pode olhar e dizer "ah, foi a
                semana do feriado" — e poder discordar é como o critério
                melhora.
              */}
              <small className="crc-meta">{a.fato}</small>
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  );
}

/* -------------------------------------------------------------------------- */
/* Capacidade                                                                 */
/* -------------------------------------------------------------------------- */

function Capacidade({
  lista,
  ocupacaoAtualPct,
}: {
  lista: readonly CapacidadeNaTela[];
  ocupacaoAtualPct: number;
}) {
  const paradas = lista.reduce((s, c) => s + c.horasOciosas, 0);

  return (
    <Cartao titulo="Cadeira por dentista">
      {lista.length === 0 ? (
        <Vazio
          titulo="Sem consultas nos últimos 28 dias"
          explicacao="A ocupação é medida sobre consultas realizadas, confirmadas ou em andamento. Sem nenhuma delas no período, não há janela para medir."
        />
      ) : (
        <>
          <p className="crc-meta" style={{ marginBottom: "var(--crc-e4)" }}>
            {/*
              "DA JANELA REAL" DITO AQUI, uma vez, e não repetido em cada linha.

              Sem essa frase, 60% lê-se como "60% da grade contratada" — que o
              CRC não conhece: a grade mora no sistema da clínica. O que ele
              mede é quanto do tempo em que a pessoa esteve na clínica virou
              atendimento, que é mais conservador e é verificável.
            */}
            {String(ocupacaoAtualPct)}% de ocupação média e {String(Math.round(paradas))}h paradas
            nos últimos 28 dias — medido sobre a janela real de atendimento de cada dia, e não sobre
            a grade contratada.
          </p>

          <ul className="crc-pilha">
            {lista.map((c) => (
              <li key={c.dentistId} className="crc-cartao-compacto">
                <div className="crc-linha" style={{ gap: "var(--crc-e2)", flexWrap: "wrap" }}>
                  <strong>{c.nome}</strong>
                  <Etiqueta
                    tom={
                      c.situacao === "OCIOSO"
                        ? "alerta"
                        : c.situacao === "APERTADO"
                          ? "info"
                          : "positiva"
                    }
                  >
                    {c.situacao === "OCIOSO"
                      ? "tem espaço"
                      : c.situacao === "APERTADO"
                        ? "no limite"
                        : "saudável"}
                  </Etiqueta>
                  <Etiqueta tom="neutra">{String(c.ocupacaoPct)}% ocupado</Etiqueta>
                </div>
                <small className="crc-meta">
                  {c.horasOciosas.toFixed(0)}h paradas dentro da janela em que esteve na clínica.
                </small>
              </li>
            ))}
          </ul>
        </>
      )}
    </Cartao>
  );
}

/* -------------------------------------------------------------------------- */
/* O simulador                                                                */
/* -------------------------------------------------------------------------- */

/**
 * "E se eu abrisse sábado de manhã?"
 *
 * ============================================================================
 *  SÓ DUAS COISAS SÃO DIGITADAS: horas a mais e valor da hora de cadeira.
 *
 *  A ocupação de hoje e a taxa de falta NÃO têm campo — são medidas, e
 *  aparecem escritas em cima do formulário justamente para que a pessoa veja
 *  de onde a conta parte.
 *
 *  Um simulador com campo de ocupação é um gerador de números bonitos: basta
 *  escrever 95% para o resultado ficar ótimo.
 * ============================================================================
 */
function Simulador({
  ocupacaoAtualPct,
  taxaDeFaltaPct,
}: {
  ocupacaoAtualPct: number;
  taxaDeFaltaPct: number;
}) {
  const [horas, setHoras] = useState("4");
  const [valor, setValor] = useState("250");
  const [resultado, setResultado] = useState<SimulacaoNaTela | null>(null);
  const { rodando, recado, limpar, executar } = useAcao();

  return (
    <Cartao titulo="E se eu abrisse mais horas?">
      <BarraDeRecado recado={recado} aoFechar={limpar} />

      <p className="crc-meta" style={{ marginBottom: "var(--crc-e4)" }}>
        Partindo do que está medido: {String(ocupacaoAtualPct)}% de ocupação e{" "}
        {String(taxaDeFaltaPct)}% de falta. Esses dois não se digitam.
      </p>

      <div className="crc-grade">
        <Campo rotulo="Horas a mais por semana" dica="de 1 a 80">
          {(id) => (
            <Entrada
              id={id}
              type="number"
              min={1}
              max={80}
              value={horas}
              onChange={(e) => {
                setHoras(e.target.value);
              }}
            />
          )}
        </Campo>

        <Campo
          rotulo="Valor da hora de cadeira (R$)"
          /*
            A DICA EXPLICA POR QUE ISTO É DIGITADO e o resto não: o CRC não
            conhece o mix de procedimentos, então não tem como medir o valor da
            hora. Sem essa frase, o campo parece uma inconsistência.
          */
          dica="o CRC não conhece seu mix de procedimentos — este número é seu"
        >
          {(id) => (
            <Entrada
              id={id}
              type="number"
              min={1}
              value={valor}
              onChange={(e) => {
                setValor(e.target.value);
              }}
            />
          )}
        </Campo>
      </div>

      <div style={{ marginTop: "var(--crc-e4)" }}>
        <Botao
          variante="primario"
          carregando={rodando}
          onClick={() => {
            void executar(
              () =>
                simularHorario({
                  data: { horasAMais: Number(horas), valorPorHora: Number(valor) },
                }),
              (r) => {
                setResultado(r.simulacao);
              },
            );
          }}
        >
          Simular
        </Botao>
      </div>

      {resultado !== null && (
        <div style={{ marginTop: "var(--crc-e5)" }}>
          <div className="crc-linha" style={{ gap: "var(--crc-e5)", flexWrap: "wrap" }}>
            <div>
              <span className="crc-rotulo">Horas realmente ocupadas</span>
              <div style={{ fontSize: "1.5rem", fontWeight: 600 }}>
                {resultado.horasGanhas.toFixed(1)}h
              </div>
              <small className="crc-meta">por semana</small>
            </div>
            <div>
              <span className="crc-rotulo">Receita a mais</span>
              <div style={{ fontSize: "1.5rem", fontWeight: 600 }}>
                {reais(resultado.receitaMes)}
              </div>
              {/*
                "ESTIMATIVA" EMBAIXO DO NÚMERO, e não dentro dele. O número
                grande é o que a pessoa leva na cabeça; esta linha é o que ela
                lê quando ele a surpreende — e é aí que precisa saber que não é
                promessa.
              */}
              <small className="crc-meta">estimativa por mês</small>
            </div>
          </div>

          {/*
            AS PREMISSAS FICAM VISÍVEIS, e não atrás de um "ver detalhes".

            Uma simulação sem as premissas na frente é folheto de vendas. É aqui
            que a pessoa descobre que a conta assume nenhum custo novo — sem
            hora extra, sem material a mais, sem energia.
          */}
          <p className="crc-rotulo" style={{ marginTop: "var(--crc-e4)" }}>
            A conta assume que:
          </p>
          <ul className="crc-pilha" style={{ gap: "var(--crc-e1)" }}>
            {resultado.premissas.map((p) => (
              <li key={p} className="crc-meta">
                {p}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Cartao>
  );
}
