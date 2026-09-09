/**
 * Quanto custou cada paciente que sentou na cadeira.
 *
 * A TELA EXISTE PARA UMA PERGUNTA SÓ: qual campanha manter e qual pausar. Tudo
 * o que não ajuda a responder isso ficou de fora.
 *
 * TRÊS DECISÕES:
 *
 *   O NÚMERO EM DESTAQUE É O DO FIM DA CADEIA — custo por paciente que
 *   compareceu. Custo por clique e custo por contato aparecem no caminho
 *   porque explicam o resultado, mas destacá-los ensinaria a otimizar a métrica
 *   errada: um anúncio com cem contatos baratos e nenhum comparecimento é mais
 *   caro que um com dez caros e cinco na cadeira.
 *
 *   SEM GASTO LANÇADO, A TELA PEDE O GASTO. Não mostra R$ 0,00 e não mostra
 *   custo por paciente de zero reais — que seria a leitura mais perigosa
 *   possível. Enquanto ninguém lançar, ela diz o que falta.
 *
 *   O RATEIO POR CAMPANHA É CHAMADO DE ESTIMATIVA, na própria tela. O total é
 *   contagem; a divisão por campanha é proporcional aos leads. Quem lê precisa
 *   saber qual dos dois está olhando.
 */
import { useCallback, useEffect, useState } from "react";

import { carregarInvestimento, lancarInvestimentoDoMes, type InvestimentoDto } from "@/lib/crc/api";
import { dinheiro } from "@/lib/crc/dominio/formatar";

import {
  Aviso,
  BarraDeRecado,
  Botao,
  Campo,
  Cartao,
  Entrada,
  ListaEsqueleto,
  Modal,
  useAcao,
} from "./base";

const CANAIS: { valor: string; rotulo: string }[] = [
  { valor: "GOOGLE", rotulo: "Google Ads" },
  { valor: "META", rotulo: "Meta (Instagram/Facebook)" },
  { valor: "OUTRO", rotulo: "Outro" },
];

/** `2026-09-01` → `setembro de 2026`. */
function mesPorExtenso(iso: string): string {
  const t = Date.parse(`${iso.slice(0, 10)}T12:00:00.000Z`);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleDateString("pt-BR", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });
}

function mesCorrente(): string {
  const hoje = new Date();
  return `${String(hoje.getFullYear())}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
}

export function Investimento() {
  const [dados, setDados] = useState<InvestimentoDto | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [lancando, setLancando] = useState(false);

  const [mes, setMes] = useState(mesCorrente());
  const [campanha, setCampanha] = useState("");
  const [canal, setCanal] = useState("GOOGLE");
  const [valor, setValor] = useState("");

  const acao = useAcao();

  const recarregar = useCallback(async (): Promise<void> => {
    try {
      const r = await carregarInvestimento({ data: {} });
      if (r.ok) {
        setDados(r.investimento);
        setErro(null);
      } else {
        setErro(r.message);
      }
    } catch {
      setErro("Não conseguimos carregar os números de investimento.");
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const lancar = useCallback(async (): Promise<void> => {
    // A vírgula é como se digita dinheiro em português. Aceitar só ponto faria
    // "3.900,00" virar um número errado sem ninguém perceber.
    const numero = Number.parseFloat(valor.replace(/\./gu, "").replace(",", "."));
    await acao.executar(
      () =>
        lancarInvestimentoDoMes({
          data: { mes, campanha, canal, valor: numero, observacao: "" },
        }),
      () => {
        setLancando(false);
        setCampanha("");
        setValor("");
        void recarregar();
      },
      "Investimento lançado.",
    );
  }, [acao, campanha, canal, mes, recarregar, valor]);

  if (erro !== null && dados === null) return <Aviso tom="perigo">{erro}</Aviso>;
  if (dados === null) return <ListaEsqueleto linhas={3} />;

  const compareceram = dados.etapas.find((e) => e.chave === "compareceram");

  return (
    <>
      <BarraDeRecado recado={acao.recado} aoFechar={acao.limpar} />

      <Cartao
        titulo="Quanto custou cada paciente"
        acao={
          <Botao
            variante="primario"
            onClick={() => {
              setLancando(true);
            }}
          >
            Lançar investimento
          </Botao>
        }
      >
        {!dados.temInvestimento ? (
          <Aviso tom="info">
            Nenhum investimento lançado para {mesPorExtenso(dados.periodo)}. Lance quanto foi gasto
            em anúncios e esta tela passa a mostrar o custo por paciente — sem isso, não dá para
            dizer se uma campanha saiu cara ou barata.
          </Aviso>
        ) : (
          <>
            <div className="crc-grade">
              <div className="crc-kpi">
                <span className="crc-kpi-rotulo">Investido no mês</span>
                <span className="crc-kpi-valor">{dinheiro(dados.investido)}</span>
                <span className="crc-kpi-nota">{mesPorExtenso(dados.periodo)}</span>
              </div>
              <div className="crc-kpi">
                <span className="crc-kpi-rotulo">Custo por paciente na cadeira</span>
                <span className="crc-kpi-valor">
                  {compareceram?.custoUnitario === null || compareceram === undefined
                    ? "—"
                    : dinheiro(compareceram.custoUnitario)}
                </span>
                <span className="crc-kpi-nota">
                  {compareceram === undefined
                    ? ""
                    : `${String(compareceram.quantidade)} compareceram`}
                </span>
              </div>
            </div>

            <h3 className="crc-titulo-cartao" style={{ marginTop: "var(--crc-e5)" }}>
              A cadeia, etapa por etapa
            </h3>
            <ul className="crc-pilha" style={{ gap: "var(--crc-e2)", marginTop: "var(--crc-e2)" }}>
              {dados.etapas.map((e) => (
                <li key={e.chave} className="crc-cartao-compacto">
                  <div className="crc-linha">
                    <strong style={{ flex: 1 }}>{e.rotulo}</strong>
                    <span className="crc-numero">{e.quantidade}</span>
                    <span className="crc-meta">
                      {e.custoUnitario === null ? "—" : `${dinheiro(e.custoUnitario)} cada`}
                    </span>
                  </div>
                </li>
              ))}
            </ul>

            {dados.campanhas.length > 0 && (
              <>
                <h3 className="crc-titulo-cartao" style={{ marginTop: "var(--crc-e5)" }}>
                  Por campanha
                </h3>
                <p className="crc-meta">
                  O total acima é contagem. A divisão por campanha é <strong>estimativa</strong>: o
                  comparecimento é rateado pela participação de cada campanha nos leads do mês.
                </p>
                <ul
                  className="crc-pilha"
                  style={{ gap: "var(--crc-e2)", marginTop: "var(--crc-e3)" }}
                >
                  {dados.campanhas.map((c) => (
                    <li key={c.campanha} className="crc-cartao-compacto">
                      <div className="crc-linha">
                        <strong style={{ flex: 1 }}>{c.campanha}</strong>
                        <span className="crc-meta">{dinheiro(c.investido)} investidos</span>
                        <span className="crc-meta">{c.leads} contatos</span>
                        <span className="crc-meta">~{c.compareceram} na cadeira</span>
                        <strong>
                          {c.custoPorPaciente === null
                            ? "—"
                            : `${dinheiro(c.custoPorPaciente)} / paciente`}
                        </strong>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </Cartao>

      {dados.lancamentos.length > 0 && (
        <Cartao titulo="Lançamentos">
          <p className="crc-meta" style={{ marginBottom: "var(--crc-e3)" }}>
            Lançar o mesmo mês e a mesma campanha de novo <strong>atualiza</strong> o valor, em vez
            de somar outra linha.
          </p>
          <ul className="crc-pilha" style={{ gap: "var(--crc-e1)" }}>
            {dados.lancamentos.map((l) => (
              <li key={l.id} className="crc-cartao-compacto">
                <div className="crc-linha">
                  <strong style={{ flex: 1 }}>{l.campanha}</strong>
                  <span className="crc-meta">{mesPorExtenso(l.mes)}</span>
                  <span className="crc-meta">{l.canal}</span>
                  <strong>{dinheiro(l.valor)}</strong>
                </div>
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      <Modal
        titulo="Lançar investimento"
        aberto={lancando}
        aoFechar={() => {
          setLancando(false);
        }}
        rodape={
          <>
            <Botao
              onClick={() => {
                setLancando(false);
              }}
            >
              Cancelar
            </Botao>
            <Botao
              variante="primario"
              carregando={acao.rodando}
              disabled={valor.trim().length === 0}
              onClick={() => {
                void lancar();
              }}
            >
              Lançar
            </Botao>
          </>
        }
      >
        <Campo rotulo="Mês" dica="O mês em que o dinheiro foi gasto.">
          {(id) => (
            <Entrada
              id={id}
              type="month"
              value={mes}
              onChange={(e) => {
                setMes(e.target.value);
              }}
            />
          )}
        </Campo>

        <Campo
          rotulo="Campanha"
          dica="O mesmo nome que está no utm_campaign do anúncio. Em branco, entra como “geral”."
        >
          {(id) => (
            <Entrada
              id={id}
              value={campanha}
              maxLength={120}
              placeholder="implantes-zona-norte"
              onChange={(e) => {
                setCampanha(e.target.value);
              }}
            />
          )}
        </Campo>

        <Campo rotulo="Canal">
          {(id) => (
            <select
              id={id}
              className="crc-selecao"
              value={canal}
              onChange={(e) => {
                setCanal(e.target.value);
              }}
            >
              {CANAIS.map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.rotulo}
                </option>
              ))}
            </select>
          )}
        </Campo>

        <Campo rotulo="Valor investido" dica="Pode usar vírgula: 3.900,00">
          {(id) => (
            <Entrada
              id={id}
              inputMode="decimal"
              value={valor}
              placeholder="3.900,00"
              onChange={(e) => {
                setValor(e.target.value);
              }}
            />
          )}
        </Campo>
      </Modal>
    </>
  );
}
