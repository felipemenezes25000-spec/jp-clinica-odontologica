import { useEffect, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Bot,
  CalendarCheck2,
  CircleDollarSign,
  Clock3,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";

import { carregarHome, type ItemPrioridade, type ResumoHome } from "@/lib/crc/api";
import {
  dinheiro,
  dinheiroCurto,
  frescor,
  plural,
  tempoRelativo,
} from "@/lib/crc/dominio/formatar";

import { FitaDoDia, Porque, Pulso, type RazaoDaNota } from "./assinatura";
import { Aviso, Botao, Cartao, Esqueleto, Etiqueta, ListaEsqueleto, Vazio } from "./base";

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
        if (vivo) setErro("Não conseguimos carregar sua fila agora. Tente atualizar a página.");
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  if (erro !== null) return <Aviso tom="perigo">{erro}</Aviso>;

  if (resumo === null) {
    return (
      <div className="crc-home-v2">
        <div className="crc-home-hero crc-home-hero-loading">
          <Esqueleto altura={18} largura="24%" />
          <Esqueleto altura={52} largura="56%" />
          <Esqueleto altura={16} largura="68%" />
        </div>
        <div className="crc-home-metricas">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="crc-home-metrica">
              <Esqueleto altura={13} largura="58%" />
              <Esqueleto altura={34} largura="34%" />
            </div>
          ))}
        </div>
        <ListaEsqueleto linhas={5} />
      </div>
    );
  }

  const primeiroNome = nomeUsuario.trim().split(/\s+/u)[0] ?? "";
  const temTrabalho = resumo.precisamDeAtencao > 0;
  const valorEhReceita = Number.parseFloat(resumo.receitaConfirmada) > 0;
  const valorRecuperado = valorEhReceita ? resumo.receitaConfirmada : resumo.valorPotencialRecuperado;
  const prioridadeAlta = resumo.prioridades.filter((p) => p.faixa === "ALTA").length;

  return (
    <div className="crc-home-v2">
      <section className="crc-home-hero">
        <div className="crc-home-hero-copy">
          <div className="crc-home-kicker">
            <Sparkles size={14} aria-hidden="true" />
            Central operacional
          </div>
          <h1 className="crc-home-titulo">
            {resumo.saudacao}
            {primeiroNome.length > 0 ? `, ${primeiroNome}` : ""}.
          </h1>
          <p className="crc-home-resumo">
            {temTrabalho ? (
              <>
                <strong>{plural(resumo.precisamDeAtencao, "paciente precisa", "pacientes precisam")}</strong>{" "}
                da sua atenção agora.
              </>
            ) : (
              <>Sua fila humana está limpa agora.</>
            )}{" "}
            {resumo.emAutomacao > 0 && (
              <>A automação está trabalhando outros {resumo.emAutomacao.toLocaleString("pt-BR")} casos.</>
            )}
          </p>

          <div className="crc-home-status-linha">
            <Pulso
              ativo={resumo.dentroDoHorario}
              texto={
                resumo.dentroDoHorario
                  ? "Automação ativa dentro do horário"
                  : "Fora do horário — a fila espera a abertura"
              }
            />
            {resumo.frescorDados !== null && <span className="crc-meta">{frescor(resumo.frescorDados)}</span>}
          </div>
        </div>

        <div className={`crc-home-foco${temTrabalho ? " crc-home-foco-ativo" : ""}`}>
          <div className="crc-home-foco-topo">
            <span className="crc-home-foco-icone">
              {temTrabalho ? <Activity aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
            </span>
            <span className="crc-home-foco-label">Agora</span>
          </div>
          <strong className="crc-home-foco-numero">{resumo.precisamDeAtencao.toLocaleString("pt-BR")}</strong>
          <span className="crc-home-foco-texto">
            {temTrabalho ? "precisam de ação humana" : "pendências humanas"}
          </span>
          {prioridadeAlta > 0 && (
            <span className="crc-home-foco-alerta">{prioridadeAlta} de prioridade alta</span>
          )}
        </div>
      </section>

      <section className="crc-home-metricas" aria-label="Resumo operacional">
        <Metrica
          icone={UsersRound}
          rotulo="Fila humana"
          valor={resumo.precisamDeAtencao.toLocaleString("pt-BR")}
          nota="Sem automação cuidando"
          tom={temTrabalho ? "alerta" : "positivo"}
        />
        <Metrica
          icone={Clock3}
          rotulo="Suas tarefas"
          valor={resumo.tarefasHoje.toLocaleString("pt-BR")}
          nota="Abertas e em andamento"
        />
        <Metrica
          icone={MessageSquareText}
          rotulo="Conversas esperando"
          valor={resumo.conversasEsperando.toLocaleString("pt-BR")}
          nota="Com mensagem não lida"
        />
        <Metrica
          icone={Bot}
          rotulo="Em automação"
          valor={resumo.emAutomacao.toLocaleString("pt-BR")}
          nota={resumo.dentroDoHorario ? "Motor trabalhando agora" : "Aguardando janela útil"}
          tom="info"
        />
      </section>

      <div className="crc-home-grid-principal">
        <section className="crc-home-prioridades">
          <div className="crc-home-secao-topo">
            <div>
              <div className="crc-sobretitulo">Fila priorizada</div>
              <h2 className="crc-titulo-secao">Quem merece sua atenção primeiro</h2>
            </div>
            {resumo.prioridades.length > 0 && (
              <span className="crc-home-contagem">
                {plural(resumo.prioridades.length, "item", "itens")}
              </span>
            )}
          </div>

          {resumo.prioridades.length === 0 ? (
            <Cartao>
              <Vazio
                titulo="Nenhuma oportunidade esperando você agora."
                explicacao="As automações continuam monitorando a base. Quando um paciente precisar de contato humano, ele aparece aqui."
              />
            </Cartao>
          ) : (
            <div className="crc-fila crc-home-fila">
              {resumo.prioridades.map((item, indice) => (
                <LinhaPrioridade
                  key={item.opportunityId}
                  item={item}
                  explicadoDeSaida={indice === 0}
                  aoAbrir={aoAbrirPaciente}
                />
              ))}
            </div>
          )}
        </section>

        <aside className="crc-home-lateral">
          <Cartao>
            <div className="crc-home-card-titulo">
              <span className="crc-home-card-icone"><CalendarCheck2 aria-hidden="true" /></span>
              <div>
                <div className="crc-sobretitulo">Ritmo do dia</div>
                <h2 className="crc-titulo-cartao">Janela de atendimento</h2>
              </div>
            </div>
            <FitaDoDia inicio={resumo.janelaDeHoje.inicio} fim={resumo.janelaDeHoje.fim} />
          </Cartao>

          <Cartao>
            <div className="crc-home-card-titulo">
              <span className="crc-home-card-icone"><CircleDollarSign aria-hidden="true" /></span>
              <div>
                <div className="crc-sobretitulo">Resultado do mês</div>
                <h2 className="crc-titulo-cartao">Recuperação</h2>
              </div>
            </div>

            <div className="crc-home-resultado-grid">
              <div>
                <span className="crc-home-resultado-label">Consultas recuperadas</span>
                <strong>{resumo.consultasRecuperadas.toLocaleString("pt-BR")}</strong>
              </div>
              <div>
                <span className="crc-home-resultado-label">{valorEhReceita ? "Receita confirmada" : "Valor potencial"}</span>
                <strong>{dinheiroCurto(valorRecuperado)}</strong>
              </div>
            </div>
            {!valorEhReceita && (
              <p className="crc-meta crc-home-resultado-nota">Ainda sem confirmação financeira; o valor acima é potencial.</p>
            )}
          </Cartao>
        </aside>
      </div>
    </div>
  );
}

function Metrica({
  icone: Icone,
  rotulo,
  valor,
  nota,
  tom = "neutro",
}: {
  icone: typeof Activity;
  rotulo: string;
  valor: string;
  nota: string;
  tom?: "neutro" | "alerta" | "positivo" | "info";
}) {
  return (
    <article className="crc-home-metrica" data-tom={tom}>
      <span className="crc-home-metrica-icone"><Icone aria-hidden="true" /></span>
      <div className="crc-home-metrica-copy">
        <span className="crc-home-metrica-label">{rotulo}</span>
        <strong className="crc-home-metrica-valor">{valor}</strong>
        <span className="crc-home-metrica-nota">{nota}</span>
      </div>
    </article>
  );
}

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

function paraRazoes(fatores: ItemPrioridade["fatores"]): RazaoDaNota[] {
  return fatores.map((f) => ({ rotulo: f.rotulo, peso: f.pontos }));
}

function LinhaPrioridade({
  item,
  explicadoDeSaida,
  aoAbrir,
}: {
  item: ItemPrioridade;
  explicadoDeSaida: boolean;
  aoAbrir: (patientId: string) => void;
}) {
  const [explicando, setExplicando] = useState(explicadoDeSaida);

  return (
    <div className="crc-entra" data-urgencia={item.faixa}>
      <div className="crc-fila-item" data-urgencia={item.faixa} style={{ cursor: "default" }}>
        <span className="crc-fila-nota" title={`Nota de prioridade: ${String(item.score)} de 100`} aria-hidden="true">
          {item.score}
        </span>

        <div className="crc-fila-corpo">
          <div className="crc-linha" style={{ gap: "var(--crc-e2)" }}>
            <span className="crc-fila-nome">{item.nome}</span>
            <Etiqueta tom={TOM_FAIXA[item.faixa]}>{ROTULO_FAIXA[item.faixa]}</Etiqueta>
            <Etiqueta>{item.tipoRotulo}</Etiqueta>
            {item.temJornadaAtiva && <Etiqueta tom="info">Automação cuidando</Etiqueta>}
          </div>

          <p className="crc-fila-motivo" title={item.motivo}>{item.motivo}</p>

          <div className="crc-home-fila-meta">
            {item.valorPotencial !== null && (
              <span>Potencial <strong>{dinheiro(item.valorPotencial)}</strong></span>
            )}
            {item.proximaAcao !== null && <span>Próximo passo <strong>{item.proximaAcao}</strong></span>}
            {item.ultimoContatoEm !== null && <span>Último contato {tempoRelativo(item.ultimoContatoEm)}</span>}
          </div>

          {item.fatores.length > 0 && explicando && (
            <div className="crc-home-porque"><Porque total={item.score} razoes={paraRazoes(item.fatores)} /></div>
          )}
        </div>

        <div className="crc-home-fila-acoes">
          {item.fatores.length > 0 && (
            <Botao
              pequeno
              variante="discreto"
              aria-expanded={explicando}
              onClick={() => setExplicando((v) => !v)}
            >
              {explicando ? "Ocultar motivo" : "Entender prioridade"}
            </Botao>
          )}

          {item.patientId !== null && (
            <Botao
              pequeno
              variante="secundario"
              onClick={() => {
                if (item.patientId !== null) aoAbrir(item.patientId);
              }}
            >
              Abrir paciente <ArrowUpRight size={15} aria-hidden="true" />
            </Botao>
          )}
        </div>
      </div>
    </div>
  );
}
