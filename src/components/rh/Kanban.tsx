import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import {
  Archive,
  Check,
  ClipboardCheck,
  ClipboardList,
  MessageCircle,
  MoveRight,
  Paperclip,
  Sparkles,
  Star,
  TriangleAlert,
} from "lucide-react";

import { ResumoDuvidas } from "@/components/rh/PainelDuvidas";
import { SeloSinais } from "@/components/rh/PainelSinais";
import { duvidasImportantesDe } from "@/lib/rh/duvidas";
import { leiturasDeDuvidas, situacaoDaFicha, totalDaFicha } from "@/lib/rh/ficha";
import { iniciais, primeiroNome, tempoRelativo } from "@/lib/rh/formatar";
import { linkWhatsapp } from "@/lib/rh/mensagens";
import { AREAS, STATUS } from "@/lib/rh/opcoes";
import { recomendacaoPor } from "@/lib/rh/ia/tipos";
import type { Candidatura, StatusCandidatura } from "@/lib/rh/tipos";

/** Área pode chegar vazia de um registro antigo; o texto de reserva evita "undefined". */
function rotuloArea(area: string): string {
  return AREAS.find((a) => a.valor === area)?.rotulo ?? "Sem área";
}

/**
 * Estrelas só de leitura. O `role="img"` com `aria-label` é o que faz o leitor
 * de tela anunciar "Nota 4 de 5" em vez de cinco ícones mudos — e esse texto é
 * também a pista não cromática que o projeto exige para qualquer estado.
 */
function Estrelas(props: { nota: number }) {
  if (props.nota <= 0) return null;
  return (
    <span
      role="img"
      aria-label={`Nota ${props.nota} de 5`}
      className="flex shrink-0 items-center gap-0.5"
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={11}
          strokeWidth={2}
          aria-hidden="true"
          fill={n <= props.nota ? "currentColor" : "none"}
          // Lime como texto só em fundo escuro — e o cartão do kanban é sempre escuro.
          className={n <= props.nota ? "text-lime" : "text-white/25"}
        />
      ))}
    </span>
  );
}

/**
 * A leitura da IA condensada para 240px de cartão: estrelas, a pílula da
 * recomendação e as contagens de sinal por gravidade.
 *
 * Quem nunca foi analisado ganha um tracinho, e não um espaço em branco. A
 * diferença importa quando o RH varre a coluna com o olho: vazio parece cartão
 * quebrado, tracinho diz "esta ainda não passou pela IA" — que é uma informação,
 * e é o que faz a pessoa clicar em "Analisar todas".
 */
function LinhaIa(props: { item: Candidatura }) {
  const analise = props.item.analise;

  if (analise === null) {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-[0.7rem] text-white/85">
        <Sparkles size={11} aria-hidden="true" className="shrink-0" />
        <span aria-hidden="true">IA —</span>
        <span className="sr-only">Sem leitura da IA</span>
      </p>
    );
  }

  if (analise.erro.length > 0) {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-[0.7rem] font-semibold text-rose-200">
        <TriangleAlert size={11} aria-hidden="true" className="shrink-0" />A leitura da IA falhou
      </p>
    );
  }

  const rec = recomendacaoPor(analise.recomendacao);

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span
        role="img"
        aria-label={`Leitura da IA: ${analise.estrelas} de 5 estrelas`}
        className="flex shrink-0 items-center gap-0.5"
      >
        <Sparkles size={11} aria-hidden="true" className="mr-0.5 text-lime" />
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            size={10}
            strokeWidth={2}
            aria-hidden="true"
            fill={n <= analise.estrelas ? "currentColor" : "none"}
            className={n <= analise.estrelas ? "text-lime" : "text-white/25"}
          />
        ))}
      </span>
      <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-bold ${rec.pilulaEscura}`}>
        {rec.rotulo}
      </span>
      <SeloSinais sinais={analise.sinais} />
    </div>
  );
}

/**
 * A ficha de entrevista no cartão, em um selo só.
 *
 * Discreto de propósito: quem varre a coluna com o olho precisa de duas
 * respostas — "já preparei a conversa desta pessoa?" e "esta já foi
 * entrevistada, e em quanto ficou?". Um ícone responde a primeira; o total
 * responde a segunda. Quem ainda não tem ficha não ganha selo nenhum: seria
 * ruído em cima do estado mais comum do painel.
 *
 * O total vai sem denominador porque o cartão não conhece o guia (é ele que diz
 * quanto vale o máximo), e um "38/0" inventado seria pior que o número puro. O
 * `/50` aparece na gaveta e no comparativo, onde o guia está em mãos.
 */
function SeloFicha(props: { item: Candidatura }) {
  const situacao = situacaoDaFicha(props.item.ficha);
  if (situacao === "sem" || situacao === "erro") return null;

  if (situacao === "concluida" && props.item.ficha !== null) {
    const { total } = totalDaFicha(props.item.ficha.notas);
    return (
      /* Fundo lime = fundo verde: o total vai branco. O selo continua verde na
         pastilha, no anel e no ícone — o que muda é só a letra. */
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-lime/15 px-2 py-0.5 text-[0.65rem] font-extrabold text-white ring-1 ring-lime/30">
        <ClipboardCheck size={11} aria-hidden="true" className="text-lime" />
        <span aria-hidden="true" className="tabular-nums">
          {total}
        </span>
        <span className="sr-only">Entrevista concluída, {total} pontos na ficha</span>
      </span>
    );
  }

  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[0.65rem] font-semibold text-white ring-1 ring-white/15">
      <ClipboardList size={11} aria-hidden="true" className="text-lime" />
      <span className="sr-only">
        {situacao === "preenchendo" ? "Ficha em preenchimento" : "Ficha de entrevista pronta"}
      </span>
      <span aria-hidden="true">Ficha</span>
    </span>
  );
}

/**
 * Pergunta sem resposta, no cartão do funil.
 *
 * Existe para uma cena específica: o RH arrastando gente de "entrevista" para
 * "proposta" numa tarde, olhando só para o cartão. Sem isto, a única forma de
 * saber que sobrou dúvida grave — o emprego curto que ninguém explicou, o
 * registro no conselho que ninguém conferiu — é abrir a gaveta de cada uma, e
 * ninguém abre quinze gavetas para mover cinco cartões. A pílula não julga a
 * candidata e não trava o arrasto: ela diz que ficou pergunta em aberto.
 *
 * Só aparece quando há dúvida IMPORTANTE (crítica ou alta) ainda não marcada
 * como "Convenceu". As outras não entram no cartão de propósito — 240px de
 * largura não comportam a lista inteira, e um selo que aparece em todo mundo
 * deixa de ser aviso e vira moldura.
 */
function SeloDuvidas(props: { item: Candidatura }) {
  const leituras = leiturasDeDuvidas(props.item.ficha);
  if (duvidasImportantesDe(props.item, leituras) === 0) return null;
  return <ResumoDuvidas item={props.item} leituras={leituras} />;
}

function CartaoCandidato(props: {
  item: Candidatura;
  agora: Date;
  arrastando: boolean;
  selecionada: boolean;
  aoAbrir: (id: string) => void;
  aoSelecionar: (id: string, marcada: boolean) => void;
  aoMoverStatus: (id: string, status: StatusCandidatura) => void;
  aoIniciarArrasto: (id: string) => void;
  aoTerminarArrasto: () => void;
}) {
  const { item } = props;
  const [menuAberto, setMenuAberto] = useState(false);
  const botaoMenuRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const idMenu = `${useId()}-mover`;

  // Abriu por teclado ou por clique, o foco vai para a primeira opção: um menu
  // que abre e deixa o foco para trás obriga a percorrer a página inteira de novo.
  useEffect(() => {
    if (!menuAberto) return;
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [menuAberto]);

  const fecharMenu = (devolverFoco: boolean) => {
    setMenuAberto(false);
    if (devolverFoco) botaoMenuRef.current?.focus();
  };

  const etiquetasVisiveis = item.etiquetas.slice(0, 2);
  const restantes = item.etiquetas.length - etiquetasVisiveis.length;
  const subtitulo = item.vagaTitulo.trim() || item.cargoDesejado.trim() || "Candidatura espontânea";
  /** Sem texto: o atalho do cartão só abre a conversa. Ver o comentário abaixo. */
  const hrefWhats = linkWhatsapp(item.telefone, "");

  return (
    <article
      draggable
      data-arrastando={props.arrastando ? "true" : "false"}
      onDragStart={(e: DragEvent<HTMLElement>) => {
        // O id viaja no dataTransfer além do estado local porque é ele que
        // sobrevive ao arrasto entre colunas — o estado só cuida do visual.
        e.dataTransfer.setData("text/plain", item.id);
        e.dataTransfer.effectAllowed = "move";
        props.aoIniciarArrasto(item.id);
      }}
      onDragEnd={props.aoTerminarArrasto}
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !menuAberto) return;
        // Para no cartão: mais acima, Escape é o atalho que fecha a gaveta.
        e.stopPropagation();
        fecharMenu(true);
      }}
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget)) return;
        setMenuAberto(false);
      }}
      /* A marca de selecionado não é só cor: além do anel lime, a própria
         caixa de seleção fica marcada e o contador da barra de lote sobe. */
      className={`rh-cartao-cand relative ${props.selecionada ? "ring-2 ring-lime" : ""}`}
    >
      <div className="flex items-start gap-2.5">
        {/* Caixa de seleção no lugar do avatar quando marcada não é opção: as
            duas coisas convivem, porque as iniciais são o que o RH usa para
            achar o cartão de relance. z-[2] para ficar acima do `.stretch-link`,
            que cobre o cartão inteiro — sem isso, marcar abriria a gaveta. */}
        <label className="relative z-[2] flex shrink-0 cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={props.selecionada}
            onChange={(e) => props.aoSelecionar(item.id, e.target.checked)}
            className="h-5 w-5 shrink-0 accent-lime"
          />
          <span className="sr-only">Selecionar {item.nome || "candidatura sem nome"}</span>
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-lime/15 text-xs font-extrabold text-white ring-1 ring-lime/25"
          >
            {iniciais(item.nome) || "?"}
          </span>
        </label>

        {/* `.stretch-link` estica o alvo deste botão por todo o cartão: clicar em
            qualquer canto abre a gaveta, mas quem recebe foco continua sendo um
            <button> de verdade, e não uma <div> clicável. */}
        <button
          type="button"
          onClick={() => props.aoAbrir(item.id)}
          className="stretch-link min-w-0 flex-1 text-left"
        >
          <span className="block truncate text-sm font-bold text-white">
            {item.nome || "Sem nome"}
          </span>
          <span className="mt-0.5 block truncate text-xs text-white/85">{subtitulo}</span>
        </button>

        {/* Atalho de WhatsApp: abre a conversa SEM mensagem pronta. É o gesto
            de "só quero falar rapidinho com ela", que na gaveta custa dois
            cliques a mais. Só ícone, sem preenchimento e sem cor forte, para
            não competir com abrir a ficha — que continua sendo o cartão
            inteiro. O texto pronto vive na central de contato, dentro da
            gaveta: um convite disparado daqui não teria o nome da vaga nem
            entraria no histórico dela. */}
        {hrefWhats === "" ? null : (
          <a
            href={hrefWhats}
            target="_blank"
            rel="noreferrer"
            aria-label={`Abrir conversa no WhatsApp com ${item.nome || "candidato"}`}
            onClick={(e) => e.stopPropagation()}
            className="relative z-[2] flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/15 text-white/85 transition-colors hover:border-lime/50 hover:text-white"
          >
            <MessageCircle size={16} aria-hidden="true" />
          </a>
        )}

        {/* Botão da lista "mover para". Ele existe por causa de quem não usa
            mouse: arrastar e soltar é gesto de ponteiro e a API nativa do HTML5
            não tem equivalente de teclado nenhum. Sem esta lista, teclado e leitor
            de tela não conseguiriam mudar o status de ninguém — o kanban seria
            decoração para essas pessoas. O z-[2] o mantém acima da camada do
            `.stretch-link`, que cobre o cartão inteiro. */}
        <button
          ref={botaoMenuRef}
          type="button"
          aria-controls={idMenu}
          aria-expanded={menuAberto}
          aria-label={`Mover ${primeiroNome(item.nome) || "candidato"} para outro status`}
          onClick={() => setMenuAberto((v) => !v)}
          className={`relative z-[2] flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors ${
            menuAberto
              ? "border-lime bg-lime/20 text-lime"
              : "border-white/15 text-white/85 hover:border-lime/50 hover:text-lime"
          }`}
        >
          <MoveRight size={16} aria-hidden="true" />
        </button>
      </div>

      {/* A lista abre no fluxo do cartão, e não flutuando: o corpo da coluna tem
          `overflow-y: auto`, então uma lista em position absolute seria cortada
          pela borda da coluna assim que o cartão estivesse perto do rodapé.

          É `role="group"`, e não `role="menu"`: com `menuitem` o leitor de tela
          entra em modo de aplicação e passa a esperar navegação por setas, que
          esta lista não implementa — o comportamento real é o de botões comuns,
          alcançáveis por Tab. */}
      {menuAberto ? (
        <div
          ref={menuRef}
          id={idMenu}
          role="group"
          aria-label="Mover para"
          className="relative z-[2] mt-2 rounded-xl border border-lime/30 bg-brand-deep/95 p-1"
        >
          {STATUS.map((s) => {
            const atual = s.valor === item.status;
            return (
              <button
                key={s.valor}
                type="button"
                aria-current={atual ? "true" : undefined}
                onClick={() => {
                  if (atual) {
                    fecharMenu(true);
                    return;
                  }
                  // Fecha SEM devolver o foco ao botão do cartão: a mudança de
                  // status é otimista, o cartão é recriado dentro de outra
                  // coluna e esse botão deixa de existir — o foco cairia no
                  // <body>. Quem reposiciona o foco é o pai, na coluna destino.
                  fecharMenu(false);
                  props.aoMoverStatus(item.id, s.valor);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2.5 text-left text-xs font-medium text-white transition-colors hover:bg-white/10"
              >
                <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${s.ponto}`} />
                <span className="min-w-0 flex-1 truncate">{s.rotulo}</span>
                {atual ? (
                  <Check size={14} aria-hidden="true" className="shrink-0 text-lime" />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-white ring-1 ring-white/15">
          {rotuloArea(item.area)}
        </span>
        <Estrelas nota={item.nota} />
        <SeloFicha item={item} />
        <SeloDuvidas item={item} />
        {item.arquivada ? (
          <span className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[0.65rem] font-semibold text-white">
            <Archive size={10} aria-hidden="true" />
            Arquivada
          </span>
        ) : null}
      </div>

      <LinhaIa item={item} />

      {item.etiquetas.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {etiquetasVisiveis.map((etiqueta) => (
            <li
              key={etiqueta}
              className="max-w-[9rem] truncate rounded-md bg-lime/10 px-1.5 py-0.5 text-[0.65rem] font-medium text-white ring-1 ring-lime/20"
            >
              {etiqueta}
            </li>
          ))}
          {restantes > 0 ? (
            <li className="rounded-md bg-white/10 px-1.5 py-0.5 text-[0.65rem] font-semibold text-white">
              +{restantes}
              <span className="sr-only"> outras etiquetas</span>
            </li>
          ) : null}
        </ul>
      ) : null}

      {/* O tempo relativo é a informação que o RH varre com o olho na coluna:
          branco de verdade, não branco esmaecido. */}
      <footer className="mt-2.5 flex items-center justify-between gap-2 text-[0.7rem] text-white/85">
        <span>{tempoRelativo(item.criadoEm, props.agora)}</span>
        {item.curriculo ? (
          <span className="flex items-center gap-1 text-white">
            <Paperclip size={12} aria-hidden="true" className="text-lime" />
            <span className="sr-only">Currículo anexado</span>
            <span aria-hidden="true">CV</span>
          </span>
        ) : null}
      </footer>
    </article>
  );
}

export function Kanban(props: {
  itens: Candidatura[];
  agora: Date;
  /** Ids marcados para as ações em lote. Vive na rota: a tabela e o kanban
   *  compartilham a MESMA seleção, e trocar de visão não pode perdê-la. */
  selecionadas: string[];
  aoAbrir: (id: string) => void;
  aoSelecionar: (id: string, marcada: boolean) => void;
  aoMoverStatus: (id: string, status: StatusCandidatura) => void;
}) {
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [colunaSobre, setColunaSobre] = useState<StatusCandidatura | null>(null);
  // Coluna que deve receber o foco depois de uma mudança feita pela lista do
  // cartão. Vira estado (e não um focus() no handler) porque o cartão só é
  // recriado na coluna destino no render seguinte.
  const [colunaFocada, setColunaFocada] = useState<StatusCandidatura | null>(null);
  const base = useId();

  useEffect(() => {
    if (colunaFocada === null) return;
    document.getElementById(`${base}-${colunaFocada}`)?.focus();
    setColunaFocada(null);
  }, [colunaFocada, base]);

  /** Caminho do teclado: move e leva o foco para o título da coluna de destino. */
  const moverPelaLista = (id: string, status: StatusCandidatura) => {
    props.aoMoverStatus(id, status);
    setColunaFocada(status);
  };

  const soltar = (e: DragEvent<HTMLElement>, status: StatusCandidatura) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || arrastando;
    setColunaSobre(null);
    setArrastando(null);
    if (!id) return;
    const item = props.itens.find((c) => c.id === id);
    // Soltar na própria coluna não é erro, mas também não é mudança: gravar aqui
    // geraria uma escrita em disco e um "atualizado agora" mentiroso.
    if (!item || item.status === status) return;
    props.aoMoverStatus(id, status);
  };

  return (
    <div className="jp-container py-5">
      <p className="mb-3 text-xs text-white/85">
        Arraste um cartão para outra coluna ou use o botão de mover dentro dele — os dois caminhos
        fazem a mesma coisa.
      </p>

      <div className="rh-scroll -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0">
        {STATUS.map((s) => {
          const daColuna = props.itens.filter((c) => c.status === s.valor);
          const idTitulo = `${base}-${s.valor}`;
          const alvo = colunaSobre === s.valor;

          return (
            <section
              key={s.valor}
              aria-labelledby={idTitulo}
              data-drop={alvo ? "true" : "false"}
              onDragOver={(e: DragEvent<HTMLElement>) => {
                // Sem o preventDefault o navegador recusa o soltar: por padrão
                // nenhum elemento é alvo válido de drop.
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (!alvo) setColunaSobre(s.valor);
              }}
              onDragLeave={(e: DragEvent<HTMLElement>) => {
                // Sair para um filho ainda dispara dragleave na coluna; sem esta
                // checagem o realce piscaria a cada cartão sob o cursor.
                if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                setColunaSobre((atual) => (atual === s.valor ? null : atual));
              }}
              onDrop={(e: DragEvent<HTMLElement>) => soltar(e, s.valor)}
              className="rh-coluna w-[17.5rem] shrink-0 snap-start"
            >
              <header className="rh-coluna-topo">
                <h3
                  id={idTitulo}
                  // Alvo de foco depois de mover um cartão pela lista: é o
                  // ponto estável mais próximo do cartão que acabou de chegar.
                  tabIndex={-1}
                  className="flex min-w-0 items-center gap-2 text-sm font-bold text-white outline-none"
                >
                  <span
                    aria-hidden="true"
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.ponto}`}
                  />
                  <span className="truncate">{s.rotulo}</span>
                </h3>
                <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-xs font-bold tabular-nums text-white">
                  {daColuna.length}
                  <span className="sr-only">
                    {daColuna.length === 1 ? " candidatura" : " candidaturas"}
                  </span>
                </span>
              </header>

              <div className="rh-coluna-corpo rh-scroll">
                {daColuna.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-white/25 px-3 py-6 text-center text-xs leading-relaxed text-white/85">
                    {/* `s.vazio` em vez de compor `Ninguém em ${s.rotulo}`:
                        metade dos rótulos já traz preposição ("Em triagem") ou
                        pede contração ("no Banco de talentos"), e "Ninguém em
                        Não seguiu" não é frase nenhuma. A frase de arrasto é a
                        única que pode citar o rótulo, porque o cita entre aspas
                        como nome de destino. */}
                    {arrastando ? `Solte aqui para mover para “${s.rotulo}”` : `${s.vazio}.`}
                  </p>
                ) : (
                  daColuna.map((item) => (
                    <CartaoCandidato
                      key={item.id}
                      item={item}
                      agora={props.agora}
                      arrastando={arrastando === item.id}
                      selecionada={props.selecionadas.includes(item.id)}
                      aoSelecionar={props.aoSelecionar}
                      aoAbrir={props.aoAbrir}
                      aoMoverStatus={moverPelaLista}
                      aoIniciarArrasto={setArrastando}
                      aoTerminarArrasto={() => {
                        setArrastando(null);
                        setColunaSobre(null);
                      }}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
