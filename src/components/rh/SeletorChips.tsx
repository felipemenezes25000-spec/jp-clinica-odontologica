/**
 * Grupos de pílulas selecionáveis (vínculo, especialidades, softwares, idiomas).
 *
 * São botões de verdade, e não `<div>` com `onClick`: assim entram na ordem de
 * tabulação sozinhos, respondem a Enter e Espaço sem código extra e já são
 * anunciados como controle pelo leitor de tela.
 *
 * A semântica muda com o modo, porque a promessa feita ao leitor de tela é
 * diferente: escolha única vira `radiogroup` + `aria-checked` ("uma destas"),
 * múltipla vira `group` + `aria-pressed` ("quantas você quiser"). Trocar um pelo
 * outro anunciaria um contrato que a tela não cumpre.
 */
import { useRef, type KeyboardEvent } from "react";
import { Check } from "lucide-react";

import { Ajuda, MensagemErro, Rotulo } from "@/components/rh/CampoTexto";
import { idCampo } from "@/components/rh/idsCampo";

export function SeletorChips(props: {
  campo: string;
  rotulo: string;
  opcoes: { valor: string; rotulo: string }[];
  selecionados: string[];
  modo: "unica" | "multipla";
  aoAlternar: (valor: string) => void;
  erro?: string | undefined;
  ajuda?: string | undefined;
  opcional?: boolean | undefined;
  className?: string | undefined;
}) {
  const erro = props.erro ?? "";
  const ajuda = props.ajuda ?? "";
  const unica = props.modo === "unica";
  const botoes = useRef<(HTMLButtonElement | null)[]>([]);

  const descritos: string[] = [];
  if (ajuda.length > 0) descritos.push(`rh-ajuda-${props.campo}`);
  if (erro.length > 0) descritos.push(`rh-erro-${props.campo}`);

  // Num radiogroup o Tab entra e sai do grupo inteiro; quem escolhe entre as
  // opções são as setas. Por isso só um botão fica tabulável (o marcado, ou o
  // primeiro quando nada foi escolhido) — é o "roving tabindex" da WAI-ARIA.
  const indiceAtivo = props.opcoes.findIndex((o) => props.selecionados.includes(o.valor));
  const tabulavel = indiceAtivo >= 0 ? indiceAtivo : 0;

  const aoTeclar = (evento: KeyboardEvent<HTMLButtonElement>, indice: number) => {
    if (!unica) return;
    const total = props.opcoes.length;
    let destino = -1;
    if (evento.key === "ArrowRight" || evento.key === "ArrowDown") destino = (indice + 1) % total;
    if (evento.key === "ArrowLeft" || evento.key === "ArrowUp") {
      destino = (indice - 1 + total) % total;
    }
    if (evento.key === "Home") destino = 0;
    if (evento.key === "End") destino = total - 1;
    if (destino < 0) return;

    evento.preventDefault();
    const opcao = props.opcoes[destino];
    if (!opcao) return;
    // A seta já marca a opção, como manda o padrão de radiogroup: navegar sem
    // selecionar deixaria quem usa teclado sem jeito de escolher com as setas.
    props.aoAlternar(opcao.valor);
    botoes.current[destino]?.focus();
  };

  return (
    <div className={props.className ?? ""}>
      <Rotulo
        campo={props.campo}
        texto={props.rotulo}
        opcional={props.opcional}
        paraCampo={false}
      />
      <div
        role={unica ? "radiogroup" : "group"}
        aria-labelledby={`rh-rotulo-${props.campo}`}
        aria-describedby={descritos.length > 0 ? descritos.join(" ") : undefined}
        className="flex flex-wrap gap-2"
      >
        {props.opcoes.map((o, i) => {
          const ativo = props.selecionados.includes(o.valor);
          return (
            <button
              // O primeiro botão carrega o id do campo: é para ele que o
              // assistente manda o foco quando o grupo inteiro está inválido.
              id={i === 0 ? idCampo(props.campo) : undefined}
              key={o.valor}
              ref={(el) => {
                botoes.current[i] = el;
              }}
              type="button"
              className="rh-chip"
              data-ativo={ativo ? "true" : "false"}
              tabIndex={unica && i !== tabulavel ? -1 : undefined}
              role={unica ? "radio" : undefined}
              aria-checked={unica ? ativo : undefined}
              aria-pressed={unica ? undefined : ativo}
              onKeyDown={(e) => aoTeclar(e, i)}
              onClick={() => props.aoAlternar(o.valor)}
            >
              {/* O ícone é o sinal não cromático do estado: quem não distingue o
                  verde da borda ainda enxerga o "visto". */}
              {ativo ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
              {o.rotulo}
            </button>
          );
        })}
      </div>
      <Ajuda campo={props.campo} texto={ajuda} />
      <MensagemErro campo={props.campo} texto={erro} />
    </div>
  );
}
