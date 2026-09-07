/**
 * Grade de disponibilidade: dias da semana x turnos.
 *
 * O RH da clínica lê essa grade antes de qualquer outra coisa — escala é o que
 * mais reprova candidato aqui —, então ela precisa ser preenchida em segundos.
 * Daí os atalhos: o rótulo do dia marca a linha inteira e o cabeçalho do turno
 * marca a coluna inteira. Cada atalho alterna: se a linha já está toda marcada,
 * o clique desmarca; caso contrário, completa. É o comportamento que a pessoa
 * espera de um "selecionar tudo" que também precisa desfazer.
 *
 * O estado sobe como lista plana de chaves ("seg-manha"), o formato que
 * `chaveDisponibilidade` define e que o JSON grava sem virar matriz.
 */
import { Check } from "lucide-react";

import { Ajuda, MensagemErro, Rotulo } from "@/components/rh/CampoTexto";
import { idCampo } from "@/components/rh/idsCampo";
import { chaveDisponibilidade, DIAS_SEMANA, TURNOS } from "@/lib/rh/opcoes";

export function GradeTurnos(props: {
  campo: string;
  selecionadas: string[];
  aoMudar: (chaves: string[]) => void;
  erro?: string | undefined;
  ajuda?: string | undefined;
}) {
  const erro = props.erro ?? "";
  const ajuda = props.ajuda ?? "";
  const marcadas = new Set(props.selecionadas);

  const descritos: string[] = [];
  if (ajuda.length > 0) descritos.push(`rh-ajuda-${props.campo}`);
  if (erro.length > 0) descritos.push(`rh-erro-${props.campo}`);

  const alternar = (chave: string) => {
    const proximas = new Set(marcadas);
    if (proximas.has(chave)) proximas.delete(chave);
    else proximas.add(chave);
    props.aoMudar([...proximas]);
  };

  /** Liga ou desliga um conjunto de células de uma vez (linha ou coluna). */
  const alternarConjunto = (chaves: string[]) => {
    const todasMarcadas = chaves.every((c) => marcadas.has(c));
    const proximas = new Set(marcadas);
    for (const c of chaves) {
      if (todasMarcadas) proximas.delete(c);
      else proximas.add(c);
    }
    props.aoMudar([...proximas]);
  };

  // Os atalhos moram em células claras (bg-cream no cabeçalho, bg-white nos
  // dias) e o hover ainda clareia mais (bg-mint): em fundo claro a letra é
  // `--ink`. Era `text-brand-text`, verde sobre claro — o que a clínica pediu
  // para tirar de todo rótulo.
  const atalho =
    "min-h-11 rounded-lg px-1.5 py-2 text-[0.7rem] font-bold uppercase tracking-[0.08em] " +
    "text-ink transition hover:bg-mint";

  return (
    <div>
      <Rotulo campo={props.campo} texto="Disponibilidade" paraCampo={false} />
      <div
        role="group"
        aria-labelledby={`rh-rotulo-${props.campo}`}
        aria-describedby={descritos.length > 0 ? descritos.join(" ") : undefined}
        className="overflow-hidden rounded-2xl border border-border-soft bg-white"
      >
        <div
          className="grid gap-px bg-border-soft"
          // 4 colunas fixas cabem em 360px: o rótulo do dia encolhe até 3rem e
          // as três células dividem o resto. Em grade fluida (auto-fit) os dias
          // quebravam para duas linhas e a leitura de coluna se perdia.
          style={{ gridTemplateColumns: "minmax(3rem, 0.8fr) repeat(3, minmax(0, 1fr))" }}
        >
          <div className="bg-cream px-2 py-2 text-[0.65rem] font-bold uppercase tracking-[0.1em] text-ink-soft">
            Dia
          </div>
          {TURNOS.map((t) => {
            const chaves = DIAS_SEMANA.map((d) => chaveDisponibilidade(d.valor, t.valor));
            const cheia = chaves.every((c) => marcadas.has(c));
            return (
              <button
                key={t.valor}
                type="button"
                className={`bg-cream ${atalho}`}
                onClick={() => alternarConjunto(chaves)}
                aria-label={
                  cheia
                    ? `Desmarcar todos os dias no turno da ${t.rotulo.toLowerCase()}`
                    : `Marcar todos os dias no turno da ${t.rotulo.toLowerCase()}`
                }
              >
                {t.rotulo}
              </button>
            );
          })}

          {DIAS_SEMANA.map((d) => {
            const chavesDia = TURNOS.map((t) => chaveDisponibilidade(d.valor, t.valor));
            const diaCheio = chavesDia.every((c) => marcadas.has(c));
            return (
              <div key={d.valor} className="contents">
                <button
                  type="button"
                  className={`bg-white ${atalho}`}
                  onClick={() => alternarConjunto(chavesDia)}
                  aria-label={
                    diaCheio ? `Desmarcar ${d.rotulo} inteira` : `Marcar ${d.rotulo} inteira`
                  }
                >
                  {d.curto}
                </button>
                {TURNOS.map((t, indiceTurno) => {
                  const chave = chaveDisponibilidade(d.valor, t.valor);
                  const ativa = marcadas.has(chave);
                  return (
                    <button
                      // O id do campo mora na primeira célula da grade: é ela
                      // que recebe o foco quando a validação barra o avanço.
                      id={
                        d.valor === DIAS_SEMANA[0]?.valor && indiceTurno === 0
                          ? idCampo(props.campo)
                          : undefined
                      }
                      key={chave}
                      type="button"
                      aria-pressed={ativa}
                      aria-label={`${d.rotulo} de ${t.rotulo.toLowerCase()}`}
                      onClick={() => alternar(chave)}
                      className={
                        // min-h-11 = 44px, o alvo mínimo de toque. O estado não
                        // é só cor: o "visto" aparece só quando está marcado.
                        "grid min-h-11 place-items-center transition " +
                        (ativa
                          ? "bg-forest text-white"
                          : "bg-white text-ink-soft hover:bg-mint focus-visible:bg-mint")
                      }
                    >
                      {ativa ? (
                        <Check className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <span
                          className="h-1.5 w-1.5 rounded-full bg-border-soft"
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <Ajuda campo={props.campo} texto={ajuda} />
      <MensagemErro campo={props.campo} texto={erro} />
    </div>
  );
}
