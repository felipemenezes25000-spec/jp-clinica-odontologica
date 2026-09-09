/**
 * O painel do gestor — Milestone 9, itens 34 e 277.
 *
 * SEPARADO DA HOME DE PROPÓSITO (item 182). A Home responde "o que eu faço
 * agora?"; esta tela responde "quanto essa operação está recuperando?". São
 * duas perguntas de duas pessoas diferentes, e juntá-las produz uma tela que
 * não serve bem a nenhuma das duas.
 *
 * A DECISÃO MAIS IMPORTANTE DESTA TELA É O RÓTULO DO NÚMERO GRANDE.
 * Enquanto não houver registro financeiro confirmado, ele se chama "valor
 * potencial" e a tela DIZ que é potencial. O item 63 é explícito, e a tentação
 * de chamar de receita é real justamente porque o número fica mais bonito.
 *
 * OS GRÁFICOS SÃO CSS PURO, sem biblioteca. O item 150 (performance budget)
 * pesou: uma suíte de charts para desenhar seis barras e um funil custaria
 * centenas de kilobytes num painel que alguém abre uma vez por semana. Barra
 * proporcional é altura em porcentagem, e o resultado é acessível porque cada
 * valor também aparece como texto ao lado — um gráfico que só existe como forma
 * é invisível para quem usa leitor de tela.
 */
import { useEffect, useState } from "react";

import { carregarPanorama, exportarCsv, type PanoramaDto } from "@/lib/crc/api";
import { dinheiro, dinheiroCurto, porcentagem } from "@/lib/crc/dominio/formatar";
import { MOTIVOS_PERDA } from "@/lib/crc/dominio/rotulos";

import { Aviso, BarraDeRecado, Botao, Cartao, Esqueleto, Kpi, Vazio, useAcao } from "./base";
import { Investimento } from "./Investimento";

export function Gestao({
  podeExportar,
  podeVerFinanceiro,
}: {
  podeExportar: boolean;
  podeVerFinanceiro: boolean;
}) {
  const [panorama, setPanorama] = useState<PanoramaDto | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const acao = useAcao();

  /**
   * Baixa o CSV.
   *
   * O arquivo é montado no SERVIDOR e desce como texto; o navegador só o
   * embrulha num Blob e dispara o download. Montar no cliente exigiria trazer
   * as linhas todas para a tela primeiro — o que contorna o filtro de
   * permissão que o servidor aplica, e é justamente o que o item 129 proíbe.
   */
  const exportar = (escopo: string): void => {
    void acao.executar(
      () => exportarCsv({ data: { escopo } }),
      (r) => {
        const blob = new Blob([r.conteudo], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = r.nomeArquivo;
        link.click();
        // Sem o revoke, cada exportação deixa o arquivo inteiro preso na
        // memória da aba até ela ser fechada.
        URL.revokeObjectURL(url);
      },
      "Arquivo gerado.",
    );
  };

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const r = await carregarPanorama();
        if (!vivo) return;
        if (r.ok) setPanorama(r.panorama);
        else setErro(r.message);
      } catch {
        if (vivo) setErro("Não conseguimos carregar o painel agora. Tente atualizar a página.");
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  if (erro !== null) return <Aviso tom="perigo">{erro}</Aviso>;

  if (panorama === null) {
    return (
      <>
        <div className="crc-grade" style={{ marginBottom: "var(--crc-e6)" }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="crc-kpi">
              <Esqueleto altura={12} largura="60%" />
              <div style={{ height: "var(--crc-e2)" }} />
              <Esqueleto altura={26} largura="45%" />
            </div>
          ))}
        </div>
        <Esqueleto altura={220} />
      </>
    );
  }

  const p = panorama;
  const semFinanceiro = p.semFinanceiroConfirmado;

  return (
    <>
      <BarraDeRecado recado={acao.recado} aoFechar={acao.limpar} />

      {podeExportar && (
        <div
          className="crc-linha"
          style={{ justifyContent: "flex-end", marginBottom: "var(--crc-e4)" }}
        >
          <span className="crc-meta">Exportar:</span>
          <Botao
            pequeno
            carregando={acao.rodando}
            onClick={() => {
              exportar("pacientes");
            }}
          >
            Pacientes
          </Botao>
          <Botao
            pequeno
            carregando={acao.rodando}
            onClick={() => {
              exportar("oportunidades");
            }}
          >
            Oportunidades
          </Botao>
          <Botao
            pequeno
            carregando={acao.rodando}
            onClick={() => {
              exportar("tarefas");
            }}
          >
            Tarefas
          </Botao>
        </div>
      )}

      {/*
        Item 63 em forma de aviso. Enquanto não houver integração financeira, o
        gestor precisa saber que está lendo POTENCIAL — senão ele leva o número
        para uma reunião como se fosse caixa.
      */}
      {semFinanceiro && (
        <div style={{ marginBottom: "var(--crc-e5)" }}>
          <Aviso tom="info">
            Ainda não há pagamento registrado no sistema, então os valores abaixo são{" "}
            <strong>potenciais</strong>: somam orçamentos e parcelas em aberto ligados a
            oportunidades recuperadas. Assim que os pagamentos passarem a ser registrados, a tela
            separa o que foi de fato recebido.
          </Aviso>
        </div>
      )}

      <div className="crc-grade" style={{ marginBottom: "var(--crc-e8)" }}>
        <Kpi
          rotulo={semFinanceiro ? "Valor potencial recuperado" : "Receita recuperada"}
          valor={dinheiroCurto(semFinanceiro ? p.valorPotencial : p.receitaConfirmada)}
          nota={`Em ${p.periodo}`}
        />
        <Kpi
          rotulo="Consultas recuperadas"
          valor={p.consultasRecuperadas.toLocaleString("pt-BR")}
          nota={`${p.pacientesReativados.toLocaleString("pt-BR")} pacientes diferentes`}
        />
        <Kpi
          rotulo="Oportunidades abertas"
          valor={p.oportunidadesAbertas.toLocaleString("pt-BR")}
          nota={`${dinheiroCurto(p.valorEmAberto)} em jogo`}
        />
        <Kpi
          rotulo="Resposta ao lead novo"
          valor={p.lead.medianaMinutos === null ? "—" : `${String(p.lead.medianaMinutos)} min`}
          nota={
            p.lead.leads === 0
              ? "Nenhum lead no período"
              : `${String(p.lead.ateCincoMinutos)} de ${String(p.lead.leads)} em até 5 min`
          }
        />
      </div>

      <div className="crc-pilha">
        <Cartao titulo="Recuperação por mês">
          <SerieMensal serie={p.serieReceita} semFinanceiro={semFinanceiro} />
        </Cartao>

        <Cartao titulo={`Funil de ${p.periodo}`}>
          <Funil etapas={p.funil} />
        </Cartao>

        <Cartao titulo="Onde estamos perdendo">
          {p.perdas.length === 0 ? (
            <Vazio
              titulo="Nenhuma perda registrada no período."
              explicacao="Toda oportunidade fechada como perdida exige um motivo. Quando houver, os motivos aparecem aqui ordenados por frequência."
            />
          ) : (
            <Perdas perdas={p.perdas} />
          )}
        </Cartao>

        <Cartao titulo="Desempenho das automações">
          {p.automacoes.length === 0 ? (
            <Vazio
              titulo="Nenhuma automação instalada."
              explicacao="As automações são criadas na instalação e começam em simulação."
            />
          ) : (
            <TabelaAutomacoes automacoes={p.automacoes} />
          )}
        </Cartao>

        <Cartao titulo="Trabalho da equipe">
          {p.atendentes.length === 0 ? (
            <Vazio
              titulo="Nenhuma atividade registrada no período."
              explicacao="Este quadro mostra carga e distribuição — quem está afogado e quem tem espaço. Ele não é um ranking."
            />
          ) : (
            <TabelaAtendentes atendentes={p.atendentes} />
          )}
        </Cartao>

        {/* O custo por paciente fecha o painel de propósito: ele só faz sentido
            depois de a pessoa ter visto o funil e o desempenho acima. Fora do
            contexto, "R$ 118 por paciente" não diz se é bom ou ruim. */}
        {podeVerFinanceiro && <Investimento />}
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Série mensal                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Barras verticais proporcionais.
 *
 * A grade com `minmax(0, 1fr)` por coluna faz o gráfico acompanhar a largura
 * sem media query, e o `minmax(0, ...)` é o que impede um valor longo esticar a
 * coluna além da viewport.
 *
 * Cada barra carrega `role="img"` com o valor por extenso: a altura comunica a
 * comparação para quem vê, e o rótulo comunica o número para quem não vê.
 */
function SerieMensal({
  serie,
  semFinanceiro,
}: {
  serie: PanoramaDto["serieReceita"];
  semFinanceiro: boolean;
}) {
  const valores = serie.map((m) => Number.parseFloat(semFinanceiro ? m.potencial : m.confirmada));
  const maior = Math.max(...valores, 1);

  if (valores.every((v) => v === 0)) {
    return (
      <Vazio
        titulo="Nenhuma recuperação registrada ainda."
        explicacao="Quando um paciente com oportunidade aberta comparecer a uma consulta, o valor aparece aqui."
      />
    );
  }

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${String(serie.length)}, minmax(0, 1fr))`,
          gap: "var(--crc-e3)",
          alignItems: "end",
          height: 180,
        }}
      >
        {serie.map((mes, i) => {
          const valor = valores[i] ?? 0;
          const altura = Math.max(2, (valor / maior) * 100);
          return (
            <div
              key={mes.rotulo}
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
                height: "100%",
              }}
            >
              <span
                className="crc-meta crc-numero"
                style={{ textAlign: "center", marginBottom: 4, fontWeight: 600 }}
              >
                {valor === 0 ? "—" : dinheiroCurto(String(valor))}
              </span>
              <div
                style={{
                  height: `${String(altura)}%`,
                  background: "var(--crc-primaria)",
                  borderRadius: "6px 6px 0 0",
                  minHeight: 2,
                }}
                // O valor também vai como texto acessível: um gráfico que só
                // existe como forma é invisível para leitor de tela.
                role="img"
                aria-label={`${mes.rotulo}: ${dinheiro(String(valor))}`}
              />
            </div>
          );
        })}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${String(serie.length)}, minmax(0, 1fr))`,
          gap: "var(--crc-e3)",
          marginTop: "var(--crc-e2)",
        }}
      >
        {serie.map((m) => (
          <span key={m.rotulo} className="crc-meta" style={{ textAlign: "center" }}>
            {m.rotulo}
          </span>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Funil                                                                      */
/* -------------------------------------------------------------------------- */

function Funil({ etapas }: { etapas: PanoramaDto["funil"] }) {
  const topo = etapas[0]?.quantidade ?? 0;

  if (topo === 0) {
    return (
      <Vazio
        titulo="Nenhuma oportunidade no período."
        explicacao="O funil se preenche conforme as oportunidades avançam: contatadas, responderam, agendaram, compareceram."
      />
    );
  }

  return (
    <div className="crc-pilha" style={{ gap: "var(--crc-e3)" }}>
      {etapas.map((e) => {
        const largura = topo > 0 ? Math.max(2, (e.quantidade / topo) * 100) : 0;
        return (
          <div key={e.chave}>
            <div className="crc-linha" style={{ gap: "var(--crc-e2)" }}>
              <span style={{ fontSize: "0.9375rem", fontWeight: 500 }}>{e.rotulo}</span>
              <span className="crc-meta crc-empurra crc-numero">
                {e.quantidade.toLocaleString("pt-BR")}
                {/*
                  `null` significa "sem base para comparar", e não "0%". A
                  distinção evita a tela afirmar queda onde não há dado.
                */}
                {e.conversao !== null && (
                  <span style={{ marginLeft: "var(--crc-e2)", color: "var(--crc-texto-3)" }}>
                    {porcentagem(e.quantidade, Math.round(e.quantidade / e.conversao))} da etapa
                    anterior
                  </span>
                )}
              </span>
            </div>
            <div
              style={{
                height: 10,
                background: "var(--crc-superficie-3)",
                borderRadius: 999,
                marginTop: 4,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${String(largura)}%`,
                  height: "100%",
                  background: "var(--crc-primaria)",
                  borderRadius: 999,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Tabelas                                                                    */
/* -------------------------------------------------------------------------- */

const ROTULO_PERDA = new Map<string, string>(MOTIVOS_PERDA.map((m) => [m.chave, m.rotulo]));

function Perdas({ perdas }: { perdas: PanoramaDto["perdas"] }) {
  const total = perdas.reduce((s, p) => s + p.quantidade, 0);

  return (
    <div className="crc-tabela-caixa">
      <table className="crc-tabela">
        <thead>
          <tr>
            <th scope="col">Motivo</th>
            <th scope="col">Quantas</th>
            <th scope="col">Participação</th>
            <th scope="col">Valor potencial perdido</th>
          </tr>
        </thead>
        <tbody>
          {perdas.map((p) => (
            <tr key={p.motivo}>
              <td>{ROTULO_PERDA.get(p.motivo) ?? p.motivo}</td>
              <td className="crc-numero">{p.quantidade.toLocaleString("pt-BR")}</td>
              <td className="crc-numero">{porcentagem(p.quantidade, total)}</td>
              <td className="crc-numero">{dinheiro(p.valorPerdido)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TabelaAutomacoes({ automacoes }: { automacoes: PanoramaDto["automacoes"] }) {
  return (
    <div className="crc-tabela-caixa">
      <table className="crc-tabela">
        <thead>
          <tr>
            <th scope="col">Automação</th>
            <th scope="col">Em jornada</th>
            <th scope="col">Terminaram</th>
            {/* A métrica que importa — item 261. */}
            <th scope="col">Agendaram por causa dela</th>
            <th scope="col">Conversão</th>
          </tr>
        </thead>
        <tbody>
          {automacoes.map((a) => (
            <tr key={a.automationId}>
              <td>{a.nome}</td>
              <td className="crc-numero">{a.emJornada.toLocaleString("pt-BR")}</td>
              <td className="crc-numero">{a.concluidas.toLocaleString("pt-BR")}</td>
              <td className="crc-numero" style={{ fontWeight: 600, color: "var(--crc-primaria)" }}>
                {a.saiuPorConversao.toLocaleString("pt-BR")}
              </td>
              <td className="crc-numero">
                {a.taxa === null ? "—" : porcentagem(a.saiuPorConversao, a.concluidas)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TabelaAtendentes({ atendentes }: { atendentes: PanoramaDto["atendentes"] }) {
  return (
    <>
      <p className="crc-corpo" style={{ marginBottom: "var(--crc-e4)" }}>
        Carga e distribuição do período. Não é ranking: contagem de tarefa concluída é fácil de
        inflar e não tem relação direta com paciente recuperado.
      </p>
      <div className="crc-tabela-caixa">
        <table className="crc-tabela">
          <thead>
            <tr>
              <th scope="col">Pessoa</th>
              <th scope="col">Tarefas concluídas</th>
              <th scope="col">Mensagens enviadas</th>
              <th scope="col">Oportunidades fechadas</th>
            </tr>
          </thead>
          <tbody>
            {atendentes.map((a) => (
              <tr key={a.userId}>
                <td>{a.nome}</td>
                <td className="crc-numero">{a.tarefasConcluidas.toLocaleString("pt-BR")}</td>
                <td className="crc-numero">{a.mensagensEnviadas.toLocaleString("pt-BR")}</td>
                <td className="crc-numero">{a.oportunidadesGanhas.toLocaleString("pt-BR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
