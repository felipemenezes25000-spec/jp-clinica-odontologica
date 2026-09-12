/**
 * "O que a IA está fazendo agora" — §7 e §43.
 *
 * ============================================================================
 *  ESTE BLOCO EXISTE PARA RESPONDER UMA PERGUNTA QUE, SEM ELE, NÃO TEM
 *  RESPOSTA: "o sistema está fazendo alguma coisa?".
 *
 *  Um CRC que age sozinho e não mostra o que fez é indistinguível de um CRC
 *  parado. A pessoa abre a Home, vê os mesmos números de ontem, e conclui que
 *  a automação morreu — quando ela pode ter trabalhado a noite inteira.
 *
 *  `crc_ai_activity` e a API existiam desde a FASE A. Nenhuma tela consumia.
 * ============================================================================
 *
 * AS PENDÊNCIAS VÊM ANTES DO HISTÓRICO, e a ordem é a da urgência: o que
 * espera decisão de alguém primeiro, o que já aconteceu depois. Um feed em
 * ordem cronológica pura enterraria a pendência de hoje de manhã embaixo de
 * quarenta linhas de "enviou mensagem".
 */
import { useEffect, useState } from "react";

import { carregarAtividade, type AtividadeUI } from "@/lib/crc/api";

import { Cartao, Etiqueta, Vazio } from "./base";

/** A hora, no fuso da clínica. O dia não importa num feed do dia. */
function hora(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "--:--";
  return d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

const TOM: Record<string, "positiva" | "alerta" | "info" | "neutra" | "perigo"> = {
  CONCLUIDA: "positiva",
  EXECUTADA: "positiva",
  PENDENTE: "alerta",
  AGUARDANDO_HUMANO: "alerta",
  BLOQUEADA: "perigo",
  SIMULADA: "info",
};

export function AtividadeDaIA() {
  const [recentes, setRecentes] = useState<AtividadeUI[] | null>(null);
  const [pendencias, setPendencias] = useState<AtividadeUI[]>([]);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const r = await carregarAtividade();
        if (!vivo || !r.ok) return;
        setRecentes(r.recentes);
        setPendencias(r.pendencias);
      } catch {
        /*
         * SILÊNCIO É A ESCOLHA CERTA AQUI, e é a única do arquivo.
         *
         * Este bloco é um acessório no fim de uma Home que funciona sem ele.
         * Um aviso de erro no lugar faria a pessoa achar que o CRC quebrou
         * quando o que falhou foi o feed.
         */
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  // Enquanto carrega, nada: um esqueleto piscando no fim da Home a cada
  // navegação chama mais atenção do que o conteúdo da página.
  if (recentes === null) return null;

  return (
    <Cartao titulo="O que a IA está fazendo">
      {pendencias.length > 0 && (
        <>
          <p className="crc-rotulo" style={{ marginBottom: "var(--crc-e2)" }}>
            Esperando alguém
          </p>
          <ul className="crc-pilha" style={{ gap: "var(--crc-e2)", marginBottom: "var(--crc-e5)" }}>
            {pendencias.map((a) => (
              <li key={a.id} className="crc-cartao-compacto">
                <div className="crc-linha" style={{ gap: "var(--crc-e2)", flexWrap: "wrap" }}>
                  <strong>{a.titulo}</strong>
                  <Etiqueta tom={TOM[a.status] ?? "alerta"}>{a.status.toLowerCase()}</Etiqueta>
                </div>
                {a.resumo !== null && <small className="crc-meta">{a.resumo}</small>}
              </li>
            ))}
          </ul>
        </>
      )}

      {recentes.length === 0 ? (
        <Vazio
          titulo="A IA ainda não fez nada hoje"
          /*
            O VAZIO DIZ O QUE PRECISA ACONTECER, porque este é o vazio mais
            fácil de interpretar como defeito. Sem a explicação, a pessoa
            conclui que a automação quebrou — quando pode ser só um dia sem
            cancelamento nenhum.
          */
          explicacao="Cada coisa que o sistema decide ou executa aparece aqui, com a hora. Um dia sem nada é um dia em que nada aconteceu — sem cancelamento, sem orçamento parado, sem paciente sumido — e não um dia em que o sistema parou."
        />
      ) : (
        <ul className="crc-pilha" style={{ gap: "var(--crc-e1)" }}>
          {recentes.map((a) => (
            <li key={a.id} className="crc-linha" style={{ gap: "var(--crc-e3)" }}>
              {/*
                A HORA VEM PRIMEIRO E EM LARGURA FIXA: é o que transforma uma
                lista de frases numa timeline legível de cima a baixo.
              */}
              <span
                className="crc-meta"
                style={{ minWidth: "3.4em", fontVariantNumeric: "tabular-nums" }}
              >
                {hora(a.criadoEm)}
              </span>
              <span>{a.titulo}</span>
              {a.status === "SIMULADA" && (
                /*
                  "SIMULADA" PRECISA APARECER, sempre.

                  É a automação em modo sombra: ela decidiu e NÃO executou.
                  Sem a etiqueta, a linha se lê como coisa feita — e alguém
                  conta com uma mensagem que nunca saiu.
                */
                <Etiqueta tom="info">só simulou</Etiqueta>
              )}
              {a.confianca !== null && a.confianca < 0.5 && (
                <Etiqueta tom="alerta">confiança baixa</Etiqueta>
              )}
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  );
}
