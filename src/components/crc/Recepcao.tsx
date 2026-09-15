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

import { Aviso, Botao, Cartao, Kpi, ListaEsqueleto, Vazio } from "./base";

/**
 * ============================================================================
 *  ESTE `catch` ERA `} catch {` — SEM LIGAR O ERRO A NADA.
 *
 *  A tela falhava em produção com "Não conseguimos ler os números do
 *  atendimento agora", e a causa real era descartada ali mesmo: nada no
 *  console, nada em telemetria, nada para correlacionar com o log do servidor.
 *  Quem fosse investigar tinha a mesma informação que a recepcionista — ou
 *  seja, nenhuma.
 *
 *  Agora: a causa vai para o console, a tela mostra um id de correlação, e há
 *  um botão de tentar de novo que realmente refaz a chamada. O id é gerado no
 *  cliente porque o erro pode acontecer ANTES de existir resposta do servidor
 *  — que é justamente o caso em que não há id vindo de lá.
 * ============================================================================
 */
type Falha = { mensagem: string; correlacao: string; tecnico: string };

function idDeCorrelacao(): string {
  try {
    return crypto.randomUUID().slice(0, 8);
  } catch {
    // `randomUUID` exige contexto seguro. Sem ele, um id fraco ainda serve:
    // ele só precisa casar a tela com a linha do console.
    return Math.random().toString(36).slice(2, 10);
  }
}

export function Recepcao() {
  const [dados, setDados] = useState<RecepcaoUI | null>(null);
  const [erro, setErro] = useState<Falha | null>(null);

  const recarregar = useCallback(async (): Promise<void> => {
    try {
      const r = await carregarRecepcao();
      if (r.ok) {
        setDados(r.recepcao);
        setErro(null);
      } else {
        const correlacao = idDeCorrelacao();
        console.error(
          `[crc:recepcao ${correlacao}] a chamada respondeu, mas não com ok`,
          r.message,
        );
        setErro({ mensagem: r.message, correlacao, tecnico: r.message });
      }
    } catch (causa) {
      const correlacao = idDeCorrelacao();
      // O `console.error` É O CONSERTO. Sem ele esta linha era um buraco.
      console.error(`[crc:recepcao ${correlacao}] falhou ao carregar`, causa);
      setErro({
        mensagem:
          "Não conseguimos ler os números do atendimento agora. Tente de novo; se continuar, avise o responsável técnico com o código abaixo.",
        correlacao,
        tecnico: causa instanceof Error ? `${causa.name}: ${causa.message}` : String(causa),
      });
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  if (erro !== null && dados === null) {
    return (
      <Aviso tom="perigo" detalheTecnico={`${erro.tecnico} · correlação ${erro.correlacao}`}>
        <p style={{ margin: 0 }}>{erro.mensagem}</p>
        <div className="crc-linha" style={{ marginTop: "var(--crc-e3)", gap: "var(--crc-e3)" }}>
          <Botao variante="discreto" onClick={() => void recarregar()}>
            Tentar de novo
          </Botao>
          <small className="crc-meta">código {erro.correlacao}</small>
        </div>
      </Aviso>
    );
  }
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
