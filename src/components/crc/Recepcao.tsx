/**
 * Recepção — o que o atendimento deixou de fazer.
 *
 * ============================================================================
 *  ESTA TELA MEDE O PROCESSO, E NÃO A PESSOA. A distinção decide se ela ajuda
 *  ou destrói a equipe.
 *
 *  "A Raphaela tem nota 62" é um ranking, e ranking de atendente numa clínica
 *  pequena produz uma coisa só: a pessoa para de registrar o que correu mal. A
 *  partir daí o painel fica bonito e cego.
 *
 *  Por isso nenhum número aqui tem nome ao lado, e cada observação termina numa
 *  PERGUNTA — quem responde é a equipe, que sabe coisas que o banco não sabe.
 * ============================================================================
 *
 * E A VOZ ESTÁ `BLOCKED_EXTERNAL`: não há provedor. As ligações que aparecem
 * aqui foram anotadas à mão por quem atendeu, e a tela diz isso em vez de
 * deixar parecer que o sistema está escutando o telefone.
 */
import { useCallback, useEffect, useState } from "react";

import { carregarRecepcao, type RecepcaoUI } from "@/lib/crc/api";

import { Aviso, Cartao, Kpi, ListaEsqueleto, Vazio } from "./base";

export function Recepcao() {
  const [dados, setDados] = useState<RecepcaoUI | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async (): Promise<void> => {
    try {
      const r = await carregarRecepcao();
      if (r.ok) {
        setDados(r.recepcao);
        setErro(null);
      } else {
        setErro(r.message);
      }
    } catch {
      setErro("Não conseguimos ler os números do atendimento agora.");
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  if (erro !== null && dados === null) return <Aviso tom="perigo">{erro}</Aviso>;
  if (dados === null) return <ListaEsqueleto linhas={5} />;

  const semNada = dados.chamadas === 0 && dados.semResposta === 0 && dados.leadsParados === 0;

  return (
    <>
      <div className="crc-grade" style={{ marginBottom: "var(--crc-e6)" }}>
        <Kpi
          rotulo="Ligações em 30 dias"
          valor={String(dados.chamadas)}
          nota="anotadas à mão — não há provedor de voz"
        />
        <Kpi
          rotulo="Não atendidas"
          valor={String(dados.naoAtendidas)}
          destaque={dados.naoAtendidas > 0 ? "foco" : "calmo"}
          nota="alguém quis falar e não conseguiu"
        />
        <Kpi
          rotulo="Primeira resposta"
          valor={
            dados.medianaDeResposta === null
              ? "—"
              : `${String(Math.round(dados.medianaDeResposta))} min`
          }
          /*
            A MEDIANA, E A NOTA DIZ ISSO. Uma conversa respondida três dias
            depois destrói a média de um mês inteiro, e o painel acusaria uma
            recepção que está respondendo em quatro minutos.
          */
          nota="mediana — metade das conversas espera menos que isso"
        />
        <Kpi
          rotulo="Leads parados"
          valor={String(dados.leadsParados)}
          destaque={dados.leadsParados > 0 ? "foco" : "calmo"}
          nota="demonstraram interesse e nunca foram contatados"
        />
      </div>

      <Cartao titulo="O que os números levantam">
        {semNada ? (
          <Vazio
            titulo="Ainda não há o que observar"
            explicacao="Quando houver ligações anotadas, conversas no Inbox e leads no período, as observações aparecem aqui — cada uma com o número e a pergunta que ele levanta."
          />
        ) : (
          <ul className="crc-pilha">
            {dados.observacoes.map((o) => (
              <li key={o.chave} className="crc-cartao-compacto" data-status={tom(o.gravidade)}>
                <div className="crc-linha" style={{ gap: "var(--crc-e2)", flexWrap: "wrap" }}>
                  <strong>{o.fato}</strong>
                </div>
                {/*
                  A PERGUNTA, E NÃO O VEREDITO. Um painel que conclui no lugar
                  da equipe é um painel que a equipe aprende a contornar.
                */}
                <p className="crc-corpo">{o.pergunta}</p>
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      <Cartao titulo="Como ler esta tela">
        <p className="crc-corpo">
          Nenhum número aqui tem nome ao lado, e isso é de propósito. O que está sendo medido é o{" "}
          <strong>processo</strong>: quantas ligações a clínica não conseguiu atender, quantas
          conversas esperaram demais, quantas pessoas demonstraram interesse e ficaram sem retorno.
        </p>
        <p className="crc-corpo">
          A resposta para cada um desses quase nunca é "alguém trabalhou mal". Costuma ser escala,
          ferramenta ou processo — e quem sabe qual dos três é a equipe.
        </p>
      </Cartao>
    </>
  );
}

function tom(gravidade: string): string {
  if (gravidade === "ALTA") return "off";
  if (gravidade === "ATENCAO") return "alerta";
  return "ok";
}
