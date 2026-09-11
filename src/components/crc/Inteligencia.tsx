/**
 * Inteligência — o que o agente pensou, e o que não chegou a ninguém.
 *
 * ESTA TELA EXISTE PARA UMA FRASE PODER SER DITA COM HONESTIDADE: "nenhuma
 * dessas respostas foi enviada". Sem ela, ligar o modo sombra é um ato de fé —
 * o agente roda, gasta modelo, grava linha no banco, e a única forma de ler é
 * SQL. Uma capacidade que só o desenvolvedor consegue observar não é uma
 * capacidade do produto.
 *
 * O QUE A TELA COLOCA NA FRENTE, e por quê:
 *
 *   O DESFECHO ANTES DO TEXTO. A pergunta de quem abre isto não é "o que ele
 *   escreveu?", é "ele mandou alguma coisa?". Por isso o primeiro elemento é a
 *   faixa que responde sim ou não, e só depois vem a lista.
 *
 *   O PORTÃO QUE BARROU, quando barrou. "Conteúdo clínico" ao lado da resposta
 *   ensina mais sobre o sistema do que qualquer documentação: dá para ver a
 *   regra funcionando sobre um caso real.
 *
 *   O CUSTO SOMADO. Um turno agentic faz uma chamada por volta do laço, e o
 *   número que importa é o do turno inteiro — não o da última chamada.
 */
import { useCallback, useEffect, useState } from "react";
import { Bot, CircleCheck, CirclePause, ShieldCheck, TriangleAlert } from "lucide-react";

import {
  carregarMemoriasDaIa,
  carregarPanoramaDaIa,
  confirmarMemoriaDaIa,
  criarMemoriaDaIa,
  invalidarMemoriaDaIa,
  type MemoriaDaIaDto,
  type PanoramaDaIaDto,
  type SupervisaoDto,
  type TurnoDaIaDto,
} from "@/lib/crc/api";
import { reais } from "@/lib/crc/dominio/custo";
import { tempoRelativo } from "@/lib/crc/dominio/formatar";

import {
  Area,
  Aviso,
  BarraDeRecado,
  Botao,
  Campo,
  Cartao,
  Etiqueta,
  Kpi,
  ListaEsqueleto,
  useAcao,
  Vazio,
} from "./base";

/**
 * Como cada desfecho se chama para quem lê.
 *
 * "candidato" vira "Escreveu, não enviou" — o nome técnico não diz a coisa que
 * mais importa nesta tela, que é o paciente NÃO ter recebido.
 */
const DESFECHO: Record<string, string> = {
  candidato: "Escreveu, não enviou",
  enviado: "Enviado ao paciente",
  humano: "Passou para a equipe",
  sem_acao: "Não agiu",
  falha_segura: "Falhou com segurança",
};

export function Inteligencia() {
  const [panorama, setPanorama] = useState<PanoramaDaIaDto | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);

  const recarregar = useCallback(async (): Promise<void> => {
    try {
      const r = await carregarPanoramaDaIa();
      if (r.ok) {
        setPanorama(r.panorama);
        setErro(null);
      } else {
        setErro(r.message);
      }
    } catch {
      setErro("Não conseguimos carregar os turnos do agente.");
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  if (erro !== null && panorama === null) return <Aviso tom="perigo">{erro}</Aviso>;
  if (panorama === null) return <ListaEsqueleto linhas={4} />;

  if (panorama.turnos.length === 0) {
    return (
      <Vazio
        titulo="O agente ainda não rodou nenhuma vez."
        explicacao="Ele só acorda quando um paciente escreve E a flag ai_agente_sombra está ligada. Enquanto isso, a classificação e as jornadas seguem funcionando normalmente."
      />
    );
  }

  const enviados = panorama.porResultado["enviado"] ?? 0;

  const notas = panorama.turnos
    .map((t) => t.supervisao?.notaQualidade)
    .filter((n): n is number => typeof n === "number");
  const notaMedia = notas.length === 0 ? null : notas.reduce((a, b) => a + b, 0) / notas.length;

  return (
    <>
      {/*
        A PRIMEIRA COISA RESPONDE A PRIMEIRA PERGUNTA. Quem abre esta tela pela
        primeira vez quer saber se a máquina falou com alguém — e a resposta
        não pode depender de somar uma coluna de uma tabela.
      */}
      <div style={{ marginBottom: "var(--crc-e5)" }}>
        {panorama.sombraPura ? (
          // `info` e não `alerta`: a notícia é boa. O tom de alerta fica
          // reservado para o caso oposto, em que a máquina falou com alguém.
          <Aviso tom="info">
            <strong>Nenhuma dessas respostas foi enviada.</strong> O agente está em modo sombra: ele
            lê, decide e grava o que diria — e o paciente não recebe nada.
          </Aviso>
        ) : (
          <Aviso tom="alerta">
            <strong>
              {enviados === 1
                ? "1 resposta foi enviada"
                : `${String(enviados)} respostas foram enviadas`}{" "}
              ao paciente.
            </strong>{" "}
            O envio do agente está ligado nesta clínica.
          </Aviso>
        )}
      </div>

      <div className="crc-grade" style={{ marginBottom: "var(--crc-e6)" }}>
        <Kpi
          rotulo="Turnos registrados"
          valor={String(panorama.turnos.length)}
          nota="os 40 mais recentes"
        />
        <Kpi
          rotulo="Passaram para a equipe"
          valor={String(panorama.porResultado["humano"] ?? 0)}
          nota="o agente decidiu não resolver sozinho"
        />
        <Kpi
          rotulo="Falharam com segurança"
          valor={String(panorama.porResultado["falha_segura"] ?? 0)}
          nota="erro nomeado, nunca silêncio"
        />
        <Kpi
          rotulo="Custo destes turnos"
          valor={reais(panorama.custoTotal)}
          nota="somando todas as voltas do laço"
        />
        {/*
          A nota só aparece quando existe supervisão. Um KPI que mostrasse "—"
          para sempre ensinaria que o número não funciona, em vez de ensinar que
          existe uma chave para ligá-lo.
        */}
        {notaMedia !== null && (
          <Kpi
            rotulo="Nota média das respostas"
            valor={`${notaMedia.toFixed(1)} / 10`}
            nota="o próprio sistema revisando o que respondeu"
          />
        )}
      </div>

      <Cartao titulo="O que o agente decidiu">
        <ul className="crc-pilha" style={{ marginTop: "var(--crc-e4)" }}>
          {panorama.turnos.map((t) => (
            <TurnoNaLista
              key={t.id}
              turno={t}
              aberto={aberto === t.id}
              aoAlternar={() => {
                setAberto((atual) => (atual === t.id ? null : t.id));
              }}
            />
          ))}
        </ul>
      </Cartao>

      <MemoriaDoAgente />
    </>
  );
}

function TurnoNaLista({
  turno,
  aberto,
  aoAlternar,
}: {
  turno: TurnoDaIaDto;
  aberto: boolean;
  aoAlternar: () => void;
}) {
  const rotulo = DESFECHO[turno.resultado] ?? turno.resultado;
  const Icone =
    turno.resultado === "enviado"
      ? CircleCheck
      : turno.resultado === "humano"
        ? TriangleAlert
        : turno.resultado === "falha_segura"
          ? TriangleAlert
          : turno.resultado === "sem_acao"
            ? CirclePause
            : Bot;

  return (
    <li className="crc-cartao-compacto crc-turno-ia" data-resultado={turno.resultado}>
      <div className="crc-linha" style={{ gap: "var(--crc-e3)", alignItems: "flex-start" }}>
        <span className="crc-turno-ia-icone" aria-hidden="true">
          <Icone size={15} />
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="crc-linha" style={{ gap: "var(--crc-e2)" }}>
            <strong>{rotulo}</strong>
            {turno.portaoBloqueou !== null && (
              // O PORTÃO AO LADO DO TEXTO. É onde a regra deixa de ser
              // documentação e vira algo que se vê acontecendo.
              <span className="crc-turno-ia-portao">barrado por {turno.portaoBloqueou}</span>
            )}
            <span className="crc-meta crc-empurra">{tempoRelativo(turno.criadoEm)}</span>
          </div>

          {turno.motivo !== null && (
            <p className="crc-corpo" style={{ marginTop: "var(--crc-e1)" }}>
              {turno.motivo}
            </p>
          )}

          {turno.respostaCandidata !== null && (
            <blockquote className="crc-turno-ia-resposta">{turno.respostaCandidata}</blockquote>
          )}

          {turno.supervisao !== null && <Supervisao s={turno.supervisao} />}

          <div className="crc-linha" style={{ marginTop: "var(--crc-e2)", gap: "var(--crc-e4)" }}>
            {turno.modelo !== null && <span className="crc-meta">{turno.modelo}</span>}
            {turno.custoEstimado !== null && (
              <span className="crc-meta">{reais(turno.custoEstimado)}</span>
            )}
            {turno.duracaoMs !== null && (
              <span className="crc-meta">{(turno.duracaoMs / 1000).toFixed(1)}s</span>
            )}
            {turno.spans.length > 0 && (
              <Botao pequeno variante="discreto" onClick={aoAlternar}>
                {aberto ? "Ocultar etapas" : `${String(turno.spans.length)} etapas`}
              </Botao>
            )}
          </div>

          {aberto && (
            <ol className="crc-turno-ia-trace">
              {turno.spans.map((s, i) => (
                <li key={`${s.nome}-${String(i)}`} data-status={s.status}>
                  <span className="crc-turno-ia-span-nome">{s.nome}</span>
                  <span className="crc-meta">{s.duracaoMs}ms</span>
                  {s.resumo !== null && (
                    <span className="crc-turno-ia-span-resumo">{s.resumo}</span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* A segunda leitura do turno                                                 */
/* -------------------------------------------------------------------------- */

/** O código de violação em português. O código cru não diz nada a quem lê. */
const VIOLACAO: Record<string, string> = {
  prometeu_sem_acao: "prometeu algo sem fazer",
  conteudo_clinico: "falou de assunto clínico",
  citou_preco: "citou preço",
  inventou_horario: "falou de horário sem consultar",
  ignorou_a_pergunta: "não respondeu o que foi perguntado",
  tom_inadequado: "tom fora do lugar",
  repetiu_se: "repetiu o que já tinha dito",
  revelou_ser_maquina: "disse que é um programa",
};

/**
 * A revisão que o próprio sistema fez desta resposta.
 *
 * A NOTA VEM COM O MOTIVO AO LADO, sempre. Nota sozinha é um número que ninguém
 * sabe o que fazer com — "6,5" não diz o que melhorar. A objeção que a pessoa
 * levantou, sim.
 */
function Supervisao({ s }: { s: SupervisaoDto }) {
  return (
    <div className="crc-turno-ia-supervisao">
      <div className="crc-linha" style={{ gap: "var(--crc-e2)", flexWrap: "wrap" }}>
        <span className="crc-turno-ia-selo">revisão do sistema</span>

        {s.notaQualidade !== null && (
          <Etiqueta
            tom={s.notaQualidade >= 7 ? "positiva" : s.notaQualidade >= 5 ? "alerta" : "perigo"}
          >
            nota {s.notaQualidade.toFixed(1)}
          </Etiqueta>
        )}

        <Etiqueta tom={s.resolvido ? "positiva" : "neutra"}>
          {s.resolvido ? "paciente atendido" : "ficou pendente"}
        </Etiqueta>

        {s.precisaFollowup && <Etiqueta tom="alerta">precisa de retorno</Etiqueta>}

        {s.violacoes.map((v) => (
          <Etiqueta key={v} tom="perigo">
            {VIOLACAO[v] ?? v}
          </Etiqueta>
        ))}
      </div>

      {(s.intencao !== null || s.objecao !== null) && (
        <p className="crc-corpo" style={{ marginTop: "var(--crc-e1)" }}>
          {s.intencao !== null && (
            <>
              A pessoa queria <strong>{s.intencao}</strong>.
            </>
          )}
          {s.objecao !== null && <> Reclamou de: {s.objecao}.</>}
        </p>
      )}

      {s.memoriasRecusadas > 0 && (
        <p className="crc-meta" style={{ marginTop: "var(--crc-e1)" }}>
          {s.memoriasRecusadas === 1
            ? "1 anotação foi recusada"
            : `${String(s.memoriasRecusadas)} anotações foram recusadas`}{" "}
          por serem opinião sobre a pessoa, e não algo que ela disse.
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* A memória                                                                  */
/* -------------------------------------------------------------------------- */

const ROTULO_STATUS: Record<string, { texto: string; tom: "positiva" | "alerta" | "neutra" }> = {
  ATIVA: { texto: "valendo", tom: "positiva" },
  PENDENTE: { texto: "esperando você conferir", tom: "alerta" },
  INVALIDADA: { texto: "apagada por alguém da equipe", tom: "neutra" },
};

const ROTULO_ORIGEM: Record<string, string> = {
  conversa: "tirado de uma conversa",
  operador: "escrito à mão pela equipe",
  sistema: "posto pelo sistema",
};

/**
 * O que o agente guardou, e o botão de apagar.
 *
 * ESTA SEÇÃO É O QUE TORNA A MEMÓRIA ACEITÁVEL. Um sistema que acumula frases
 * sobre pacientes sem uma tela onde elas apareçam é um sistema que ninguém pode
 * auditar — e a clínica descobriria o que ele anotou no dia em que uma anotação
 * errada saísse numa resposta.
 *
 * Os três estados aparecem juntos de propósito: ativa, esperando conferência, e
 * apagada. Esconder as apagadas pareceria mais limpo e tiraria justamente a
 * prova de que apagar funciona.
 */
function MemoriaDoAgente() {
  const [memorias, setMemorias] = useState<MemoriaDaIaDto[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [novo, setNovo] = useState("");
  const acao = useAcao();

  const recarregar = useCallback(async (): Promise<void> => {
    try {
      const r = await carregarMemoriasDaIa();
      if (r.ok) {
        setMemorias(r.memorias);
        setErro(null);
      } else {
        setErro(r.message);
      }
    } catch {
      setErro("Não conseguimos carregar o que o agente anotou.");
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  return (
    <Cartao titulo="O que o agente anotou sobre as pessoas">
      <p className="crc-corpo" style={{ marginTop: "var(--crc-e2)" }}>
        Quando a revisão automática está ligada, o sistema guarda frases que ajudam no próximo
        atendimento — e só do tipo que a pessoa <strong>disse</strong>: “só posso depois das 17h”,
        “vem sempre com a filha”. Opinião sobre a pessoa é recusada pelo próprio sistema: “não tem
        dinheiro”, “é difícil de lidar” e parecidas não entram, nem se alguém digitar à mão. Tudo
        aqui tem prazo e pode ser apagado por você.
      </p>

      <BarraDeRecado recado={acao.recado} aoFechar={acao.limpar} />

      {erro !== null && <Aviso tom="perigo">{erro}</Aviso>}

      {/*
        O CAMPO DE ESCREVER À MÃO EXISTE POR DOIS MOTIVOS. O primeiro é útil: a
        recepção sabe coisas que nunca passaram pelo WhatsApp. O segundo é
        didático — quem tentar escrever um rótulo recebe, em português, a
        explicação de por que aquela frase não deveria existir no sistema.
      */}
      <div style={{ marginTop: "var(--crc-e4)" }}>
        <Campo
          rotulo="Anotar alguma coisa sobre a clínica"
          dica="Vale para todos os pacientes. Ex.: “não atendemos aos sábados em janeiro”."
        >
          {(id) => (
            <Area
              id={id}
              rows={2}
              value={novo}
              maxLength={180}
              placeholder="Uma frase curta, do tipo que você diria a um colega novo."
              onChange={(e) => {
                setNovo(e.target.value);
              }}
            />
          )}
        </Campo>
        <Botao
          variante="secundario"
          pequeno
          disabled={acao.rodando || novo.trim().length === 0}
          onClick={() => {
            void acao.executar(
              () =>
                criarMemoriaDaIa({
                  data: { escopo: "organizacao", subjectId: null, conteudo: novo.trim() },
                }),
              () => {
                setNovo("");
                void recarregar();
              },
              "Anotado. O agente já pode usar isso.",
            );
          }}
        >
          Anotar
        </Botao>
      </div>

      {memorias === null ? (
        <div style={{ marginTop: "var(--crc-e4)" }}>
          <ListaEsqueleto linhas={3} />
        </div>
      ) : memorias.length === 0 ? (
        <div style={{ marginTop: "var(--crc-e4)" }}>
          <Vazio
            titulo="Nada anotado ainda."
            explicacao="O agente só anota quando a chave “Deixar a IA revisar o próprio atendimento” está ligada em Configurações. Você também pode anotar à mão no campo acima."
          />
        </div>
      ) : (
        <ul className="crc-pilha" style={{ marginTop: "var(--crc-e4)" }}>
          {memorias.map((m) => (
            <LinhaDeMemoria
              key={m.id}
              memoria={m}
              rodando={acao.rodando}
              aoInvalidar={() => {
                void acao.executar(
                  () => invalidarMemoriaDaIa({ data: { memoriaId: m.id } }),
                  () => {
                    void recarregar();
                  },
                  "Apagado. O agente não vai mais usar essa frase — e ela não volta sozinha.",
                );
              }}
              aoConfirmar={() => {
                void acao.executar(
                  () => confirmarMemoriaDaIa({ data: { memoriaId: m.id } }),
                  () => {
                    void recarregar();
                  },
                  "Confirmado. A partir de agora o agente pode usar isso.",
                );
              }}
            />
          ))}
        </ul>
      )}
    </Cartao>
  );
}

function LinhaDeMemoria({
  memoria,
  rodando,
  aoInvalidar,
  aoConfirmar,
}: {
  memoria: MemoriaDaIaDto;
  rodando: boolean;
  aoInvalidar: () => void;
  aoConfirmar: () => void;
}) {
  const status = ROTULO_STATUS[memoria.status] ?? { texto: memoria.status, tom: "neutra" as const };
  const sujeito =
    memoria.escopo === "organizacao" ? "Sobre a clínica" : (memoria.sujeito ?? "Paciente");

  return (
    <li className="crc-cartao-compacto" data-status={memoria.status}>
      <div className="crc-linha" style={{ gap: "var(--crc-e2)", flexWrap: "wrap" }}>
        <strong>{sujeito}</strong>
        <Etiqueta tom={status.tom}>{status.texto}</Etiqueta>
        <span className="crc-meta crc-empurra">{tempoRelativo(memoria.criadoEm)}</span>
      </div>

      <p className="crc-corpo" style={{ marginTop: "var(--crc-e1)" }}>
        “{memoria.conteudo}”
      </p>

      <div className="crc-linha" style={{ marginTop: "var(--crc-e2)", gap: "var(--crc-e3)" }}>
        <span className="crc-meta">{ROTULO_ORIGEM[memoria.origem] ?? memoria.origem}</span>
        {memoria.expiraEm !== null && (
          <span className="crc-meta">
            some sozinho em {new Date(Date.parse(memoria.expiraEm)).toLocaleDateString("pt-BR")}
          </span>
        )}

        {memoria.status === "PENDENTE" && (
          <Botao pequeno variante="secundario" disabled={rodando} onClick={aoConfirmar}>
            Está certo, pode usar
          </Botao>
        )}
        {memoria.status !== "INVALIDADA" && (
          <Botao pequeno variante="perigo" disabled={rodando} onClick={aoInvalidar}>
            Apagar
          </Botao>
        )}
      </div>
    </li>
  );
}

/** Só para o shell saber que existe sem importar o resto. */
export const ICONE_INTELIGENCIA = ShieldCheck;
