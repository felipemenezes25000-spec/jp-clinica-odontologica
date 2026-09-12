/**
 * Tratamentos — o orçamento que ainda pode virar tratamento.
 *
 * ============================================================================
 *  O NÚMERO QUE ESTA TELA EXISTE PARA MOVER é a conversão de orçamento. Num
 *  consultório ela fica entre 35% e 55% — quase metade do que já foi
 *  examinado, diagnosticado e orçado nunca vira nada.
 *
 *  É o dinheiro mais barato que existe: o paciente já veio. Não precisa de
 *  anúncio nem de captação; precisa de alguém retomando a conversa na hora
 *  certa, com o argumento certo.
 * ============================================================================
 *
 * ============================================================================
 *  DUAS SEÇÕES, E A SEGUNDA É A QUE MUDA O MÊS SEGUINTE.
 *
 *  A lista responde "com quem eu falo hoje". A analítica de objeções responde
 *  "o que eu mudo no mês que vem" — e é a que ninguém tem, porque exige guardar
 *  o motivo E o desfecho, e cruzar os dois.
 *
 *  "Preço aparece em 58% das objeções" é uma frase que todo mundo já sabe.
 *  "Preço aparece em 58% e converte em 11%, enquanto tempo aparece em 14% e
 *  converte em 47%" é outra coisa: diz que preço não é problema de treinamento
 *  de equipe, é tabela ou forma de pagamento.
 * ============================================================================
 */
import { useCallback, useEffect, useState } from "react";

import { carregarTratamentos, type TratamentosUI } from "@/lib/crc/api";

import { Aviso, Cartao, Etiqueta, Kpi, ListaEsqueleto, Vazio } from "./base";

export function Tratamentos() {
  const [dados, setDados] = useState<TratamentosUI | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async (): Promise<void> => {
    try {
      const r = await carregarTratamentos();
      if (r.ok) {
        setDados(r.tratamentos);
        setErro(null);
      } else {
        setErro(r.message);
      }
    } catch {
      setErro("Não conseguimos ler o funil de tratamentos agora.");
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  if (erro !== null && dados === null) return <Aviso tom="perigo">{erro}</Aviso>;
  if (dados === null) return <ListaEsqueleto linhas={6} />;

  return (
    <>
      <div className="crc-grade" style={{ marginBottom: "var(--crc-e6)" }}>
        <Kpi
          rotulo="Esperado do funil"
          valor={reais(dados.esperado)}
          destaque={dados.esperado > 0 ? "foco" : "calmo"}
          nota="valor × chance de fechar"
        />
        <Kpi
          rotulo="Se tudo fechar"
          valor={reais(dados.emJogo)}
          nota={`${String(dados.funil.length)} orçamentos abertos`}
        />
        <Kpi
          rotulo="Aceitou e não marcou"
          valor={String(dados.aceitosSemData)}
          destaque={dados.aceitosSemData > 0 ? "foco" : "calmo"}
          nota="o caso mais quente do funil"
        />
      </div>

      {dados.aceitosSemData > 0 && (
        <Aviso tom="alerta">
          {/*
            A FRASE QUE EXPLICA POR QUE ESSE NÚMERO ESTÁ EM DESTAQUE.
            O sistema da clínica mostra esses orçamentos como APROVADOS, então
            ninguém os procura numa lista de pendências — e eles esfriam.
          */}
          <strong>
            {dados.aceitosSemData === 1
              ? "Um orçamento aceito"
              : `${String(dados.aceitosSemData)} orçamentos aceitos`}{" "}
            sem data marcada.
          </strong>{" "}
          A pessoa já disse sim. No sistema da clínica eles aparecem como aprovados, e por isso
          ninguém os procura — é onde mais se perde dinheiro sem ninguém notar.
        </Aviso>
      )}

      <Cartao titulo="Orçamentos abertos">
        {dados.funil.length === 0 ? (
          <Vazio
            titulo="Nenhum orçamento no funil"
            explicacao="Quando a sincronização trouxer orçamentos abertos, eles aparecem aqui em ordem de valor, com a chance de fechar e a próxima ação."
          />
        ) : (
          <ul className="crc-pilha">
            {dados.funil.map((f) => (
              <li key={f.id} className="crc-cartao-compacto">
                <div className="crc-linha" style={{ gap: "var(--crc-e2)", flexWrap: "wrap" }}>
                  <strong>{f.nome}</strong>
                  <Etiqueta tom={tomDaEtapa(f.etapa)}>{f.etapaRotulo}</Etiqueta>
                  {f.diasParado >= 30 && (
                    <Etiqueta tom="alerta">parado há {f.diasParado} dias</Etiqueta>
                  )}
                </div>
                <small className="crc-meta">
                  {reais(f.valor)}
                  {f.probabilidade !== null && (
                    <>
                      {" × "}
                      {pct(f.probabilidade)}
                      {" = "}
                      <strong>{reais(f.valorEsperado)}</strong>
                    </>
                  )}
                  {f.proximaAcao !== null && <> · {rotuloDaAcao(f.proximaAcao)}</>}
                </small>
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      <Cartao titulo="Por que não fecham">
        {dados.objecoes.length === 0 ? (
          <Vazio
            titulo="Nenhuma objeção registrada"
            explicacao="Quando alguém anotar o motivo que a pessoa deu para não fechar — nas palavras dela —, a contagem por categoria aparece aqui. Com desfecho suficiente, a taxa de conversão de cada motivo também."
          />
        ) : (
          <div className="crc-tabela-caixa">
            <table className="crc-tabela">
              <thead>
                <tr>
                  <th scope="col">Motivo</th>
                  <th scope="col" style={{ textAlign: "right" }}>
                    Quantas
                  </th>
                  <th scope="col" style={{ textAlign: "right" }}>
                    Converteu
                  </th>
                  <th scope="col" style={{ textAlign: "right" }}>
                    Em jogo
                  </th>
                </tr>
              </thead>
              <tbody>
                {dados.objecoes.map((o) => (
                  <tr key={o.categoria}>
                    <td>{ROTULO_DA_OBJECAO[o.categoria] ?? o.categoria}</td>
                    <td style={{ textAlign: "right" }}>{o.total}</td>
                    <td style={{ textAlign: "right" }}>
                      {/*
                        A TAXA NULA É ESCRITA, e não deixada em branco. Com três
                        objeções resolvidas, "33%" é ruído apresentado como
                        medida — e é o tipo de número que alguém leva para uma
                        reunião.
                      */}
                      {o.taxaDeConversao === null ? (
                        <span style={{ color: "var(--crc-texto-3)" }}>sem amostra</span>
                      ) : (
                        <strong>{pct(o.taxaDeConversao)}</strong>
                      )}
                    </td>
                    <td style={{ textAlign: "right", color: "var(--crc-texto-3)" }}>
                      {reais(o.valorEmJogo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>
    </>
  );
}

const ROTULO_DA_OBJECAO: Readonly<Record<string, string>> = {
  PRECO: "Achou caro",
  TEMPO: "Agora não dá",
  MEDO: "Medo do procedimento",
  TERCEIRO: "Depende de outra pessoa",
  CONVENIO: "Convênio ou pagamento",
  CONFIANCA: "Não se convenceu",
  OUTRO: "Outro",
};

const ROTULO_DA_ACAO: Readonly<Record<string, string>> = {
  AGENDAR: "marcar o tratamento",
  RETOMAR: "retomar a conversa",
  AGUARDAR: "aguardar a consulta",
  OFERECER_PARCELAMENTO: "mostrar as condições",
  FALAR_COM_DENTISTA: "rever o caso com o dentista",
  PASSAR_PARA_EQUIPE: "passar para a equipe",
  ENCERRAR: "encerrar",
};

function rotuloDaAcao(a: string): string {
  return ROTULO_DA_ACAO[a] ?? a.toLowerCase();
}

/**
 * O tom de cada etapa.
 *
 * "Aceitou e não marcou" é o único em alerta, e é deliberado: é a etapa mais
 * quente e a mais fácil de perder de vista. Colorir tudo faria nenhuma chamar
 * atenção.
 */
function tomDaEtapa(e: string): "neutra" | "positiva" | "alerta" | "perigo" | "info" {
  if (e === "ACCEPTED") return "alerta";
  if (e === "SCHEDULED") return "positiva";
  if (e === "PRICE_OBJECTION" || e === "FEAR_OBJECTION") return "info";
  return "neutra";
}

const reais = (v: number): string =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const pct = (v: number): string => `${String(Math.round(v * 100))}%`;
