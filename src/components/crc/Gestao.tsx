import { useEffect, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  CircleDollarSign,
  Gauge,
  Sparkles,
  Target,
  TrendingUp,
  UsersRound,
} from "lucide-react";

import { carregarPanorama, exportarCsv, type PanoramaDto } from "@/lib/crc/api";
import { dinheiro, dinheiroCurto, porcentagem } from "@/lib/crc/dominio/formatar";
import { MOTIVOS_PERDA } from "@/lib/crc/dominio/rotulos";

import { Aviso, BarraDeRecado, Botao, Esqueleto, Vazio, useAcao } from "./base";
import { Briefing } from "./Briefing";
import { Investimento } from "./Investimento";
import "./crc-management.css";

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
      <div className="crc-gestao-v2">
        <div className="crc-gestao-kpis-v2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="crc-gestao-kpi-v2">
              <Esqueleto altura={14} largura="62%" />
              <Esqueleto altura={34} largura="42%" />
            </div>
          ))}
        </div>
        <Esqueleto altura={300} />
      </div>
    );
  }

  const p = panorama;
  const semFinanceiro = p.semFinanceiroConfirmado;

  return (
    <div className="crc-gestao-v2">
      <BarraDeRecado recado={acao.recado} aoFechar={acao.limpar} />

      <section className="crc-gestao-command-v2">
        <div>
          <div className="crc-gestao-kicker-v2">
            <Sparkles size={14} aria-hidden="true" /> Performance real da operação
          </div>
          <h2>O que o CRC está recuperando — e onde estamos perdendo.</h2>
          <p>
            Resultado, conversão, velocidade e carga da equipe no mesmo painel. Sem misturar valor
            potencial com dinheiro efetivamente recebido.
          </p>
        </div>
        {podeExportar && (
          <div className="crc-gestao-exportar-v2">
            <span>
              <ArrowDownToLine aria-hidden="true" /> Exportar
            </span>
            <Botao pequeno carregando={acao.rodando} onClick={() => exportar("pacientes")}>
              Pacientes
            </Botao>
            <Botao pequeno carregando={acao.rodando} onClick={() => exportar("oportunidades")}>
              Oportunidades
            </Botao>
            <Botao pequeno carregando={acao.rodando} onClick={() => exportar("tarefas")}>
              Tarefas
            </Botao>
          </div>
        )}
      </section>

      {semFinanceiro && (
        <Aviso tom="info">
          Ainda não há pagamento confirmado no sistema. Os valores financeiros abaixo são{" "}
          <strong>potenciais</strong>, não receita realizada.
        </Aviso>
      )}

      {/*
        O BRIEFING VEM ANTES DOS KPIs, e a ordem é a da pergunta que se faz de
        manhã: primeiro "o que mudou e o que preciso saber hoje", depois "quanto
        isso já produziu". Os KPIs acumulam meses; o briefing é de hoje, e um
        número de hoje embaixo de um acumulado de trimestre não é lido.
      */}
      <Briefing />

      <section className="crc-gestao-kpis-v2" aria-label="Indicadores principais">
        <KpiGestao
          icone={CircleDollarSign}
          rotulo={semFinanceiro ? "Valor potencial recuperado" : "Receita recuperada"}
          valor={dinheiroCurto(semFinanceiro ? p.valorPotencial : p.receitaConfirmada)}
          nota={`Em ${p.periodo}`}
          destaque
        />
        <KpiGestao
          icone={Target}
          rotulo="Consultas recuperadas"
          valor={p.consultasRecuperadas.toLocaleString("pt-BR")}
          nota={`${p.pacientesReativados.toLocaleString("pt-BR")} pacientes diferentes`}
        />
        <KpiGestao
          icone={TrendingUp}
          rotulo="Oportunidades abertas"
          valor={p.oportunidadesAbertas.toLocaleString("pt-BR")}
          nota={`${dinheiroCurto(p.valorEmAberto)} em jogo`}
        />
        <KpiGestao
          icone={Gauge}
          rotulo="Resposta ao lead novo"
          valor={p.lead.medianaMinutos === null ? "—" : `${String(p.lead.medianaMinutos)} min`}
          nota={
            p.lead.leads === 0
              ? "Nenhum lead no período"
              : `${String(p.lead.ateCincoMinutos)} de ${String(p.lead.leads)} em até 5 min`
          }
        />
      </section>

      <section className="crc-gestao-grid-v2">
        <Painel
          titulo="Recuperação por mês"
          sobretitulo="Tendência"
          icone={TrendingUp}
          classe="crc-gestao-painel-grafico-v2"
        >
          <SerieMensal serie={p.serieReceita} semFinanceiro={semFinanceiro} />
        </Painel>
        <Painel titulo={`Funil de ${p.periodo}`} sobretitulo="Conversão" icone={Activity}>
          <Funil etapas={p.funil} />
        </Painel>
      </section>

      <section className="crc-gestao-grid-v2">
        <Painel titulo="Onde estamos perdendo" sobretitulo="Diagnóstico" icone={Target}>
          {p.perdas.length === 0 ? (
            <Vazio
              titulo="Nenhuma perda registrada no período."
              explicacao="Toda oportunidade fechada como perdida exige um motivo. Quando houver, os motivos aparecem aqui ordenados por frequência."
            />
          ) : (
            <Perdas perdas={p.perdas} />
          )}
        </Painel>
        <Painel
          titulo="Desempenho das automações"
          sobretitulo="Resultado automático"
          icone={Sparkles}
        >
          {p.automacoes.length === 0 ? (
            <Vazio
              titulo="Nenhuma automação instalada."
              explicacao="As automações são criadas na instalação e começam em simulação."
            />
          ) : (
            <TabelaAutomacoes automacoes={p.automacoes} />
          )}
        </Painel>
      </section>

      <Painel titulo="Trabalho da equipe" sobretitulo="Distribuição de carga" icone={UsersRound}>
        {p.atendentes.length === 0 ? (
          <Vazio
            titulo="Nenhuma atividade registrada no período."
            explicacao="Este quadro mostra carga e distribuição — quem está afogado e quem tem espaço. Ele não é um ranking."
          />
        ) : (
          <TabelaAtendentes atendentes={p.atendentes} />
        )}
      </Painel>

      {podeVerFinanceiro && <Investimento />}
    </div>
  );
}

function KpiGestao({
  icone: Icone,
  rotulo,
  valor,
  nota,
  destaque = false,
}: {
  icone: typeof Activity;
  rotulo: string;
  valor: string;
  nota: string;
  destaque?: boolean;
}) {
  return (
    <article className={`crc-gestao-kpi-v2${destaque ? " crc-gestao-kpi-destaque-v2" : ""}`}>
      <span>
        <Icone aria-hidden="true" />
      </span>
      <div>
        <small>{rotulo}</small>
        <strong>{valor}</strong>
        <em>{nota}</em>
      </div>
    </article>
  );
}

function Painel({
  titulo,
  sobretitulo,
  icone: Icone,
  classe = "",
  children,
}: {
  titulo: string;
  sobretitulo: string;
  icone: typeof Activity;
  classe?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`crc-gestao-painel-v2 ${classe}`}>
      <header>
        <span>
          <Icone aria-hidden="true" />
        </span>
        <div>
          <small>{sobretitulo}</small>
          <h2>{titulo}</h2>
        </div>
      </header>
      <div className="crc-gestao-painel-corpo-v2">{children}</div>
    </section>
  );
}

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
    <div
      className="crc-gestao-serie-v2"
      style={{ gridTemplateColumns: `repeat(${String(serie.length)}, minmax(0, 1fr))` }}
    >
      {serie.map((mes, i) => {
        const valor = valores[i] ?? 0;
        const altura = Math.max(3, (valor / maior) * 100);
        return (
          <div key={mes.rotulo} className="crc-gestao-serie-coluna-v2">
            <span>{valor === 0 ? "—" : dinheiroCurto(String(valor))}</span>
            <div className="crc-gestao-serie-trilho-v2">
              <i
                style={{ height: `${String(altura)}%` }}
                role="img"
                aria-label={`${mes.rotulo}: ${dinheiro(String(valor))}`}
              />
            </div>
            <small>{mes.rotulo}</small>
          </div>
        );
      })}
    </div>
  );
}

function Funil({ etapas }: { etapas: PanoramaDto["funil"] }) {
  const topo = etapas[0]?.quantidade ?? 0;
  if (topo === 0)
    return (
      <Vazio
        titulo="Nenhuma oportunidade no período."
        explicacao="O funil se preenche conforme as oportunidades avançam: contatadas, responderam, agendaram, compareceram."
      />
    );

  return (
    <div className="crc-gestao-funil-v2">
      {etapas.map((e) => {
        const largura = topo > 0 ? Math.max(2, (e.quantidade / topo) * 100) : 0;
        return (
          <div key={e.chave}>
            <div className="crc-gestao-funil-topo-v2">
              <span>{e.rotulo}</span>
              <strong>{e.quantidade.toLocaleString("pt-BR")}</strong>
              {e.conversao !== null && (
                <em>
                  {porcentagem(e.quantidade, Math.round(e.quantidade / e.conversao))} da anterior
                </em>
              )}
            </div>
            <div className="crc-gestao-funil-trilho-v2">
              <i style={{ width: `${String(largura)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const ROTULO_PERDA = new Map<string, string>(MOTIVOS_PERDA.map((m) => [m.chave, m.rotulo]));

function Perdas({ perdas }: { perdas: PanoramaDto["perdas"] }) {
  const total = perdas.reduce((s, p) => s + p.quantidade, 0);
  return (
    <div className="crc-tabela-caixa">
      <table className="crc-tabela">
        <thead>
          <tr>
            <th>Motivo</th>
            <th>Quantas</th>
            <th>Participação</th>
            <th>Valor potencial perdido</th>
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
            <th>Automação</th>
            <th>Em jornada</th>
            <th>Terminaram</th>
            <th>Agendaram</th>
            <th>Conversão</th>
          </tr>
        </thead>
        <tbody>
          {automacoes.map((a) => (
            <tr key={a.automationId}>
              <td>{a.nome}</td>
              <td className="crc-numero">{a.emJornada.toLocaleString("pt-BR")}</td>
              <td className="crc-numero">{a.concluidas.toLocaleString("pt-BR")}</td>
              <td className="crc-numero crc-gestao-positivo-v2">
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
      <p className="crc-gestao-nota-v2">
        Carga e distribuição do período. Não é ranking: volume de tarefa concluída não mede sozinho
        paciente recuperado.
      </p>
      <div className="crc-tabela-caixa">
        <table className="crc-tabela">
          <thead>
            <tr>
              <th>Pessoa</th>
              <th>Tarefas concluídas</th>
              <th>Mensagens enviadas</th>
              <th>Oportunidades fechadas</th>
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
