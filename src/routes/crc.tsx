/**
 * O portal do JP CRC — `/crc`.
 *
 * Este arquivo é o SHELL: login, navegação e qual tela mostrar. Nenhuma regra
 * de negócio mora aqui, e nenhuma chamada de servidor além da sessão.
 *
 * A NAVEGAÇÃO POR ESTADO, E NÃO POR SUBROTA, é uma escolha com um motivo
 * concreto: o `vite.config.ts` deste projeto força `inlineDynamicImports` no
 * ambiente SSR por causa de um ciclo entre chunks que derrubou TODAS as rotas
 * com o build passando limpo (`docs/INCIDENTE-BUILD-500.md`). Multiplicar
 * arquivos de rota aqui aumenta a superfície desse problema sem ganho para o
 * usuário — o CRC é uma ferramenta de trabalho, e ninguém compartilha o link da
 * própria Inbox.
 *
 * O QUE SE PERDE COM ISSO: link direto para uma aba. O item 148 pede estado na
 * URL "quando fizer sentido", e o lugar onde isso faz sentido de verdade é o
 * Funil com filtros — que é o próximo a ganhar URL, não a navegação inteira.
 *
 * O ISOLAMENTO DE CSS (item 207) acontece pela classe `.crc-app`: todo seletor
 * de `crc.css` está sob ela. O site e o portal de RH não são tocados.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { Automacoes } from "@/components/crc/Automacoes";
import { Funil } from "@/components/crc/Funil";
import { Gestao } from "@/components/crc/Gestao";
import { Home } from "@/components/crc/Home";
import { Inbox } from "@/components/crc/Inbox";
import { Integracoes } from "@/components/crc/Integracoes";
import { MeuTrabalho } from "@/components/crc/MeuTrabalho";
import { BuscaPacientes, CentralDoPaciente } from "@/components/crc/Pacientes";
import { Paleta, type AcaoPaleta } from "@/components/crc/Paleta";
import { Aviso, Botao, Campo, Entrada, useAcao } from "@/components/crc/base";
import "@/components/crc/crc.css";
import { entrarNoCrc, estadoSessaoCrc, sairDoCrc, type EstadoSessao } from "@/lib/crc/api";
import { ROTULO_PAPEL } from "@/lib/crc/dominio/rbac";
import type { Permissao } from "@/lib/crc/dominio/rbac";

export const Route = createFileRoute("/crc")({
  component: PortalCrc,
  head: () => ({
    meta: [
      { title: "JP CRC — Central de Relacionamento" },
      // A tela é interna e cheia de dado de paciente. Ela não entra em
      // buscador, e a diretiva vale também para o que o crawler já viu.
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type Aba =
  "home" | "trabalho" | "inbox" | "funil" | "pacientes" | "gestao" | "automacoes" | "integracoes";

type ItemNav = { aba: Aba; rotulo: string; permissao: Permissao };

const NAVEGACAO: readonly ItemNav[] = [
  { aba: "home", rotulo: "Início", permissao: "ver_oportunidade" },
  { aba: "trabalho", rotulo: "Meu trabalho", permissao: "ver_tarefa" },
  { aba: "inbox", rotulo: "Conversas", permissao: "ver_conversa" },
  { aba: "funil", rotulo: "Funil", permissao: "ver_oportunidade" },
  { aba: "pacientes", rotulo: "Pacientes", permissao: "ver_paciente" },
  { aba: "gestao", rotulo: "Gestão", permissao: "ver_analytics_gerencial" },
  { aba: "automacoes", rotulo: "Automações", permissao: "ver_automacao" },
  { aba: "integracoes", rotulo: "Integrações", permissao: "ver_integracoes" },
];

function PortalCrc() {
  const [sessao, setSessao] = useState<EstadoSessao | null>(null);
  const [aba, setAba] = useState<Aba>("home");
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
          <div style={{ maxWidth: 460 }}>
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

  // O papel pode não alcançar a aba atual (por exemplo, marketing não vê
  // Conversas). Cair na primeira permitida evita uma tela em branco sem
  // explicação.
  const abaAtual = permitidas.some((n) => n.aba === aba) ? aba : (permitidas[0]?.aba ?? "home");
  const rotuloAtual = NAVEGACAO.find((n) => n.aba === abaAtual)?.rotulo ?? "Início";

  const acoesDaPaleta: AcaoPaleta[] = permitidas.map((n) => ({
    id: n.aba,
    rotulo: `Ir para ${n.rotulo}`,
    dica: "Navegação",
    executar: () => {
      setAba(n.aba);
      if (n.aba !== "pacientes") setPacienteAberto(null);
    },
  }));

  return (
    <div className="crc-app">
      {/*
        A paleta lista só as abas que este papel alcança. Ela é atalho para o
        que a pessoa já pode fazer — nunca um caminho paralelo que contorna a
        navegação (e, com ela, o RBAC).
      */}
      <Paleta acoes={acoesDaPaleta} aoAbrirPaciente={abrirPaciente} />

      <div className="crc-shell">
        <nav className="crc-lateral" aria-label="Seções do CRC">
          <div className="crc-marca">
            <span aria-hidden="true">JP</span>
            CRC
          </div>

          {permitidas.map((n) => (
            <button
              key={n.aba}
              type="button"
              className="crc-nav-item"
              aria-current={abaAtual === n.aba ? "page" : undefined}
              onClick={() => {
                setAba(n.aba);
                // Sair de Pacientes fecha a ficha: voltar para a aba e
                // reencontrar a ficha de alguém que você abriu meia hora antes
                // é desorientador.
                if (n.aba !== "pacientes") setPacienteAberto(null);
              }}
            >
              {n.rotulo}
            </button>
          ))}

          <div style={{ marginTop: "auto", paddingTop: "var(--crc-e5)" }}>
            <div style={{ padding: "0 var(--crc-e3) var(--crc-e2)" }}>
              <div style={{ fontSize: "0.875rem", fontWeight: 600 }}>{usuario.nome}</div>
              <div className="crc-meta">{ROTULO_PAPEL[usuario.papel]}</div>
            </div>
            <Botao
              variante="discreto"
              pequeno
              onClick={() => {
                void (async () => {
                  await sairDoCrc();
                  await carregarSessao();
                })();
              }}
            >
              Sair
            </Botao>
          </div>
        </nav>

        <main className="crc-conteudo">
          {/* A Home traz o próprio cabeçalho, com a saudação. */}
          {abaAtual !== "home" && !(abaAtual === "pacientes" && pacienteAberto !== null) && (
            <header className="crc-cabecalho-pagina">
              <h1 className="crc-titulo-pagina">{rotuloAtual}</h1>
            </header>
          )}

          {abaAtual === "home" && (
            <Home nomeUsuario={usuario.nome} aoAbrirPaciente={abrirPaciente} />
          )}

          {abaAtual === "trabalho" && (
            <MeuTrabalho usuarioId={usuario.id} aoAbrirPaciente={abrirPaciente} />
          )}

          {abaAtual === "inbox" && <Inbox aoAbrirPaciente={abrirPaciente} />}

          {abaAtual === "funil" && <Funil aoAbrirPaciente={abrirPaciente} />}

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
            <Gestao podeExportar={usuario.permissoes.includes("exportar_dados")} />
          )}

          {abaAtual === "automacoes" && (
            <Automacoes podeGerenciar={usuario.permissoes.includes("gerenciar_automacao")} />
          )}

          {abaAtual === "integracoes" && (
            <Integracoes podeGerenciar={usuario.permissoes.includes("gerenciar_integracoes")} />
          )}
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
    <div
      style={{
        display: "grid",
        placeItems: "center",
        minHeight: "100dvh",
        padding: "var(--crc-e5)",
      }}
    >
      <form
        className="crc-cartao"
        style={{ width: "min(400px, 100%)" }}
        onSubmit={(e) => {
          e.preventDefault();
          void entrar();
        }}
      >
        <div className="crc-marca" style={{ padding: "0 0 var(--crc-e4)" }}>
          <span aria-hidden="true">JP</span>
          CRC
        </div>

        <h1 className="crc-titulo-secao" style={{ marginBottom: "var(--crc-e2)" }}>
          Entrar
        </h1>
        <p className="crc-corpo" style={{ marginBottom: "var(--crc-e5)" }}>
          Central de relacionamento da JP Clínica Integrada Odontológica.
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
                required
                value={senha}
                onChange={(e) => {
                  setSenha(e.target.value);
                }}
              />
            )}
          </Campo>

          <Botao type="submit" variante="primario" carregando={acao.rodando}>
            Entrar
          </Botao>
        </div>
      </form>
    </div>
  );
}
