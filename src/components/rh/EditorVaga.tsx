/**
 * Editor de vaga: o formulário que coloca (ou tira) um anúncio do ar.
 *
 * É um diálogo modal em tela cheia, e não a `.rh-gaveta` do painel, por dois
 * motivos: a gaveta nasce escura e com 30rem fixos — e os campos do portal
 * (`.rh-rotulo` em --brand-text, `.rh-campo` em branco) só têm contraste em
 * superfície clara, além de a prévia precisar caber ao lado do formulário. Como
 * as classes `.rh-*` moram fora de @layer, elas venceriam qualquer utilitário do
 * Tailwind que tentasse trocar fundo ou largura da gaveta; então a superfície
 * aqui é montada do zero.
 *
 * Os campos reusam `CampoTexto`/`CampoSelect`/`CampoTextarea`, `SeletorChips` e
 * `GradeTurnos`, os mesmos do formulário público — inclusive o contrato de id
 * (`rh-campo-<campo>`), que é o que permite levar o foco ao primeiro campo
 * inválido com um `getElementById`, sem uma ref por campo. Os nomes de campo
 * levam o prefixo "vaga-" porque o painel monta várias telas ao mesmo tempo e
 * um id repetido faria o <label> apontar para o controle errado.
 */
import { useEffect, useRef, useState } from "react";
import { CircleAlert, Eye, MapPin, Pencil, Save, Send, Sparkles, X } from "lucide-react";
import {
  Ajuda,
  CampoSelect,
  CampoTexto,
  CampoTextarea,
  MensagemErro,
  Rotulo,
} from "@/components/rh/CampoTexto";
import { descritores, idCampo } from "@/components/rh/idsCampo";
import { CartaoVaga } from "@/components/rh/CartaoVaga";
import { Interruptor, ListaEditavel } from "@/components/rh/ControlesRh";
import { GradeTurnos } from "@/components/rh/GradeTurnos";
import { SeletorChips } from "@/components/rh/SeletorChips";
import { mascararMoeda } from "@/lib/rh/formatar";
import {
  AREAS,
  ESPECIALIDADES_ODONTO,
  MODELOS_TRABALHO,
  STATUS_VAGA,
  VINCULOS,
  statusVagaPor,
} from "@/lib/rh/opcoes";
import type { AreaVaga, ModeloTrabalho, StatusVaga, Vaga, Vinculo } from "@/lib/rh/tipos";
import { LIMITES, vagaVazia } from "@/lib/rh/tipos";
import { validarVaga } from "@/lib/rh/vagas";
import { CLINICA } from "@/lib/jp";

const MAX_RESUMO = 220;

/**
 * Chave do erro em `validarVaga` -> nome do campo na tela, na mesma ordem em que
 * os campos aparecem. Ao salvar com erro, o foco vai para o primeiro problema de
 * cima para baixo; mandar para um campo lá embaixo faria a pessoa perder a
 * referência de onde estava.
 */
const ORDEM_ERROS: { erro: string; campo: string }[] = [
  { erro: "titulo", campo: "vaga-titulo" },
  { erro: "resumo", campo: "vaga-resumo" },
  { erro: "area", campo: "vaga-area" },
  { erro: "vinculo", campo: "vaga-vinculo" },
  { erro: "quantidade", campo: "vaga-quantidade" },
  { erro: "encerraEm", campo: "vaga-encerraEm" },
];

const FOCAVEIS =
  "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), " +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const ESPECIALIDADES = ESPECIALIDADES_ODONTO.map((e) => ({ valor: e, rotulo: e }));

export function EditorVaga(props: {
  vaga: Vaga | null;
  beneficiosSugeridos: string[];
  salvando: boolean;
  aoFechar: () => void;
  aoSalvar: (vaga: Vaga) => void;
}) {
  const { vaga } = props;

  const [form, setForm] = useState<Vaga>(() => vaga ?? vagaVazia());
  const [erros, setErros] = useState<Record<string, string>>({});
  const [alvoFoco, setAlvoFoco] = useState("");
  const [abaCelular, setAbaCelular] = useState<"editar" | "previa">("editar");

  /**
   * "Agora" congelado na primeira montagem, como manda a regra das datas do
   * projeto. Aqui é seguro: com `vaga === null` o componente não renderiza nada,
   * então o servidor nunca imprime texto derivado deste instante — quando o
   * editor abre, já é interação do usuário, no cliente.
   */
  const [agora] = useState(() => new Date());

  const painelRef = useRef<HTMLDivElement | null>(null);
  // O listener de teclado vive fora do React (ver abaixo) e não pode carregar
  // um `aoFechar` congelado na montagem.
  const refFechar = useRef(props.aoFechar);
  useEffect(() => {
    refFechar.current = props.aoFechar;
  }, [props.aoFechar]);

  // Cada abertura recomeça do zero: sem isso, editar a vaga A, fechar e abrir a
  // vaga B mostraria o rascunho de A (o estado local sobrevive à troca de prop).
  useEffect(() => {
    if (!vaga) return;
    setForm(vaga);
    setErros({});
    setAlvoFoco("");
    setAbaCelular("editar");
  }, [vaga]);

  // Foco entra no primeiro campo ao abrir e volta ao botão de origem ao fechar:
  // quem navega por teclado precisa retomar de onde estava na lista de vagas.
  useEffect(() => {
    if (!vaga) return undefined;
    const origem = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.getElementById(idCampo("vaga-titulo"))?.focus();
    return () => origem?.focus();
  }, [vaga]);

  // Trava a rolagem do fundo: sem isso, rolar dentro do editor no celular
  // arrasta a lista de vagas por baixo e a posição dela se perde.
  useEffect(() => {
    if (!vaga) return undefined;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = anterior;
    };
  }, [vaga]);

  /**
   * Armadilha de foco no Tab e fechamento no Escape.
   *
   * O listener é do `document`, e não um `onKeyDown` no wrapper: um clique em
   * área não focável do diálogo (o parágrafo da prévia, um título) joga o foco
   * no <body>, e dali em diante nenhuma tecla nasceria mais dentro da subárvore
   * React — Escape pararia de fechar e o Tab seguinte sairia do modal. Por isso
   * também o `!painel.contains(...)`: foco fora conta como "antes do primeiro".
   * O `querySelectorAll` roda no momento da tecla porque metade dos controles
   * aparece e some conforme o formulário muda (chips, sugestões de benefício).
   */
  useEffect(() => {
    if (!vaga) return undefined;

    const tecla = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") {
        evento.preventDefault();
        evento.stopPropagation();
        refFechar.current();
        return;
      }
      if (evento.key !== "Tab") return;

      const painel = painelRef.current;
      if (!painel) return;
      const alvos = Array.from(painel.querySelectorAll<HTMLElement>(FOCAVEIS)).filter(
        // offsetParent nulo = escondido (aba do celular, bloco condicional).
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      const primeiro = alvos[0];
      const ultimo = alvos[alvos.length - 1];
      if (!primeiro || !ultimo) {
        evento.preventDefault();
        painel.focus();
        return;
      }

      const ativo = document.activeElement;
      const fora = !painel.contains(ativo) || ativo === painel;
      if (evento.shiftKey && (ativo === primeiro || fora)) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && (ativo === ultimo || fora)) {
        evento.preventDefault();
        primeiro.focus();
      }
    };

    // Captura para chegar antes de qualquer handler da página por baixo.
    document.addEventListener("keydown", tecla, true);
    return () => document.removeEventListener("keydown", tecla, true);
  }, [vaga]);

  /**
   * O foco no campo inválido roda em efeito, e não direto no clique de salvar:
   * no celular o campo pode estar escondido atrás da aba "Prévia", e ele só
   * volta a existir no DOM depois que o React reaplica `abaCelular`.
   */
  useEffect(() => {
    if (alvoFoco === "") return;
    document.getElementById(idCampo(alvoFoco))?.focus();
    setAlvoFoco("");
  }, [alvoFoco]);

  if (!vaga) return null;

  const novo = vaga.id.trim().length === 0;
  const statusAtual = statusVagaPor(form.status);

  // A cópia + atribuição indexada existe para o TypeScript: com `{ ...atual,
  // [campo]: valor }` a chave genérica vira índice de string e o resultado
  // deixa de ser um `Vaga` aos olhos do compilador.
  const trocar = <C extends keyof Vaga>(campo: C, valor: Vaga[C]) => {
    setForm((atual) => {
      const proximo: Vaga = { ...atual };
      proximo[campo] = valor;
      return proximo;
    });
  };

  const alternarEspecialidade = (nome: string) => {
    setForm((atual) => ({
      ...atual,
      especialidades: atual.especialidades.includes(nome)
        ? atual.especialidades.filter((e) => e !== nome)
        : [...atual.especialidades, nome],
    }));
  };

  const salvar = (publicando: boolean) => {
    // "Salvar e publicar" é só um atalho para trocar o status antes de validar,
    // assim o mesmo caminho de validação vale para os dois botões.
    const proposta: Vaga = publicando ? { ...form, status: "aberta" } : form;
    const encontrados = validarVaga(proposta);
    setErros(encontrados);

    const primeiro = ORDEM_ERROS.find((par) => encontrados[par.erro] !== undefined);
    if (primeiro !== undefined) {
      setAbaCelular("editar");
      setAlvoFoco(primeiro.campo);
      return;
    }
    props.aoSalvar(proposta);
  };

  const abaClasse = (ativa: boolean) =>
    `inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full px-4 text-sm font-extrabold transition ${
      ativa ? "bg-forest text-white" : "bg-white text-ink ring-1 ring-border-soft"
    }`;

  return (
    /* CENTRALIZADO, e não encostado na direita. Como gaveta de 68rem, num
       monitor de 1920 o editor ocupava a metade direita e a outra metade ficava
       escura e inútil — e é um formulário com prévia ao lado, não um painel de
       detalhe. No celular continua ocupando a tela inteira, que ali é o certo:
       margem em volta de um formulário de 20 campos é espaço roubado. */
    <div className="fixed inset-0 z-[95] flex items-stretch justify-center p-0 sm:items-center sm:p-4 lg:p-6">
      {/*
        Fundo escuro clicável. É <button> e não <div> por regra do projeto — e
        com tabIndex -1 para não duplicar, no percurso de teclado, o "Fechar"
        que já está no cabeçalho (o Escape cobre o mesmo caminho).
      */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className="absolute inset-0 cursor-default bg-brand-deep/75 backdrop-blur-sm"
        onClick={props.aoFechar}
      />

      <div
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-vaga-titulo"
        // Clicar num texto do diálogo precisa ter onde pousar: sem este alvo o
        // foco cai no <body> e a armadilha perde a referência de onde está.
        tabIndex={-1}
        /* A folha global pinta o foco de lime dentro de `.rh-aurora`, porque
           o painel é escuro; este diálogo é claro, e ali o lime mede 2,81:1. */
        /* 100rem de teto, e não a tela inteira: acima disso o campo de título
           esticaria por mais de um metro de pixel e a leitura piora em vez de
           melhorar. Em 1920 sobra uma moldura fina; em 2560 o diálogo fica
           centrado com margem generosa, que é o comportamento certo. */
        className="relative z-10 flex h-full w-full max-w-[100rem] flex-col overflow-hidden bg-paper shadow-[0_0_80px_-20px_rgba(0,0,0,.7)] outline-none sm:h-auto sm:max-h-[min(94dvh,64rem)] sm:rounded-3xl [&_:focus-visible]:outline-forest-2"
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-border-soft bg-white px-4 py-4 sm:px-6">
          <span
            aria-hidden="true"
            className="mt-0.5 inline-grid h-10 w-10 shrink-0 place-items-center rounded-full bg-mint text-forest"
          >
            <Pencil className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="editor-vaga-titulo"
              className="font-display text-xl font-extrabold leading-tight text-forest-2"
            >
              {novo ? "Nova vaga" : "Editar vaga"}
            </h2>
            <p className="rh-ajuda">
              {form.status === "aberta"
                ? "Ao salvar, esta vaga fica visível no portal de carreiras do site."
                : "Enquanto o status não for “Aberta”, nada disto aparece no site."}
            </p>
          </div>
          <button
            type="button"
            aria-label="Fechar editor de vaga"
            className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border-soft bg-white text-ink-soft transition hover:border-forest hover:text-forest"
            onClick={props.aoFechar}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        {/* Abas só no celular: no desktop formulário e prévia ficam lado a lado. */}
        <div className="flex shrink-0 gap-2 border-b border-border-soft bg-cream/60 px-4 py-3 lg:hidden">
          <button
            type="button"
            className={abaClasse(abaCelular === "editar")}
            aria-pressed={abaCelular === "editar"}
            onClick={() => setAbaCelular("editar")}
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Editar
          </button>
          <button
            type="button"
            className={abaClasse(abaCelular === "previa")}
            aria-pressed={abaCelular === "previa"}
            onClick={() => setAbaCelular("previa")}
          >
            <Eye className="h-4 w-4" aria-hidden="true" />
            Prévia
          </button>
        </div>

        <div className="rh-scroll min-h-0 flex-1 overflow-y-auto">
          <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_23rem] 2xl:gap-8 2xl:grid-cols-[minmax(0,1fr)_27rem]">
            {/* ---------------- Formulário ---------------- */}
            {/* DUAS COLUNAS a partir de 1536px. O formulário tem quatro
                blocos e vinte campos; numa coluna só, quem edita a jornada não
                enxerga mais o título, e salvar vira um passeio de rolagem. Com
                a largura que o diálogo ganhou, os quatro blocos cabem em duas
                colunas e a maior parte da edição acontece sem rolar.

                `items-start` porque os blocos têm alturas diferentes de
                propósito — a lista de requisitos cresce, a de jornada não — e
                esticar um para acompanhar o outro só deixaria buraco no meio. */}
            <div
              className={`min-w-0 space-y-7 ${abaCelular === "editar" ? "" : "hidden"} lg:block 2xl:grid 2xl:grid-cols-2 2xl:items-start 2xl:gap-x-8 2xl:gap-y-7 2xl:space-y-0`}
            >
              <section className="space-y-4">
                <CampoTexto
                  campo="vaga-titulo"
                  rotulo="Título da vaga"
                  valor={form.titulo}
                  maxLength={120}
                  placeholder="Ex.: Recepcionista para clínica odontológica"
                  erro={erros["titulo"] ?? ""}
                  ajuda="É o título que aparece no card e vira o endereço da vaga no site."
                  aoMudar={(v) => trocar("titulo", v)}
                />

                <CampoTextarea
                  campo="vaga-resumo"
                  rotulo="Resumo (aparece no card)"
                  valor={form.resumo}
                  linhas={3}
                  maxLength={MAX_RESUMO}
                  placeholder="Uma ou duas frases sobre o dia a dia de quem ocupar a vaga."
                  erro={erros["resumo"] ?? ""}
                  rodape={
                    <p className="mt-1 text-right text-xs font-semibold tabular-nums text-ink">
                      {form.resumo.length} de {MAX_RESUMO} caracteres
                    </p>
                  }
                  aoMudar={(v) => trocar("resumo", v)}
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  {/*
                    Status e modelo são <select> escritos à mão: `CampoSelect`
                    sempre abre com uma opção vazia (o placeholder acessível dos
                    campos opcionais do formulário público), e aqui escolher o
                    vazio gravaria um status que não existe no domínio.
                  */}
                  <div>
                    <Rotulo campo="vaga-status" texto="Status" />
                    <select
                      id={idCampo("vaga-status")}
                      className="rh-campo"
                      value={form.status}
                      aria-describedby={descritores("vaga-status", statusAtual.descricao, "")}
                      onChange={(e) => trocar("status", e.target.value as StatusVaga)}
                    >
                      {STATUS_VAGA.map((s) => (
                        <option key={s.valor} value={s.valor}>
                          {s.rotulo}
                        </option>
                      ))}
                    </select>
                    <Ajuda campo="vaga-status" texto={statusAtual.descricao} />
                  </div>

                  <div>
                    <Rotulo campo="vaga-quantidade" texto="Posições abertas" />
                    <input
                      id={idCampo("vaga-quantidade")}
                      className="rh-campo"
                      type="number"
                      min={1}
                      max={99}
                      step={1}
                      inputMode="numeric"
                      value={form.quantidade}
                      aria-invalid={erros["quantidade"] !== undefined}
                      aria-describedby={descritores(
                        "vaga-quantidade",
                        "",
                        erros["quantidade"] ?? "",
                      )}
                      onChange={(e) => {
                        const n = Number.parseInt(e.target.value, 10);
                        trocar("quantidade", Number.isNaN(n) ? 0 : n);
                      }}
                    />
                    <MensagemErro campo="vaga-quantidade" texto={erros["quantidade"] ?? ""} />
                  </div>
                </div>

                <Interruptor
                  rotulo="Destacar no topo do portal"
                  descricao="Vagas em destaque aparecem antes das demais na página de carreiras."
                  ligado={form.destaque}
                  desativado={props.salvando}
                  aoMudar={(v) => trocar("destaque", v)}
                />
              </section>

              <section className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <CampoSelect
                    campo="vaga-area"
                    rotulo="Área"
                    valor={form.area}
                    opcoes={AREAS.map((a) => ({ valor: a.valor, rotulo: a.rotulo }))}
                    erro={erros["area"] ?? ""}
                    aoMudar={(v) => trocar("area", v as AreaVaga)}
                  />
                  <CampoSelect
                    campo="vaga-vinculo"
                    rotulo="Vínculo"
                    valor={form.vinculo}
                    opcoes={VINCULOS}
                    erro={erros["vinculo"] ?? ""}
                    aoMudar={(v) => trocar("vinculo", v as Vinculo)}
                  />
                  <div>
                    <Rotulo campo="vaga-modelo" texto="Modelo" />
                    <select
                      id={idCampo("vaga-modelo")}
                      className="rh-campo"
                      value={form.modelo}
                      onChange={(e) => trocar("modelo", e.target.value as ModeloTrabalho)}
                    >
                      {MODELOS_TRABALHO.map((m) => (
                        <option key={m.valor} value={m.valor}>
                          {m.rotulo}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Especialidade só faz sentido para cadeira: pedir isso numa vaga
                    de recepção confunde quem preenche e quem lê o anúncio. */}
                {form.area === "dentista" ? (
                  <SeletorChips
                    campo="vaga-especialidades"
                    rotulo="Especialidades desejadas"
                    opcoes={ESPECIALIDADES}
                    selecionados={form.especialidades}
                    modo="multipla"
                    opcional
                    ajuda="Aparecem na página da vaga como o perfil que a clínica procura."
                    aoAlternar={alternarEspecialidade}
                  />
                ) : null}

                <CampoTextarea
                  campo="vaga-descricao"
                  rotulo="Descrição completa"
                  valor={form.descricao}
                  linhas={8}
                  // O mesmo número que o servidor grava (`LIMITES`, em
                  // tipos.ts). Com 6000, o texto era aceito na tela e cortado no
                  // meio da frase na gravação — e o corte ia direto para a
                  // página pública da vaga e para o JSON-LD, sem aviso nenhum.
                  maxLength={LIMITES.textoLongo}
                  opcional
                  placeholder="Conte como é a rotina, o perfil de paciente, a equipe e o que a clínica espera dessa pessoa."
                  ajuda="É o texto da página da vaga. As listas abaixo aparecem em blocos separados."
                  aoMudar={(v) => trocar("descricao", v)}
                />
              </section>

              <section className="space-y-6">
                <ListaEditavel
                  rotulo="Responsabilidades"
                  ajuda="O que a pessoa faz no dia a dia. Comece pelo mais frequente."
                  placeholder="Ex.: Confirmar a agenda do dia seguinte"
                  itens={form.responsabilidades}
                  sugestoes={[]}
                  rotuloSugestoes=""
                  aoMudar={(itens) => trocar("responsabilidades", itens)}
                />
                <ListaEditavel
                  rotulo="Requisitos"
                  ajuda="Só o que é mesmo obrigatório: os três primeiros já aparecem no card."
                  placeholder="Ex.: CRO ativo em São Paulo"
                  itens={form.requisitos}
                  sugestoes={[]}
                  rotuloSugestoes=""
                  aoMudar={(itens) => trocar("requisitos", itens)}
                />
                <ListaEditavel
                  rotulo="Diferenciais"
                  ajuda="O que conta pontos, mas não elimina quem não tem."
                  placeholder="Ex.: Experiência com escaneamento intraoral"
                  itens={form.diferenciais}
                  sugestoes={[]}
                  rotuloSugestoes=""
                  aoMudar={(itens) => trocar("diferenciais", itens)}
                />
                <ListaEditavel
                  rotulo="Benefícios"
                  ajuda="É a parte mais lida do anúncio. Vale repetir o óbvio."
                  placeholder="Ex.: Vale-transporte"
                  itens={form.beneficios}
                  sugestoes={props.beneficiosSugeridos}
                  rotuloSugestoes="Benefícios padrão da clínica (definidos na aba Config)"
                  aoMudar={(itens) => trocar("beneficios", itens)}
                />
              </section>

              <section className="space-y-4">
                <CampoTexto
                  campo="vaga-jornada"
                  rotulo="Jornada"
                  valor={form.jornada}
                  maxLength={120}
                  opcional
                  placeholder="Ex.: 44h semanais, de segunda a sexta"
                  ajuda="Sai no card junto com o modelo de trabalho."
                  aoMudar={(v) => trocar("jornada", v)}
                />

                <GradeTurnos
                  campo="vaga-turnos"
                  selecionadas={form.turnos}
                  ajuda="Turnos em que esta vaga trabalha. Ajuda o candidato a se descartar sozinho quando a escala não serve."
                  aoMudar={(chaves) => trocar("turnos", chaves)}
                />

                <div>
                  <CampoTexto
                    campo="vaga-local"
                    rotulo="Local de trabalho"
                    valor={form.local}
                    // Idem: mesmo teto do corte no servidor.
                    maxLength={LIMITES.localVaga}
                    opcional
                    placeholder="Endereço ou região onde a pessoa vai trabalhar"
                    aoMudar={(v) => trocar("local", v)}
                  />
                  <button
                    type="button"
                    className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-full border border-forest/30 bg-white px-4 text-xs font-extrabold text-ink transition hover:bg-mint"
                    onClick={() => trocar("local", CLINICA.endereco)}
                  >
                    <MapPin className="h-4 w-4 text-forest" aria-hidden="true" />
                    Usar o endereço da clínica
                  </button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <CampoTexto
                    campo="vaga-salarioMin"
                    rotulo="Salário mínimo"
                    valor={form.salarioMin}
                    inputMode="numeric"
                    opcional
                    placeholder="R$ 0,00"
                    aoMudar={(v) => trocar("salarioMin", mascararMoeda(v))}
                  />
                  <CampoTexto
                    campo="vaga-salarioMax"
                    rotulo="Salário máximo"
                    valor={form.salarioMax}
                    inputMode="numeric"
                    opcional
                    placeholder="R$ 0,00"
                    aoMudar={(v) => trocar("salarioMax", mascararMoeda(v))}
                  />
                </div>

                <Interruptor
                  rotulo="Mostrar a faixa salarial no site"
                  descricao="Desligado, o valor fica só aqui no painel: o card e a página da vaga não exibem nada."
                  ligado={form.mostrarSalario}
                  desativado={props.salvando}
                  aoMudar={(v) => trocar("mostrarSalario", v)}
                />

                <CampoTexto
                  campo="vaga-encerraEm"
                  rotulo="Encerra em"
                  tipo="date"
                  valor={form.encerraEm}
                  opcional
                  erro={erros["encerraEm"] ?? ""}
                  ajuda="Depois desta data a vaga sai do site sozinha, mesmo continuando como “Aberta”. Em branco, fica no ar até você pausar ou encerrar."
                  aoMudar={(v) => trocar("encerraEm", v)}
                />
              </section>
            </div>

            {/* ---------------- Prévia ---------------- */}
            <aside
              className={`min-w-0 ${abaCelular === "previa" ? "" : "hidden"} lg:block`}
              aria-label="Prévia da vaga no site"
            >
              <div className="lg:sticky lg:top-2">
                <div className="rh-papel p-4">
                  <p className="eyebrow flex items-center gap-2 text-ink">
                    <Eye className="h-4 w-4 text-forest" aria-hidden="true" />
                    Como fica no site
                  </p>
                  <p className="rh-ajuda">
                    Este é o card que o candidato vê na página de carreiras. Ele acompanha o que
                    você digita.
                  </p>
                  {/*
                    `inert` desliga clique e foco do cartão inteiro. O CartaoVaga
                    real tem um link que cobre toda a área (`.stretch-link`) e,
                    sem isto, um clique na prévia levaria o RH para fora do
                    editor — jogando fora tudo o que ainda não foi salvo.
                  */}
                  <div className="mt-3" inert>
                    <CartaoVaga vaga={form} agora={agora} destaque={form.destaque} />
                  </div>

                  {form.status === "aberta" ? (
                    <p className="mt-3 flex items-start gap-2 rounded-xl bg-mint px-3 py-2 text-xs font-bold text-ink">
                      <Sparkles
                        className="mt-0.5 h-4 w-4 shrink-0 text-forest"
                        aria-hidden="true"
                      />
                      Ao salvar, esta vaga entra no ar em /carreiras.
                    </p>
                  ) : (
                    <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 ring-1 ring-amber-200">
                      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      Status “{statusAtual.rotulo}”: nada disto aparece no site ainda.
                    </p>
                  )}
                </div>
              </div>
            </aside>
          </div>
        </div>

        {/* Rodapé grudento: em formulário longo, o botão de salvar não pode
            depender de a pessoa rolar até o fim para reaparecer. */}
        <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border-soft bg-white px-4 py-3 sm:px-6">
          <p className="mr-auto hidden text-xs font-semibold text-ink sm:block">
            {props.salvando ? "Salvando…" : "Nada é publicado até você salvar."}
          </p>
          <button
            type="button"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-border-soft bg-white px-5 text-sm font-extrabold text-ink transition hover:border-forest"
            onClick={props.aoFechar}
          >
            Cancelar
          </button>
          {form.status === "rascunho" ? (
            <button
              type="button"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-forest/30 bg-white px-5 text-sm font-extrabold text-ink transition hover:bg-mint disabled:cursor-not-allowed disabled:opacity-50"
              disabled={props.salvando}
              onClick={() => salvar(false)}
            >
              <Save className="h-4 w-4 text-forest" aria-hidden="true" />
              Salvar rascunho
            </button>
          ) : null}
          <button
            type="button"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-forest px-6 text-sm font-extrabold text-white transition hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-50"
            disabled={props.salvando}
            onClick={() => salvar(form.status === "rascunho")}
          >
            {form.status === "rascunho" ? (
              <>
                <Send className="h-4 w-4" aria-hidden="true" />
                Salvar e publicar
              </>
            ) : (
              <>
                <Save className="h-4 w-4" aria-hidden="true" />
                Salvar
              </>
            )}
          </button>
        </footer>
      </div>
    </div>
  );
}
