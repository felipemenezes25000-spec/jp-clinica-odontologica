/**
 * Painel de RH — a rota que junta tudo o que os componentes de `@/components/rh`
 * sabem desenhar.
 *
 * Três decisões estruturais valem ser ditas antes do código:
 *
 * 1. **A rota é a única dona do estado do servidor.** O loader traz sessão,
 *    candidaturas, vagas e configurações; os componentes recebem tudo por prop e
 *    devolvem intenção por callback. Nenhum deles chama server function — assim
 *    existe um lugar só onde tratar erro, sessão expirada e reversão.
 * 2. **Atualização otimista.** Mudar o status de um cartão arrastando precisa ser
 *    instantâneo: o estado local muda primeiro, a server function corre depois e,
 *    se ela recusar, o valor anterior volta e um aviso explica o que houve. Sem
 *    isso o cartão voltaria para a coluna de origem e "piscaria" até a resposta.
 * 3. **A aba e o candidato aberto moram na URL.** O RH recarrega a página o dia
 *    inteiro (e manda link de candidato por WhatsApp para a sócia); guardar isso
 *    só em `useState` faria cada F5 jogar a pessoa de volta no Resumo.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { CircleAlert, CircleCheck, ShieldAlert, X } from "lucide-react";

import { AbaEntrevistas } from "@/components/rh/AbaEntrevistas";
import { AbaTriagem } from "@/components/rh/AbaTriagem";
import { AcoesEmLote } from "@/components/rh/AcoesEmLote";
import type { ResultadoImportacao } from "@/components/rh/AbaTriagem";
import { aplicarFiltros, BarraFiltros, filtrosVazios } from "@/components/rh/BarraFiltros";
import type { FiltrosRh } from "@/components/rh/BarraFiltros";
import { CabecalhoRh } from "@/components/rh/CabecalhoRh";
import type { AbaRh } from "@/components/rh/CabecalhoRh";
import { ConfiguracoesPortal } from "@/components/rh/ConfiguracoesPortal";
import { GavetaCandidatura } from "@/components/rh/GavetaCandidatura";
import { GestaoVagas } from "@/components/rh/GestaoVagas";
import { Kanban } from "@/components/rh/Kanban";
import { LoginRh } from "@/components/rh/LoginRh";
import { ModoEntrevista } from "@/components/rh/ModoEntrevista";
import { PainelResumo } from "@/components/rh/PainelResumo";
import { TabelaCandidaturas } from "@/components/rh/TabelaCandidaturas";
import { SkipLink } from "@/components/site/SkipLink";
import {
  adicionarAnotacao,
  analisarTodas,
  analisarUma,
  atualizarCandidatura,
  entrarRh,
  estadoIa,
  gerarFichaAdmin,
  gerarRanking,
  importarCurriculos,
  excluirCandidatura,
  excluirCandidaturaAgora,
  restaurarCandidatura,
  excluirGuiaAdmin,
  excluirVagaAdmin,
  listarCandidaturas,
  listarGuiasAdmin,
  listarVagasAdmin,
  obterConfiguracoesAdmin,
  removerAnotacao,
  sairRh,
  salvarConfiguracoesAdmin,
  salvarFichaAdmin,
  salvarGuiaAdmin,
  salvarVagaAdmin,
  sessaoRh,
} from "@/lib/rh/api";
import { CLINICA } from "@/lib/jp";
import type { RespostaSessao } from "@/lib/rh/api";
import type { FichaEntrevista } from "@/lib/rh/ficha";
import { situacaoDaFicha } from "@/lib/rh/ficha";
import { formatarDataHora } from "@/lib/rh/formatar";
import type { GuiaEntrevista } from "@/lib/rh/guia";
import { escolherGuia, guiaSementeRecepcao } from "@/lib/rh/guia";
import type { RankingSalvo } from "@/lib/rh/ia/tipos";
import { AREAS, statusPor, VINCULOS } from "@/lib/rh/opcoes";
import { configuracoesPadrao, DIAS_ATE_EXCLUIR } from "@/lib/rh/tipos";
import type {
  AreaVaga,
  CamposGeriveis,
  Candidatura,
  ConfiguracoesRh,
  StatusCandidatura,
  Vaga,
} from "@/lib/rh/tipos";
import { vagaAberta } from "@/lib/rh/vagas";

const TITULO = "Portal de RH — JP Clínica Integrada Odontológica";

/** Motivo devolvido pelas server functions quando o cookie de sessão não vale mais. */
const NAO_AUTENTICADO = "nao-autenticado";

const ABAS: AbaRh[] = ["resumo", "candidaturas", "triagem", "entrevistas", "vagas", "config"];

/**
 * O estado da triagem por IA como a tela precisa dele: a resposta do servidor
 * sem o discriminante `ok`, que só interessa a quem trata a falha.
 */
type EstadoIaTela = {
  configurada: boolean;
  motivo: string;
  modelo: string;
  pendentes: number;
  analisadas: number;
};

/**
 * O que a aba Triagem mostra quando a consulta de estado falhou (sessão caindo,
 * servidor fora do ar). Não é "a chave não existe": é "não consegui perguntar"
 * — e a diferença importa, porque a primeira frase mandaria o RH mexer numa
 * configuração que talvez esteja perfeita.
 */
const IA_INDISPONIVEL: EstadoIaTela = {
  configurada: false,
  motivo:
    "Não foi possível consultar o estado da triagem por IA agora. Use o botão Atualizar do topo.",
  modelo: "",
  pendentes: 0,
  analisadas: 0,
};

/**
 * Quantas fichas o servidor analisa por chamada. É o mesmo teto de
 * `MAX_ANALISES_POR_CHAMADA` em `api.ts` e existe repetido aqui porque a tela
 * precisa saber de quantas em quantas fatiar uma seleção grande — mandar 300
 * ids de uma vez faria o servidor analisar 20 e devolver "pronto", deixando 280
 * para trás sem ninguém perceber.
 */
const LOTE_SERVIDOR = 20;

/**
 * Teto de voltas do laço de análise em lote. Com 20 por volta dá 1.000 fichas,
 * bem acima do acervo real da clínica. O número existe para que um servidor que
 * responda sempre "fiz zero" não deixe a aba girando para sempre.
 */
const MAX_VOLTAS_LOTE = 50;

/** Troca, na lista da tela, só as fichas que voltaram do servidor. */
function mesclarLista(atual: Candidatura[], novos: Candidatura[]): Candidatura[] {
  if (novos.length === 0) return atual;
  const porId = new Map(novos.map((c) => [c.id, c]));
  return atual.map((c) => porId.get(c.id) ?? c);
}

/** Traduções dos motivos técnicos que o servidor devolve. Qualquer outro motivo
 *  já chega em português (é a mensagem de `validarVaga`) e passa direto. */
const MOTIVOS: Record<string, string> = {
  "nao-encontrada": "Esse registro não existe mais no servidor. Atualize o painel.",
};

/**
 * As três chaves são opcionais de propósito. Se `validateSearch` sempre
 * devolvesse valor, o roteador reescreveria "/rh" como "/rh?aba=resumo&c=" com
 * um 307 a cada visita — endereço feio de decorar e um salto a mais em toda
 * abertura do painel. Ausência quer dizer "o padrão": aba Resumo, gaveta
 * fechada, nenhuma entrevista em curso.
 *
 * `entrevista` guarda o candidato do modo entrevista (a tela cheia que roda
 * DURANTE a conversa). Ela mora na URL pelo mesmo motivo da aba e da gaveta, só
 * que com mais razão ainda: a entrevista dura quarenta minutos com a candidata
 * sentada na frente, e nesse tempo o navegador é fechado sem querer, o notebook
 * hiberna, alguém recarrega a página. Com o id no endereço, voltar é abrir o
 * mesmo link — e o que já tinha sido digitado está gravado no servidor. Vale
 * também para o caminho contrário: a Dra. Ana Beatriz manda o link pronto para
 * o Jefferson e os dois entram na mesma ficha.
 */
type BuscaRh = { aba?: AbaRh; c?: string; entrevista?: string };

const ABA_PADRAO: AbaRh = "resumo";

type DadosRh = {
  sessao: RespostaSessao;
  itens: Candidatura[];
  vagas: Vaga[];
  /** Os guias de entrevista da clínica — o método por que ela contrata. */
  guias: GuiaEntrevista[];
  config: ConfiguracoesRh;
  /** `null` quando a consulta falhou — ver `IA_INDISPONIVEL`. */
  ia: EstadoIaTela | null;
  /**
   * "Agora" carimbado pelo servidor. Todo texto relativo do painel ("há 3
   * minutos", "vaga no ar") sai do mesmo instante no HTML do SSR e na
   * hidratação; um `new Date()` no cliente leria o relógio do aparelho e, com
   * ele adiantado ou com um minuto virando no meio do caminho, o React acharia
   * divergência e repintaria a raiz inteira.
   */
  agoraIso: string;
};

export const Route = createFileRoute("/rh")({
  // `aba` e `c` (candidato aberto) na URL: recarregar a página, voltar de um
  // link ou mandar o endereço para outra pessoa cai exatamente no mesmo lugar.
  validateSearch: (s: Record<string, unknown>): BuscaRh => {
    const aba = s["aba"];
    const c = s["c"];
    const entrevista = s["entrevista"];
    const saida: BuscaRh = {};
    if (typeof aba === "string" && aba !== ABA_PADRAO && (ABAS as string[]).includes(aba)) {
      saida.aba = aba as AbaRh;
    }
    if (typeof c === "string" && c.length > 0) saida.c = c;
    if (typeof entrevista === "string" && entrevista.length > 0) saida.entrevista = entrevista;
    return saida;
  },
  // O retorno é anotado à mão porque a inferência da server function não
  // atravessa a fronteira do loader gerado — sem isso `useLoaderData()` chegaria
  // como `any` e a tela inteira perderia a checagem de tipo em silêncio.
  loader: async (): Promise<DadosRh> => {
    const sessao = await sessaoRh();
    const agoraIso = new Date().toISOString();
    // Sem sessão nem adianta pedir o resto: as três rotas devolveriam
    // "nao-autenticado" e o loader gastaria três viagens para nada.
    if (!sessao.autenticado) {
      return {
        sessao,
        itens: [],
        vagas: [],
        guias: [],
        config: configuracoesPadrao(),
        ia: null,
        agoraIso,
      };
    }

    const [lista, vagas, guias, config, ia] = await Promise.all([
      listarCandidaturas(),
      listarVagasAdmin(),
      // Mais uma leitura de disco, sem nenhuma chamada paga: o guia precisa
      // estar em mãos antes do primeiro render da gaveta, porque é ele que diz
      // quais critérios a ficha pontua. Buscá-lo depois faria a tabela de notas
      // nascer vazia e se preencher sozinha um instante depois.
      listarGuiasAdmin(),
      obterConfiguracoesAdmin(),
      // Entra no mesmo `Promise.all` de propósito: é mais uma leitura de disco
      // (conta quantas fichas têm análise) e nenhuma chamada à OpenAI, então não
      // custa tempo de abertura — e sem ela a aba Triagem abriria dizendo que a
      // IA está desligada até a primeira consulta voltar.
      estadoIa(),
    ]);

    return {
      sessao,
      itens: lista.ok ? lista.itens : [],
      vagas: vagas.ok ? vagas.itens : [],
      guias: guias.ok ? guias.itens : [],
      config: config.ok ? config.config : configuracoesPadrao(),
      ia: ia.ok
        ? {
            configurada: ia.configurada,
            motivo: ia.motivo,
            modelo: ia.modelo,
            pendentes: ia.pendentes,
            analisadas: ia.analisadas,
          }
        : null,
      agoraIso,
    };
  },
  // O HTML do painel carrega nome, CPF, endereço e telefone de todo mundo. Sem
  // isto, num computador compartilhado da recepção o botão Voltar depois do
  // "Sair" reabriria a lista inteira do cache do navegador — e um proxy
  // corporativo poderia guardar a mesma resposta.
  headers: () => ({
    "Cache-Control": "private, no-store",
    Vary: "Cookie",
  }),
  head: () => ({
    meta: [
      { title: TITULO },
      // O painel nunca deve ser indexado: é área interna, e um resultado de
      // busca apontando para a tela de login só serve para atrair tentativa.
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PaginaRh,
});

function PaginaRh() {
  const dados: DadosRh = Route.useLoaderData();

  // Login e painel são componentes separados de propósito: cada um é dono dos
  // próprios hooks, e trocar de um para o outro desmonta tudo o que o anterior
  // guardava (rascunho de senha, filtros, gaveta aberta).
  if (!dados.sessao.autenticado) return <TelaLogin sessao={dados.sessao} />;
  return <Painel dados={dados} />;
}

/* -------------------------------------------------------------------------- */
/* Login                                                                      */
/* -------------------------------------------------------------------------- */

function TelaLogin({ sessao }: { sessao: RespostaSessao }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [segundos, setSegundos] = useState(0);

  const entrar = (senha: string) => {
    setOcupado(true);
    setErro("");
    setSegundos(0);

    entrarRh({ data: { senha } })
      .then(async (resposta) => {
        if (resposta.ok) {
          // Recarrega o loader: é ele que decide entre login e painel, e agora
          // o cookie existe. Trocar de tela por estado local mostraria o painel
          // sem os dados, que só chegam pelo loader.
          await router.invalidate();
          return;
        }
        setErro(resposta.erro);
        setSegundos(resposta.segundos ?? 0);
        setOcupado(false);
      })
      .catch(() => {
        setErro("Não foi possível falar com o servidor. Tente de novo em instantes.");
        setOcupado(false);
      });
  };

  return (
    <LoginRh
      configurado={sessao.configurado}
      motivo={sessao.motivo}
      ocupado={ocupado}
      erro={erro}
      segundos={segundos}
      aoEnviar={entrar}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Avisos flutuantes                                                          */
/* -------------------------------------------------------------------------- */

type Aviso = { id: number; tipo: "ok" | "erro"; texto: string };

/** Erro fica mais tempo na tela: quase sempre pede uma ação de quem está lendo. */
const DURACAO: Record<Aviso["tipo"], number> = { ok: 4000, erro: 7000 };

function Avisos({
  avisos,
  camadaAberta,
  aoDispensar,
}: {
  avisos: Aviso[];
  camadaAberta: boolean;
  aoDispensar: (id: number) => void;
}) {
  return (
    <div
      /* Os avisos ficam acima de qualquer camada (z-[120] contra os 90 da gaveta
         e os 95 do editor), então no rodapé eles cairiam justamente sobre
         "Excluir definitivamente" e "Salvar". Com uma camada aberta eles sobem
         para o topo; e todos podem ser fechados na hora, porque um aviso de erro
         fica 7s na tela e nesse tempo cobre o que a pessoa precisa clicar. */
      className={`pointer-events-none fixed inset-x-0 z-[120] flex flex-col gap-2 p-4 ${
        camadaAberta ? "top-0 items-center" : "bottom-0 items-center sm:items-end"
      }`}
    >
      {avisos.map((aviso) => (
        <div
          key={aviso.id}
          // `alert` interrompe a leitura para contar que algo deu errado;
          // `status` espera a próxima pausa, que é o certo para uma confirmação.
          role={aviso.tipo === "erro" ? "alert" : "status"}
          className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl py-3 pl-4 pr-2 text-sm font-semibold shadow-xl ring-1 backdrop-blur ${
            aviso.tipo === "erro"
              ? "bg-rose-950/90 text-rose-100 ring-rose-300/35"
              : "bg-brand-deep/92 text-white ring-lime/35"
          }`}
        >
          {aviso.tipo === "erro" ? (
            <CircleAlert size={18} className="mt-0.5 shrink-0 text-rose-200" aria-hidden="true" />
          ) : (
            <CircleCheck size={18} className="mt-0.5 shrink-0 text-lime" aria-hidden="true" />
          )}
          <p className="min-w-0 flex-1 leading-relaxed">{aviso.texto}</p>
          <button
            type="button"
            onClick={() => aoDispensar(aviso.id)}
            aria-label="Fechar aviso"
            className="-my-1 grid h-11 w-11 shrink-0 place-items-center rounded-full transition hover:bg-white/15"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Exportação CSV                                                             */
/* -------------------------------------------------------------------------- */

const COLUNAS_CSV = [
  "Protocolo",
  "Recebida em",
  "Nome",
  "E-mail",
  "Telefone",
  "CPF",
  "Cidade",
  "UF",
  "Área",
  "Cargo desejado",
  "Vínculo",
  "Vaga",
  "Status",
  "Nota",
  "Etiquetas",
  "Responsável",
  "Entrevista em",
  "Pretensão",
  "Experiência",
  "Currículo",
  "Origem",
  "Arquivada",
] as const;

/**
 * Um campo do CSV. Sempre entre aspas (assim ponto e vírgula, vírgula e acento
 * dentro do texto não quebram a coluna) e com as aspas internas dobradas, que é
 * como o formato manda escapá-las. Quebras de linha viram espaço: o Excel até
 * entende quebra dentro de aspas, mas quem abre o arquivo no Bloco de Notas ou
 * importa em outro sistema vê linhas soltas sem sentido.
 *
 * A aspa simples na frente de `= + - @` não é enfeite: o Excel avalia como
 * fórmula qualquer célula que comece com esses caracteres, mesmo entre aspas.
 * Como nome e cargo são texto livre digitado por quem se candidata, um
 * `=HYPERLINK(...)` colado ali viraria fórmula ativa na planilha do RH — e um
 * clique dele vazaria protocolo, CPF e e-mail das linhas vizinhas. A aspa é
 * consumida pelo próprio Excel na abertura, então o texto continua legível.
 */
function campoCsv(valor: string): string {
  const limpo = valor.replace(/\r?\n/g, " ").replace(/"/g, '""');
  return `"${/^[=+\-@\t\r]/.test(limpo) ? `'${limpo}` : limpo}"`;
}

function rotuloArea(valor: string): string {
  return AREAS.find((a) => a.valor === valor)?.rotulo ?? valor;
}

function rotuloVinculo(valor: string): string {
  return VINCULOS.find((v) => v.valor === valor)?.rotulo ?? valor;
}

function linhaCsv(c: Candidatura): string[] {
  return [
    c.protocolo,
    formatarDataHora(c.criadoEm),
    c.nome,
    c.email,
    c.telefone,
    c.cpf,
    c.cidade,
    c.uf,
    rotuloArea(c.area),
    c.cargoDesejado,
    rotuloVinculo(c.vinculo),
    c.vagaTitulo.length > 0 ? c.vagaTitulo : "Candidatura espontânea",
    statusPor(c.status).rotulo,
    c.nota > 0 ? String(c.nota) : "",
    c.etiquetas.join(", "),
    c.responsavel,
    c.entrevistaEm.length > 0 ? c.entrevistaEm.replace("T", " ") : "",
    c.pretensao,
    c.anosExperiencia,
    c.curriculo ? c.curriculo.nomeOriginal : "Sem currículo",
    c.origem,
    c.arquivada ? "Sim" : "Não",
  ];
}

/**
 * Os valores que ESTA chamada tentou mudar, do jeito que estavam antes dela.
 * É o que a reversão repõe: devolver o objeto `antes` inteiro apagaria da tela
 * outra alteração do mesmo candidato que já tivesse sido gravada com sucesso
 * enquanto esta estava em voo (dar nota e arquivar em seguida, por exemplo).
 * A lista é escrita à mão porque `CamposGeriveis` tem seis chaves e o TypeScript
 * não relaciona `volta[chave]` com `antes[chave]` numa cópia genérica.
 */
function camposAnteriores(
  antes: Candidatura,
  enviados: Partial<CamposGeriveis>,
): Partial<CamposGeriveis> {
  const volta: Partial<CamposGeriveis> = {};
  if ("status" in enviados) volta.status = antes.status;
  if ("nota" in enviados) volta.nota = antes.nota;
  if ("etiquetas" in enviados) volta.etiquetas = antes.etiquetas;
  if ("responsavel" in enviados) volta.responsavel = antes.responsavel;
  if ("entrevistaEm" in enviados) volta.entrevistaEm = antes.entrevistaEm;
  if ("arquivada" in enviados) volta.arquivada = antes.arquivada;
  return volta;
}

/** "2026-09-06" a partir do relógio local — o nome do arquivo é o que separa a
 *  exportação de hoje da de ontem na pasta de Downloads. */
function carimboDoDia(agora: Date): string {
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${agora.getFullYear()}-${mes}-${dia}`;
}

function baixarCsv(itens: Candidatura[], agora: Date): void {
  const linhas = [COLUNAS_CSV.slice(), ...itens.map(linhaCsv)];
  // Ponto e vírgula, não vírgula: o Excel em português usa a vírgula como
  // separador decimal e, num CSV separado por vírgula, joga a linha inteira
  // dentro da primeira célula. O BOM (U+FEFF) na frente é o que faz o mesmo
  // Excel reconhecer UTF-8 — sem ele, "Cirurgião" abre como "CirurgiÃ£o".
  const corpo = linhas.map((linha) => linha.map(campoCsv).join(";")).join("\r\n");
  const blob = new Blob([`\uFEFF${corpo}`], { type: "text/csv;charset=utf-8" });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `candidaturas-${carimboDoDia(agora)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/* -------------------------------------------------------------------------- */
/* Painel                                                                     */
/* -------------------------------------------------------------------------- */

function Painel({ dados }: { dados: DadosRh }) {
  const router = useRouter();
  const navigate = useNavigate();
  const busca: BuscaRh = Route.useSearch();
  const aba: AbaRh = busca.aba ?? ABA_PADRAO;
  const idAberto = busca.c ?? "";
  const idEntrevista = busca.entrevista ?? "";

  // Cópia local do que veio do loader. É ela que a tela lê, para a atualização
  // otimista poder mexer no valor antes da resposta do servidor.
  const [itens, setItens] = useState<Candidatura[]>(dados.itens);
  const [vagas, setVagas] = useState<Vaga[]>(dados.vagas);
  const [guias, setGuias] = useState<GuiaEntrevista[]>(dados.guias);
  const [config, setConfig] = useState<ConfiguracoesRh>(dados.config);
  const [ia, setIa] = useState<EstadoIaTela | null>(dados.ia);

  // Ressincroniza quando o loader roda de novo (botão atualizar, login, F5).
  useEffect(() => setItens(dados.itens), [dados.itens]);
  useEffect(() => setVagas(dados.vagas), [dados.vagas]);
  useEffect(() => setGuias(dados.guias), [dados.guias]);
  useEffect(() => setConfig(dados.config), [dados.config]);
  useEffect(() => setIa(dados.ia), [dados.ia]);

  /**
   * "Agora" congelado uma vez, como manda a regra de datas do projeto. O
   * instante vem do loader (`agoraIso`), e não de um `new Date()` local: o
   * inicializador do `useState` roda nos dois lados, então o navegador leria o
   * relógio do aparelho e escreveria "há 18 minutos" onde o SSR imprimiu "há 16"
   * — divergência que faz o React repintar a raiz inteira. Ele é renovado junto
   * com o botão de atualizar, que já é interação do usuário.
   */
  const [agora, setAgora] = useState(() => new Date(dados.agoraIso));

  const [filtros, setFiltros] = useState<FiltrosRh>(filtrosVazios());
  const [visao, setVisao] = useState<"kanban" | "tabela">("kanban");
  /**
   * Ids marcados para as ações em lote.
   *
   * Mora aqui, e não no kanban nem na tabela, porque a seleção é UMA só: trocar
   * de visão no meio do trabalho não pode jogar fora as seis pessoas que o RH
   * acabou de marcar. Guarda ids, e não objetos: o item pode ser reescrito por
   * uma gravação otimista enquanto está selecionado, e uma cópia congelada aqui
   * mandaria o convite com o status antigo.
   */
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [atualizando, setAtualizando] = useState(false);
  // Contador, não booleano: duas gravações simultâneas (mover cartão e salvar
  // vaga) não podem apagar o indicador uma da outra ao terminar.
  const [gravacoes, setGravacoes] = useState(0);
  const [expirada, setExpirada] = useState(false);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  // O editor de vaga é uma camada modal que vive dentro da aba Vagas; a rota
  // precisa saber que ele está aberto para não jogar aviso em cima dos botões.
  const [editorVagaAberto, setEditorVagaAberto] = useState(false);

  /* -------------------------- estado da triagem por IA ------------------- */

  /** Fichas com leitura em andamento agora. Lista, e não booleano: o RH pode
   *  abrir uma ficha, mandar analisar, fechar e abrir outra. */
  const [analisandoIds, setAnalisandoIds] = useState<string[]>([]);
  const [progressoIa, setProgressoIa] = useState<{ feitos: number; total: number } | null>(null);
  /** Contador pelo mesmo motivo de `gravacoes`: ranking e importação podem
   *  correr juntos, e um terminando não pode apagar o "ocupado" do outro. */
  const [ocupacoesIa, setOcupacoesIa] = useState(0);
  const [ranking, setRanking] = useState<RankingSalvo | null>(null);
  /** Fichas de entrevista sendo escritas pela IA agora — lista pelo mesmo
   *  motivo de `analisandoIds`. */
  const [gerandoFichaIds, setGerandoFichaIds] = useState<string[]>([]);
  /**
   * Contador só das gravações de ficha. Separado de `gravacoes` de propósito: as
   * telas da ficha usam este sinal para saber quando podem voltar a aceitar o
   * que vem do servidor, e com o contador geral um "arquivar candidatura" em
   * outra aba faria a tela do modo entrevista pensar que a anotação dela subiu.
   */
  const [salvamentosFicha, setSalvamentosFicha] = useState(0);
  const [resultadoImportacao, setResultadoImportacao] = useState<ResultadoImportacao | null>(null);
  /**
   * Trava do lote. Fica num ref, e não em estado, porque precisa valer no
   * instante do segundo clique — um `disabled` derivado de estado só chega à
   * tela no render seguinte, e nesse intervalo o RH já disparou duas rodadas de
   * 20 análises pagas em cima das mesmas fichas.
   */
  const loteEmCurso = useRef(false);

  const proximoAviso = useRef(0);
  const temporizadores = useRef<number[]>([]);

  useEffect(() => {
    const lista = temporizadores.current;
    // Sair do painel com avisos na tela deixaria timers pendentes chamando
    // setState em componente desmontado.
    return () => lista.forEach((t) => window.clearTimeout(t));
  }, []);

  const dispensarAviso = useCallback((id: number) => {
    setAvisos((atual) => atual.filter((a) => a.id !== id));
  }, []);

  const avisar = useCallback((tipo: Aviso["tipo"], texto: string) => {
    proximoAviso.current += 1;
    const id = proximoAviso.current;
    setAvisos((atual) => [...atual, { id, tipo, texto }]);
    const t = window.setTimeout(() => {
      setAvisos((atual) => atual.filter((a) => a.id !== id));
    }, DURACAO[tipo]);
    temporizadores.current.push(t);
  }, []);

  /**
   * Trata o `motivo` de qualquer resposta `{ ok: false }`. Sessão caída não vira
   * aviso passageiro: acende a faixa fixa do topo, para quem estava escrevendo
   * uma anotação ler o texto antes de sair da tela — nada aqui desloga sozinho.
   */
  const tratarMotivo = useCallback(
    (motivo: string, alternativa: string) => {
      if (motivo === NAO_AUTENTICADO) {
        setExpirada(true);
        return;
      }
      avisar("erro", MOTIVOS[motivo] ?? (motivo.length > 0 ? motivo : alternativa));
    },
    [avisar],
  );

  const falhaDeRede = useCallback(() => {
    avisar("erro", "Não foi possível falar com o servidor. A alteração não foi salva.");
  }, [avisar]);

  const abrirGravacao = useCallback(() => setGravacoes((n) => n + 1), []);
  const fecharGravacao = useCallback(() => setGravacoes((n) => n - 1), []);

  /* ---------------------------------------------------------------------- */
  /* Navegação (aba e candidato aberto vivem na URL)                        */
  /* ---------------------------------------------------------------------- */

  // `replace` sempre: o painel é bancada de trabalho, não leitura sequencial.
  // Empilhar histórico a cada troca de aba faria o botão Voltar do navegador
  // desfazer cliques um a um em vez de devolver a pessoa ao site.
  const irPara = useCallback(
    (proximaAba: AbaRh, proximoId: string, proximaEntrevista: string) => {
      // Só o que foge do padrão vira parâmetro; o resto some da barra de
      // endereço (ver o comentário de `BuscaRh`).
      const search: BuscaRh = {};
      if (proximaAba !== ABA_PADRAO) search.aba = proximaAba;
      if (proximoId.length > 0) search.c = proximoId;
      if (proximaEntrevista.length > 0) search.entrevista = proximaEntrevista;
      void navigate({ to: "/rh", search, replace: true });
    },
    [navigate],
  );

  // Trocar de aba fecha a gaveta, exceto ao voltar para a lista de onde ela veio.
  // A entrevista em curso sobrevive: ela é uma camada por cima de tudo, e quem
  // troca de aba está mexendo na tela de baixo.
  const trocarAba = useCallback(
    (proxima: AbaRh) => irPara(proxima, proxima === "candidaturas" ? idAberto : "", idEntrevista),
    [irPara, idAberto, idEntrevista],
  );

  const abrirCandidato = useCallback((id: string) => irPara("candidaturas", id, ""), [irPara]);

  const fecharGaveta = useCallback(
    () => irPara(aba, "", idEntrevista),
    [irPara, aba, idEntrevista],
  );

  /**
   * Abre o modo entrevista sem fechar o que estava aberto embaixo: sair da
   * entrevista devolve a pessoa exatamente à gaveta (ou à agenda) de onde ela
   * entrou, que é o que o RH espera depois de quarenta minutos de conversa.
   */
  const abrirModoEntrevista = useCallback(
    (id: string) => irPara(aba, idAberto, id),
    [irPara, aba, idAberto],
  );

  const fecharModoEntrevista = useCallback(
    () => irPara(aba, idAberto, ""),
    [irPara, aba, idAberto],
  );

  /* ---------------------------------------------------------------------- */
  /* Candidaturas                                                           */
  /* ---------------------------------------------------------------------- */

  const trocarItem = useCallback((id: string, item: Candidatura) => {
    setItens((atual) => atual.map((c) => (c.id === id ? item : c)));
  }, []);

  /** Mescla no item que estiver na tela agora, sem partir de um retrato antigo. */
  const mesclarItem = useCallback((id: string, campos: Partial<CamposGeriveis>) => {
    setItens((atual) => atual.map((c) => (c.id === id ? { ...c, ...campos } : c)));
  }, []);

  /**
   * Número da última chamada em voo por candidato. Duas gravações do mesmo
   * candidato podem voltar fora de ordem; sem este carimbo, a resposta da
   * primeira chegaria por último e reescreveria a tela com o valor antigo.
   */
  const sequencias = useRef(new Map<string, number>());

  /**
   * Núcleo da atualização otimista: aplica na tela, dispara, e desfaz o que esta
   * chamada mexeu se o servidor recusar. Reverte só os campos enviados — repor o
   * item inteiro apagaria outra alteração que tivesse chegado no meio.
   */
  const gerir = useCallback(
    (id: string, campos: Partial<CamposGeriveis>) => {
      const antes = itens.find((c) => c.id === id);
      if (antes === undefined) return;

      const seq = (sequencias.current.get(id) ?? 0) + 1;
      sequencias.current.set(id, seq);
      const atualDaVez = () => sequencias.current.get(id) === seq;

      mesclarItem(id, campos);
      abrirGravacao();

      atualizarCandidatura({ data: { id, campos } })
        .then((resposta) => {
          if (resposta.ok) {
            // Resposta de uma chamada já superada: adotá-la devolveria à tela o
            // retrato anterior à alteração seguinte, que o servidor já gravou.
            if (atualDaVez()) trocarItem(id, resposta.item);
            return;
          }
          mesclarItem(id, camposAnteriores(antes, campos));
          tratarMotivo(resposta.motivo, "Não foi possível salvar a alteração.");
        })
        .catch(() => {
          mesclarItem(id, camposAnteriores(antes, campos));
          falhaDeRede();
        })
        .finally(fecharGravacao);
    },
    [itens, trocarItem, mesclarItem, abrirGravacao, fecharGravacao, tratarMotivo, falhaDeRede],
  );

  const moverStatus = useCallback(
    (id: string, status: StatusCandidatura) => {
      const item = itens.find((c) => c.id === id);
      gerir(id, { status });
      // Mudar o status é a única ação que reorganiza a tela sozinha: o cartão
      // sai de uma coluna e nasce em outra. Sem este anúncio, quem usa leitor de
      // tela não recebe confirmação nenhuma de que a mudança aconteceu.
      if (item !== undefined) {
        avisar("ok", `${item.nome || "Candidatura"} agora está em “${statusPor(status).rotulo}”.`);
      }
    },
    [gerir, itens, avisar],
  );

  const anotar = useCallback(
    (id: string, texto: string) => {
      // Anotação não é otimista: o id e o carimbo de hora nascem no servidor, e
      // inventar um provisório aqui só criaria uma linha que muda sozinha depois.
      abrirGravacao();
      adicionarAnotacao({ data: { id, texto } })
        .then((resposta) => {
          if (resposta.ok) {
            trocarItem(id, resposta.item);
            avisar("ok", "Anotação salva.");
            return;
          }
          tratarMotivo(resposta.motivo, "Não foi possível salvar a anotação.");
        })
        .catch(falhaDeRede)
        .finally(fecharGravacao);
    },
    [trocarItem, abrirGravacao, fecharGravacao, tratarMotivo, falhaDeRede, avisar],
  );

  const apagarAnotacao = useCallback(
    (id: string, anotacaoId: string) => {
      const antes = itens.find((c) => c.id === id);
      if (antes === undefined) return;

      const semAnotacao = antes.anotacoes.filter((nota) => nota.id !== anotacaoId);
      setItens((atual) => atual.map((c) => (c.id === id ? { ...c, anotacoes: semAnotacao } : c)));
      abrirGravacao();

      // A reversão repõe só as anotações, pelo mesmo motivo de `gerir`: o status
      // ou a nota podem ter mudado (com sucesso) enquanto esta chamada corria.
      const reverter = () => {
        setItens((atual) =>
          atual.map((c) => (c.id === id ? { ...c, anotacoes: antes.anotacoes } : c)),
        );
      };

      removerAnotacao({ data: { id, anotacaoId } })
        .then((resposta) => {
          if (resposta.ok) {
            trocarItem(id, resposta.item);
            return;
          }
          reverter();
          tratarMotivo(resposta.motivo, "Não foi possível remover a anotação.");
        })
        .catch(() => {
          reverter();
          falhaDeRede();
        })
        .finally(fecharGravacao);
    },
    [itens, trocarItem, abrirGravacao, fecharGravacao, tratarMotivo, falhaDeRede],
  );

  const restaurarCandidato = useCallback(
    (id: string) => {
      const antes = itens;
      // Otimista, como as outras ações do painel: o item volta para a lista
      // sem `excluirEm`, e se o servidor recusar a lista inteira é revertida.
      setItens((atual) => atual.map((c) => (c.id === id ? { ...c, excluirEm: "" } : c)));
      abrirGravacao();

      restaurarCandidatura({ data: { id } })
        .then((resposta) => {
          if (resposta.ok) {
            avisar("ok", "Candidatura restaurada. Ela voltou para a lista.");
            return;
          }
          setItens(antes);
          tratarMotivo(resposta.motivo, "Não foi possível restaurar a candidatura.");
        })
        .catch(() => {
          setItens(antes);
          falhaDeRede();
        })
        .finally(fecharGravacao);
    },
    [itens, abrirGravacao, fecharGravacao, tratarMotivo, falhaDeRede, avisar],
  );

  /** Apaga de vez, sem esperar os sete dias. Só existe dentro da lixeira. */
  const excluirCandidatoAgora = useCallback(
    (id: string) => {
      const antes = itens;
      setItens((atual) => atual.filter((c) => c.id !== id));
      irPara("candidaturas", "", "");
      abrirGravacao();

      excluirCandidaturaAgora({ data: { id } })
        .then((resposta) => {
          if (resposta.ok) {
            avisar("ok", "Apagada de vez, junto com o arquivo do currículo.");
            return;
          }
          setItens(antes);
          tratarMotivo(resposta.motivo, "Não foi possível apagar a candidatura.");
        })
        .catch(() => {
          setItens(antes);
          falhaDeRede();
        })
        .finally(fecharGravacao);
    },
    [itens, irPara, abrirGravacao, fecharGravacao, tratarMotivo, falhaDeRede, avisar],
  );

  const excluirCandidato = useCallback(
    (id: string) => {
      const antes = itens;
      // Marca com a data do prazo em vez de tirar da lista na mão: é o mesmo
      // campo que o servidor grava, e é ele que o filtro usa para esconder. O
      // valor exato vem na próxima leitura; aqui basta "está na lixeira".
      const prazo = new Date(agora.getTime() + DIAS_ATE_EXCLUIR * 86400000).toISOString();
      setItens((atual) => atual.map((c) => (c.id === id ? { ...c, excluirEm: prazo } : c)));
      // A gaveta some junto — e a entrevista também: manter abertas telas de uma
      // ficha que saiu da lista deixaria o painel em estado impossível.
      irPara("candidaturas", "", "");
      abrirGravacao();

      excluirCandidatura({ data: { id } })
        .then((resposta) => {
          if (resposta.ok) {
            avisar(
              "ok",
              `Movida para a lixeira. Some sozinha em ${String(DIAS_ATE_EXCLUIR)} dias — dá para restaurar até lá.`,
            );
            return;
          }
          setItens(antes);
          tratarMotivo(resposta.motivo, "Não foi possível excluir a candidatura.");
        })
        .catch(() => {
          setItens(antes);
          falhaDeRede();
        })
        .finally(fecharGravacao);
    },
    [itens, agora, irPara, abrirGravacao, fecharGravacao, tratarMotivo, falhaDeRede, avisar],
  );

  /* ---------------------------------------------------------------------- */
  /* Triagem por IA                                                         */
  /* ---------------------------------------------------------------------- */

  /** Relê o contador de pendentes/analisadas. Nunca vira aviso na tela: é só um
   *  número de apoio, e um erro dele não desfaz nada do que foi analisado. */
  const recarregarEstadoIa = useCallback(() => {
    void estadoIa()
      .then((r) => {
        if (!r.ok) return;
        setIa({
          configurada: r.configurada,
          motivo: r.motivo,
          modelo: r.modelo,
          pendentes: r.pendentes,
          analisadas: r.analisadas,
        });
      })
      .catch(() => {
        // Silêncio de propósito: ver o comentário acima.
      });
  }, []);

  const analisarFicha = useCallback(
    (id: string, forcar: boolean) => {
      // Dois cliques no mesmo botão custariam duas leituras pagas do mesmo PDF.
      if (analisandoIds.includes(id)) return;
      setAnalisandoIds((atual) => [...atual, id]);

      analisarUma({ data: { id, forcar } })
        .then((resposta) => {
          if (resposta.ok) {
            // A resposta traz a ficha inteira relida do disco: numa candidatura
            // importada em branco, é a leitura que acabou de descobrir o nome e
            // o telefone — mesclar só a análise deixaria "Sem nome" na tela.
            trocarItem(id, resposta.item);
            recarregarEstadoIa();
            return;
          }
          tratarMotivo(resposta.motivo, "Não foi possível analisar este currículo.");
        })
        .catch(falhaDeRede)
        .finally(() => setAnalisandoIds((atual) => atual.filter((x) => x !== id)));
    },
    [analisandoIds, trocarItem, tratarMotivo, falhaDeRede, recarregarEstadoIa],
  );

  /**
   * Análise em lote.
   *
   * O servidor faz até `LOTE_SERVIDOR` por chamada (duas idas ao modelo por
   * ficha estouram o tempo máximo de resposta da plataforma), então a tela
   * chama de novo enquanto sobrar coisa. Cada volta já ficou gravada em disco:
   * fechar o painel no meio não desperdiça nada do que foi lido, e a rodada
   * seguinte retoma exatamente onde parou.
   *
   * Nada disso bloqueia a tela — o RH continua abrindo ficha, movendo cartão e
   * escrevendo anotação enquanto as leituras chegam.
   */
  const analisarEmLote = useCallback(
    (ids: string[], forcar: boolean) => {
      if (loteEmCurso.current) return;
      loteEmCurso.current = true;
      setOcupacoesIa((n) => n + 1);

      // Progresso otimista: a barra nasce com o total antes da primeira
      // resposta. Sem isso a aba passaria uns 30 segundos sem nada acontecendo,
      // que é exatamente quando alguém clica de novo achando que travou.
      const total = ids.length > 0 ? ids.length : (ia?.pendentes ?? 0);
      setProgressoIa({ feitos: 0, total: Math.max(total, 1) });

      const executar = async (): Promise<{
        feitos: number;
        falhas: { id: string; motivo: string }[];
        recusa: string;
      }> => {
        let feitos = 0;
        let falhas: { id: string; motivo: string }[] = [];
        let restantes = ids.slice();

        for (let volta = 0; volta < MAX_VOLTAS_LOTE; volta += 1) {
          // Lista vazia significa "as pendentes", e quem escolhe quais é o
          // servidor — ele é quem sabe o que já foi gravado nesta rodada.
          const doLote = ids.length > 0 ? restantes.slice(0, LOTE_SERVIDOR) : [];
          if (ids.length > 0 && doLote.length === 0) break;

          const resposta = await analisarTodas({ data: { ids: doLote, forcar } });
          if (!resposta.ok) return { feitos, falhas, recusa: resposta.motivo };

          setItens((atual) => mesclarLista(atual, resposta.itens));
          falhas = [...falhas, ...resposta.falhas];

          const processados = resposta.feitos + resposta.falhas.length;
          feitos += processados;
          // O total cresce se o servidor entregar mais do que a tela esperava:
          // uma barra que passa de 100% é pior que uma barra que se corrige.
          setProgressoIa({ feitos, total: Math.max(total, feitos) });

          restantes = restantes.slice(doLote.length);
          // Para quando a volta nao LEU nada. `processados === 0` nao bastava:
          // uma volta que so falha tem processados > 0 e o laco seguia, pagando
          // outra chamada pelos mesmos arquivos quebrados. Sem leitura nova, a
          // proxima volta so repetiria o mesmo resultado.
          if (resposta.feitos === 0) break;
        }

        return { feitos, falhas, recusa: "" };
      };

      executar()
        .then(({ feitos, falhas, recusa }) => {
          if (recusa.length > 0) {
            tratarMotivo(recusa, "Não foi possível analisar as candidaturas.");
            return;
          }
          if (feitos === 0) {
            avisar("ok", "Não havia nenhuma candidatura para analisar.");
            return;
          }
          const lidas = feitos - falhas.length;
          avisar(
            falhas.length > 0 ? "erro" : "ok",
            falhas.length > 0
              ? `${lidas} de ${feitos} lidas. ${falhas.length} falharam — o motivo está na ficha de cada uma.`
              : `${lidas} ${lidas === 1 ? "candidatura lida" : "candidaturas lidas"} pela IA.`,
          );
        })
        .catch(falhaDeRede)
        .finally(() => {
          loteEmCurso.current = false;
          setProgressoIa(null);
          setOcupacoesIa((n) => n - 1);
          recarregarEstadoIa();
        });
    },
    [ia, tratarMotivo, falhaDeRede, avisar, recarregarEstadoIa],
  );

  const criarRanking = useCallback(
    (area: AreaVaga | "", vagaId: string) => {
      setOcupacoesIa((n) => n + 1);
      gerarRanking({ data: { area, vagaId } })
        .then((resposta) => {
          if (resposta.ok) {
            setRanking(resposta.ranking);
            avisar("ok", "Fila de entrevistas montada.");
            return;
          }
          tratarMotivo(resposta.motivo, "Não foi possível montar a fila de entrevistas.");
        })
        .catch(falhaDeRede)
        .finally(() => setOcupacoesIa((n) => n - 1));
    },
    [tratarMotivo, falhaDeRede, avisar],
  );

  const importarAcervo = useCallback(
    (arquivos: File[], area: AreaVaga | "", vagaId: string, analisar: boolean) => {
      if (arquivos.length === 0) return;

      const formulario = new FormData();
      for (const arquivo of arquivos) formulario.append("arquivos", arquivo);
      formulario.append("area", area);
      formulario.append("vagaId", vagaId);
      formulario.append("analisar", analisar ? "sim" : "nao");

      setOcupacoesIa((n) => n + 1);
      // Zera o resultado anterior antes de começar: deixar na tela o "12
      // criadas" da leva passada enquanto esta sobe faria o RH achar que o
      // envio de agora terminou.
      setResultadoImportacao(null);

      importarCurriculos({ data: formulario })
        .then((resposta) => {
          if (!resposta.ok) {
            tratarMotivo(resposta.motivo, "Não foi possível importar os currículos.");
            return undefined;
          }
          setResultadoImportacao({
            criadas: resposta.criadas,
            duplicadas: resposta.duplicadas,
            erros: resposta.erros,
          });
          // A lista inteira é relida: a importação cria fichas que a tela nunca
          // viu, e não há como mesclá-las a partir dos contadores.
          return listarCandidaturas().then((lista) => {
            if (lista.ok) setItens(lista.itens);
          });
        })
        .catch(falhaDeRede)
        .finally(() => {
          setOcupacoesIa((n) => n - 1);
          recarregarEstadoIa();
        });
    },
    [tratarMotivo, falhaDeRede, recarregarEstadoIa],
  );

  /* ---------------------------------------------------------------------- */
  /* Ficha de entrevista                                                    */
  /* ---------------------------------------------------------------------- */

  /**
   * Manda a IA preparar a ficha desta candidatura no formato do guia da clínica.
   *
   * Não é otimista: não há o que mostrar antes da resposta — o texto todo nasce
   * no servidor. A trava por id é a mesma da análise, e pelo mesmo motivo: dois
   * cliques no botão custariam duas fichas pagas da mesma pessoa.
   */
  const gerarFichaDe = useCallback(
    (id: string, forcar: boolean) => {
      if (gerandoFichaIds.includes(id)) return;
      setGerandoFichaIds((atual) => [...atual, id]);

      gerarFichaAdmin({ data: { id, forcar } })
        .then((resposta) => {
          if (resposta.ok) {
            // O item volta inteiro do disco: gerar a ficha pode ter disparado a
            // análise que faltava, e ela traz nome e telefone junto.
            trocarItem(id, resposta.item);
            avisar("ok", "Ficha de entrevista pronta.");
            return;
          }
          tratarMotivo(resposta.motivo, "Não foi possível preparar a ficha de entrevista.");
        })
        .catch(falhaDeRede)
        .finally(() => setGerandoFichaIds((atual) => atual.filter((x) => x !== id)));
    },
    [gerandoFichaIds, trocarItem, tratarMotivo, falhaDeRede, avisar],
  );

  /**
   * Grava o que o entrevistador escreveu na ficha, otimista como o resto do
   * painel: a anotação aparece na hora e volta atrás se o servidor recusar.
   *
   * A reversão repõe SÓ a ficha, e não o item inteiro, pelo mesmo motivo de
   * `gerir`: mover o cartão para "Entrevista" no meio da conversa é comum, e
   * essa mudança não pode ser desfeita pela recusa de uma anotação.
   *
   * O carimbo de ordem é o mesmo mapa de `gerir` de propósito: as duas escrevem
   * o mesmo arquivo no servidor, e é a última que sai que manda. Sem
   * compartilhar o contador, a resposta atrasada de uma reporia na tela o
   * retrato anterior à outra.
   */
  const salvarFicha = useCallback(
    (id: string, ficha: FichaEntrevista) => {
      const antes = itens.find((c) => c.id === id);
      if (antes === undefined) return;

      const seq = (sequencias.current.get(id) ?? 0) + 1;
      sequencias.current.set(id, seq);
      const atualDaVez = () => sequencias.current.get(id) === seq;

      setItens((atual) => atual.map((c) => (c.id === id ? { ...c, ficha } : c)));
      setSalvamentosFicha((n) => n + 1);

      const reverter = () => {
        setItens((atual) => atual.map((c) => (c.id === id ? { ...c, ficha: antes.ficha } : c)));
      };

      salvarFichaAdmin({ data: { id, ficha } })
        .then((resposta) => {
          if (resposta.ok) {
            if (atualDaVez()) trocarItem(id, resposta.item);
            return;
          }
          reverter();
          tratarMotivo(resposta.motivo, "Não foi possível salvar a ficha de entrevista.");
        })
        .catch(() => {
          reverter();
          falhaDeRede();
        })
        .finally(() => setSalvamentosFicha((n) => n - 1));
    },
    [itens, trocarItem, tratarMotivo, falhaDeRede],
  );

  /* ---------------------------------------------------------------------- */
  /* Guias de entrevista                                                    */
  /* ---------------------------------------------------------------------- */

  const salvarGuia = useCallback(
    (guia: GuiaEntrevista) => {
      const antes = guias;
      const novo = guia.id.length === 0;

      // Guia novo não entra otimista, pelo mesmo motivo da vaga: sem id do
      // servidor ele não teria chave estável na lista, e o slug é dele.
      if (!novo) {
        setGuias((atual) => atual.map((g) => (g.id === guia.id ? guia : g)));
      }
      abrirGravacao();

      salvarGuiaAdmin({ data: { guia } })
        .then((resposta) => {
          if (resposta.ok) {
            const item = resposta.item;
            setGuias((atual) => {
              const lista = atual.some((g) => g.id === item.id)
                ? atual.map((g) => (g.id === item.id ? item : g))
                : [item, ...atual];
              // Marcar este como padrão desmarcou os outros da mesma área no
              // servidor; sem repetir a regra aqui, a tela mostraria dois
              // "padrão" na mesma área até o próximo F5.
              return item.padrao
                ? lista.map((g) =>
                    g.id !== item.id && g.area === item.area && g.padrao
                      ? { ...g, padrao: false }
                      : g,
                  )
                : lista;
            });
            avisar("ok", novo ? "Guia de entrevista criado." : "Guia de entrevista salvo.");
            return;
          }
          setGuias(antes);
          tratarMotivo(resposta.motivo, "Não foi possível salvar o guia.");
        })
        .catch(() => {
          setGuias(antes);
          falhaDeRede();
        })
        .finally(fecharGravacao);
    },
    [guias, abrirGravacao, fecharGravacao, tratarMotivo, falhaDeRede, avisar],
  );

  const excluirGuia = useCallback(
    (id: string) => {
      const antes = guias;
      setGuias((atual) => atual.filter((g) => g.id !== id));
      abrirGravacao();

      excluirGuiaAdmin({ data: { id } })
        .then((resposta) => {
          if (resposta.ok) {
            avisar("ok", "Guia excluído. As fichas já geradas por ele continuam válidas.");
            return;
          }
          setGuias(antes);
          tratarMotivo(resposta.motivo, "Não foi possível excluir o guia.");
        })
        .catch(() => {
          setGuias(antes);
          falhaDeRede();
        })
        .finally(fecharGravacao);
    },
    [guias, abrirGravacao, fecharGravacao, tratarMotivo, falhaDeRede, avisar],
  );

  /* ---------------------------------------------------------------------- */
  /* Vagas e configurações                                                  */
  /* ---------------------------------------------------------------------- */

  const salvarVaga = useCallback(
    (vaga: Vaga) => {
      const antes = vagas;
      const nova = vaga.id.length === 0;

      // Vaga nova não entra otimista: sem id do servidor ela não teria chave
      // estável na lista, e o slug (que vira o link divulgado) também é dele.
      if (!nova) {
        setVagas((atual) => atual.map((v) => (v.id === vaga.id ? vaga : v)));
      }
      abrirGravacao();

      salvarVagaAdmin({ data: { vaga } })
        .then((resposta) => {
          if (resposta.ok) {
            const item = resposta.item;
            setVagas((atual) =>
              atual.some((v) => v.id === item.id)
                ? atual.map((v) => (v.id === item.id ? item : v))
                : [item, ...atual],
            );
            avisar("ok", nova ? "Vaga criada." : "Vaga salva.");
            return;
          }
          setVagas(antes);
          tratarMotivo(resposta.motivo, "Não foi possível salvar a vaga.");
        })
        .catch(() => {
          setVagas(antes);
          falhaDeRede();
        })
        .finally(fecharGravacao);
    },
    [vagas, abrirGravacao, fecharGravacao, tratarMotivo, falhaDeRede, avisar],
  );

  const excluirVaga = useCallback(
    (id: string) => {
      const antes = vagas;
      setVagas((atual) => atual.filter((v) => v.id !== id));
      abrirGravacao();

      excluirVagaAdmin({ data: { id } })
        .then((resposta) => {
          if (resposta.ok) {
            avisar("ok", "Vaga excluída. As candidaturas dela continuam no painel.");
            return;
          }
          setVagas(antes);
          tratarMotivo(resposta.motivo, "Não foi possível excluir a vaga.");
        })
        .catch(() => {
          setVagas(antes);
          falhaDeRede();
        })
        .finally(fecharGravacao);
    },
    [vagas, abrirGravacao, fecharGravacao, tratarMotivo, falhaDeRede, avisar],
  );

  const salvarConfig = useCallback(
    (nova: ConfiguracoesRh) => {
      const antes = config;
      setConfig(nova);
      abrirGravacao();

      salvarConfiguracoesAdmin({ data: { config: nova } })
        .then((resposta) => {
          if (resposta.ok) {
            // A resposta traz o `atualizadoEm` carimbado pelo servidor; sem
            // adotá-la, o formulário ficaria eternamente marcado como "não salvo".
            setConfig(resposta.config);
            avisar("ok", "Configurações do portal salvas.");
            return;
          }
          setConfig(antes);
          tratarMotivo(resposta.motivo, "Não foi possível salvar as configurações.");
        })
        .catch(() => {
          setConfig(antes);
          falhaDeRede();
        })
        .finally(fecharGravacao);
    },
    [config, abrirGravacao, fecharGravacao, tratarMotivo, falhaDeRede, avisar],
  );

  /* ---------------------------------------------------------------------- */
  /* Sessão                                                                 */
  /* ---------------------------------------------------------------------- */

  const atualizarTudo = useCallback(() => {
    setAtualizando(true);
    void router
      .invalidate()
      .catch(falhaDeRede)
      .finally(() => {
        // O relógio anda junto: sem isso, "há 2 minutos" continuaria dizendo
        // "há 2 minutos" depois de meia hora de painel aberto.
        setAgora(new Date());
        setAtualizando(false);
      });
  }, [router, falhaDeRede]);

  const sair = useCallback(() => {
    void sairRh()
      .then(() => router.invalidate())
      .catch(falhaDeRede);
  }, [router, falhaDeRede]);

  /* ---------------------------------------------------------------------- */
  /* Derivados                                                              */
  /* ---------------------------------------------------------------------- */

  const visiveis = useMemo(() => aplicarFiltros(itens, filtros), [itens, filtros]);

  const totalNovos = useMemo(
    () => itens.filter((c) => c.status === "novo" && !c.arquivada).length,
    [itens],
  );
  const totalVagasAbertas = useMemo(
    () => vagas.filter((v) => vagaAberta(v, agora)).length,
    [vagas, agora],
  );

  /**
   * O selo da aba Entrevistas: fichas prontas cuja conversa ainda não terminou.
   *
   * Não é "quantas fichas existem" nem "quantas entrevistas foram feitas" — é o
   * que está esperando alguém, que é a única contagem que faz sentido num selo.
   * Arquivada fica de fora: quem tirou a candidatura da mesa não quer o número
   * dela cobrando na barra o resto do mês.
   */
  const totalEntrevistas = useMemo(
    () =>
      itens.filter((c) => {
        if (c.arquivada) return false;
        const situacao = situacaoDaFicha(c.ficha);
        return situacao === "gerada" || situacao === "preenchendo";
      }).length,
    [itens],
  );

  // A gaveta procura na lista inteira, não nas visíveis: um link com `?c=` para
  // alguém já arquivado precisa abrir mesmo com o filtro escondendo a ficha.
  const aberto = useMemo(() => itens.find((c) => c.id === idAberto) ?? null, [itens, idAberto]);

  /**
   * O guia que vale para uma candidatura — o MESMO que a IA usou para escrever a
   * ficha (`escolherGuia` é a regra compartilhada com o servidor).
   *
   * A semente é criada uma vez e memorizada porque `guiaSementeRecepcao()`
   * devolve um objeto novo a cada chamada: usada solta no render, ela mudaria de
   * identidade a cada repintura e o modo entrevista jogaria fora o rascunho da
   * pessoa a cada tecla. Ela só entra em cena quando não existe guia nenhum
   * gravado, que é exatamente o que o servidor também faz.
   */
  const semente = useMemo(() => guiaSementeRecepcao(), []);

  const guiaDoAberto = useMemo(
    () => (aberto === null ? null : escolherGuia(guias, aberto.vagaId, aberto.area)),
    [guias, aberto],
  );

  // O modo entrevista também procura na lista inteira: o link é aberto de outro
  // aparelho, com filtros que não são os desta tela.
  const emEntrevista = useMemo(
    () => (idEntrevista === "" ? null : (itens.find((c) => c.id === idEntrevista) ?? null)),
    [itens, idEntrevista],
  );

  const guiaDaEntrevista = useMemo(
    () =>
      emEntrevista === null
        ? null
        : (escolherGuia(guias, emEntrevista.vagaId, emEntrevista.area) ?? semente),
    [guias, emEntrevista, semente],
  );

  const exportar = useCallback(() => baixarCsv(visiveis, agora), [visiveis, agora]);

  /* ---------------------------------------------------------------------- */
  /* Seleção em lote                                                        */
  /* ---------------------------------------------------------------------- */

  /**
   * Os itens realmente selecionados, na ordem em que estão VISÍVEIS na tela.
   *
   * Filtrar por `visiveis` (e não pela lista inteira) é o que impede a barra de
   * agir sobre gente que o filtro escondeu: o RH marca seis, aperta um filtro,
   * e a barra passa a falar só das que continuam na frente dele. O id de quem
   * saiu da tela continua guardado — desfazer o filtro devolve a marcação.
   */
  const itensSelecionados = useMemo(
    () => visiveis.filter((c) => selecionadas.includes(c.id)),
    [visiveis, selecionadas],
  );

  const alternarSelecao = useCallback((id: string, marcada: boolean) => {
    setSelecionadas((atual) => {
      if (marcada) return atual.includes(id) ? atual : [...atual, id];
      return atual.filter((x) => x !== id);
    });
  }, []);

  const selecionarVisiveis = useCallback(
    (marcar: boolean) => {
      const ids = visiveis.map((c) => c.id);
      setSelecionadas((atual) => {
        if (!marcar) return atual.filter((x) => !ids.includes(x));
        const novos = ids.filter((x) => !atual.includes(x));
        return novos.length === 0 ? atual : [...atual, ...novos];
      });
    },
    [visiveis],
  );

  const limparSelecao = useCallback(() => setSelecionadas([]), []);

  const exportarSelecionadas = useCallback(
    (lista: Candidatura[]) => baixarCsv(lista, agora),
    [agora],
  );

  /**
   * O nome que assina as mensagens. Vem das configurações e cai para o nome da
   * clínica quando o campo está em branco — nunca um nome inventado no código,
   * que chegaria ao WhatsApp de uma candidata como se fosse gente de verdade.
   */
  const remetente = config.assinaturaRh.trim() === "" ? CLINICA.nome : config.assinaturaRh.trim();

  return (
    <div className="rh-admin rh-aurora flex min-h-dvh flex-col">
      {/* O `id="conteudo"` do <main> sempre existiu; faltava o atalho que o usa.
          Sem ele, quem navega por teclado atravessa cabeçalho, abas, busca e os
          dez controles de filtro antes do primeiro candidato. */}
      <SkipLink />

      <CabecalhoRh
        aba={aba}
        aoTrocarAba={trocarAba}
        totalNovos={totalNovos}
        totalVagasAbertas={totalVagasAbertas}
        totalCandidaturas={itens.length}
        totalEntrevistas={totalEntrevistas}
        atualizando={atualizando}
        aoAtualizar={atualizarTudo}
        aoSair={sair}
      />

      {expirada ? (
        <div role="alert" className="border-b border-amber-200/30 bg-amber-300/12">
          <div className="jp-container flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
            <ShieldAlert size={18} className="shrink-0 text-amber-700" aria-hidden="true" />
            <p className="min-w-0 flex-1 text-sm font-semibold leading-relaxed text-ink">
              Sua sessão expirou e as últimas alterações não foram gravadas. Copie o que ainda
              estiver escrito na tela antes de entrar de novo.
            </p>
            <button
              type="button"
              onClick={() => void router.invalidate()}
              className="button-primary min-h-11"
            >
              Entrar de novo
            </button>
          </div>
        </div>
      ) : null}

      {/* O painel de cada aba é o `tabpanel` do `tablist` do cabeçalho: sem o
          par `aria-controls`/`aria-labelledby`, o comando "ir para o elemento
          controlado" do leitor de tela não tem destino depois de trocar de aba. */}
      <main
        id="conteudo"
        role="tabpanel"
        aria-labelledby={`aba-rh-${aba}`}
        tabIndex={-1}
        /* A aba Candidaturas não leva a folga de baixo: o quadro do kanban é
           dimensionado para terminar exatamente no fim da janela, e 64px a mais
           embaixo dele criariam uma rolagem de página que não leva a lugar
           nenhum. As outras abas continuam com o respiro no fim do conteúdo. */
        className={`flex-1 ${aba === "candidaturas" ? "" : "pb-16"}`}
      >
        {aba === "resumo" ? (
          // A calha vive aqui, e não dentro de cada componente: sem ela os KPIs
          // e os cartões encostavam nas bordas no celular e esticavam de ponta a
          // ponta no desktop, enquanto a aba Candidaturas ficava contida.
          <div className="jp-container py-5">
            <PainelResumo
              itens={itens}
              vagas={vagas}
              agora={agora}
              aoAbrir={abrirCandidato}
              aoIrParaAba={trocarAba}
            />
          </div>
        ) : null}

        {aba === "candidaturas" ? (
          <>
            <BarraFiltros
              filtros={filtros}
              aoMudar={setFiltros}
              vagas={vagas}
              total={itens.length}
              visiveis={visiveis.length}
              visao={visao}
              aoTrocarVisao={setVisao}
              aoExportar={exportar}
              selecionadas={itensSelecionados.length}
              todasVisiveisMarcadas={
                visiveis.length > 0 && itensSelecionados.length === visiveis.length
              }
              aoSelecionarVisiveis={selecionarVisiveis}
            />
            {visao === "kanban" ? (
              <Kanban
                itens={visiveis}
                agora={agora}
                selecionadas={selecionadas}
                aoAbrir={abrirCandidato}
                aoSelecionar={alternarSelecao}
                aoMoverStatus={moverStatus}
              />
            ) : (
              <TabelaCandidaturas
                itens={visiveis}
                total={itens.length}
                agora={agora}
                selecionadas={selecionadas}
                aoAbrir={abrirCandidato}
                aoSelecionar={alternarSelecao}
                aoMoverStatus={moverStatus}
              />
            )}

            {/* A barra só existe quando há gente marcada — e ela mesma some
                quando a lista esvazia. Fica no fim da aba, grudada embaixo:
                é o lugar em que o polegar já está depois de percorrer a fila. */}
            <AcoesEmLote
              itens={itensSelecionados}
              agora={agora}
              remetente={remetente}
              aoLimpar={limparSelecao}
              aoMoverStatus={moverStatus}
              aoRegistrar={anotar}
              aoExportar={exportarSelecionadas}
            />
          </>
        ) : null}

        {aba === "triagem" ? (
          <div className="jp-container py-5">
            <AbaTriagem
              itens={itens}
              vagas={vagas}
              agora={agora}
              estadoIa={ia ?? IA_INDISPONIVEL}
              ocupado={ocupacoesIa > 0}
              progresso={progressoIa}
              ranking={ranking}
              resultadoImportacao={resultadoImportacao}
              aoAnalisarTodas={analisarEmLote}
              aoGerarRanking={criarRanking}
              aoImportar={importarAcervo}
              aoAbrir={abrirCandidato}
            />
          </div>
        ) : null}

        {aba === "entrevistas" ? (
          <div className="jp-container py-5">
            <AbaEntrevistas
              itens={itens}
              guias={guias}
              vagas={vagas}
              agora={agora}
              salvando={gravacoes > 0}
              aoSalvarGuia={salvarGuia}
              aoExcluirGuia={excluirGuia}
              aoAbrir={abrirCandidato}
              aoAbrirModoEntrevista={abrirModoEntrevista}
            />
          </div>
        ) : null}

        {aba === "vagas" ? (
          <div className="jp-container py-5">
            <GestaoVagas
              vagas={vagas}
              candidaturas={itens}
              config={config}
              agora={agora}
              salvando={gravacoes > 0}
              aoSalvar={salvarVaga}
              aoExcluir={excluirVaga}
              aoAlternarEditor={setEditorVagaAberto}
            />
          </div>
        ) : null}

        {aba === "config" ? (
          <div className="jp-container py-5">
            <ConfiguracoesPortal
              config={config}
              salvando={gravacoes > 0}
              aoSalvar={salvarConfig}
              estadoIa={ia}
            />
          </div>
        ) : null}
      </main>

      {/* Fora do `main` e fora da troca de abas: a gaveta é uma camada por cima
          da tela, e desmontá-la ao mudar de aba jogaria fora o foco devolvido. */}
      <GavetaCandidatura
        item={aberto}
        vagas={vagas}
        agora={agora}
        salvando={gravacoes > 0}
        aoFechar={fecharGaveta}
        aoAtualizar={gerir}
        aoAnotar={anotar}
        aoRemoverAnotacao={apagarAnotacao}
        remetente={remetente}
        aoExcluir={excluirCandidato}
        aoRestaurar={restaurarCandidato}
        aoExcluirAgora={excluirCandidatoAgora}
        analisando={aberto !== null && analisandoIds.includes(aberto.id)}
        aoAnalisar={analisarFicha}
        guia={guiaDoAberto}
        gerandoFicha={aberto !== null && gerandoFichaIds.includes(aberto.id)}
        salvandoFicha={salvamentosFicha > 0}
        aoGerarFicha={gerarFichaDe}
        aoSalvarFicha={salvarFicha}
        aoAbrirModoEntrevista={abrirModoEntrevista}
      />

      {/* O modo entrevista é a camada mais alta do painel: ele roda com a
          candidata sentada na frente, e nada da tela de baixo pode aparecer por
          cima. Vem depois da gaveta no DOM porque é dela que ele costuma ser
          aberto — e fechá-lo devolve o foco para lá.

          A `key` pelo id desmonta e remonta ao trocar de pessoa: cronômetro,
          passo e rascunho de uma entrevista não podem vazar para a seguinte. */}
      {emEntrevista !== null && guiaDaEntrevista !== null ? (
        <ModoEntrevista
          key={emEntrevista.id}
          item={emEntrevista}
          guia={guiaDaEntrevista}
          agora={agora}
          salvando={salvamentosFicha > 0}
          aoFechar={fecharModoEntrevista}
          aoSalvar={(ficha) => salvarFicha(emEntrevista.id, ficha)}
        />
      ) : null}

      <Avisos
        avisos={avisos}
        camadaAberta={aberto !== null || editorVagaAberto || emEntrevista !== null}
        aoDispensar={dispensarAviso}
      />
    </div>
  );
}
