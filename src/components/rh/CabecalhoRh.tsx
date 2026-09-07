/**
 * Cabeçalho do Portal de RH.
 *
 * O painel usa uma superfície clara como base e concentra o verde nas ações e
 * nos estados ativos. Assim a navegação fica mais leve para uso prolongado sem
 * perder a identidade da JP Clínica.
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
  // mesma lista, e mantém a ordem do trabalho real — chega currículo, a IA lê,
  // o RH decide quem chamar.
  { valor: "triagem", rotulo: "Triagem por IA", icone: Sparkles },
  { valor: "entrevistas", rotulo: "Entrevistas", icone: ClipboardList },
  { valor: "vagas", rotulo: "Vagas", icone: Briefcase },
  { valor: "config", rotulo: "Configurações", icone: Settings },
];

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
    evento.preventDefault();
    aoTrocarAba(item.valor);
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
    <header className="rh-topbar sticky top-0 z-50 border-b border-border-soft bg-white/95 backdrop-blur-xl">
      <div className="jp-container flex min-h-[72px] items-center justify-between gap-4 py-3">
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-mint ring-1 ring-forest/10">
            <Logo variante="simbolo" fundo="claro" altura={30} className="shrink-0" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-display text-[1.05rem] font-extrabold leading-tight text-ink">
              Portal de RH
            </p>
            <p className="mt-0.5 truncate text-xs font-medium text-ink-soft">
              JP Clínica Integrada
              <span aria-hidden="true" className="mx-1.5 text-ink-soft">
                •
              </span>
              {plural(totalCandidaturas, "candidatura", "candidaturas")}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={aoAtualizar}
            disabled={atualizando}
            aria-label={atualizando ? "Atualizando dados" : "Atualizar dados"}
            aria-busy={atualizando}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-border-soft bg-white px-3.5 text-sm font-bold text-ink shadow-sm transition hover:border-forest/25 hover:bg-mint/60 disabled:cursor-not-allowed disabled:opacity-60 sm:px-4"
          >
            <RefreshCw
              size={16}
              className={atualizando ? "animate-spin text-forest" : "text-forest"}
              aria-hidden="true"
            />
            <span className="hidden sm:inline">{atualizando ? "Atualizando" : "Atualizar"}</span>
          </button>

          <button
            type="button"
            onClick={aoSair}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-forest px-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-deep sm:px-4"
          >
            <LogOut size={16} aria-hidden="true" />
            <span className="hidden sm:inline">Sair</span>
            <span style={SO_LEITOR} className="sm:hidden">
              Sair do painel
            </span>
          </button>
        </div>
      </div>

      <div className="jp-container">
        {/* `tablist` de verdade: só a aba ativa entra no Tab (foco itinerante) e as
            setas navegam entre elas. É o que a WAI-ARIA descreve para este padrão, e
            é o que faz diferença para quem opera o painel pelo teclado. */}
        <div
          role="tablist"
          aria-label="Seções do painel de RH"
          aria-orientation="horizontal"
          className="rh-scroll -mb-px flex gap-1 overflow-x-auto pb-2"
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
                aria-controls={ativa ? "conteudo" : undefined}
                tabIndex={ativa ? 0 : -1}
                onClick={() => aoTrocarAba(item.valor)}
                onKeyDown={(evento) => aoTeclar(evento, indice)}
                className={`inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 text-sm transition sm:px-3.5 ${
                  ativa
                    ? "bg-forest font-extrabold text-white shadow-sm"
                    : "font-semibold text-ink-soft hover:bg-mint/70 hover:text-ink"
                }`}
              >
                <Icone size={16} aria-hidden="true" />
                {item.rotulo}
                {n > 0 ? (
                  <span
                    aria-hidden="true"
                    className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[0.65rem] font-extrabold tabular-nums ${
                      ativa ? "bg-white text-ink" : "bg-forest text-white"
                    }`}
                  >
                    {n}
                  </span>
                ) : null}
                {n > 0 ? <span style={SO_LEITOR}>{descricaoSelo(item.valor, n)}</span> : null}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}
