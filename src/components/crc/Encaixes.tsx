/**
 * Encaixes — a cadeira que vagou, e a que provavelmente vai vagar.
 *
 * ============================================================================
 *  DUAS LISTAS NA MESMA TELA, e juntá-las é a decisão de produto.
 *
 *  A primeira é o que JÁ vagou: cancelamentos e vãos, com o convite em
 *  andamento. A segunda é o que PROVAVELMENTE vai vagar: consultas de risco
 *  alto nos próximos sete dias.
 *
 *  Em telas separadas, a segunda nunca seria aberta — ninguém procura
 *  "previsão de falta" de manhã. Juntas, a pergunta que a tela responde é uma
 *  só, e é a que a recepção realmente faz: **quais horas desta semana estão em
 *  perigo, e o que eu faço com elas?**
 * ============================================================================
 *
 * O QUE ESTA TELA NÃO FAZ: não envia convite. O convite sai pelo pulso, em
 * lotes de três, com espera entre levas. A tela mostra quantos já foram — que é
 * o número que impede alguém de "ajudar" disparando para a lista inteira.
 */
import { useCallback, useEffect, useState } from "react";

import {
  carregarAgendaInteligente,
  carregarPreConsulta,
  resolverPendencia,
  type AgendaInteligenteUI,
  type PendenciaUI,
} from "@/lib/crc/api";

import { Aviso, Botao, Cartao, Etiqueta, Kpi, ListaEsqueleto, Vazio } from "./base";

export function Encaixes() {
  const [agenda, setAgenda] = useState<AgendaInteligenteUI | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async (): Promise<void> => {
    try {
      const r = await carregarAgendaInteligente();
      if (r.ok) {
        setAgenda(r.agenda);
        setErro(null);
      } else {
        setErro(r.message);
      }
    } catch {
      setErro("Não conseguimos ler a agenda agora.");
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  if (erro !== null && agenda === null) return <Aviso tom="perigo">{erro}</Aviso>;
  if (agenda === null) return <ListaEsqueleto linhas={5} />;

  const oferecendo = agenda.buracos.filter((b) => b.status === "OFERECENDO").length;

  return (
    <>
      <div className="crc-grade" style={{ marginBottom: "var(--crc-e6)" }}>
        <Kpi
          rotulo="Horas vagas"
          valor={String(agenda.buracos.length)}
          destaque={agenda.buracos.length > 0 ? "foco" : "calmo"}
          nota="nos próximos 14 dias"
        />
        <Kpi
          rotulo="Parado nessas horas"
          valor={reais(agenda.valorParado)}
          /*
            "POTENCIAL" NA NOTA, e não no rótulo, porque o rótulo é o que a
            pessoa lê rápido. A nota é o que ela lê quando o número a
            surpreende — e é aí que ela precisa saber que é estimativa.
          */
          nota="estimativa pela duração — não é receita"
        />
        <Kpi
          rotulo="Já convidando"
          valor={String(oferecendo)}
          nota="em levas de 3, com espera entre elas"
        />
        <Kpi
          rotulo="Risco de falta"
          valor={String(agenda.emRisco.length)}
          destaque={agenda.emRisco.length > 0 ? "foco" : "calmo"}
          nota="consultas de risco alto em 7 dias"
        />
      </div>

      <Cartao titulo="Horas vagas">
        {agenda.buracos.length === 0 ? (
          <Vazio
            titulo="Nenhuma hora vaga"
            explicacao="Quando uma consulta for cancelada, ou sobrar um vão entre duas consultas do mesmo dentista, a janela aparece aqui com os convites em andamento."
          />
        ) : (
          <ul className="crc-pilha">
            {agenda.buracos.map((b) => (
              <li key={b.id} className="crc-cartao-compacto">
                <div className="crc-linha" style={{ gap: "var(--crc-e2)", flexWrap: "wrap" }}>
                  <strong>{quando(b.inicioEm)}</strong>
                  <Etiqueta tom="neutra">{b.duracaoMin} min</Etiqueta>
                  {b.dentista !== null && <Etiqueta tom="neutra">{b.dentista}</Etiqueta>}
                  {b.status === "OFERECENDO" ? (
                    <Etiqueta tom="info">convidando</Etiqueta>
                  ) : (
                    <Etiqueta tom="alerta">sem convite ainda</Etiqueta>
                  )}
                </div>
                <small className="crc-meta">
                  {reais(b.valorEstimado)} potencial
                  {b.oferecidos > 0 && (
                    <>
                      {" · "}
                      {b.oferecidos === 1
                        ? "1 pessoa convidada"
                        : `${String(b.oferecidos)} pessoas convidadas`}
                    </>
                  )}
                </small>
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      <Cartao titulo="Provavelmente vão faltar">
        {agenda.emRisco.length === 0 ? (
          <Vazio
            titulo="Nenhuma consulta em risco alto"
            explicacao="As consultas dos próximos sete dias estão dentro do padrão de comparecimento da clínica."
          />
        ) : (
          <>
            <Aviso tom="info">
              {/*
                A FRASE QUE MUDA O QUE A PESSOA FAZ COM A LISTA.
                Sem ela, "risco alto" vira "ligar mais" — e insistir com quem vai
                faltar não faz a pessoa vir. O que recupera a hora é ter a lista
                de espera pronta.
              */}
              Risco alto não quer dizer ligar mais. Quer dizer{" "}
              <strong>deixar o encaixe preparado</strong>: se a falta acontecer, a cadeira já tem
              quem chamar.
            </Aviso>
            <ul className="crc-pilha">
              {agenda.emRisco.map((c) => (
                <li key={c.id} className="crc-cartao-compacto">
                  <div className="crc-linha" style={{ gap: "var(--crc-e2)", flexWrap: "wrap" }}>
                    <strong>{c.nome}</strong>
                    <Etiqueta tom="perigo">risco alto</Etiqueta>
                    {c.confirmada ? (
                      <Etiqueta tom="positiva">confirmada</Etiqueta>
                    ) : (
                      <Etiqueta tom="alerta">não confirmou</Etiqueta>
                    )}
                    <Etiqueta tom="neutra">{quando(c.inicioEm)}</Etiqueta>
                  </div>
                  <small className="crc-meta">
                    {/*
                      OS FATORES, SEMPRE. "Risco alto" sozinho é um rótulo que
                      ninguém pode contestar; com os motivos na frente, a
                      recepção pode discordar — e discordar é como o critério
                      melhora.
                    */}
                    {c.fatores.length === 0
                      ? "Sem fatores registrados."
                      : c.fatores.map((f) => f.rotulo).join(" · ")}
                  </small>
                </li>
              ))}
            </ul>
          </>
        )}
      </Cartao>

      <PreConsulta />
    </>
  );
}

/**
 * O que falta para as consultas dos próximos três dias acontecerem.
 *
 * ============================================================================
 *  ESTA SEÇÃO ESTÁ AQUI, E NÃO NUMA TELA PRÓPRIA, porque é a mesma pergunta
 *  das duas de cima: **o que está em risco na agenda desta semana?**
 *
 *  Hora vaga é risco que já aconteceu. Risco de falta é risco que vai
 *  acontecer. Pendência de pré-consulta é risco que ninguém chamaria de risco —
 *  a pessoa vem, e o atendimento atrasa porque falta a autorização do convênio.
 *
 *  Em telas separadas, a terceira nunca seria aberta.
 * ============================================================================
 */
function PreConsulta() {
  const [pendencias, setPendencias] = useState<PendenciaUI[] | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const recarregar = useCallback(async (): Promise<void> => {
    try {
      const r = await carregarPreConsulta();
      if (r.ok) setPendencias(r.pendencias);
    } catch {
      setPendencias([]);
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const fechar = useCallback(
    async (id: string, dispensar: boolean): Promise<void> => {
      setOcupado(id);
      try {
        await resolverPendencia({ data: { id, dispensar } });
        await recarregar();
      } finally {
        setOcupado(null);
      }
    },
    [recarregar],
  );

  if (pendencias === null) return <ListaEsqueleto linhas={3} />;

  const bloqueiam = pendencias.filter((p) => p.bloqueia);

  return (
    <Cartao titulo="Falta para acontecer">
      {pendencias.length === 0 ? (
        <Vazio
          titulo="Nada pendente nos próximos dias"
          explicacao="As consultas dos próximos três dias estão com confirmação, documentos e convênio em ordem."
        />
      ) : (
        <>
          {bloqueiam.length > 0 && (
            <Aviso tom="perigo">
              {/*
                SÓ O CONVÊNIO BLOQUEIA, e por isso ele tem aviso próprio. Falta
                de formulário se resolve na recepção em dois minutos; convênio
                sem autorização impede cobrar do plano depois.
              */}
              <strong>
                {bloqueiam.length === 1 ? "Uma consulta" : `${String(bloqueiam.length)} consultas`}{" "}
                com convênio sem autorização.
              </strong>{" "}
              Depende de falar com o plano — o sistema não diz “autorizado” sem prova.
            </Aviso>
          )}

          <ul className="crc-pilha">
            {pendencias.map((p) => (
              <li key={p.id} className="crc-cartao-compacto">
                <div className="crc-linha" style={{ gap: "var(--crc-e2)", flexWrap: "wrap" }}>
                  <strong>{p.nome}</strong>
                  <Etiqueta tom={p.bloqueia ? "perigo" : "alerta"}>{p.itemRotulo}</Etiqueta>
                  {/*
                    QUEM RESOLVE é a informação que separa o que já está sendo
                    tratado do que espera uma pessoa. Sem ela, a lista parece
                    toda trabalho manual.
                  */}
                  <Etiqueta tom={p.resolveQuem === "automacao" ? "info" : "neutra"}>
                    {p.resolveQuem === "automacao" ? "o sistema resolve" : "precisa de você"}
                  </Etiqueta>
                  {p.inicioEm !== null && <Etiqueta tom="neutra">{quando(p.inicioEm)}</Etiqueta>}
                  <span className="crc-empurra">
                    <Botao
                      variante="discreto"
                      onClick={() => {
                        void fechar(p.id, true);
                      }}
                      disabled={ocupado === p.id}
                    >
                      Já está resolvido
                    </Botao>
                  </span>
                </div>
                {p.detalhe !== null && <small className="crc-meta">{p.detalhe}</small>}
              </li>
            ))}
          </ul>
        </>
      )}
    </Cartao>
  );
}

const reais = (v: number): string =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/**
 * "Amanhã 14:00", "Qui 09:30".
 *
 * Um ISO cru numa lista de horas vagas é ilegível, e a data completa é longa
 * demais para uma janela que é sempre dos próximos catorze dias.
 */
function quando(iso: string): string {
  const d = new Date(iso);
  const hoje = new Date();
  const dias = Math.round((d.getTime() - hoje.getTime()) / 86_400_000);

  const hora = d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });

  if (dias <= 0) return `Hoje ${hora}`;
  if (dias === 1) return `Amanhã ${hora}`;

  const dia = d.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
  return `${dia} ${hora}`;
}
