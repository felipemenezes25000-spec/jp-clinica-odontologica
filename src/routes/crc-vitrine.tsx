/**
 * Vitrine das telas do CRC — SÓ EM DESENVOLVIMENTO.
 *
 * ============================================================================
 *  POR QUE ISTO EXISTE.
 *
 *  As 43 telas do CRC só aparecem depois do login, e revisar aparência exige
 *  vê-las. Sem isto, qualquer mudança de visual é feita às cegas e verificada
 *  pelo usuário em produção — que foi exatamente como o portal quebrou uma vez.
 *
 *  A vitrine renderiza cada tela ISOLADA, com dados de mentira, sem sessão e
 *  sem senha. Dá para olhar as 43 em sequência, comparar espaçamento, tipografia
 *  e estado vazio, e enxergar a inconsistência que só aparece lado a lado.
 *
 *  COMO ELA ENGANA AS TELAS: as chamadas de servidor do TanStack vão para
 *  `/_serverFn/<base64>`, e o base64 carrega o NOME da função. A vitrine troca
 *  o `fetch` da página, lê esse nome e devolve o dado de mentira correspondente.
 *  Nenhuma linha do caminho real muda — o que é o ponto: uma vitrine que exige
 *  alterar o código de produção para funcionar não está mostrando o produto.
 *
 *  SEM ATALHO DE AUTENTICAÇÃO, de propósito. Seria mais simples criar uma sessão
 *  falsa no servidor, e seria uma porta dos fundos no código de verdade. Aqui
 *  nada toca sessão: as telas nem chegam a perguntar quem é o usuário.
 * ============================================================================
 *
 * ============================================================================
 *  O QUE ACONTECE EM PRODUÇÃO — conferido, e não suposto.
 *
 *  Esta linha dizia "EM PRODUÇÃO ESTA ROTA NÃO EXISTE — ela devolve 404". Foi
 *  medido em 13/09/2026, contra o site no ar:
 *
 *      GET https://www.jpclinicaodontologica.com.br/crc-vitrine  →  200
 *
 *  A ROTA EXISTE E RESPONDE. O que ela devolve fora de desenvolvimento é o
 *  aviso de "disponível só em desenvolvimento" — não 404.
 *
 *  O QUE A MEDIÇÃO CONFIRMOU, e é o que de fato importava:
 *
 *    o corpo da vitrine É removido pelo tree-shaking (`import.meta.env.DEV` é
 *    substituído por literal em build), então nenhum dado de mentira e nenhuma
 *    tela do CRC entram no pacote que o paciente baixa;
 *
 *    o que sobrevive é o CAMINHO registrado na árvore de rotas.
 *
 *  A diferença entre "404" e "200 com aviso" não muda o risco — muda o que
 *  alguém vai acreditar daqui a seis meses ao ler este comentário e decidir
 *  não conferir.
 * ============================================================================
 */
import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy, useEffect, useMemo, useState, type ReactElement } from "react";

import "@/components/crc/crc.css";
import "@/components/crc/crc-premium.css";

export const Route = createFileRoute("/crc-vitrine")({
  component: Vitrine,
});

/* -------------------------------------------------------------------------- */
/* O engano                                                                   */
/* -------------------------------------------------------------------------- */

/** `.../_serverFn/<base64>` → `carregarSaudeDoSistema`. */
function nomeDaFuncao(url: string): string | null {
  const cru = /\/_serverFn\/([^?/#]+)/u.exec(url)?.[1];
  if (cru === undefined) return null;
  try {
    const { export: exportado } = JSON.parse(atob(cru)) as { export?: string };
    if (typeof exportado !== "string") return null;
    return exportado.replace(/_createServerFn_handler$/u, "");
  } catch {
    return null;
  }
}

/**
 * Instala o interceptador e devolve como desinstalar.
 *
 * O que NÃO tem dado de mentira volta como falha explicada, e não como sucesso
 * vazio: assim a tela mostra o estado de ERRO dela — que também é aparência que
 * precisa ser revisada, e que ninguém nunca olha.
 */
function interceptar(dados: Record<string, unknown>): () => void {
  const original = window.fetch;

  window.fetch = async (entrada, init) => {
    const url =
      typeof entrada === "string"
        ? entrada
        : entrada instanceof URL
          ? entrada.toString()
          : entrada.url;

    const nome = nomeDaFuncao(url);
    if (nome === null) return original(entrada, init);

    const corpo =
      nome in dados
        ? dados[nome]
        : { ok: false, message: `A vitrine ainda não tem dado de mentira para "${nome}".` };

    /*
     * O INVÓLUCRO `{ result }` NÃO É DETALHE — sem ele a tela recebe `undefined`
     * e cai no `catch`, parecendo erro de dado quando é erro de protocolo.
     *
     * O servidor do TanStack devolve `{ result, error, context }` e o cliente
     * faz `return result.result`. Devolver o payload cru atravessa a rede, o
     * JSON é lido, nada lança — e o valor some. Foi exatamente o que aconteceu
     * aqui: `fetch` no console mostrava o dado certo e a tela mostrava erro.
     */
    return new Response(JSON.stringify({ result: corpo, error: undefined, context: {} }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  return () => {
    window.fetch = original;
  };
}

/* -------------------------------------------------------------------------- */
/* O catálogo                                                                 */
/* -------------------------------------------------------------------------- */

type Entrada = { chave: string; titulo: string; grupo: string; render: () => ReactElement };

const TELAS: readonly Entrada[] = [
  criar(
    "home",
    "Home",
    "Atender",
    () => import("@/components/crc/Home"),
    (M) => <M.Home nomeUsuario="Felipe" aoAbrirPaciente={() => undefined} />,
  ),
  criar(
    "inbox",
    "Inbox",
    "Atender",
    () => import("@/components/crc/Inbox"),
    (M) => (
      <M.Inbox
        aoAbrirPaciente={() => undefined}
        conversaInicial={null}
        aoConsumirInicial={() => undefined}
      />
    ),
  ),
  criar(
    "trabalho",
    "Meu trabalho",
    "Atender",
    () => import("@/components/crc/MeuTrabalho"),
    (M) => <M.MeuTrabalho usuarioId="u1" aoAbrirPaciente={() => undefined} />,
  ),
  criar(
    "radar",
    "Radar de Receita",
    "Recuperar",
    () => import("@/components/crc/Radar"),
    (M) => <M.Radar />,
  ),
  criar(
    "funil",
    "Funil",
    "Fechar",
    () => import("@/components/crc/Funil"),
    (M) => <M.Funil aoAbrirPaciente={() => undefined} />,
  ),
  criar(
    "agenda",
    "Agenda",
    "Agenda",
    () => import("@/components/crc/Agenda"),
    (M) => <M.Agenda aoAbrirPaciente={() => undefined} />,
  ),
  criar(
    "encaixes",
    "Encaixes",
    "Agenda",
    () => import("@/components/crc/Encaixes"),
    (M) => <M.Encaixes />,
  ),
  criar(
    "saude",
    "Saúde",
    "Operar",
    () => import("@/components/crc/Saude"),
    (M) => <M.Saude />,
  ),
  criar(
    "autonomia",
    "Centro de Autonomia",
    "Controlar",
    () => import("@/components/crc/Autonomia"),
    (M) => <M.Autonomia />,
  ),
  criar(
    "metas",
    "Metas",
    "Gerir",
    () => import("@/components/crc/Metas"),
    (M) => <M.Metas podeGerenciar />,
  ),
  criar(
    "campanhas",
    "Campanhas",
    "Captar",
    () => import("@/components/crc/Campanhas"),
    (M) => <M.Campanhas />,
  ),
  criar(
    "equipe",
    "Equipe",
    "Controlar",
    () => import("@/components/crc/Equipe"),
    (M) => <M.Equipe />,
  ),
];

/** Fecha o `lazy` num objeto simples — o `render` recebe o módulo já carregado. */
function criar<M>(
  chave: string,
  titulo: string,
  grupo: string,
  importar: () => Promise<M>,
  render: (modulo: M) => ReactElement,
): Entrada {
  const Componente = lazy(async () => {
    const modulo = await importar();
    return { default: () => render(modulo) };
  });
  return { chave, titulo, grupo, render: () => <Componente /> };
}

/* -------------------------------------------------------------------------- */
/* A página                                                                   */
/* -------------------------------------------------------------------------- */

function Vitrine(): ReactElement {
  const [pronta, setPronta] = useState(false);
  const [atual, setAtual] = useState<string>(TELAS[0]?.chave ?? "");

  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    let desfazer = (): void => undefined;
    void (async () => {
      const { DADOS_DA_VITRINE } = await import("@/components/crc/vitrine-dados");
      desfazer = interceptar(DADOS_DA_VITRINE);
      setPronta(true);
    })();
    return () => {
      desfazer();
    };
  }, []);

  const grupos = useMemo(() => {
    const m = new Map<string, Entrada[]>();
    for (const t of TELAS) {
      if (!m.has(t.grupo)) m.set(t.grupo, []);
      m.get(t.grupo)?.push(t);
    }
    return [...m];
  }, []);

  if (!import.meta.env.DEV) {
    return (
      <p style={{ padding: "2rem", fontFamily: "system-ui" }}>Disponível só em desenvolvimento.</p>
    );
  }

  const escolhida = TELAS.find((t) => t.chave === atual);

  return (
    <div
      className="crc-app"
      style={{ display: "grid", gridTemplateColumns: "230px 1fr", minHeight: "100vh" }}
    >
      <nav
        style={{
          borderRight: "1px solid var(--border-soft, #e0e5dd)",
          padding: "1rem",
          overflowY: "auto",
          maxHeight: "100vh",
        }}
      >
        <strong style={{ display: "block", marginBottom: "0.75rem", fontSize: "0.9rem" }}>
          Vitrine · {String(TELAS.length)} telas
        </strong>
        {grupos.map(([grupo, itens]) => (
          <div key={grupo} style={{ marginBottom: "0.9rem" }}>
            <div
              style={{
                fontSize: "0.68rem",
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                opacity: 0.55,
              }}
            >
              {grupo}
            </div>
            {itens.map((t) => (
              <button
                key={t.chave}
                type="button"
                onClick={() => {
                  setAtual(t.chave);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "0.35rem 0.4rem",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "0.85rem",
                  background: t.chave === atual ? "var(--mint, #e9f2e5)" : "transparent",
                  fontWeight: t.chave === atual ? 700 : 400,
                }}
              >
                {t.titulo}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <main
        style={{ padding: "1.5rem", overflow: "auto", maxHeight: "100vh" }}
        data-vitrine-alvo={atual}
      >
        {!pronta ? (
          <p>Preparando os dados de mentira…</p>
        ) : (
          <Suspense fallback={<p>Carregando a tela…</p>}>{escolhida?.render()}</Suspense>
        )}
      </main>
    </div>
  );
}
