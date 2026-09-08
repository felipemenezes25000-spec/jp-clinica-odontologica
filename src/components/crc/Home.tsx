/**
 * A Home operacional — item 15 do Mega Prompt, itens 106 e 181 do contrato.
 *
 * "Não quero dashboard cheio de cards inúteis. Quero uma Home operacional."
 *
 * O QUE ISSO SIGNIFICOU NAS DECISÕES DESTA TELA:
 *
 *   A frase vem antes dos números. "17 oportunidades precisam da sua atenção,
 *   82 estão sendo tratadas automaticamente" responde as quatro perguntas do
 *   item 44 (o que aconteceu, por que importa, o que eu faço, o que o sistema
 *   já faz) numa linha — antes de qualquer KPI.
 *
 *   Cinco KPIs, não quinze. Cada um responde a uma pergunta que alguém faz de
 *   verdade. Um sexto card só porque o dado existe é exatamente o que o item 45
 *   proíbe.
 *
 *   As prioridades mostram POR QUÊ. O item 173 pede explicabilidade, e ela é o
 *   que separa "o sistema mandou ligar" de "o sistema mandou ligar porque ela
 *   pediu para agendar e respondeu hoje".
 *
 *   Doze itens no máximo. O item 15 é literal: "não mostrar 300 coisas de uma
 *   vez". A fila completa mora no Funil.
 */
import { useEffect, useState } from "react";

import { carregarHome, type ItemPrioridade, type ResumoHome } from "@/lib/crc/api";
import {
  dinheiro,
  dinheiroCurto,
  frescor,
  plural,
  tempoRelativo,
} from "@/lib/crc/dominio/formatar";

import { Aviso, Cartao, Esqueleto, Etiqueta, Kpi, ListaEsqueleto, Vazio } from "./base";

export function Home({
  nomeUsuario,
  aoAbrirPaciente,
}: {
  nomeUsuario: string;
  aoAbrirPaciente: (patientId: string) => void;
}) {
  const [resumo, setResumo] = useState<ResumoHome | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const r = await carregarHome();
        if (!vivo) return;
        if (r.ok) setResumo(r.resumo);
        else setErro(r.message);
      } catch {
        if (vivo) {
          setErro("Não conseguimos carregar sua fila agora. Tente atualizar a página.");
        }
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  if (erro !== null) {
    return <Aviso tom="perigo">{erro}</Aviso>;
  }

  if (resumo === null) {
    return (
      <>
        <div className="crc-grade" style={{ marginBottom: "var(--crc-e6)" }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="crc-kpi">
              <Esqueleto altura={12} largura="60%" />
              <div style={{ height: "var(--crc-e2)" }} />
              <Esqueleto altura={26} largura="45%" />
            </div>
          ))}
        </div>
        <ListaEsqueleto linhas={4} />
      </>
    );
  }

  const primeiroNome = nomeUsuario.trim().split(/\s+/u)[0] ?? "";

  return (
    <>
      <header style={{ marginBottom: "var(--crc-e6)" }}>
        <h1 className="crc-titulo-pagina">
          {resumo.saudacao}
          {primeiroNome.length > 0 ? `, ${primeiroNome}` : ""}.
        </h1>

        {/* A frase que resume o dia. É ela que faz o funcionário sentir que o
            sistema está trabalhando por ele (item 50 do Mega Prompt). */}
        <p className="crc-corpo" style={{ marginTop: "var(--crc-e2)", fontSize: "1.0625rem" }}>
          {resumo.precisamDeAtencao === 0 ? (
            <>Nenhum paciente está esperando você agora. </>
          ) : (
            <>
              <strong style={{ color: "var(--crc-texto)" }}>
                {plural(resumo.precisamDeAtencao, "paciente precisa", "pacientes precisam")}
              </strong>{" "}
              da sua atenção.{" "}
            </>
          )}
          {resumo.emAutomacao > 0 && (
            <>
              Outros {resumo.emAutomacao.toLocaleString("pt-BR")} estão sendo trabalhados
              automaticamente.
            </>
          )}
        </p>

        {/* Item 136: quando os dados são velhos, a tela avisa. Um CRC operando
            sobre uma sincronização de ontem toma decisão errada em silêncio. */}
        {resumo.frescorDados !== null && (
          <p className="crc-meta" style={{ marginTop: "var(--crc-e2)" }}>
            {frescor(resumo.frescorDados)}
          </p>
        )}
      </header>

      <div className="crc-grade" style={{ marginBottom: "var(--crc-e8)" }}>
        <Kpi
          rotulo="Precisam de você"
          valor={resumo.precisamDeAtencao.toLocaleString("pt-BR")}
          nota="Sem automação cuidando"
        />
        <Kpi
          rotulo="Suas tarefas"
          valor={resumo.tarefasHoje.toLocaleString("pt-BR")}
          nota="Abertas e em andamento"
        />
        <Kpi
          rotulo="Conversas esperando"
          valor={resumo.conversasEsperando.toLocaleString("pt-BR")}
          nota="Com mensagem não lida"
        />
        <Kpi
          rotulo="Consultas recuperadas"
          valor={resumo.consultasRecuperadas.toLocaleString("pt-BR")}
          nota="Neste mês"
        />
        {/*
          ITEM 63 EM CÓDIGO. Enquanto não houver integração financeira, este
          número é POTENCIAL — e o rótulo diz isso, em vez de chamar de
          "receita recuperada" e o dashboard mentir.
        */}
        <Kpi
          rotulo={
            Number.parseFloat(resumo.receitaConfirmada) > 0
              ? "Receita recuperada"
              : "Valor potencial recuperado"
          }
          valor={dinheiroCurto(
            Number.parseFloat(resumo.receitaConfirmada) > 0
              ? resumo.receitaConfirmada
              : resumo.valorPotencialRecuperado,
          )}
          nota={
            Number.parseFloat(resumo.receitaConfirmada) > 0
              ? "Confirmada neste mês"
              : "Ainda sem confirmação financeira"
          }
        />
      </div>

      <Cartao titulo="Prioridades de hoje">
        {resumo.prioridades.length === 0 ? (
          <Vazio
            titulo="Nenhuma oportunidade esperando você agora."
            explicacao="As automações continuam monitorando a base. Quando um paciente precisar de contato humano, ele aparece aqui."
          />
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {resumo.prioridades.map((item, indice) => (
              <li key={item.opportunityId}>
                {indice > 0 && <hr className="crc-separador" />}
                <LinhaPrioridade item={item} aoAbrir={aoAbrirPaciente} />
              </li>
            ))}
          </ul>
        )}
      </Cartao>
    </>
  );
}

/* -------------------------------------------------------------------------- */

const ROTULO_FAIXA: Readonly<Record<ItemPrioridade["faixa"], string>> = {
  ALTA: "Prioridade alta",
  MEDIA: "Prioridade média",
  BAIXA: "Prioridade baixa",
};

const TOM_FAIXA: Readonly<Record<ItemPrioridade["faixa"], "perigo" | "alerta" | "neutra">> = {
  ALTA: "perigo",
  MEDIA: "alerta",
  BAIXA: "neutra",
};

function LinhaPrioridade({
  item,
  aoAbrir,
}: {
  item: ItemPrioridade;
  aoAbrir: (patientId: string) => void;
}) {
  const [explicando, setExplicando] = useState(false);

  return (
    <div className={`crc-prioridade crc-prioridade-${item.faixa}`}>
      <div className="crc-linha" style={{ gap: "var(--crc-e3)", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="crc-linha" style={{ gap: "var(--crc-e2)" }}>
            <h3 className="crc-titulo-cartao">{item.nome}</h3>
            {/*
              A etiqueta repete a informação da faixa colorida de propósito —
              item 65: nenhuma ação pode depender só de cor.
            */}
            <Etiqueta tom={TOM_FAIXA[item.faixa]}>{ROTULO_FAIXA[item.faixa]}</Etiqueta>
            <Etiqueta>{item.tipoRotulo}</Etiqueta>
          </div>

          <p className="crc-corpo" style={{ marginTop: "var(--crc-e1)" }}>
            {item.motivo}
          </p>

          <div className="crc-linha" style={{ marginTop: "var(--crc-e2)", gap: "var(--crc-e4)" }}>
            {item.valorPotencial !== null && (
              <span className="crc-meta">
                Valor potencial:{" "}
                <strong style={{ color: "var(--crc-texto-2)" }}>
                  {dinheiro(item.valorPotencial)}
                </strong>
              </span>
            )}
            {item.proximaAcao !== null && (
              <span className="crc-meta">Ação sugerida: {item.proximaAcao}</span>
            )}
            {item.ultimoContatoEm !== null && (
              <span className="crc-meta">Último contato {tempoRelativo(item.ultimoContatoEm)}</span>
            )}
          </div>

          {/*
            ITEM 173 — "Por que prioridade alta?".
            Os fatores exibidos são os MESMOS que ordenaram a fila; eles vêm
            gravados junto do score, e não são recalculados aqui. Se fossem,
            a explicação poderia divergir da ordem, que é pior do que não
            explicar nada.
          */}
          {item.fatores.length > 0 && (
            <div style={{ marginTop: "var(--crc-e2)" }}>
              <button
                type="button"
                className="crc-botao crc-botao-discreto crc-botao-pequeno"
                aria-expanded={explicando}
                onClick={() => {
                  setExplicando((v) => !v);
                }}
              >
                {explicando ? "Ocultar" : `Por que ${String(item.score)}/100?`}
              </button>

              {explicando && (
                <ul
                  style={{
                    listStyle: "none",
                    margin: "var(--crc-e2) 0 0",
                    padding: 0,
                    display: "grid",
                    gap: "2px",
                  }}
                >
                  {item.fatores.map((f) => (
                    <li key={f.rotulo} className="crc-meta">
                      <span
                        style={{
                          fontVariantNumeric: "tabular-nums",
                          fontWeight: 600,
                          color: f.pontos >= 0 ? "var(--crc-primaria)" : "var(--crc-texto-3)",
                          marginRight: "var(--crc-e2)",
                        }}
                      >
                        {f.pontos >= 0 ? "+" : ""}
                        {f.pontos}
                      </span>
                      {f.rotulo}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Item 4: o botão faz coisa de verdade — abre a central do paciente. */}
        {item.patientId !== null && (
          <button
            type="button"
            className="crc-botao crc-botao-secundario crc-botao-pequeno"
            onClick={() => {
              if (item.patientId !== null) aoAbrir(item.patientId);
            }}
          >
            Abrir paciente
          </button>
        )}
      </div>
    </div>
  );
}
