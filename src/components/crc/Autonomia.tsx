/**
 * Centro de Autonomia — quanto o sistema pode fazer sozinho.
 *
 * ============================================================================
 *  A COLUNA QUE IMPORTA É O NÍVEL **EFETIVO**, e não o configurado.
 *
 *  Um domínio configurado no nível 5 com a chave desligada opera como 0.
 *  Mostrar só o 5 é a forma mais rápida de alguém concluir que a automação
 *  está quebrada quando ela está obedecendo — e sair mexendo no que já estava
 *  certo.
 *
 *  Por isso a tela mostra os dois números lado a lado sempre que eles
 *  divergem, e diz QUEM está segurando: kill switch ou chave desligada.
 * ============================================================================
 *
 * O QUE ESTA TELA NÃO FAZ: não liga nem desliga a chave (isso é Configurações)
 * e não aciona o kill switch. Ela governa o NÍVEL. Juntar as três coisas aqui
 * faria a tela parecer o lugar de desligar tudo — e o kill switch precisa ser
 * difícil de achar por engano e fácil de achar de propósito.
 */
import { useCallback, useEffect, useState } from "react";

import {
  ajustarAutonomia,
  carregarAutonomia,
  herdarAutonomia,
  type DominioDaAutonomiaUI,
  type EscadaUI,
} from "@/lib/crc/api";

import { Aviso, BarraDeRecado, Botao, Cartao, Etiqueta, ListaEsqueleto, useAcao } from "./base";

export function Autonomia() {
  const [dominios, setDominios] = useState<DominioDaAutonomiaUI[] | null>(null);
  const [escada, setEscada] = useState<EscadaUI[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const acao = useAcao();

  const recarregar = useCallback(async (): Promise<void> => {
    try {
      const r = await carregarAutonomia();
      if (r.ok) {
        setDominios(r.dominios);
        setEscada(r.escada);
        setErro(null);
      } else setErro(r.message);
    } catch {
      setErro("Não conseguimos ler o Centro de Autonomia agora.");
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const mudar = useCallback(
    async (d: DominioDaAutonomiaUI, nivel: number): Promise<void> => {
      await acao.executar(
        () => ajustarAutonomia({ data: { dominio: d.dominio, nivel } }),
        () => void recarregar(),
        `${d.rotulo}: nível ${String(nivel)}.`,
      );
    },
    [acao, recarregar],
  );

  const herdar = useCallback(
    async (d: DominioDaAutonomiaUI): Promise<void> => {
      await acao.executar(
        () => herdarAutonomia({ data: { dominio: d.dominio } }),
        () => void recarregar(),
        `${d.rotulo} voltou a seguir o padrão da organização.`,
      );
    },
    [acao, recarregar],
  );

  if (erro !== null && dominios === null) return <Aviso tom="perigo">{erro}</Aviso>;
  if (dominios === null) return <ListaEsqueleto linhas={6} />;

  const segurados = dominios.filter((d) => d.bloqueadoPor !== null);

  return (
    <>
      <BarraDeRecado recado={acao.recado} aoFechar={acao.limpar} />

      <Cartao titulo="A escada">
        <p className="crc-meta" style={{ marginBottom: "var(--crc-e4)" }}>
          {/*
            A ESCADA VEM ANTES DA LISTA. Sem saber o que "nível 3" significa,
            o seletor de cada domínio é um número sem régua — e a pessoa
            escolhe pelo que soa razoável, que é como se autoriza sem querer.
          */}
          Cada degrau é uma coisa a mais que o sistema faz sem perguntar. Ele nunca pula degrau
          sozinho: subir é sempre decisão de alguém.
        </p>

        <ul className="crc-pilha" style={{ gap: "var(--crc-e2)" }}>
          {escada.map((e) => (
            <li key={e.nivel} className="crc-linha" style={{ gap: "var(--crc-e3)" }}>
              <Etiqueta tom={e.nivel === 0 ? "neutra" : e.nivel >= 4 ? "alerta" : "info"}>
                {String(e.nivel)} · {e.rotulo}
              </Etiqueta>
              <span className="crc-meta">{e.explicacao}</span>
            </li>
          ))}
        </ul>
      </Cartao>

      {segurados.length > 0 && (
        <Aviso tom="alerta">
          {/*
            ESTE AVISO EXISTE PARA IMPEDIR UMA CONCLUSÃO ERRADA: "configurei e
            não funcionou". O que está acontecendo é o sistema OBEDECENDO a um
            freio que alguém ligou — e o freio tem nome.
          */}
          {segurados.length === 1
            ? `1 domínio está configurado num nível que não está em vigor.`
            : `${String(segurados.length)} domínios estão configurados num nível que não está em vigor.`}{" "}
          Isso não é defeito: é um freio ligado. Cada um diz qual, abaixo.
        </Aviso>
      )}

      <Cartao titulo="Por domínio">
        <ul className="crc-pilha">
          {dominios.map((d) => (
            <li key={d.dominio} className="crc-cartao-compacto">
              <div className="crc-linha" style={{ gap: "var(--crc-e2)", flexWrap: "wrap" }}>
                <strong>{d.rotulo}</strong>

                {d.bloqueadoPor === null ? (
                  <Etiqueta tom={d.efetivo === 0 ? "neutra" : d.efetivo >= 4 ? "alerta" : "info"}>
                    em vigor: nível {String(d.efetivo)}
                  </Etiqueta>
                ) : (
                  <>
                    {/*
                      OS DOIS NÚMEROS JUNTOS quando divergem. Mostrar só o
                      configurado esconde que nada está acontecendo; mostrar só o
                      efetivo esconde que alguém já configurou.
                    */}
                    <Etiqueta tom="perigo">em vigor: 0</Etiqueta>
                    <Etiqueta tom="neutra">configurado: {String(d.nivel)}</Etiqueta>
                  </>
                )}

                {d.herdado ? (
                  <Etiqueta tom="neutra">padrão da organização</Etiqueta>
                ) : (
                  <Etiqueta tom="info">ajustado nesta unidade</Etiqueta>
                )}
              </div>

              <small className="crc-meta">{d.explicacao}</small>

              {d.bloqueadoPor !== null && (
                <small className="crc-meta" style={{ display: "block", marginTop: 4 }}>
                  <strong>Segurado por:</strong> {d.bloqueadoPor}.
                </small>
              )}

              <div
                className="crc-linha"
                style={{ gap: "var(--crc-e2)", marginTop: "var(--crc-e3)", flexWrap: "wrap" }}
              >
                <label htmlFor={`nivel-${d.dominio}`} className="crc-meta">
                  Nível
                </label>
                <select
                  id={`nivel-${d.dominio}`}
                  className="crc-selecao"
                  value={d.nivel}
                  disabled={acao.rodando}
                  onChange={(e) => void mudar(d, Number(e.target.value))}
                >
                  {escada.map((e) => (
                    <option key={e.nivel} value={e.nivel}>
                      {String(e.nivel)} — {e.rotulo}
                    </option>
                  ))}
                </select>

                {!d.herdado && (
                  <Botao pequeno disabled={acao.rodando} onClick={() => void herdar(d)}>
                    Voltar ao padrão
                  </Botao>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Cartao>
    </>
  );
}
