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

import { carregarPanoramaDaIa, type PanoramaDaIaDto, type TurnoDaIaDto } from "@/lib/crc/api";
import { reais } from "@/lib/crc/dominio/custo";
import { tempoRelativo } from "@/lib/crc/dominio/formatar";

import { Aviso, Botao, Cartao, Kpi, ListaEsqueleto, Vazio } from "./base";

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

/** Só para o shell saber que existe sem importar o resto. */
export const ICONE_INTELIGENCIA = ShieldCheck;
