/**
 * Navegação do Portal de RH.
 *
 * É uma tela de trabalho, não uma página: a navegação fica numa lateral de
 * 248px sobre o próprio chão (sem filete, sem sombra), com a marca e o escopo
 * no alto, as seções no meio e as ações da sessão embaixo. No celular a mesma
 * peça vira uma barra de 56px com o nome da seção e um botão "Menu" que abre a
 * lista — as seções são as mesmas, o DOM é um só.
 *
 * Por que `<aside>` e não `<header>`: a barra de filtros de Candidaturas
 * (`BarraFiltros`) procura o `<header>` grudento mais próximo para descobrir
 * quanto descer. Uma lateral de altura total, com esse nome, a faria descer a
 * janela inteira. A altura da barra do celular chega por `--rh-topo`.
 *
 * O marcador da seção ativa é a coroa da marca: a única forma com caráter do
 * sistema, usada aqui como ferramenta (diz onde você está), não como enfeite.
 */
import { Fragment, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { LogOut, Menu, RefreshCw, X } from "lucide-react";

import { Logo } from "@/components/site/Logo";
import { MarcaCoroa } from "@/components/site/sistema/Coroa";
import { IA_DO_RH_LIGADA } from "@/lib/rh/ia/tipos";

import "./painel.css";

export type AbaRh = "resumo" | "candidaturas" | "triagem" | "entrevistas" | "vagas" | "config";

const ABAS: { valor: AbaRh; rotulo: string }[] = [
  { valor: "resumo", rotulo: "Resumo" },
  { valor: "candidaturas", rotulo: "Candidaturas" },
  // Logo depois de Candidaturas de propósito: a triagem é a leitura daquela
  // mesma lista, e mantém a ordem do trabalho real — chega currículo, a IA lê,
  // o RH decide quem chamar. Some inteira com a IA desligada: tudo nela
  // (análise em lote, fila, importação com leitura) depende da IA.
  ...(IA_DO_RH_LIGADA ? [{ valor: "triagem" as const, rotulo: "Triagem por IA" }] : []),
  { valor: "entrevistas", rotulo: "Entrevistas" },
  { valor: "vagas", rotulo: "Vagas" },
  { valor: "config", rotulo: "Configurações" },
];

/**
 * Rótulos de grupo da lateral, antes da primeira aba de cada um: "o processo"
 * (leitura e decisão sobre pessoas) e "o site" (o que o portal publica). São
 * `role="presentation"` dentro do `tablist` para o leitor de tela continuar
 * ouvindo só abas.
 */
const GRUPOS: Partial<Record<AbaRh, string>> = {
  resumo: "Processo seletivo",
  vagas: "Portal",
};

function plural(n: number, singular: string, plural_: string): string {
  return n === 1 ? `1 ${singular}` : `${n} ${plural_}`;
}

export function CabecalhoRh({
  aba,
  aoTrocarAba,
  totalNovos,
  totalVagasAbertas,
  totalEntrevistas,
  atualizando,
  aoAtualizar,
  aoSair,
}: {
  aba: AbaRh;
  aoTrocarAba: (aba: AbaRh) => void;
  totalNovos: number;
  totalVagasAbertas: number;
  totalEntrevistas: number;
  atualizando: boolean;
  aoAtualizar: () => void;
  aoSair: () => void;
}) {
  const botoes = useRef<Array<HTMLButtonElement | null>>([]);
  const botaoMenu = useRef<HTMLButtonElement>(null);
  // Só existe no celular: a partir de lg a lista está sempre à vista (CSS).
  const [aberto, setAberto] = useState(false);

  // Esc fecha a lista no celular e devolve o foco ao botão que a abriu; sem
  // isso quem usa teclado externo ficaria preso num menu que não tem saída.
  useEffect(() => {
    if (!aberto) return undefined;
    const aoTeclar = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setAberto(false);
      botaoMenu.current?.focus();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aberto]);

  const aoTeclar = (evento: KeyboardEvent<HTMLButtonElement>, indice: number) => {
    const total = ABAS.length;
    let alvo = -1;
    // Setas verticais na lateral, horizontais para quem já tinha o hábito.
    if (evento.key === "ArrowDown" || evento.key === "ArrowRight") alvo = (indice + 1) % total;
    else if (evento.key === "ArrowUp" || evento.key === "ArrowLeft") {
      alvo = (indice - 1 + total) % total;
    } else if (evento.key === "Home") alvo = 0;
    else if (evento.key === "End") alvo = total - 1;
    if (alvo < 0) return;

    const item = ABAS[alvo];
    if (!item) return;
    evento.preventDefault();
    aoTrocarAba(item.valor);
    botoes.current[alvo]?.focus();
  };

  // Contagem só em fila que pede ação, e o substantivo vai no texto de apoio:
  // "Vagas 2" sozinho deixa a pessoa perguntando "dois o quê?".
  const selo = (valor: AbaRh): number => {
    if (valor === "candidaturas") return totalNovos;
    if (valor === "entrevistas") return totalEntrevistas;
    if (valor === "vagas") return totalVagasAbertas;
    return 0;
  };

  const descricaoSelo = (valor: AbaRh, n: number): string => {
    if (valor === "candidaturas") return `, ${plural(n, "candidatura nova", "candidaturas novas")}`;
    if (valor === "entrevistas") {
      return `, ${plural(n, "ficha aguardando entrevista", "fichas aguardando entrevista")}`;
    }
    return `, ${plural(n, "vaga aberta", "vagas abertas")}`;
  };

  const atual = ABAS.find((item) => item.valor === aba);

  return (
    <aside className="rh-lateral" data-aberto={aberto ? "true" : "false"}>
      <div className="rh-lateral__topo">
        <div className="rh-lateral__marca">
          <Logo variante="simbolo" fundo="claro" altura={30} className="shrink-0" />
          <div className="min-w-0">
            <p className="rh-lateral__nome">Portal de RH</p>
            <p className="rh-lateral__escopo">JP Clínica Integrada</p>
          </div>
        </div>

        {/* No celular o nome da seção atual fica ao lado do botão: a barra de
            56px responde "onde estou" sem abrir nada. */}
        <p className="rh-lateral__aqui" aria-hidden="true">
          {atual?.rotulo}
        </p>
        <button
          ref={botaoMenu}
          type="button"
          className="rh-lateral__menu"
          aria-expanded={aberto}
          aria-controls="rh-navegacao"
          onClick={() => setAberto((v) => !v)}
        >
          {aberto ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
          <span>{aberto ? "Fechar" : "Menu"}</span>
        </button>
      </div>

      <div id="rh-navegacao" className="rh-lateral__corpo">
        {/* `tablist` de verdade: só a aba ativa entra no Tab (foco itinerante) e as
            setas navegam entre elas. É o que a WAI-ARIA descreve para este padrão, e
            é o que faz diferença para quem opera o painel pelo teclado. */}
        <div
          role="tablist"
          aria-label="Seções do painel de RH"
          aria-orientation="vertical"
          className="rh-lateral__abas"
        >
          {ABAS.map((item, indice) => {
            const ativa = item.valor === aba;
            const n = selo(item.valor);
            return (
              <Fragment key={item.valor}>
                {GRUPOS[item.valor] ? (
                  <span role="presentation" aria-hidden="true" className="rh-lateral__grupo">
                    {GRUPOS[item.valor]}
                  </span>
                ) : null}
                <button
                  type="button"
                  role="tab"
                  id={`aba-rh-${item.valor}`}
                  ref={(el) => {
                    botoes.current[indice] = el;
                  }}
                  aria-selected={ativa}
                  aria-controls={ativa ? "conteudo" : undefined}
                  tabIndex={ativa ? 0 : -1}
                  onClick={() => {
                    aoTrocarAba(item.valor);
                    if (aberto) {
                      // No celular a lista fecha e o botão escolhido some com
                      // ela: o foco volta para o botão "Menu", não para o body.
                      setAberto(false);
                      botaoMenu.current?.focus();
                    }
                  }}
                  onKeyDown={(evento) => aoTeclar(evento, indice)}
                  className="rh-aba"
                >
                  <span className="rh-aba__marca" aria-hidden="true">
                    <MarcaCoroa />
                  </span>
                  <span className="rh-aba__rotulo">{item.rotulo}</span>
                  {n > 0 ? (
                    <span aria-hidden="true" className="rh-aba__n">
                      {n}
                    </span>
                  ) : null}
                  {n > 0 ? <span className="sr-only">{descricaoSelo(item.valor, n)}</span> : null}
                </button>
              </Fragment>
            );
          })}
        </div>

        <div className="rh-lateral__sessao">
          <button
            type="button"
            onClick={aoAtualizar}
            disabled={atualizando}
            aria-label={atualizando ? "Atualizando dados" : "Atualizar dados"}
            aria-busy={atualizando}
            className="rh-acao-lateral"
          >
            <RefreshCw
              size={16}
              className={atualizando ? "animate-spin" : undefined}
              aria-hidden="true"
            />
            {atualizando ? "Atualizando" : "Atualizar dados"}
          </button>
          <button type="button" onClick={aoSair} className="rh-acao-lateral">
            <LogOut size={16} aria-hidden="true" />
            Sair do painel
          </button>
        </div>
      </div>
    </aside>
  );
}
