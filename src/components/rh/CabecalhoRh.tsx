/**
 * Barra superior do painel de RH: marca, abas e as duas ações que valem para o
 * painel inteiro (atualizar e sair).
 *
 * As abas são um `tablist` de verdade, com foco itinerante (só a aba ativa fica
 * no Tab) e as setas navegando entre elas — é o que a WAI-ARIA descreve para
 * este padrão, e é o que faz a diferença para quem opera o painel no teclado.
 */
import { useRef, type CSSProperties, type KeyboardEvent } from "react";
import {
  Briefcase,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  Settings,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";

import { Logo } from "@/components/site/Logo";

export type AbaRh = "resumo" | "candidaturas" | "triagem" | "entrevistas" | "vagas" | "config";

/**
 * Texto que só o leitor de tela ouve. Vai em `style` porque o projeto não tem
 * utilitário próprio para isso, e `display: none` esconderia o texto também de
 * quem usa leitor — o recorte por `clip-path` mantém o nó acessível.
 */
const SO_LEITOR: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: "hidden",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
  border: 0,
};

const ABAS: { valor: AbaRh; rotulo: string; icone: LucideIcon }[] = [
  { valor: "resumo", rotulo: "Resumo", icone: LayoutDashboard },
  { valor: "candidaturas", rotulo: "Candidaturas", icone: Users },
  // Logo depois de Candidaturas de propósito: a triagem é a leitura daquela
  // mesma lista, e separá-la das vagas mantém a ordem do trabalho real —
  // chega currículo, a IA lê, o RH decide quem chamar.
  { valor: "triagem", rotulo: "Triagem por IA", icone: Sparkles },
  // Entre a triagem e as vagas porque é a ordem do trabalho real: a IA lê, o RH
  // escolhe quem chamar, e a entrevista acontece — pelo guia da própria clínica.
  { valor: "entrevistas", rotulo: "Entrevistas", icone: ClipboardList },
  { valor: "vagas", rotulo: "Vagas", icone: Briefcase },
  { valor: "config", rotulo: "Configurações", icone: Settings },
];

/** Plural sem "(s)": o painel é lido o dia inteiro e essa muleta cansa. */
function plural(n: number, singular: string, plural_: string): string {
  return n === 1 ? `1 ${singular}` : `${n} ${plural_}`;
}

export function CabecalhoRh({
  aba,
  aoTrocarAba,
  totalNovos,
  totalVagasAbertas,
  totalCandidaturas,
  totalEntrevistas,
  atualizando,
  aoAtualizar,
  aoSair,
}: {
  aba: AbaRh;
  aoTrocarAba: (aba: AbaRh) => void;
  totalNovos: number;
  totalVagasAbertas: number;
  totalCandidaturas: number;
  /** Fichas prontas cuja entrevista ainda não foi concluída — o que espera na aba. */
  totalEntrevistas: number;
  atualizando: boolean;
  aoAtualizar: () => void;
  aoSair: () => void;
}) {
  const botoes = useRef<Array<HTMLButtonElement | null>>([]);

  const aoTeclar = (evento: KeyboardEvent<HTMLButtonElement>, indice: number) => {
    const total = ABAS.length;
    let alvo = -1;
    if (evento.key === "ArrowRight") alvo = (indice + 1) % total;
    else if (evento.key === "ArrowLeft") alvo = (indice - 1 + total) % total;
    else if (evento.key === "Home") alvo = 0;
    else if (evento.key === "End") alvo = total - 1;
    if (alvo < 0) return;

    const item = ABAS[alvo];
    if (!item) return;
    // preventDefault para a seta não rolar a página junto com a troca de aba.
    evento.preventDefault();
    aoTrocarAba(item.valor);
    // Ativação automática: a aba que recebe o foco já é a aba selecionada. Só
    // vale porque trocar de aba aqui é instantâneo (os dados já estão em mãos);
    // se houvesse ida ao servidor, o certo seria exigir Enter.
    botoes.current[alvo]?.focus();
  };

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

  return (
    <header className="sticky top-0 z-50 border-b border-lime/20 bg-brand-deep/90 backdrop-blur-xl">
      <div className="jp-container flex flex-wrap items-center justify-between gap-x-4 gap-y-3 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Logo variante="simbolo" fundo="escuro" altura={30} className="shrink-0" />
          <div className="min-w-0">
            <p className="truncate font-display text-base font-extrabold leading-tight text-white">
              Portal de RH
            </p>
            {/* Linha de apoio em branco a 85%, o piso do projeto para texto que
                ainda precisa ser lido sobre o verde. O ponto separador segue
                lime: é ponto, não letra. */}
            <p className="truncate text-xs text-white/85">
              JP Clínica Integrada
              <span aria-hidden="true" className="mx-1.5 text-lime">
                •
              </span>
              {plural(totalCandidaturas, "candidatura", "candidaturas")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={aoAtualizar}
            disabled={atualizando}
            aria-label={atualizando ? "Atualizando dados" : "Atualizar dados"}
            aria-busy={atualizando}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-white/20 px-4 text-sm font-semibold text-white transition hover:border-lime/60 hover:bg-white/10 disabled:opacity-60"
          >
            <RefreshCw size={16} className={atualizando ? "animate-spin" : ""} aria-hidden="true" />
            <span className="hidden sm:inline">{atualizando ? "Atualizando" : "Atualizar"}</span>
          </button>

          <button
            type="button"
            onClick={aoSair}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-white/20 px-4 text-sm font-semibold text-white transition hover:border-rose-200/60 hover:bg-white/10"
          >
            <LogOut size={16} aria-hidden="true" />
            <span className="hidden sm:inline">Sair</span>
            <span style={SO_LEITOR} className="sm:hidden">
              Sair do painel
            </span>
          </button>
        </div>
      </div>

      {/* No celular as abas rolam na horizontal em vez de quebrar em duas
          linhas: com quebra, a barra grudenta come um terço da tela útil. */}
      <div className="jp-container">
        <div
          role="tablist"
          aria-label="Seções do painel de RH"
          aria-orientation="horizontal"
          className="rh-scroll -mb-px flex gap-1 overflow-x-auto pb-0"
        >
          {ABAS.map((item, indice) => {
            const ativa = item.valor === aba;
            const n = selo(item.valor);
            const Icone = item.icone;
            return (
              <button
                key={item.valor}
                type="button"
                role="tab"
                id={`aba-rh-${item.valor}`}
                ref={(el) => {
                  botoes.current[indice] = el;
                }}
                aria-selected={ativa}
                /* Só a aba ativa aponta para o painel: o conteúdo das outras
                   nem existe no DOM, e um `aria-controls` para id inexistente é
                   referência quebrada. O <main id="conteudo"> é o tabpanel. */
                aria-controls={ativa ? "conteudo" : undefined}
                tabIndex={ativa ? 0 : -1}
                onClick={() => aoTrocarAba(item.valor)}
                onKeyDown={(evento) => aoTeclar(evento, indice)}
                className={`inline-flex h-12 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm transition sm:px-4 ${
                  ativa
                    ? // Aba ativa: sublinhado lime + peso da fonte + cor. Três
                      // sinais, porque só a cor não basta para quem não a vê.
                      "border-lime font-extrabold text-white"
                    : "border-transparent font-medium text-white/85 hover:border-white/30 hover:text-white"
                }`}
              >
                <Icone size={16} aria-hidden="true" />
                {item.rotulo}
                {n > 0 ? (
                  /* O selo era `bg-lime` com o número em verde profundo. Número
                     é letra, e letra sobre fundo verde é branca — só que branco
                     sobre `--lime` mede 3,0:1. Por isso o preenchimento desceu
                     para `--forest` (branco a mais de 10:1) e o lime virou o
                     anel, que continua destacando o selo na barra escura. */
                  <span
                    aria-hidden="true"
                    className="inline-flex min-w-6 items-center justify-center rounded-full bg-forest px-1.5 py-0.5 text-[0.7rem] font-extrabold tabular-nums text-white ring-1 ring-lime"
                  >
                    {n}
                  </span>
                ) : null}
                {/* O selo é decorativo para o leitor de tela; o número vira
                    texto no nome da aba, que é como ele é anunciado. */}
                {n > 0 ? <span style={SO_LEITOR}>{descricaoSelo(item.valor, n)}</span> : null}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}
