/**
 * Uma rota, todas as telas do CRC menos a Home.
 *
 * ============================================================================
 *  POR QUE UM ARQUIVO E NÃO VINTE E NOVE.
 *
 *  O roteamento por arquivo do TanStack aceita os dois desenhos. Vinte e nove
 *  arquivos dariam vinte e nove `createFileRoute` idênticos, cada um com três
 *  linhas de verdade e vinte de cerimônia — e a lista de telas, que hoje mora
 *  num lugar só (`rotas.ts`), passaria a existir espalhada pela árvore de
 *  diretórios, onde ninguém consegue lê-la inteira.
 *
 *  O segmento dinâmico entrega exatamente o que o endereço precisa entregar:
 *  `/crc/radar` é uma URL de verdade, o item do menu é um `<a href>` (então
 *  Ctrl+clique abre em aba nova), F5 recarrega aquela tela, e voltar/avançar
 *  andam dentro do aplicativo.
 *
 *  A DIVISÃO DO PACOTE NÃO SE PERDE: cada tela continua sendo um `React.lazy`
 *  próprio, então o navegador baixa só a que foi aberta. O que é único aqui é
 *  a ROTA, não o pedaço de JavaScript.
 * ============================================================================
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { lazy, useCallback, type ComponentType, type ReactElement } from "react";

import { Aviso } from "@/components/crc/base";
import { useCrc } from "@/components/crc/contexto-crc";
import { PERMISSAO_DA_TELA, ehAba } from "@/components/crc/rotas";

export const Route = createFileRoute("/crc/$tela")({
  component: TelaDoCrc,
});

/**
 * `React.lazy` com export nomeado.
 *
 * O `lazy` só aceita um módulo cujo `default` seja o componente, e nenhuma tela
 * do CRC tem export default — o estilo da casa é nomear. Este ajudante faz a
 * ponte num lugar só, em vez de vinte e nove `.then(m => ({ default: m.X }))`
 * espalhados, cada um uma chance de trocar o nome e descobrir em produção.
 *
 * A CONVERSÃO DE TIPO É DELIBERADA, E ESTREITA: devolver `M[N]` — o tipo do
 * componente ORIGINAL — mantém a conferência de props exata em cada uso.
 */
function tela<M extends Record<string, unknown>, N extends keyof M & string>(
  carregar: () => Promise<M>,
  nome: N,
): M[N] {
  return lazy(() =>
    carregar().then((m) => ({ default: m[nome] as ComponentType<Record<string, unknown>> })),
  ) as unknown as M[N];
}

const Agenda = tela(() => import("@/components/crc/Agenda"), "Agenda");
const Automacoes = tela(() => import("@/components/crc/Automacoes"), "Automacoes");
const Autonomia = tela(() => import("@/components/crc/Autonomia"), "Autonomia");
const Avaliacao = tela(() => import("@/components/crc/Avaliacao"), "Avaliacao");
const Campanhas = tela(() => import("@/components/crc/Campanhas"), "Campanhas");
const Configuracoes = tela(() => import("@/components/crc/Configuracoes"), "Configuracoes");
const Conhecimento = tela(() => import("@/components/crc/Conhecimento"), "Conhecimento");
const Encaixes = tela(() => import("@/components/crc/Encaixes"), "Encaixes");
const Equipe = tela(() => import("@/components/crc/Equipe"), "Equipe");
const Estudio = tela(() => import("@/components/crc/Estudio"), "Estudio");
const Ferramentas = tela(() => import("@/components/crc/Ferramentas"), "Ferramentas");
const Funil = tela(() => import("@/components/crc/Funil"), "Funil");
const Gestao = tela(() => import("@/components/crc/Gestao"), "Gestao");
const Importar = tela(() => import("@/components/crc/Importar"), "Importar");
const Inbox = tela(() => import("@/components/crc/Inbox"), "Inbox");
const Integracoes = tela(() => import("@/components/crc/Integracoes"), "Integracoes");
const Inteligencia = tela(() => import("@/components/crc/Inteligencia"), "Inteligencia");
const Metas = tela(() => import("@/components/crc/Metas"), "Metas");
const MeuTrabalho = tela(() => import("@/components/crc/MeuTrabalho"), "MeuTrabalho");
const ModelosECusto = tela(() => import("@/components/crc/ModelosECusto"), "ModelosECusto");
const Playground = tela(() => import("@/components/crc/Playground"), "Playground");
const ProximasAcoes = tela(() => import("@/components/crc/ProximasAcoes"), "ProximasAcoes");
const Radar = tela(() => import("@/components/crc/Radar"), "Radar");
const Recepcao = tela(() => import("@/components/crc/Recepcao"), "Recepcao");
const Saude = tela(() => import("@/components/crc/Saude"), "Saude");
const Tratamentos = tela(() => import("@/components/crc/Tratamentos"), "Tratamentos");
const BuscaPacientes = tela(() => import("@/components/crc/Pacientes"), "BuscaPacientes");
const CentralDoPaciente = tela(() => import("@/components/crc/Pacientes"), "CentralDoPaciente");

function TelaDoCrc(): ReactElement {
  const { tela: nome } = Route.useParams();
  const busca = Route.useSearch();
  const navegar = useNavigate();
  const { usuario, abrirPaciente } = useCrc();

  /*
   * Troca pedaços da busca sem sair da tela e SEM empilhar histórico.
   *
   * `replace` porque escolher "30 dias" ou digitar na busca não é navegação —
   * é ajustar o que já se está olhando. Sem ele, voltar viraria um desfazer
   * tecla a tecla, e sair da tela custaria vinte cliques em "voltar".
   */
  const ajustarBusca = useCallback(
    (mudanca: Record<string, unknown>): void => {
      void navegar({
        to: "/crc/$tela",
        params: { tela: nome },
        search: (atual: Record<string, unknown>) => ({ ...atual, ...mudanca }),
        replace: true,
      });
    },
    [navegar, nome],
  );

  /*
   * ENDEREÇO QUE NÃO EXISTE DIZ QUE NÃO EXISTE.
   *
   * A alternativa seria mandar para a Home em silêncio — e aí quem errou uma
   * letra no link nunca descobre que errou; só acha que o sistema é errático.
   */
  if (!ehAba(nome) || nome === "home") {
    return (
      <Aviso tom="alerta">
        Não existe uma tela chamada “{nome}”. Confira o endereço ou volte pelo menu.
      </Aviso>
    );
  }

  const exigida = PERMISSAO_DA_TELA[nome];
  if (!usuario.permissoes.includes(exigida)) {
    return (
      <Aviso tom="alerta">
        Você não tem acesso a esta tela. Se precisa dela para o seu trabalho, peça a quem administra
        o CRC.
      </Aviso>
    );
  }

  switch (nome) {
    case "trabalho":
      return <MeuTrabalho usuarioId={usuario.id} aoAbrirPaciente={abrirPaciente} />;

    case "inbox":
      return (
        <Inbox
          aoAbrirPaciente={abrirPaciente}
          conversaInicial={busca.conversa ?? null}
          aoConsumirInicial={() => {
            /*
             * TIRA A CONVERSA DA URL SEM CRIAR ENTRADA NO HISTÓRICO.
             * Sem `replace`, cada abertura de conversa empilharia um passo, e
             * "voltar" viraria um desfazer de cliques em vez de navegação.
             */
            void navegar({ to: "/crc/$tela", params: { tela: "inbox" }, replace: true });
          }}
        />
      );

    case "funil":
      return (
        <Funil
          aoAbrirPaciente={abrirPaciente}
          filtroInicial={{
            tipos: busca.tipo === undefined ? [] : [busca.tipo],
            etapaChave: busca.etapa ?? null,
            apenasMinhas: busca.minhas ?? false,
          }}
          aoTrocarFiltro={(f) => {
            ajustarBusca({
              tipo: f.tipos[0] ?? undefined,
              etapa: f.etapaChave ?? undefined,
              minhas: f.apenasMinhas ? true : undefined,
            });
          }}
        />
      );

    case "agenda":
      return (
        <Agenda
          aoAbrirPaciente={abrirPaciente}
          janela={busca.janela ?? 14}
          aoTrocarJanela={(dias) => {
            ajustarBusca({ janela: dias });
          }}
        />
      );

    case "pacientes": {
      const paciente = busca.paciente;
      if (paciente === undefined || paciente.length === 0) {
        return (
          <BuscaPacientes
            aoAbrirPaciente={abrirPaciente}
            termoInicial={busca.q ?? ""}
            aoTrocarTermo={(termo) => {
              ajustarBusca({ q: termo.length > 0 ? termo : undefined });
            }}
          />
        );
      }
      return (
        <CentralDoPaciente
          patientId={paciente}
          {...(ehAbaDaFicha(busca.ficha) ? { abaInicial: busca.ficha } : {})}
          aoTrocarAba={(aba) => {
            ajustarBusca({ ficha: aba === "resumo" ? undefined : aba });
          }}
          aoVoltar={() => {
            /*
             * VOLTAR PARA A BUSCA PRESERVA O TERMO. Sem isto, abrir um paciente
             * e voltar devolveria a tela de busca vazia — e a pessoa teria que
             * digitar de novo o que acabou de digitar.
             */
            void navegar({
              to: "/crc/$tela",
              params: { tela: "pacientes" },
              search: (atual: Record<string, unknown>) => {
                const { paciente: _p, ficha: _f, ...resto } = atual;
                return resto;
              },
            });
          }}
        />
      );
    }

    case "gestao":
      return (
        <Gestao
          podeExportar={usuario.permissoes.includes("exportar_dados")}
          podeVerFinanceiro={usuario.permissoes.includes("ver_financeiro")}
        />
      );

    case "metas":
      return <Metas podeGerenciar={usuario.permissoes.includes("gerenciar_autopilot")} />;

    case "automacoes":
      return <Automacoes podeGerenciar={usuario.permissoes.includes("gerenciar_automacao")} />;

    case "integracoes":
      return <Integracoes podeGerenciar={usuario.permissoes.includes("gerenciar_integracoes")} />;

    case "saude":
      return <Saude podeVerTecnico={usuario.permissoes.includes("gerenciar_integracoes")} />;

    case "configuracoes":
      return (
        <Configuracoes podeGerenciarUsuarios={usuario.permissoes.includes("gerenciar_usuarios")} />
      );

    case "radar":
      return <Radar />;
    case "encaixes":
      return <Encaixes />;
    case "tratamentos":
      return <Tratamentos />;
    case "recepcao":
      return <Recepcao />;
    case "autonomia":
      return <Autonomia />;
    case "importar":
      return <Importar />;
    case "campanhas":
      return <Campanhas />;
    case "inteligencia":
      return <Inteligencia />;
    case "conhecimento":
      return <Conhecimento />;
    case "modelos":
      return <ModelosECusto />;
    case "avaliacao":
      return <Avaliacao />;
    case "estudio":
      return <Estudio />;
    case "playground":
      return <Playground />;
    case "ferramentas":
      return <Ferramentas />;
    case "proximas":
      return <ProximasAcoes />;
    case "equipe":
      return <Equipe />;
  }
}

/**
 * As abas da ficha do paciente, conferidas em tempo de execução.
 *
 * `?ficha=qualquer-coisa` vem da barra de endereço, e a ficha não pode abrir
 * numa aba que não existe. O tipo `AbaFicha` some na compilação; esta lista é o
 * que sobra para conferir.
 */
const ABAS_DA_FICHA = ["resumo", "aberto", "tarefas", "conversas", "agenda", "historico"] as const;

function ehAbaDaFicha(valor: unknown): valor is (typeof ABAS_DA_FICHA)[number] {
  return typeof valor === "string" && (ABAS_DA_FICHA as readonly string[]).includes(valor);
}
