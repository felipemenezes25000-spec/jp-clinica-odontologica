/**
 * Próximas ações — com quem falar primeiro hoje.
 *
 * A PERGUNTA DAS 8H DA MANHÃ. Hoje a resposta é a lista de tarefas, ordenada por
 * prazo — e prazo é uma ordenação ruim para este trabalho: põe no topo o que
 * alguém agendou, e não o que mais importa agora. Uma pessoa que aprovou um
 * orçamento ontem e não marcou fica atrás de um lembrete de rotina.
 *
 * Aqui a ordem é **risco de sumir × quanto se perde**. É a conta que a recepção
 * faz de cabeça todo dia, sem ter os números na frente.
 *
 * ========================================================================
 *  TRÊS COISAS QUE ESTA TELA NÃO FAZ, e cada uma é deliberada:
 *
 *  NÃO AGE. Ela ordena. Quem liga é uma pessoa.
 *
 *  NÃO ESCONDE O RESTO. Quem está em cooldown continua na lista, marcado —
 *  porque amanhã ele é o primeiro, e removê-lo hoje o faria sumir.
 *
 *  NÃO DÁ NÚMERO SEM MOTIVO. Cada linha traz a frase que a explica. "Ligue
 *  para a Ana primeiro" sem motivo é uma ordem; com motivo, é uma sugestão
 *  que a pessoa pode contestar — e contestar é como o critério melhora.
 * ========================================================================
 */
import { useCallback, useEffect, useState } from "react";
import { ChevronDown, PhoneCall } from "lucide-react";

import {
  carregarCerebroDoPaciente,
  carregarFilaDoDia,
  type AcaoSugeridaDto,
  type CerebroDoPacienteDto,
  type FilaDoDiaDto,
} from "@/lib/crc/api";

import { Aviso, Botao, Cartao, Etiqueta, Kpi, ListaEsqueleto, Vazio } from "./base";

export function ProximasAcoes() {
  const [fila, setFila] = useState<FilaDoDiaDto | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async (): Promise<void> => {
    try {
      const r = await carregarFilaDoDia();
      if (r.ok) {
        setFila(r.fila);
        setErro(null);
      } else {
        setErro(r.message);
      }
    } catch {
      setErro("Não conseguimos montar a fila do dia.");
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  if (erro !== null && fila === null) return <Aviso tom="perigo">{erro}</Aviso>;
  if (fila === null) return <ListaEsqueleto linhas={5} />;

  const agir = fila.acoes.filter((a) => !a.aguardar);

  return (
    <>
      <div className="crc-grade" style={{ marginBottom: "var(--crc-e6)" }}>
        <Kpi
          rotulo="Para ligar hoje"
          valor={String(agir.length)}
          destaque={agir.length > 0 ? "foco" : "calmo"}
          nota="em ordem de importância"
        />
        <Kpi
          rotulo="Em risco nesta lista"
          valor={reais(fila.valorEmRisco)}
          /*
            O NÚMERO QUE FAZ A TELA SER LIDA. Uma lista de vinte nomes é
            trabalho; "R$ 34.200 em risco" é motivo para fazer o trabalho.
          */
          nota="orçamento aprovado e não iniciado"
        />
        <Kpi
          rotulo="Aguardando"
          valor={String(fila.emEspera)}
          nota="falamos há pouco — insistir agora incomoda"
        />
      </div>

      <Cartao titulo="A fila">
        {fila.acoes.length === 0 ? (
          <Vazio
            titulo="Ninguém em risco hoje"
            explicacao="Todo mundo com orçamento aberto ou ausência longa já tem consulta marcada, ou já foi contatado esta semana."
          />
        ) : (
          <ul className="crc-pilha">
            {fila.acoes.map((a) => (
              <LinhaDaFila key={a.patientId} acao={a} />
            ))}
          </ul>
        )}
      </Cartao>
    </>
  );
}

/**
 * Uma pessoa na fila, com o "por quê?" que abre.
 *
 * O DETALHE É SOB DEMANDA porque a fila é para percorrer de cima para baixo. Se
 * cada linha já viesse com cinco fatores e três memórias, a tela viraria um
 * relatório e ninguém chegaria ao quinto nome.
 */
function LinhaDaFila({ acao }: { acao: AcaoSugeridaDto }) {
  const [aberto, setAberto] = useState(false);
  const [cerebro, setCerebro] = useState<CerebroDoPacienteDto | null>(null);
  const [carregando, setCarregando] = useState(false);

  const abrir = useCallback((): void => {
    setAberto((v) => !v);
    if (cerebro !== null || carregando) return;

    setCarregando(true);
    void (async () => {
      try {
        const r = await carregarCerebroDoPaciente({ data: { patientId: acao.patientId } });
        if (r.ok) setCerebro(r.cerebro);
      } finally {
        setCarregando(false);
      }
    })();
  }, [acao.patientId, cerebro, carregando]);

  return (
    <li className="crc-cartao-compacto" data-status={acao.aguardar ? "off" : "ok"}>
      <div className="crc-linha" style={{ gap: "var(--crc-e2)", flexWrap: "wrap" }}>
        <strong>{acao.nome}</strong>

        {acao.aguardar ? (
          <Etiqueta tom="neutra">aguardar</Etiqueta>
        ) : (
          <Etiqueta tom={acao.prioridade >= 50 ? "perigo" : "alerta"}>
            prioridade {acao.prioridade}
          </Etiqueta>
        )}

        <span className="crc-empurra">
          <Botao variante="discreto" onClick={abrir}>
            <ChevronDown size={14} /> Por quê?
          </Botao>
        </span>
      </div>

      <p className="crc-corpo" style={{ marginTop: "var(--crc-e1)" }}>
        {acao.porque}
      </p>

      {!acao.aguardar && (
        <p className="crc-linha" style={{ gap: "var(--crc-e2)", marginTop: "var(--crc-e2)" }}>
          <PhoneCall size={14} />
          {/*
            A AÇÃO É ESPECÍFICA POR FATOR, e não genérica. "Ligue" não ajuda;
            "ligue perguntando sobre o orçamento aprovado, pergunte o que
            impediu de marcar" ajuda — e é a única ligação desta lista em que
            quem disca sabe sobre o que falar antes.
          */}
          <span>{acao.acao}</span>
        </p>
      )}

      {aberto && (
        <div style={{ marginTop: "var(--crc-e3)" }}>
          {carregando && <ListaEsqueleto linhas={2} />}
          {cerebro !== null && <FichaDoPaciente cerebro={cerebro} />}
        </div>
      )}
    </li>
  );
}

/** O Patient Brain: a leitura que uma pessoa experiente faria da ficha. */
function FichaDoPaciente({ cerebro }: { cerebro: CerebroDoPacienteDto }) {
  return (
    <>
      <p className="crc-corpo">
        <strong>{cerebro.resumo}</strong>
      </p>

      <ul className="crc-pilha" style={{ marginTop: "var(--crc-e2)" }}>
        {cerebro.fatores.map((f) => (
          <li key={f.codigo} className="crc-linha">
            <span>{f.motivo}</span>
            <span className="crc-empurra">
              <Etiqueta tom="neutra">+{f.pontos}</Etiqueta>
            </span>
          </li>
        ))}
      </ul>

      {cerebro.melhorHorario !== null && (
        <p className="crc-meta" style={{ marginTop: "var(--crc-e2)" }}>
          {/*
            A EXPLICAÇÃO, E NÃO A HORA CRUA. "19h" sozinho é um número que
            ninguém sabe se deve seguir; "82% das respostas desta pessoa
            chegaram entre 18h e 21h" é uma razão para ligar às 19h.
          */}
          Melhor hora para falar: {cerebro.melhorHorario}
        </p>
      )}

      {cerebro.memorias.length > 0 && (
        <>
          <small className="crc-meta" style={{ marginTop: "var(--crc-e2)", display: "block" }}>
            {/*
              SÓ AS CONFIRMADAS chegam aqui — o servidor filtra. As pendentes
              existem justamente para não influenciar decisão antes de alguém
              conferir, e esta ficha é lida logo antes de uma ligação.
            */}
            O que a clínica sabe porque alguém disse:
          </small>
          <ul className="crc-pilha">
            {cerebro.memorias.map((m) => (
              <li key={m} className="crc-corpo">
                {m}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

const reais = (v: number): string =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
