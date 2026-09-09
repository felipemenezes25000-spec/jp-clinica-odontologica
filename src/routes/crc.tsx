/**
 * Portal do JP CRC — `/crc`.
 *
 * O shell concentra sessão, navegação e orientação de contexto. As regras de
 * negócio continuam nos módulos de `src/lib/crc` e nas telas específicas.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  Cable,
  ChevronRight,
  Columns3,
  FileUp,
  House,
  ListTodo,
  LogOut,
  Megaphone,
  MessageSquareText,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserRoundCog,
  UsersRound,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import { Automacoes } from "@/components/crc/Automacoes";
import { Agenda } from "@/components/crc/Agenda";
import { Funil } from "@/components/crc/Funil";
import { Gestao } from "@/components/crc/Gestao";
import { Home } from "@/components/crc/Home";
import { Inbox } from "@/components/crc/Inbox";
import { Integracoes } from "@/components/crc/Integracoes";
import { Logo } from "@/components/site/Logo";

import { Campanhas } from "@/components/crc/Campanhas";
import { Configuracoes } from "@/components/crc/Configuracoes";
import { Equipe } from "@/components/crc/Equipe";
import { Importar } from "@/components/crc/Importar";
import { MeuTrabalho } from "@/components/crc/MeuTrabalho";
import { BuscaPacientes, CentralDoPaciente } from "@/components/crc/Pacientes";
import { Paleta, type AcaoPaleta } from "@/components/crc/Paleta";
import { Aviso, Botao, Campo, Entrada, useAcao } from "@/components/crc/base";
import "@/components/crc/crc.css";
import "@/components/crc/crc-premium.css";
import { entrarNoCrc, estadoSessaoCrc, sairDoCrc, type EstadoSessao } from "@/lib/crc/api";
import { ROTULO_PAPEL } from "@/lib/crc/dominio/rbac";
import type { Permissao } from "@/lib/crc/dominio/rbac";

export const Route = createFileRoute("/crc")({
  component: PortalCrc,
  head: () => ({
    meta: [
      { title: "JP CRC — Central de Relacionamento" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type Aba =
  | "home"
  | "trabalho"
  | "inbox"
  | "agenda"
  | "funil"
  | "pacientes"
  | "gestao"
  | "importar"
  | "automacoes"
  | "campanhas"
  | "integracoes"
  | "configuracoes"
  | "equipe";

type ItemNav = {
  aba: Aba;
  rotulo: string;
  permissao: Permissao;
  icone: LucideIcon;
};

type GrupoNav = {
  id: "operacao" | "crescimento" | "administracao";
  rotulo: string;
  itens: readonly ItemNav[];
};

type TomLegenda = "neutra" | "positiva" | "alerta" | "perigo" | "info";

type GuiaAba = {
  sobretitulo: string;
  descricao: string;
  legendas: readonly { rotulo: string; tom: TomLegenda }[];
};

const GRUPOS_NAVEGACAO: readonly GrupoNav[] = [
  {
    id: "operacao",
    rotulo: "Operação",
    itens: [
      { aba: "home", rotulo: "Início", permissao: "ver_oportunidade", icone: House },
      { aba: "trabalho", rotulo: "Meu trabalho", permissao: "ver_tarefa", icone: ListTodo },
      { aba: "inbox", rotulo: "Conversas", permissao: "ver_conversa", icone: MessageSquareText },
      { aba: "funil", rotulo: "Funil", permissao: "ver_oportunidade", icone: Columns3 },
      { aba: "agenda", rotulo: "Agenda", permissao: "ver_paciente", icone: CalendarDays },
      { aba: "pacientes", rotulo: "Pacientes", permissao: "ver_paciente", icone: UsersRound },
    ],
  },
  {
    id: "crescimento",
    rotulo: "Performance",
    itens: [
      { aba: "gestao", rotulo: "Gestão", permissao: "ver_analytics_gerencial", icone: BarChart3 },
      { aba: "importar", rotulo: "Importar", permissao: "importar_dados", icone: FileUp },
      { aba: "automacoes", rotulo: "Automações", permissao: "ver_automacao", icone: Workflow },
      { aba: "campanhas", rotulo: "Campanhas", permissao: "gerenciar_automacao", icone: Megaphone },
    ],
  },
  {
    id: "administracao",
    rotulo: "Administração",
    itens: [
      { aba: "integracoes", rotulo: "Integrações", permissao: "ver_integracoes", icone: Cable },
      { aba: "equipe", rotulo: "Equipe", permissao: "gerenciar_usuarios", icone: UserRoundCog },
      { aba: "configuracoes", rotulo: "Configurações", permissao: "ver_integracoes", icone: Settings2 },
    ],
  },
];

const NAVEGACAO: readonly ItemNav[] = GRUPOS_NAVEGACAO.flatMap((grupo) => grupo.itens);

const GUIA_ABAS: Record<Exclude<Aba, "home">, GuiaAba> = {
  trabalho: {
    sobretitulo: "Sua fila pessoal",
    descricao:
      "Tudo que depende de você agora, organizado para reduzir decisão manual e impedir que uma tarefa sem responsável desapareça da operação.",
    legendas: [
      { rotulo: "Vencida / urgente", tom: "perigo" },
      { rotulo: "Em andamento", tom: "info" },
      { rotulo: "Em dia", tom: "positiva" },
    ],
  },
  inbox: {
    sobretitulo: "Atendimento em tempo real",
    descricao:
      "Leia o contexto antes de responder, diferencie conversa do paciente de nota interna e mantenha todo contato rastreável em um único lugar.",
    legendas: [
      { rotulo: "Recebida", tom: "neutra" },
      { rotulo: "Enviada", tom: "positiva" },
      { rotulo: "Nota interna", tom: "alerta" },
    ],
  },
  agenda: {
    sobretitulo: "Da oportunidade ao horário marcado",
    descricao:
      "Visualize compromissos e contexto do paciente sem perder a ligação entre recuperação, confirmação e atendimento.",
    legendas: [
      { rotulo: "Confirmado", tom: "positiva" },
      { rotulo: "Acompanhar", tom: "alerta" },
      { rotulo: "Informação", tom: "info" },
    ],
  },
  funil: {
    sobretitulo: "Pipeline de relacionamento",
    descricao:
      "Veja em que etapa cada oportunidade está, quem precisa de ação humana e o que a automação já está conduzindo sozinha.",
    legendas: [
      { rotulo: "Prioridade alta", tom: "perigo" },
      { rotulo: "Prioridade média", tom: "alerta" },
      { rotulo: "Automação ativa", tom: "info" },
    ],
  },
  pacientes: {
    sobretitulo: "Visão única do paciente",
    descricao:
      "Encontre rapidamente uma pessoa e reúna histórico, oportunidades, conversas e próximos passos sem caçar informação em telas diferentes.",
    legendas: [
      { rotulo: "Histórico", tom: "neutra" },
      { rotulo: "Oportunidade", tom: "info" },
      { rotulo: "Contato realizado", tom: "positiva" },
    ],
  },
  gestao: {
    sobretitulo: "Performance com contexto",
    descricao:
      "Acompanhe recuperação, produtividade e impacto financeiro distinguindo resultado confirmado de valor apenas potencial.",
    legendas: [
      { rotulo: "Resultado", tom: "positiva" },
      { rotulo: "Potencial", tom: "info" },
      { rotulo: "Requer atenção", tom: "alerta" },
    ],
  },
  importar: {
    sobretitulo: "Entrada de dados com segurança",
    descricao:
      "Pré-visualize, valide e só então grave novos dados. A tela existe para transformar arquivos externos em informação confiável para a operação.",
    legendas: [
      { rotulo: "Prévia", tom: "info" },
      { rotulo: "Validado", tom: "positiva" },
      { rotulo: "Rejeitado", tom: "perigo" },
    ],
  },
  automacoes: {
    sobretitulo: "Jornadas que trabalham sozinhas",
    descricao:
      "Entenda o que dispara cada fluxo, quais passos serão executados e quando uma jornada deve parar antes de ativá-la.",
    legendas: [
      { rotulo: "Ativa", tom: "positiva" },
      { rotulo: "Pausada", tom: "alerta" },
      { rotulo: "Simulação", tom: "info" },
    ],
  },
  campanhas: {
    sobretitulo: "Comunicação em escala, sem perder controle",
    descricao:
      "Planeje grupos de contato com leitura clara de estado, público e andamento antes de qualquer execução em massa.",
    legendas: [
      { rotulo: "Rascunho", tom: "neutra" },
      { rotulo: "Em execução", tom: "info" },
      { rotulo: "Concluída", tom: "positiva" },
    ],
  },
  integracoes: {
    sobretitulo: "Saúde das conexões",
    descricao:
      "Veja rapidamente quais serviços externos estão prontos, o que ainda precisa de credencial e onde uma falha exige intervenção técnica.",
    legendas: [
      { rotulo: "Conectada", tom: "positiva" },
      { rotulo: "Pendente", tom: "alerta" },
      { rotulo: "Falha", tom: "perigo" },
    ],
  },
  equipe: {
    sobretitulo: "Acesso e responsabilidade",
    descricao:
      "Administre pessoas e permissões com clareza sobre quem pode ver, operar ou alterar cada parte sensível do CRC.",
    legendas: [
      { rotulo: "Usuário ativo", tom: "positiva" },
      { rotulo: "Permissões", tom: "info" },
      { rotulo: "Acesso restrito", tom: "neutra" },
    ],
  },
  configuracoes: {
    sobretitulo: "Regras da operação",
    descricao:
      "Centralize parâmetros que mudam o comportamento do CRC e trate configurações críticas como parte da segurança da clínica.",
    legendas: [
      { rotulo: "Operação", tom: "info" },
      { rotulo: "Seguro", tom: "positiva" },
      { rotulo: "Requer revisão", tom: "alerta" },
    ],
  },
};

function PortalCrc() {
  const [sessao, setSessao] = useState<EstadoSessao | null>(null);
  const [aba, setAba] = useState<Aba>("home");
  const [conversaAberta, setConversaAberta] = useState<string | null>(null);
  const [pacienteAberto, setPacienteAberto] = useState<string | null>(null);

  const carregarSessao = useCallback(async (): Promise<void> => {
    try {
      setSessao(await estadoSessaoCrc());
    } catch {
      setSessao({
        autenticado: false,
        configurado: false,
        motivo: "Não conseguimos falar com o servidor agora.",
        usuario: null,
      });
    }
  }, []);

  useEffect(() => {
    void carregarSessao();
  }, [carregarSessao]);

  const abrirPaciente = useCallback((patientId: string) => {
    setPacienteAberto(patientId);
    setAba("pacientes");
  }, []);

  if (sessao === null) {
    return (
      <div className="crc-app">
        <div style={{ display: "grid", placeItems: "center", minHeight: "100dvh" }}>
          <p className="crc-meta">Carregando…</p>
        </div>
      </div>
    );
  }

  if (!sessao.configurado) {
    return (
      <div className="crc-app">
        <div
          style={{
            display: "grid",
            placeItems: "center",
            minHeight: "100dvh",
            padding: "var(--crc-e5)",
          }}
        >
          <div style={{ maxWidth: 520, width: "100%" }}>
            <Aviso tom="alerta">{sessao.motivo}</Aviso>
          </div>
        </div>
      </div>
    );
  }

  if (!sessao.autenticado || sessao.usuario === null) {
    return (
      <div className="crc-app">
        <TelaDeEntrada aoEntrar={() => void carregarSessao()} />
      </div>
    );
  }

  const usuario = sessao.usuario;
  const permitidas = NAVEGACAO.filter((n) => usuario.permissoes.includes(n.permissao));
  const abaAtual = permitidas.some((n) => n.aba === aba) ? aba : (permitidas[0]?.aba ?? "home");
  const itemAtual = NAVEGACAO.find((n) => n.aba === abaAtual) ?? NAVEGACAO[0]!;
  const IconeAtual = itemAtual.icone;
  const guiaAtual = abaAtual === "home" ? null : GUIA_ABAS[abaAtual];

  const gruposPermitidos = useMemo(
    () =>
      GRUPOS_NAVEGACAO.map((grupo) => ({
        ...grupo,
        itens: grupo.itens.filter((n) => usuario.permissoes.includes(n.permissao)),
      })).filter((grupo) => grupo.itens.length > 0),
    [usuario.permissoes],
  );

  const acoesDaPaleta: AcaoPaleta[] = permitidas.map((n) => ({
    id: n.aba,
    rotulo: `Ir para ${n.rotulo}`,
    dica: "Navegação",
    executar: () => {
      setAba(n.aba);
      if (n.aba !== "pacientes") setPacienteAberto(null);
    },
  }));

  const iniciais = usuario.nome
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((parte) => parte.charAt(0).toUpperCase())
    .join("");

  return (
    <div className="crc-app">
      <Paleta
        acoes={acoesDaPaleta}
        aoAbrirPaciente={abrirPaciente}
        aoAbrirConversa={(conversationId) => {
          setConversaAberta(conversationId);
          setAba("inbox");
          setPacienteAberto(null);
        }}
      />

      <div className="crc-shell">
        <nav className="crc-lateral" aria-label="Seções do CRC">
          <div className="crc-marca">
            <Logo
              variante="lockup"
              fundo="claro"
              altura={44}
              alt="JP Clínica Integrada Odontológica"
            />
            <span className="crc-modulo">CRC</span>
          </div>

          {gruposPermitidos.map((grupo) => (
            <div key={grupo.id} className="crc-nav-grupo">
              <div className="crc-nav-rotulo">{grupo.rotulo}</div>
              {grupo.itens.map((n) => {
                const Icone = n.icone;
                return (
                  <button
                    key={n.aba}
                    type="button"
                    className="crc-nav-item"
                    aria-current={abaAtual === n.aba ? "page" : undefined}
                    onClick={() => {
                      setAba(n.aba);
                      if (n.aba !== "pacientes") setPacienteAberto(null);
                    }}
                  >
                    <Icone aria-hidden="true" />
                    <span>{n.rotulo}</span>
                  </button>
                );
              })}
            </div>
          ))}

          <div className="crc-usuario-shell">
            <div className="crc-usuario">
              <div className="crc-avatar" aria-hidden="true">
                {iniciais || "JP"}
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="crc-usuario-nome">{usuario.nome}</div>
                <div className="crc-meta">{ROTULO_PAPEL[usuario.papel]}</div>
              </div>
              <Botao
                variante="discreto"
                pequeno
                aria-label="Sair do CRC"
                title="Sair"
                onClick={() => {
                  void (async () => {
                    await sairDoCrc();
                    await carregarSessao();
                  })();
                }}
              >
                <LogOut size={17} aria-hidden="true" />
              </Botao>
            </div>
          </div>
        </nav>

        <main className="crc-conteudo">
          <div className="crc-barra-contexto" aria-label="Contexto da tela">
            <div className="crc-barra-trilha">
              <ShieldCheck aria-hidden="true" />
              <strong>JP CRC</strong>
              <ChevronRight aria-hidden="true" />
              <span>{itemAtual.rotulo}</span>
            </div>
            <div className="crc-atalho-dica" title="Use Ctrl+K ou ⌘K para abrir a busca global">
              <Search aria-hidden="true" />
              <span>Buscar ou navegar</span>
              <kbd>Ctrl K</kbd>
            </div>
          </div>

          {abaAtual !== "home" && !(abaAtual === "pacientes" && pacienteAberto !== null) && guiaAtual !== null && (
            <header className="crc-cabecalho-pagina crc-cabecalho-premium">
              <div className="crc-cabecalho-icone" aria-hidden="true">
                <IconeAtual />
              </div>
              <div className="crc-cabecalho-copy">
                <div className="crc-sobretitulo">{guiaAtual.sobretitulo}</div>
                <h1 className="crc-titulo-pagina">{itemAtual.rotulo}</h1>
                <p className="crc-corpo">{guiaAtual.descricao}</p>
              </div>
              <div className="crc-legenda" aria-label={`Legenda de ${itemAtual.rotulo}`}>
                {guiaAtual.legendas.map((legenda) => (
                  <span key={legenda.rotulo} className="crc-legenda-item" data-tom={legenda.tom}>
                    <span className="crc-legenda-ponto" aria-hidden="true" />
                    {legenda.rotulo}
                  </span>
                ))}
              </div>
            </header>
          )}

          {abaAtual === "home" && (
            <Home nomeUsuario={usuario.nome} aoAbrirPaciente={abrirPaciente} />
          )}

          {abaAtual === "trabalho" && (
            <MeuTrabalho usuarioId={usuario.id} aoAbrirPaciente={abrirPaciente} />
          )}

          {abaAtual === "inbox" && (
            <Inbox
              aoAbrirPaciente={abrirPaciente}
              conversaInicial={conversaAberta}
              aoConsumirInicial={() => {
                setConversaAberta(null);
              }}
            />
          )}

          {abaAtual === "funil" && <Funil aoAbrirPaciente={abrirPaciente} />}
          {abaAtual === "agenda" && <Agenda aoAbrirPaciente={abrirPaciente} />}

          {abaAtual === "pacientes" &&
            (pacienteAberto === null ? (
              <BuscaPacientes aoAbrirPaciente={abrirPaciente} />
            ) : (
              <CentralDoPaciente
                patientId={pacienteAberto}
                aoVoltar={() => {
                  setPacienteAberto(null);
                }}
              />
            ))}

          {abaAtual === "gestao" && (
            <Gestao
              podeExportar={usuario.permissoes.includes("exportar_dados")}
              podeVerFinanceiro={usuario.permissoes.includes("ver_financeiro")}
            />
          )}

          {abaAtual === "importar" && <Importar />}

          {abaAtual === "automacoes" && (
            <Automacoes podeGerenciar={usuario.permissoes.includes("gerenciar_automacao")} />
          )}

          {abaAtual === "integracoes" && (
            <Integracoes podeGerenciar={usuario.permissoes.includes("gerenciar_integracoes")} />
          )}

          {abaAtual === "campanhas" && <Campanhas />}
          {abaAtual === "equipe" && <Equipe />}
          {abaAtual === "configuracoes" && <Configuracoes />}
        </main>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Entrada                                                                    */
/* -------------------------------------------------------------------------- */

function TelaDeEntrada({ aoEntrar }: { aoEntrar: () => void }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const acao = useAcao();

  const entrar = useCallback(async (): Promise<void> => {
    await acao.executar(() => entrarNoCrc({ data: { email, senha } }), aoEntrar);
  }, [acao, aoEntrar, email, senha]);

  return (
    <div className="crc-login">
      <section className="crc-login-apresentacao" aria-label="Sobre o JP CRC">
        <div className="crc-login-lockup">
          <Logo
            variante="lockup"
            fundo="escuro"
            altura={52}
            alt="JP Clínica Integrada Odontológica"
          />
        </div>

        <div className="crc-login-copy">
          <div className="crc-login-kicker">
            <Sparkles size={15} aria-hidden="true" />
            Central de relacionamento
          </div>
          <h1>Menos pacientes esquecidos. Mais cuidado que volta.</h1>
          <p>
            O JP CRC transforma faltas, cancelamentos e silêncios em uma operação clara: prioriza,
            automatiza, registra cada contato e mostra exatamente onde a equipe precisa agir.
          </p>

          <div className="crc-login-provas" aria-label="Principais recursos">
            <div className="crc-login-prova">
              <strong>Fila inteligente</strong>
              <span>Prioridade explicada, não uma caixa-preta.</span>
            </div>
            <div className="crc-login-prova">
              <strong>Automação segura</strong>
              <span>Contato com horário, cooldown e opt-out.</span>
            </div>
            <div className="crc-login-prova">
              <strong>Contexto completo</strong>
              <span>Paciente, conversa e resultado no mesmo fluxo.</span>
            </div>
          </div>
        </div>

        <div style={{ position: "relative", zIndex: 1, color: "rgba(255,255,255,.52)", fontSize: ".75rem" }}>
          Uso interno • JP Clínica Integrada Odontológica
        </div>
      </section>

      <div className="crc-login-formulario">
        <form
          className="crc-login-cartao"
          onSubmit={(e) => {
            e.preventDefault();
            void entrar();
          }}
        >
          <div className="crc-login-mini-logo crc-marca" style={{ padding: 0 }}>
            <Logo
              variante="lockup"
              fundo="claro"
              altura={48}
              alt="JP Clínica Integrada Odontológica"
            />
            <span className="crc-modulo">CRC</span>
          </div>

          <div className="crc-sobretitulo">Acesso interno</div>
          <h2 className="crc-titulo-pagina" style={{ fontSize: "2rem", marginBottom: "var(--crc-e2)" }}>
            Bem-vindo de volta.
          </h2>
          <p className="crc-corpo" style={{ marginBottom: "var(--crc-e6)" }}>
            Entre para continuar a operação da central de relacionamento da JP.
          </p>

          {acao.recado !== null && (
            <div style={{ marginBottom: "var(--crc-e4)" }}>
              <Aviso tom={acao.recado.tom}>{acao.recado.texto}</Aviso>
            </div>
          )}

          <div className="crc-pilha">
            <Campo rotulo="E-mail">
              {(id) => (
                <Entrada
                  id={id}
                  type="email"
                  autoComplete="username"
                  placeholder="seu@email.com"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                  }}
                />
              )}
            </Campo>

            <Campo rotulo="Senha">
              {(id) => (
                <Entrada
                  id={id}
                  type="password"
                  autoComplete="current-password"
                  placeholder="Sua senha"
                  required
                  value={senha}
                  onChange={(e) => {
                    setSenha(e.target.value);
                  }}
                />
              )}
            </Campo>

            <Botao type="submit" variante="primario" carregando={acao.rodando}>
              Entrar no CRC
            </Botao>
          </div>
        </form>
      </div>
    </div>
  );
}
