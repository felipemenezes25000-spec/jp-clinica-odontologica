/**
 * Orquestração da triagem por IA.
 *
 * Só roda no servidor: é sempre carregado por `await import()` dentro do handler
 * de uma server function (ou pelo script de importação), nunca no topo de um
 * módulo que a tela importa.
 *
 * O caminho de uma candidatura, do arquivo ao veredito:
 *
 *   ficha → arquivo do currículo → EXTRAÇÃO (modelo lê)
 *        → MÉTRICAS (código calcula) → SINAIS (código prova)
 *        → AVALIAÇÃO (modelo julga, com os números prontos em mãos)
 *        → sinais do modelo + sinais do cálculo → grava em `candidatura.analise`
 *
 * A ordem importa: o modelo só julga DEPOIS que a aritmética está feita, e
 * recebe os números com a instrução de não recalcular. É o que impede a análise
 * de dizer "quase dois anos" para um vínculo de sete meses.
 */
import { montarDuvidas } from "../duvidas";
import { fichaVazia, limparLeiturasOrfas, VERSAO_FICHA, type FichaEntrevista } from "../ficha";
import { telefoneParaContato } from "../validar";
import { apenasDigitos } from "../formatar";
import {
  escolherGuia,
  exemplosDaClinica,
  guiaSementeRecepcao,
  linhaDeExemplo,
  type GuiaEntrevista,
} from "../guia";
import { calcularMetricas, emAnosMeses } from "../ia/metricas";
import { notaPonderada, rubricaPara, tetoPorRotatividade } from "../ia/rubricas";
import { comVeredito } from "../ia/veredito";
import { ordenarSinais, sinaisDeCalculo } from "../ia/sinais";
import { analiseVazia, extracaoVazia, VERSAO_ANALISE } from "../ia/tipos";
import type {
  AnaliseIa,
  EmpregoExtraido,
  ExtracaoCurriculo,
  FormacaoExtraida,
  MetricasPermanencia,
  RankingSalvo,
  Sinal,
} from "../ia/tipos";
import { AREAS } from "../opcoes";
import type { AreaVaga, Candidatura, FaixaExperiencia } from "../tipos";

export type ResultadoAnalise = { ok: true; analise: AnaliseIa } | { ok: false; motivo: string };

/**
 * Grava a análise e, na mesma escrita, joga fora a leitura de dúvida que a nova
 * análise deixou órfã.
 *
 * Reanalisar um currículo refaz a lista de sinais, e é dela que sai metade do
 * roteiro de perguntas. Uma data corrigida faz o sinal de lacuna sumir, e a
 * leitura "não convenceu" que estava presa a ele vira lixo invisível: some da
 * tela — que só desenha as dúvidas atuais — mas continua sendo regravada a cada
 * salvamento, e a ficha engorda carregando resposta de pergunta que ninguém mais
 * faz. O caso pior não é o tamanho: se aquele mesmo sinal voltar um dia, a
 * dúvida reapareceria já marcada por uma conversa de dois meses atrás.
 *
 * A limpeza é feita DENTRO do mutador porque `montarDuvidas` precisa da
 * candidatura já com a análise nova — os ids saem dela. E é o mesmo
 * `atualizarCandidaturaNoDisco` de `salvarAnalise`, pela mesma razão: a análise
 * leva dezenas de segundos, e nesse intervalo o RH pode ter mudado o status ou
 * escrito uma anotação que um retrato antigo apagaria.
 *
 * O que ainda é válido fica intocado — inclusive a resposta digitada à mão numa
 * entrevista que já aconteceu.
 */
async function gravarAnaliseLimpandoRoteiro(
  armazenamento: typeof import("./armazenamento"),
  id: string,
  analise: AnaliseIa,
): Promise<void> {
  await armazenamento.atualizarCandidaturaNoDisco(id, (atual) => {
    const item: Candidatura = { ...atual, analise };
    const ficha = item.ficha;
    // Sem ficha não há leitura para envelhecer, e `atualizadoEm` continua
    // intocado aqui de propósito: uma reanálise em lote de 300 currículos não
    // pode jogar todo mundo para o topo de "mexidos recentemente".
    if (ficha === null) return item;
    return {
      ...item,
      ficha: limparLeiturasOrfas(
        ficha,
        montarDuvidas(item).map((d) => d.id),
      ),
    };
  });
}

/** Quantas análises rodam ao mesmo tempo. A API tem limite e o disco tem fila. */
const CONCORRENCIA = 3;

/* -------------------------------------------------------------------------- */
/* Fallback: análise de quem se candidatou sem anexar currículo               */
/* -------------------------------------------------------------------------- */

function semAcento(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase();
}

const MESES_PT: Record<string, number> = {
  jan: 1,
  fev: 2,
  mar: 3,
  abr: 4,
  mai: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  set: 9,
  out: 10,
  nov: 11,
  dez: 12,
};

/**
 * Datas escritas à mão no campo "período" do formulário.
 *
 * Aceita "jan/2020 a mar/2022", "01/2020 - 03/2022", "2020 a 2022" e
 * "desde 2021 (atual)". Quando não reconhece nada, devolve vazio — de propósito:
 * um período que não deu para ler vira o sinal `sem-datas`, que é a verdade,
 * enquanto uma data chutada aqui viraria uma acusação de rotatividade lá na
 * frente. Toda dúvida de data corre a favor da candidata.
 */
const RE_DATA =
  /(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\.?\s*(?:de\s+)?\/?\s*(\d{4})|(\d{1,2})\s*[/.-]\s*(\d{4})|(\d{4})/g;

export function datasDoPeriodo(periodo: string): { inicio: string; fim: string; atual: boolean } {
  const t = semAcento(periodo);
  const atual = /(atual|atualmente|presente|hoje|momento)/.test(t);

  const achadas: string[] = [];
  for (const m of t.matchAll(RE_DATA)) {
    const mesNome = m[1];
    const anoDoNome = m[2];
    const mesNumero = m[3];
    const anoDoNumero = m[4];
    const soAno = m[5];

    if (mesNome !== undefined && anoDoNome !== undefined) {
      const numero = MESES_PT[mesNome];
      achadas.push(
        numero === undefined ? anoDoNome : `${anoDoNome}-${String(numero).padStart(2, "0")}`,
      );
    } else if (mesNumero !== undefined && anoDoNumero !== undefined) {
      const numero = Number(mesNumero);
      achadas.push(
        numero >= 1 && numero <= 12
          ? `${anoDoNumero}-${String(numero).padStart(2, "0")}`
          : anoDoNumero,
      );
    } else if (soAno !== undefined) {
      achadas.push(soAno);
    }

    if (achadas.length >= 2) break;
  }

  return { inicio: achadas[0] ?? "", fim: atual ? "" : (achadas[1] ?? ""), atual };
}

/**
 * Classificação de setor por palavra-chave.
 *
 * É pobre perto do que o modelo faz lendo o documento, e é de propósito: este
 * caminho só existe para quem se candidatou pelo site SEM anexar currículo, e
 * gastar uma chamada de IA para classificar três linhas de formulário seria
 * pagar caro por pouco. Quando há arquivo, quem classifica é a extração.
 */
function classificarVinculo(
  empresa: string,
  cargo: string,
  atividades: string,
): {
  setor: string;
  atendimentoPublico: boolean;
  administrativo: boolean;
  odontologico: boolean;
  saude: boolean;
} {
  // A EMPRESA entra na conta junto do cargo: "Recepcionista" na "Clínica
  // Odontológica Sorriso" é experiência odontológica, e olhar só para o cargo
  // faria a métrica dizer "nenhuma passagem por odontologia" bem embaixo de um
  // vínculo de quase cinco anos em consultório. Foi exatamente o que aconteceu
  // no primeiro teste desta função.
  const t = semAcento(`${empresa} ${cargo} ${atividades}`);
  const odontologico = /(odonto|dentist|dentari|asb\b|tsb\b|\bcro\b|consultorio odont)/.test(t);
  const saude =
    odontologico ||
    /(clinic|hospital|saude|laborator|enfermag|medic|farmac|posto de saude)/.test(t);
  const atendimentoPublico =
    /(atend|recep|client|pacient|balcao|caixa|vend|garcom|telemarketing|call center|publico)/.test(
      t,
    );
  const administrativo =
    /(administr|agenda|financeir|caixa|planilha|excel|sistema|secretari|faturament|cobranca|estoque|whatsapp|telefone|cadastr|arquiv|recepc)/.test(
      t,
    );

  const setor = odontologico
    ? "odontologia"
    : saude
      ? "saude"
      : /(loja|varejo|comerci|supermercad|magazin|drogaria|farmac)/.test(t)
        ? "varejo"
        : /(restaurante|lanchonete|padaria|alimenta|cozinha)/.test(t)
          ? "alimentacao"
          : /(escola|creche|educa|professor)/.test(t)
            ? "educacao"
            : /(banco|financeir|contabil)/.test(t)
              ? "financeiro"
              : "outro";

  return { setor, atendimentoPublico, administrativo, odontologico, saude };
}

/**
 * Monta uma extração a partir do que a pessoa preencheu no formulário.
 *
 * Candidatura enviada pelo site sem anexo continua merecendo triagem: a pessoa
 * digitou empresa, cargo, período e atividades no passo de experiência, e essa
 * informação é dela, não de um leitor automático. Recusar a análise por falta de
 * PDF deixaria justamente quem não tem currículo pronto (que é bastante gente
 * boa para recepção) fora da fila de entrevista.
 *
 * `legibilidade` vai em 100 e `tipoDocumento` em "formulario": não há documento
 * para ler mal — o que a pessoa escreveu chegou inteiro.
 */
export function extracaoDoFormulario(c: Candidatura): ExtracaoCurriculo {
  const formacoes = c.escolaridade
    ? [
        {
          curso: c.escolaridade,
          instituicao: c.instituicao,
          nivel: semAcento(c.escolaridade).includes("superior")
            ? "superior"
            : semAcento(c.escolaridade).includes("tecnic")
              ? "tecnico"
              : semAcento(c.escolaridade).includes("pos") ||
                  semAcento(c.escolaridade).includes("mestrad") ||
                  semAcento(c.escolaridade).includes("doutorad")
                ? "pos"
                : "medio",
          conclusao: c.anoFormacao,
          emAndamento: semAcento(c.escolaridade).includes("incompleto"),
        },
      ]
    : [];

  return {
    ...extracaoVazia(),
    documentoValido: true,
    tipoDocumento: "formulario",
    legibilidade: 100,

    nome: c.nome,
    nascimento: c.nascimento,
    idadeDeclarada: null,
    cidade: c.cidade,
    uf: c.uf,
    telefone: c.telefone,
    email: c.email,
    linkedin: c.linkedin,
    resumoObjetivo: [c.cargoDesejado, c.cartaApresentacao].filter((p) => p.length > 0).join(" — "),

    formacoes,
    empregos: c.experiencias
      .filter((e) => e.empresa.length > 0 || e.cargo.length > 0)
      .map((e) => {
        const datas = datasDoPeriodo(e.periodo);
        return {
          empresa: e.empresa,
          cargo: e.cargo,
          inicio: datas.inicio,
          fim: datas.fim,
          atual: datas.atual,
          // O formulário do site pede um período, nunca uma duração solta.
          duracaoMesesDeclarada: null,
          descricao: e.atividades,
          ...classificarVinculo(e.empresa, e.cargo, e.atividades),
        };
      }),
    cursos: [c.posGraduacoes, c.cursos].filter((p) => p.length > 0),
    idiomas: c.idiomas,
    softwares: c.softwares,
    competencias: c.competencias,
    especialidades: c.especialidades,

    registroProfissional: c.cro ? `CRO-${c.croUf || "??"} ${c.cro}` : "",
    pretensaoDeclarada: c.pretensao,

    dadosSensiveisPresentes: [],
    observacoesDoLeitor: [
      "Sem currículo anexado: esta análise saiu do que a própria pessoa preencheu no formulário do site.",
    ],
  };
}

/**
 * Completa o que o documento não trouxe com o que a pessoa digitou no site.
 *
 * O cabeçalho do currículo é justamente a parte que some quando a foto corta a
 * página, e não faz sentido marcar "sem telefone" para alguém que digitou o
 * telefone no formulário. O contrário nunca acontece: o que o documento trouxe
 * manda, porque é o documento que está sendo analisado.
 */
function completarComFormulario(e: ExtracaoCurriculo, c: Candidatura): ExtracaoCurriculo {
  return {
    ...e,
    nome: e.nome || c.nome,
    nascimento: e.nascimento || c.nascimento,
    bairro: e.bairro || c.bairro,
    cep: e.cep || c.cep,
    cidade: e.cidade || c.cidade,
    uf: e.uf || c.uf,
    telefone: e.telefone || c.telefone,
    email: e.email || c.email,
    linkedin: e.linkedin || c.linkedin,
    registroProfissional:
      e.registroProfissional || (c.cro ? `CRO-${c.croUf || "??"} ${c.cro}` : ""),
    pretensaoDeclarada: e.pretensaoDeclarada || c.pretensao,
    softwares: e.softwares.length > 0 ? e.softwares : c.softwares,
    idiomas: e.idiomas.length > 0 ? e.idiomas : c.idiomas,
  };
}

/* -------------------------------------------------------------------------- */
/* Análise de uma candidatura                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Aplica o teto de rotatividade sobre a nota já ponderada.
 *
 * Só ABAIXA, nunca levanta: uma trajetória estável não ganha ponto por isso
 * aqui (a permanência já vale 30% da régua). O teto existe para impedir que a
 * média ponderada leve para a faixa de prioridade quem tem padrão de saída
 * rápida — foi o pedido do cliente, e é conta sobre datas, não opinião.
 */
function comTeto(nota: number, metricas: MetricasPermanencia): number {
  const limite = tetoPorRotatividade(metricas);
  if (limite === null) return nota;
  return Math.min(nota, limite.teto);
}

function areaDaCandidatura(c: Candidatura): AreaVaga {
  const conhecida = AREAS.some((a) => a.valor === c.area);
  // Currículo importado de pasta solta chega sem área. "outro" é a rubrica
  // genérica, que julga pelo título da vaga em vez de cobrar odontologia.
  return conhecida ? c.area : "outro";
}

/** Registro de falha, para a tela dizer "a análise falhou" em vez de nada. */
function analiseComErro(
  erro: string,
  modelo: string,
  agoraIso: string,
  extracao: ExtracaoCurriculo,
  metricas: MetricasPermanencia,
  sinais: Sinal[],
): AnaliseIa {
  return { ...analiseVazia(), modelo, analisadoEm: agoraIso, extracao, metricas, sinais, erro };
}

/**
 * Preenche na ficha o que só a leitura do documento sabia.
 *
 * Currículo importado de pasta cria a candidatura em branco (o nome do arquivo
 * é "cv-final-2.pdf", não é nome de ninguém), e o painel mostraria uma lista de
 * fichas "sem nome". Nunca sobrescreve o que já está preenchido: o que a pessoa
 * digitou no formulário do site vale mais do que o que a leitura achou.
 */
/* A sigla de cada mês, na ordem. Derivada do mapa acima em vez de reescrita:
   duas listas de meses no mesmo arquivo é uma que vai divergir da outra. */
const SIGLA_DO_MES: string[] = Object.entries(MESES_PT)
  .sort((a, b) => a[1] - b[1])
  .map(([sigla]) => sigla);

/** "2021-03" -> "mar/2021"; "2021" -> "2021"; qualquer outra coisa -> "". */
function dataLegivel(iso: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(iso);
  if (m) {
    const mes = SIGLA_DO_MES[Number(m[2]) - 1];
    if (mes !== undefined) return mes + "/" + m[1];
  }
  return /^\d{4}$/.test(iso) ? iso : "";
}

/** O período do jeito que a pessoa escreveria: "mar/2021 a hoje". */
function periodoLegivel(emprego: EmpregoExtraido): string {
  const inicio = dataLegivel(emprego.inicio);
  const fim = emprego.atual ? "hoje" : dataLegivel(emprego.fim);
  if (inicio === "" && fim === "") return "";
  if (inicio === "") return "até " + fim;
  if (fim === "") return "desde " + inicio;
  return inicio + " a " + fim;
}

/** Altura da formação, para achar a mais alta que a pessoa tem. */
const PESO_NIVEL: Record<string, number> = { medio: 1, tecnico: 2, superior: 3, pos: 4 };

/** Nível extraído -> o rótulo que o painel usa (`ESCOLARIDADES`, em opcoes.ts). */
function escolaridadeDe(f: FormacaoExtraida): string {
  if (f.nivel === "pos") return "Pós-graduação / especialização";
  if (f.nivel === "superior") return f.emAndamento ? "Superior incompleto" : "Superior completo";
  if (f.nivel === "tecnico") return "Curso técnico";
  if (f.nivel === "medio") {
    return f.emAndamento ? "Ensino médio incompleto" : "Ensino médio completo";
  }
  return "";
}

/** Meses somados -> a faixa que o painel filtra (`FAIXAS_EXPERIENCIA`). */
function faixaDeMeses(meses: number | null): FaixaExperiencia | "" {
  if (meses === null) return "";
  if (meses <= 0) return "sem";
  if (meses < 24) return "0-2";
  if (meses < 60) return "2-5";
  if (meses < 120) return "5-10";
  return "10+";
}

/**
 * Copia para a FICHA o que a leitura achou no currículo.
 *
 * POR QUE ISTO CRESCEU
 * O formulário público pedia mais de vinte campos e passou a pedir quatro (ver
 * o comentário de `validarEssencial`, em validar.ts). O painel, porém, mostra
 * os campos da ficha — `item.escolaridade`, `item.experiencias`, `item.idiomas`
 * — e não a extração crua. Sem esta cópia, encurtar o formulário deixaria a
 * gaveta vazia: a informação existiria dentro da análise e não apareceria onde
 * o RH olha.
 *
 * NUNCA SOBRESCREVE o que já está preenchido. O que a pessoa digitou vale mais
 * do que o que a leitura achou — e, principalmente, o RH pode ter corrigido no
 * painel depois. Uma reanálise não pode desfazer correção humana.
 */
async function preencherComExtracao(
  id: string,
  e: ExtracaoCurriculo,
  m: MetricasPermanencia,
): Promise<void> {
  const { atualizarCandidaturaNoDisco } = await import("./armazenamento");

  const formacaoMaisAlta = [...e.formacoes]
    .filter((f) => escolaridadeDe(f) !== "")
    .sort((a, b) => (PESO_NIVEL[b.nivel] ?? 0) - (PESO_NIVEL[a.nivel] ?? 0))[0];

  const pos = e.formacoes
    .filter((f) => f.nivel === "pos")
    .map((f) => [f.curso, f.instituicao].filter((t) => t.trim() !== "").join(" — "))
    .filter((t) => t !== "");

  const experiencias = e.empregos
    .filter((emp) => emp.empresa.trim() !== "" || emp.cargo.trim() !== "")
    .map((emp) => ({
      empresa: emp.empresa,
      cargo: emp.cargo,
      periodo: periodoLegivel(emp),
      atividades: emp.descricao,
    }));

  const faixa = faixaDeMeses(m.mesesExperienciaTotal);

  await atualizarCandidaturaNoDisco(id, (atual) => ({
    ...atual,
    nome: atual.nome || e.nome,
    email: atual.email || e.email,
    // `telefoneParaContato`, e nao `apenasDigitos`: o campo vem como texto
    // livre do curriculo e costuma trazer DOIS numeros. Colar todos os digitos
    // produzia telefone de 13 a 24 digitos, que o painel tratava como ausente.
    telefone: atual.telefone || telefoneParaContato(e.telefone),
    nascimento: atual.nascimento || e.nascimento,
    // Bairro e CEP são o que alimenta o cálculo de proximidade da clínica
    // (ver ia/proximidade.ts). Sem gravá-los aqui, a conta rodaria uma vez na
    // análise e a ficha continuaria sem saber onde a pessoa mora.
    bairro: atual.bairro || e.bairro,
    cep: atual.cep || e.cep,
    cidade: atual.cidade || e.cidade,
    uf: atual.uf || e.uf,
    linkedin: atual.linkedin || e.linkedin,
    cro: atual.cro || (e.registroProfissional.match(/\d{3,}/)?.[0] ?? ""),
    // A UF do conselho vinha sendo jogada fora: "CRO-SP 12345" virava só
    // "12345", e a ficha mostrava "CRO 12345" sem dizer de que estado — que é
    // metade da informação quando se vai conferir o registro.
    croUf:
      atual.croUf ||
      (e.registroProfissional.match(/CRO[\s-]*([A-Z]{2})/i)?.[1] ?? "").toUpperCase(),

    escolaridade: atual.escolaridade || (formacaoMaisAlta ? escolaridadeDe(formacaoMaisAlta) : ""),
    instituicao: atual.instituicao || (formacaoMaisAlta?.instituicao ?? ""),
    anoFormacao: atual.anoFormacao || (formacaoMaisAlta?.conclusao ?? ""),
    posGraduacoes: atual.posGraduacoes || pos.join("\n"),
    cursos: atual.cursos || e.cursos.join("\n"),

    // Lista vazia é "ninguém preencheu"; lista com item é dado de alguém e fica.
    experiencias: atual.experiencias.length > 0 ? atual.experiencias : experiencias,
    anosExperiencia: atual.anosExperiencia || faixa,
    softwares: atual.softwares.length > 0 ? atual.softwares : e.softwares,
    idiomas: atual.idiomas.length > 0 ? atual.idiomas : e.idiomas,
    // Competências e especialidades passam a chegar na ficha. Estavam no
    // currículo e no cadastro, mas não na extração — o bloco "Competências"
    // mostrava só softwares e idiomas, e ficava vazio para quem chega pelo
    // site, que envia apenas nome, WhatsApp e o arquivo.
    competencias: atual.competencias.length > 0 ? atual.competencias : e.competencias,
    especialidades: atual.especialidades.length > 0 ? atual.especialidades : e.especialidades,

    pretensao: atual.pretensao || e.pretensaoDeclarada,
    /* O "objetivo" que a pessoa escreveu no topo do currículo vira o cargo
       desejado quando o cadastro não tem nenhum — é literalmente a resposta à
       pergunta "que vaga você quer", escrita por ela. Cortado em 80 para não
       transformar um parágrafo de objetivo em título de cargo. */
    cargoDesejado: atual.cargoDesejado || e.resumoObjetivo.trim().slice(0, 80),
  }));
}

export async function analisarCandidatura(
  id: string,
  /* `forcar` continua na assinatura: quem chama passa, e a decisão de reler
     agora é só do guarda abaixo. */
  _opcoes: { forcar?: boolean; refazerLeituraBoa?: boolean },
): Promise<ResultadoAnalise> {
  const armazenamento = await import("./armazenamento");
  const c = await armazenamento.lerCandidatura(id);
  if (c === null) return { ok: false, motivo: "Candidatura não encontrada." };

  const anterior = c.analise;

  /*
   * LEITURA BOA NÃO SE REFAZ. Nem com `forcar`.
   *
   * Ordem do cliente, e a razão é dinheiro: cada leitura é uma chamada paga, e
   * o currículo não muda depois de enviado. Já houve um clique que disparou 150
   * chamadas contra os mesmos três arquivos.
   *
   * `forcar` continua existindo e continua servindo para o que interessa:
   * releitura do que FALHOU (`erro !== ""`) e do que nunca foi lido. O que ele
   * deixou de poder é refazer o que já deu certo — inclusive quando a régua
   * muda de versão. Trocar os pesos não torna a extração errada: a extração é
   * o que o currículo diz, e isso não mudou.
   *
   * Sem esta trava, o botão "Reanalisar" da ficha e o lote com `forcar`
   * continuariam sendo duas portas abertas para reprocessar o acervo inteiro
   * por engano.
   *
   * A ÚNICA PORTA QUE ATRAVESSA é `refazerLeituraBoa`, e ela não tem botão em
   * lugar nenhum do painel — nem na ficha, nem no lote. Existe para a manutenção
   * rara e deliberada em que a EXTRAÇÃO melhorou (um campo novo, uma instrução
   * que faz o modelo achar datas que antes deixava passar) e vale a pena pagar
   * para reler o acervo. Quem a usa escreve o nome dela, e escrever o nome já é
   * a confirmação: nenhum clique distraído chega aqui.
   */
  if (anterior !== null && anterior.erro === "" && _opcoes.refazerLeituraBoa !== true) {
    return { ok: true, analise: anterior };
  }

  const ia = await import("./openai");
  const estado = ia.iaConfigurada();
  if (!estado.ok) return { ok: false, motivo: estado.motivo };

  const modelo = ia.modeloAtual();
  const agora = new Date();
  const agoraIso = agora.toISOString();
  const area = areaDaCandidatura(c);

  let tokensEntrada = 0;
  let tokensSaida = 0;
  let extracao: ExtracaoCurriculo;

  if (c.curriculo !== null) {
    const bytes = await armazenamento.lerCurriculo(id, c.curriculo.nomeArquivo);
    if (bytes === null) {
      const motivo =
        "O arquivo do currículo não foi encontrado no disco. A ficha existe, mas o anexo sumiu.";
      await gravarAnaliseLimpandoRoteiro(
        armazenamento,
        id,
        analiseComErro(motivo, modelo, agoraIso, extracaoVazia(), calcularMetricas([], agora), []),
      );
      return { ok: false, motivo };
    }

    const lida = await ia.extrairCurriculo({
      bytes,
      nome: c.curriculo.nomeArquivo,
      mime: c.curriculo.tipo,
    });
    if (!lida.ok) {
      await gravarAnaliseLimpandoRoteiro(
        armazenamento,
        id,
        analiseComErro(
          lida.erro,
          modelo,
          agoraIso,
          extracaoVazia(),
          calcularMetricas([], agora),
          [],
        ),
      );
      return { ok: false, motivo: lida.erro };
    }

    tokensEntrada += lida.uso.entrada;
    tokensSaida += lida.uso.saida;
    extracao = completarComFormulario(lida.extracao, c);
  } else {
    extracao = extracaoDoFormulario(c);
  }

  const metricas = calcularMetricas(extracao.empregos, agora);

  const acervo = await armazenamento.listarParaDeduplicacao();
  const sinaisCalculados = sinaisDeCalculo({
    extracao,
    metricas,
    area,
    agora,
    // A própria ficha fica de fora, senão toda candidatura seria duplicata de si
    // mesma; e quem não tem nome nem telefone não ajuda a reconhecer ninguém.
    nomesJaExistentes: acervo
      .filter((o) => o.id !== id && (o.nome.length > 0 || o.telefone.length > 0))
      .map((o) => ({ id: o.id, nome: o.nome, telefone: o.telefone })),
  });

  // Documento que não é currículo não vai para a avaliação: o modelo não tem o
  // que julgar, e a chamada custaria o mesmo de uma análise de verdade para
  // produzir um parágrafo dizendo "isto é uma foto de RG". O sinal crítico já
  // está na lista, e o RH decide olhando o arquivo original.
  if (!extracao.documentoValido) {
    const analise: AnaliseIa = {
      ...analiseVazia(),
      modelo,
      analisadoEm: agoraIso,
      tokensEntrada,
      tokensSaida,
      extracao,
      metricas,
      sinais: sinaisCalculados,
      estrelas: 1,
      notaGeral: 0,
      recomendacao: "descartar",
      resumoUmaLinha: `O arquivo enviado não parece ser um currículo (${extracao.tipoDocumento || "tipo não identificado"}).`,
      pontosAtencao: [
        "Nenhuma nota foi atribuída: não houve currículo para avaliar. Confira o arquivo original antes de descartar a pessoa.",
      ],
      impressao:
        "A leitura não reconheceu este arquivo como currículo, então a triagem parou aqui para não gastar análise em cima de um documento que não é o que deveria ser. Vale abrir o arquivo e, se for o caso, pedir o currículo de novo — pode ter sido anexo trocado na hora do envio.",
      confianca: extracao.legibilidade,
      erro: "",
    };
    await gravarAnaliseLimpandoRoteiro(armazenamento, id, analise);
    return { ok: true, analise };
  }

  const calibragem = await calibragemDoRh();
  // O mesmo guia que vai gerar a ficha desta pessoa desce junto na triagem: sem
  // ele, a leitura do currículo pontuaria os nossos seis critérios e a ficha
  // pontuaria os dez da clínica, e o RH teria de traduzir de cabeça de uma tela
  // para a outra. Uma leitura de disco a mais por candidatura, sem chamada paga.
  const guia = await guiaParaVaga(c.vagaId, area);
  const julgada = await ia.avaliarCandidata({
    extracao,
    metricas,
    sinais: sinaisCalculados,
    area,
    tituloVaga: c.vagaTitulo || c.cargoDesejado,
    calibragem,
    guia,
  });

  if (!julgada.ok) {
    // A extração deu certo e custou token: guardar o que já foi lido evita
    // pagar de novo por ela quando o RH clicar em "tentar de novo".
    const analise = analiseComErro(
      julgada.erro,
      modelo,
      agoraIso,
      extracao,
      metricas,
      sinaisCalculados,
    );
    analise.tokensEntrada = tokensEntrada;
    analise.tokensSaida = tokensSaida;
    await gravarAnaliseLimpandoRoteiro(armazenamento, id, analise);
    return { ok: false, motivo: julgada.erro };
  }

  tokensEntrada += julgada.uso.entrada;
  tokensSaida += julgada.uso.saida;

  // Os alertas do modelo entram na mesma lista dos sinais calculados, marcados
  // com `origem: "ia"` — é a tela que mostra a diferença entre "o código provou"
  // e "quem leu achou". A chave leva o índice porque alerta de modelo não tem
  // identidade estável entre duas análises da mesma pessoa.
  const sinaisDoModelo: Sinal[] = julgada.avaliacao.alertas.map((a, indice) => ({
    chave: `ia-${indice + 1}`,
    origem: "ia",
    severidade: a.severidade,
    categoria: a.categoria,
    titulo: a.titulo,
    detalhe: a.detalhe,
    evidencias: [],
    perguntar: a.perguntar,
    contaNaNota: true,
  }));

  const criterios = julgada.avaliacao.criterios;
  const rubrica = rubricaPara(area);

  const analise: AnaliseIa = {
    ...analiseVazia(),
    modelo,
    analisadoEm: agoraIso,
    tokensEntrada,
    tokensSaida,

    extracao,
    metricas,
    sinais: ordenarSinais([...sinaisCalculados, ...sinaisDoModelo]),

    // Estrela e recomendação NÃO vêm do modelo — ver src/lib/rh/ia/veredito.ts.
    // Medindo o acervo real, a estrela do modelo cruzava com a nota calculada
    // (4 estrelas ia de 63 a 90, 3 estrelas de 36 a 68), então a tela podia
    // mostrar duas coisas que se contradiziam. Aqui as três viram a mesma
    // função dos seis critérios. `comVeredito` aplica a régua no fim.
    estrelas: julgada.avaliacao.estrelas,
    // A nota geral é RECALCULADA em código a partir das notas dos critérios e
    // dos pesos da rubrica. O modelo dá as notas de 0 a 10 (que é julgamento) e
    // o código faz a média ponderada (que é conta) — assim o RH consegue apontar
    // para o número e reproduzir de onde ele veio. Só cai para o valor do modelo
    // quando não veio critério nenhum, o que na prática nunca acontece.
    // O TETO POR ROTATIVIDADE entra DEPOIS da média ponderada, e por cima dela:
    // é a única coisa no cálculo que o modelo não pode contornar dando nota alta
    // nos outros cinco critérios. Ver `tetoPorRotatividade`.
    notaGeral: comTeto(
      criterios.length > 0 ? notaPonderada(criterios, rubrica.pesos) : julgada.avaliacao.notaGeral,
      metricas,
    ),
    recomendacao: julgada.avaliacao.recomendacao,
    resumoUmaLinha: julgada.avaliacao.resumoUmaLinha,
    criterios,

    pontosFortes: julgada.avaliacao.pontosFortes,
    pontosAtencao: julgada.avaliacao.pontosAtencao,
    impressao: julgada.avaliacao.impressao,
    perguntasEntrevista: julgada.avaliacao.perguntasEntrevista,
    confianca: julgada.avaliacao.confianca,

    erro: "",
  };

  const comRegua = comVeredito(analise);

  await gravarAnaliseLimpandoRoteiro(armazenamento, id, comRegua);
  await preencherComExtracao(id, extracao, metricas);
  return { ok: true, analise: comRegua };
}

/* -------------------------------------------------------------------------- */
/* Análise em lote                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Analisa uma lista de candidaturas com no máximo três chamadas simultâneas.
 *
 * Três é o número que respeita o limite de taxa da conta sem deixar o RH
 * esperando: com uma só, uma pasta de 300 currículos leva a tarde inteira; com
 * dez, a API começa a devolver 429 e a repetição exponencial acaba mais lenta do
 * que a fila menor.
 */
export async function analisarVarias(
  ids: string[],
  aoProgredir?: (feitos: number, total: number) => void,
  /** Ver a trava em `analisarCandidatura`. Sem botão em lugar nenhum. */
  opcoes: { refazerLeituraBoa?: boolean } = {},
): Promise<{ feitos: number; falhas: { id: string; motivo: string }[] }> {
  const total = ids.length;
  const falhas: { id: string; motivo: string }[] = [];
  let proximo = 0;
  let feitos = 0;

  async function trabalhador(): Promise<void> {
    for (;;) {
      const indice = proximo;
      proximo += 1;
      if (indice >= total) return;

      const id = ids[indice];
      if (id === undefined) continue;

      // Nenhuma exceção pode escapar daqui: um trabalhador que morre deixaria a
      // importação parada pela metade, sem dizer em qual currículo parou.
      try {
        const resultado = await analisarCandidatura(id, opcoes);
        if (!resultado.ok) falhas.push({ id, motivo: resultado.motivo });
      } catch (erro) {
        falhas.push({ id, motivo: erro instanceof Error ? erro.message : "Falha inesperada." });
      }

      feitos += 1;
      if (aoProgredir) aoProgredir(feitos, total);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCORRENCIA, Math.max(1, total)) }, () => trabalhador()),
  );

  return { feitos, falhas };
}

/* -------------------------------------------------------------------------- */
/* Calibragem — o gosto desta clínica                                         */
/* -------------------------------------------------------------------------- */

/** Quantos exemplos de cada lado entram no prompt. Mais que isso vira ruído. */
const MAX_EXEMPLOS = 8;

const ETIQUETA_FAVORITO = "favorito";
const ETIQUETA_RECUSADO = "recusad";

function linhaDeCalibragem(c: Candidatura): string {
  const cargo =
    c.analise?.metricas.ultimoEmprego?.cargo ||
    c.cargoDesejado ||
    c.vagaTitulo ||
    "cargo não informado";
  const empresa = c.analise?.metricas.ultimoEmprego?.empresa ?? "";
  const tempo = emAnosMeses(c.analise?.metricas.mesesUltimoEmprego ?? null);
  const odonto = c.analise ? emAnosMeses(c.analise.metricas.mesesEmOdontologia) : "não informado";
  return `- ${cargo}${empresa ? ` na ${empresa}` : ""} | último emprego: ${tempo} | em odontologia: ${odonto}`;
}

/**
 * Resume o que ESTE RH já aprovou e já recusou.
 *
 * É o que faz a IA aprender o gosto desta clínica em vez de aplicar critério de
 * manual de recrutamento. Se a JP chamou três recepcionistas vindas do varejo
 * com dois anos de casa e recusou duas com currículo bonito e seis meses em cada
 * emprego, isso diz mais sobre a próxima contratação do que qualquer rubrica.
 *
 * Devolve "" quando ainda não há histórico — e aí o prompt simplesmente não
 * traz o bloco, em vez de trazer um bloco vazio que o modelo tentaria
 * interpretar.
 */
export async function calibragemDoRh(): Promise<string> {
  const { listarTodas } = await import("./armazenamento");
  const todas = await listarTodas();

  const temEtiqueta = (c: Candidatura, alvo: string): boolean =>
    c.etiquetas.some((e) => semAcento(e).includes(alvo));

  const aprovadas = todas.filter(
    (c) =>
      temEtiqueta(c, ETIQUETA_FAVORITO) ||
      c.status === "contratado" ||
      c.status === "entrevista" ||
      c.status === "proposta",
  );
  const recusadas = todas.filter(
    (c) => c.status === "reprovado" || temEtiqueta(c, ETIQUETA_RECUSADO),
  );

  if (aprovadas.length === 0 && recusadas.length === 0) return "";

  const blocos: string[] = [];
  if (aprovadas.length > 0) {
    blocos.push(
      `APROVADAS OU CHAMADAS PARA ENTREVISTA (${aprovadas.length} no total, mostrando ${Math.min(aprovadas.length, MAX_EXEMPLOS)}):\n${aprovadas
        .slice(0, MAX_EXEMPLOS)
        .map(linhaDeCalibragem)
        .join("\n")}`,
    );
  }
  if (recusadas.length > 0) {
    blocos.push(
      `RECUSADAS (${recusadas.length} no total, mostrando ${Math.min(recusadas.length, MAX_EXEMPLOS)}):\n${recusadas
        .slice(0, MAX_EXEMPLOS)
        .map(linhaDeCalibragem)
        .join("\n")}`,
    );
  }
  blocos.push(
    "Use isto como CALIBRAGEM do gosto desta clínica, não como regra: são poucos casos, e o currículo que você está lendo pode ser diferente de todos eles.",
  );

  return blocos.join("\n\n");
}

/* -------------------------------------------------------------------------- */
/* Ranking                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Monta a fila de entrevistas de uma área (ou de uma vaga) e grava o resultado.
 *
 * Só entram candidaturas já analisadas e não arquivadas: ranquear quem não tem
 * análise obrigaria o modelo a comparar uma linha vazia com um dossiê completo,
 * e ele resolveria isso colocando a linha vazia por último — o que parece
 * julgamento e é só ausência de dado.
 */
export async function montarRanking(entrada: {
  area: AreaVaga | "";
  vagaId: string;
}): Promise<{ ok: true; ranking: RankingSalvo } | { ok: false; motivo: string }> {
  const armazenamento = await import("./armazenamento");
  const ia = await import("./openai");

  const estado = ia.iaConfigurada();
  if (!estado.ok) return { ok: false, motivo: estado.motivo };

  const todas = await armazenamento.listarTodas();
  const elegiveis = todas.filter((c) => {
    if (c.arquivada) return false;
    if (c.analise === null || c.analise.erro !== "") return false;
    if (entrada.vagaId.length > 0) return c.vagaId === entrada.vagaId;
    if (entrada.area.length > 0) return c.area === entrada.area;
    return true;
  });

  if (elegiveis.length === 0) {
    return {
      ok: false,
      motivo:
        "Nenhuma candidatura analisada nesta seleção. Rode a análise por IA antes de gerar a fila de entrevistas.",
    };
  }

  const vaga = entrada.vagaId.length > 0 ? await armazenamento.lerVaga(entrada.vagaId) : null;
  // `entrada.area` pode ser "" ("todas as áreas"), e `""` não é uma `AreaVaga`:
  // aí a rubrica genérica é a certa, porque não há uma vaga específica para
  // julgar aderência contra.
  const areaEscolhida: AreaVaga = entrada.area === "" ? "outro" : entrada.area;
  const area: AreaVaga = vaga === null ? areaEscolhida : vaga.area;
  const tituloVaga = vaga?.titulo ?? "";

  const resultado = await ia.ranquear({
    area,
    tituloVaga,
    resumos: elegiveis.map((c) => {
      const a = c.analise;
      return {
        id: c.id,
        nome: c.nome || a?.extracao.nome || "",
        estrelas: a?.estrelas ?? 0,
        notaGeral: a?.notaGeral ?? 0,
        recomendacao: a?.recomendacao ?? "talvez",
        resumoUmaLinha: a?.resumoUmaLinha ?? "",
        mesesUltimoEmprego: a?.metricas.mesesUltimoEmprego ?? null,
        mediaMesesPorEmprego: a?.metricas.mediaMesesPorEmprego ?? null,
        mesesEmOdontologia: a?.metricas.mesesEmOdontologia ?? 0,
        mesesAtendimentoPublico: a?.metricas.mesesAtendimentoPublico ?? 0,
        mesesAdministrativo: a?.metricas.mesesAdministrativo ?? 0,
        totalEmpregos: a?.metricas.totalEmpregos ?? 0,
        pontosFortes: a?.pontosFortes ?? [],
        alertasGraves: (a?.sinais ?? [])
          .filter((s) => s.severidade === "critico" || s.severidade === "alto")
          .map((s) => s.titulo),
      };
    }),
  });

  if (!resultado.ok) return { ok: false, motivo: resultado.erro };

  const chave =
    entrada.vagaId.length > 0
      ? `vaga-${entrada.vagaId}`
      : entrada.area.length > 0
        ? entrada.area
        : "geral";

  const ranking: RankingSalvo = {
    ...resultado.ranking,
    chave: armazenamento.chaveRankingSegura(chave),
    area: entrada.area,
    tituloVaga,
    geradoEm: new Date().toISOString(),
    modelo: ia.modeloAtual(),
    total: elegiveis.length,
    tokensEntrada: resultado.uso.entrada,
    tokensSaida: resultado.uso.saida,
  };

  await armazenamento.salvarRanking(ranking.chave, ranking);
  return { ok: true, ranking };
}

/* -------------------------------------------------------------------------- */
/* Ficha de entrevista — o guia da clínica aplicado a uma candidata           */
/* -------------------------------------------------------------------------- */

export type ResultadoFichaEntrevista =
  { ok: true; ficha: FichaEntrevista } | { ok: false; motivo: string };

/**
 * Qual guia conduz a entrevista desta candidatura.
 *
 * A ordem de busca é do mais específico para o mais geral: um guia amarrado
 * àquela vaga manda; depois o guia padrão da área; depois qualquer guia da
 * área; depois o padrão geral. Só se a pasta de guias tiver sido esvaziada é
 * que caímos na semente escrita neste repositório — e mesmo aí a clínica
 * continua sendo entrevistada pelo método dela, e não por um método nosso.
 * Nunca devolve `null`: uma ficha sem guia não é ficha, é formulário em branco.
 */
export async function guiaParaVaga(vagaId: string, area: AreaVaga): Promise<GuiaEntrevista> {
  const { listarGuias } = await import("./armazenamento");
  const guias = await listarGuias();

  // A regra de escolha mora em `guia.ts`, pura, porque a tela precisa chegar ao
  // MESMO guia: é ele que a gaveta usa para ler, pontuar e imprimir a ficha que
  // o modelo escreveu aqui.
  const escolhido = escolherGuia(guias, vagaId, area);
  if (escolhido !== null) return escolhido;

  // `id` fica vazio: não existe arquivo por trás deste guia, e gravar um id
  // inventado na ficha faria a tela buscar um guia que ninguém consegue abrir.
  return guiaSementeRecepcao();
}

/**
 * Calibragem de ESTILO da ficha: o que esta clínica já escreveu à mão.
 *
 * Enquanto ninguém preencheu nenhuma ficha no sistema, a referência são as oito
 * do PDF — que já são da casa, escritas pela Dra. Ana Beatriz e pelo Jefferson.
 * Assim que a clínica começa a usar o sistema de verdade, as fichas com decisão
 * ou com nota passam a valer mais como referência: elas mostram o que a JP
 * escreve HOJE, sobre as candidatas de hoje.
 *
 * Uma linha por ficha, no formato "nome | ponto forte | o que validar |
 * decisão". É pouco de propósito: o que o modelo precisa aprender daqui é tom e
 * corte, não conteúdo — e conteúdo demais no prompt vira exatamente a tentação
 * de copiar a dúvida de outra pessoa.
 */
export async function exemplosDeFicha(): Promise<string> {
  const { listarTodas } = await import("./armazenamento");
  const todas = await listarTodas();

  const preenchidas = todas
    .filter((c): c is Candidatura & { ficha: FichaEntrevista } => {
      const f = c.ficha;
      // "Preenchida" aqui é o mínimo que prova julgamento humano: uma decisão
      // registrada, ou ao menos uma nota dada na mesa. Ficha gerada e nunca
      // aberta ensinaria o modelo a imitar ele mesmo.
      return f !== null && (f.decisao.length > 0 || f.notas.some((n) => n.nota !== null));
    })
    .sort((a, b) => b.ficha.atualizadaEm.localeCompare(a.ficha.atualizadaEm))
    .slice(0, MAX_EXEMPLOS);

  if (preenchidas.length === 0) return exemplosDaClinica();

  return [
    `FICHAS QUE ESTA CLINICA JA PREENCHEU (${preenchidas.length}), no formato nome | ponto forte | o que validar | decisao:`,
    ...preenchidas.map((c) => linhaDeExemplo(c.nome || c.analise?.extracao.nome || "", c.ficha)),
  ].join("\n");
}

/**
 * Gera (ou regenera) a parte da IA da ficha de entrevista.
 *
 * REGRA CENTRAL DESTA FUNÇÃO: regenerar a parte da IA nunca pode apagar o que o
 * entrevistador anotou. A mesclagem acontece dentro de
 * `atualizarCandidaturaNoDisco`, sobre o retrato que está NO DISCO no instante
 * da gravação — e não sobre o retrato que lemos um minuto antes de chamar o
 * modelo. Sem isso, uma ficha respondida durante a entrevista enquanto alguém
 * clicava em "gerar de novo" na sala ao lado perderia as respostas.
 *
 * As respostas do entrevistador guardam a pergunta que responderam (ver
 * `RespostaItemTriagem`), então trocar as quatro perguntas não desalinha nada:
 * o que foi respondido continua ligado ao que foi perguntado.
 */
export async function gerarFicha(
  idCandidatura: string,
  opcoes: { forcar?: boolean },
): Promise<ResultadoFichaEntrevista> {
  const armazenamento = await import("./armazenamento");
  const inicial = await armazenamento.lerCandidatura(idCandidatura);
  if (inicial === null) return { ok: false, motivo: "Candidatura não encontrada." };

  const forcar = opcoes.forcar === true;
  const jaFeita = inicial.ficha;
  // Mesma economia de `analisarCandidatura`: refazer o que já saiu na versão
  // atual do prompt gastaria token para chegar ao mesmo texto.
  if (
    !forcar &&
    jaFeita !== null &&
    jaFeita.geradaEm.length > 0 &&
    jaFeita.erro === "" &&
    jaFeita.versao === VERSAO_FICHA
  ) {
    return { ok: true, ficha: jaFeita };
  }

  const ia = await import("./openai");
  const estado = ia.iaConfigurada();
  if (!estado.ok) return { ok: false, motivo: estado.motivo };

  // A ficha se apoia na análise: é dela que vêm extração, métricas e sinais. Sem
  // análise, roda a análise antes — o RH que abriu a gaveta de uma candidatura
  // importada e clicou em "preparar entrevista" não deveria precisar saber que
  // existem duas etapas.
  let candidatura = inicial;
  if (candidatura.analise === null || candidatura.analise.erro !== "") {
    const analisada = await analisarCandidatura(idCandidatura, {});
    if (!analisada.ok) return { ok: false, motivo: analisada.motivo };
    const relida = await armazenamento.lerCandidatura(idCandidatura);
    if (relida === null) return { ok: false, motivo: "Candidatura não encontrada." };
    candidatura = relida;
  }

  const analise = candidatura.analise;
  if (analise === null) {
    return {
      ok: false,
      motivo: "A candidatura ainda não tem análise da IA, e não foi possível gerá-la agora.",
    };
  }
  if (!analise.extracao.documentoValido && candidatura.curriculo !== null) {
    // Ficha de entrevista sobre um arquivo que não é currículo seria quatro
    // perguntas inventadas: não há trajetória para citar, e o guia proíbe
    // pergunta genérica. O sinal crítico da triagem já explica o caso.
    return {
      ok: false,
      motivo:
        "O arquivo desta candidatura não foi reconhecido como currículo, então não há trajetória para montar a ficha. Confira o documento original.",
    };
  }

  const guia = await guiaParaVaga(candidatura.vagaId, areaDaCandidatura(candidatura));
  const exemplos = await exemplosDeFicha();
  const modelo = ia.modeloAtual();
  const agoraIso = new Date().toISOString();

  const gerada = await ia.gerarFichaEntrevista({
    extracao: analise.extracao,
    metricas: analise.metricas,
    sinais: analise.sinais,
    analise,
    guia,
    tituloVaga: candidatura.vagaTitulo || candidatura.cargoDesejado,
    exemplos,
  });

  if (!gerada.ok) {
    // A falha fica gravada DENTRO da ficha, preservando o lado humano: a tela
    // consegue dizer "a geração falhou, tente de novo" sem perder as anotações
    // de quem já entrevistou com uma versão anterior desta mesma ficha.
    await armazenamento.atualizarCandidaturaNoDisco(idCandidatura, (atual) => {
      const base = atual.ficha ?? fichaVazia();
      return {
        ...atual,
        ficha: {
          ...base,
          guiaId: guia.id,
          guiaTitulo: guia.titulo,
          modelo,
          erro: gerada.erro,
        },
      };
    });
    return { ok: false, motivo: gerada.erro };
  }

  const parteDaIa = {
    versao: VERSAO_FICHA,
    guiaId: guia.id,
    guiaTitulo: guia.titulo,
    pontoForte: gerada.ficha.pontoForte,
    oQueValidar: gerada.ficha.oQueValidar,
    triagem: gerada.ficha.triagem,
    perguntasEspecificas: gerada.ficha.perguntasEspecificas,
    notasSugeridas: gerada.ficha.notasSugeridas,
    geradaEm: agoraIso,
    modelo,
    tokensEntrada: gerada.uso.entrada,
    tokensSaida: gerada.uso.saida,
    erro: "",
  };

  const item = await armazenamento.atualizarCandidaturaNoDisco(idCandidatura, (atual) => {
    // `base` é o que está no disco AGORA, não o que lemos antes da chamada ao
    // modelo. Tudo que é do entrevistador (respostas, notas, decisão, impressão
    // e os quatro resumos) sobrevive por vir do spread; só os campos da IA são
    // sobrescritos, um a um, logo abaixo.
    const base = atual.ficha ?? fichaVazia();
    return { ...atual, ficha: { ...base, ...parteDaIa } };
  });

  if (item === null || item.ficha === null) {
    return { ok: false, motivo: "Não foi possível gravar a ficha desta candidatura." };
  }
  return { ok: true, ficha: item.ficha };
}
