/**
 * Benchmarking interno — §42.
 *
 * ============================================================================
 *  A COLUNA "VOLUME" FICA À VISTA EM TODA LINHA, e não escondida num tooltip.
 *
 *  É o que impede a leitura errada mais cara desta tela: "o Dr. Fulano é o
 *  melhor". Com o volume ao lado, a pessoa vê sozinha que ele tem três
 *  consultas — e a conversa muda de "por que os outros não são como ele" para
 *  "ainda não dá para dizer".
 * ============================================================================
 *
 * E ESTA TELA NÃO COMPARA CLÍNICAS DE DONOS DIFERENTES. O §42 permite isso só
 * com agregação anônima e base legal; sem contrato que autorize, comparar é
 * vazar dado de um cliente para outro.
 */
import { useEffect, useState } from "react";

import { carregarBenchmark, type ComparacoesUI, type RankingUI } from "@/lib/crc/api";

import { Aviso, Cartao, Etiqueta, ListaEsqueleto, Vazio } from "./base";

export function Benchmark() {
  const [c, setC] = useState<ComparacoesUI | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const r = await carregarBenchmark();
        if (!vivo) return;
        if (r.ok) setC(r.comparacoes);
        else setErro(r.message);
      } catch {
        if (vivo) setErro("Não conseguimos montar as comparações agora.");
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  if (erro !== null) return <Aviso tom="perigo">{erro}</Aviso>;
  if (c === null) return <ListaEsqueleto linhas={6} />;

  return (
    <>
      <Cartao titulo="Este mês contra o anterior">
        {c.periodo.length === 0 ? (
          <Vazio
            titulo="Sem dados no período"
            explicacao="A comparação usa os últimos 30 dias contra os 30 anteriores, sem sobreposição."
          />
        ) : (
          <ul className="crc-pilha">
            {c.periodo.map((v) => (
              <li key={v.rotulo} className="crc-linha" style={{ gap: "var(--crc-e2)" }}>
                <strong>{v.rotulo}</strong>
                <Etiqueta tom={v.melhorou ? "positiva" : "alerta"}>
                  {v.variacaoPct === null
                    ? "começou"
                    : `${v.variacaoPct > 0 ? "+" : ""}${String(v.variacaoPct)}%`}
                </Etiqueta>
                <span className="crc-meta">{v.frase}</span>
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      <Tabela
        titulo="Entre unidades"
        ranking={c.clinicas}
        unidade="% de comparecimento"
        vazio="Só há uma unidade, ou nenhuma tem consultas no período."
      />
      <Tabela
        titulo="Entre dentistas"
        ranking={c.dentistas}
        unidade="% de comparecimento"
        vazio="Nenhum dentista com consultas no período."
      />
      <Tabela
        titulo="Entre campanhas"
        ranking={c.campanhas}
        unidade="% de conversão"
        vazio="Nenhuma campanha com público ainda."
      />
    </>
  );
}

function Tabela({
  titulo,
  ranking,
  unidade,
  vazio,
}: {
  titulo: string;
  ranking: RankingUI;
  unidade: string;
  vazio: string;
}) {
  return (
    <Cartao titulo={titulo}>
      {ranking.linhas.length === 0 ? (
        <Vazio titulo="Nada a comparar" explicacao={vazio} />
      ) : (
        <>
          {ranking.aviso !== null && (
            <div style={{ marginBottom: "var(--crc-e4)" }}>
              {/*
                O AVISO É "INFO" E NÃO "ALERTA": não há nada errado. A clínica
                simplesmente ainda não tem volume para comparar, e isso é
                normal numa base nova.
              */}
              <Aviso tom="info">{ranking.aviso}</Aviso>
            </div>
          )}

          <p className="crc-meta" style={{ marginBottom: "var(--crc-e3)" }}>
            {/*
              A RÉGUA DITA EM VOZ ALTA. Sem isso, "−4" ao lado de um nome é um
              número sem referência, e a pessoa supõe que é contra o primeiro
              colocado — que é a leitura que transforma a tabela numa lista de
              derrotas.
            */}
            Comparado com a mediana da organização: {String(ranking.mediana)} {unidade}.
          </p>

          <ul className="crc-pilha">
            {ranking.linhas.map((l) => (
              <li key={l.chave} className="crc-linha" style={{ gap: "var(--crc-e2)" }}>
                <span
                  className="crc-meta"
                  style={{ minWidth: "2em", fontVariantNumeric: "tabular-nums" }}
                >
                  {l.posicao === null ? "—" : `${String(l.posicao)}º`}
                </span>
                <strong>{l.rotulo}</strong>
                <Etiqueta tom="neutra">
                  {String(l.valor)} {unidade}
                </Etiqueta>

                {l.amostraPequena ? (
                  /*
                    O VOLUME APARECE EM TODA LINHA, e vira etiqueta de alerta
                    quando é pequeno. É o que impede "o Dr. Fulano é o melhor"
                    quando o Dr. Fulano tem três consultas.
                  */
                  <Etiqueta tom="alerta">só {String(l.volume)} — pouco para comparar</Etiqueta>
                ) : (
                  <>
                    <span className="crc-meta">{String(l.volume)} no período</span>
                    <Etiqueta tom={l.contraMediana >= 0 ? "positiva" : "alerta"}>
                      {l.contraMediana >= 0 ? "+" : ""}
                      {String(l.contraMediana)} da mediana
                    </Etiqueta>
                  </>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </Cartao>
  );
}
