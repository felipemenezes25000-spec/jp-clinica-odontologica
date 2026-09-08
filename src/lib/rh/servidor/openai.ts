/**
 * Cliente da API de respostas da OpenAI — `fetch` puro, sem SDK.
 *
 * Só roda no servidor: é sempre carregado por `await import()` dentro do handler
 * de uma server function (ou do script de importação), nunca no topo de um
 * módulo que a tela importa. A chave nunca leva prefixo `VITE_` justamente para
 * o Vite não ter como colocá-la no bundle do cliente.
 *
 * A divisão de trabalho de todo o diretório `ia/` vale aqui também: o modelo
 * **lê** o documento (passe 1) e **julga** o dossiê (passe 2); quem calcula
 * tempo de casa, média, lacuna e sobreposição é `ia/metricas.ts`, e o resultado
 * desce pronto no prompt como verdade, com a instrução explícita de não
 * recalcular. Modelo de linguagem erra conta de data, e "quanto tempo ela ficou
 * no último emprego" é a pergunta que a clínica não pode errar.
 *
 * Nada aqui lança para quem chamou: toda falha vira `{ ok: false, erro }` com
 * mensagem em português. O RH não pode ver tela quebrada porque a OpenAI teve
 * um 503.
 */
import { inflateRawSync } from "node:zlib";
import { Buffer } from "node:buffer";

import type { ItemTriagem, NotaSugerida, PerguntaFicha } from "../ficha";
import {
  criteriosPontuaveisPelaIa,
  criteriosSoNaEntrevista,
  NOTA_ETICA_JP,
  type GuiaEntrevista,
} from "../guia";
import { apenasDigitos } from "../formatar";
import { emAnosMeses } from "../ia/metricas";
import { CHAVES_CRITERIO, rubricaPara, textoDasAncoras } from "../ia/rubricas";
import { extracaoVazia } from "../ia/tipos";
import type {
  AnaliseIa,
  ChaveCriterio,
  CriterioIa,
  ExtracaoCurriculo,
  MetricasPermanencia,
  RankingIa,
  RecomendacaoIa,
  SeveridadeSinal,
  Sinal,
} from "../ia/tipos";
import type { AreaVaga } from "../tipos";
import { TAMANHO_MAX_CURRICULO } from "../tipos";

const URL_RESPOSTAS = "https://api.openai.com/v1/responses";

/** Modelo padrão da conta. Trocável por `OPENAI_MODEL_RH` sem alterar código. */
const MODELO_PADRAO = "gpt-5.5";

/**
 * Currículo de clínica é PDF de duas páginas ou foto de celular; 120 segundos
 * cobrem com folga a leitura de uma imagem em `detail: "high"`. Sem o teto, uma
 * conexão pendurada travaria a fila de importação inteira.
 */
const TIMEOUT_MS = 120_000;

/** Uma tentativa mais duas repetições. Além disso, a API está fora do ar mesmo. */
const TENTATIVAS = 3;

/* -------------------------------------------------------------------------- */
/* Formatos de retorno                                                        */
/* -------------------------------------------------------------------------- */

export type Uso = { entrada: number; saida: number; total: number };

/**
 * O que o modelo julga no passe 2. É `AnaliseIa` menos tudo que o servidor
 * carimba (versão, modelo, tokens) e menos o que o código calcula (extração,
 * métricas, sinais determinísticos).
 *
 * `alertas` virou lista de objetos — no protótipo era `string[]`. A tela mostra
 * os alertas do modelo lado a lado com os sinais calculados, e sem severidade
 * eles entrariam todos no mesmo tom, o que apagaria a diferença entre "não citou
 * nenhum sistema" e "diz ser dentista sem nenhum CRO".
 */
export type AlertaIa = {
  titulo: string;
  detalhe: string;
  severidade: SeveridadeSinal;
  categoria: string;
  perguntar: string;
};

export type AvaliacaoIa = {
  estrelas: number;
  notaGeral: number;
  recomendacao: RecomendacaoIa;
  resumoUmaLinha: string;
  criterios: CriterioIa[];
  pontosFortes: string[];
  pontosAtencao: string[];
  impressao: string;
  perguntasEntrevista: { pergunta: string; porque: string }[];
  alertas: AlertaIa[];
  confianca: number;
};

export type ResultadoExtracao =
  { ok: true; extracao: ExtracaoCurriculo; uso: Uso } | { ok: false; erro: string };

export type ResultadoAvaliacao =
  { ok: true; avaliacao: AvaliacaoIa; uso: Uso } | { ok: false; erro: string };

export type ResultadoRanking =
  { ok: true; ranking: RankingIa; uso: Uso } | { ok: false; erro: string };

/** O que cada candidata leva para a comparação final entre pessoas da mesma área. */
export type ResumoParaRanking = {
  id: string;
  nome: string;
  estrelas: number;
  notaGeral: number;
  recomendacao: RecomendacaoIa;
  resumoUmaLinha: string;
  mesesUltimoEmprego: number | null;
  mediaMesesPorEmprego: number | null;
  mesesEmOdontologia: number;
  mesesAtendimentoPublico: number;
  mesesAdministrativo: number;
  totalEmpregos: number;
  pontosFortes: string[];
  alertasGraves: string[];
};

/* -------------------------------------------------------------------------- */
/* Configuração                                                               */
/* -------------------------------------------------------------------------- */

function chaveApi(): string {
  return (process.env["OPENAI_API_KEY"] ?? "").trim();
}

/**
 * Diz se dá para chamar a IA, e por que não quando não dá.
 *
 * A tela precisa da diferença entre "a clínica não configurou a chave" (que se
 * resolve na Vercel, em Settings > Environment Variables) e "a chamada falhou".
 * Sem isso o RH veria "erro na análise" e ficaria tentando de novo para sempre.
 */
export function iaConfigurada(): { ok: boolean; motivo: string } {
  const chave = chaveApi();
  if (chave.length === 0) {
    return {
      ok: false,
      motivo:
        "A triagem por IA está desligada: falta a variável de ambiente OPENAI_API_KEY. Cadastre a chave no servidor (na Vercel, em Settings > Environment Variables) e recarregue.",
    };
  }
  // Chave real tem bem mais que isso. O corte pega o caso comum de alguém colar
  // um pedaço, ou deixar um valor de exemplo — e falha aqui, na tela de estado,
  // em vez de falhar em 300 chamadas seguidas.
  if (chave.length < 20) {
    return {
      ok: false,
      motivo: "A OPENAI_API_KEY cadastrada parece incompleta. Confira o valor no servidor.",
    };
  }
  return { ok: true, motivo: "" };
}

export function modeloAtual(): string {
  const escolhido = (process.env["OPENAI_MODEL_RH"] ?? "").trim();
  return escolhido.length > 0 ? escolhido : MODELO_PADRAO;
}

/* -------------------------------------------------------------------------- */
/* Utilidades de leitura defensiva                                            */
/* -------------------------------------------------------------------------- */

function objeto(valor: unknown): Record<string, unknown> {
  if (valor === null || typeof valor !== "object" || Array.isArray(valor)) return {};
  return valor as Record<string, unknown>;
}

function txt(valor: unknown, limite: number): string {
  return typeof valor === "string" ? valor.trim().slice(0, limite) : "";
}

function textos(valor: unknown, limite: number, maximo: number): string[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .slice(0, maximo)
    .map((item) => txt(item, limite))
    .filter((item) => item.length > 0);
}

function inteiro(valor: unknown, minimo: number, maximo: number, padrao: number): number {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return padrao;
  return Math.min(maximo, Math.max(minimo, Math.round(valor)));
}

function esperar(ms: number): Promise<void> {
  return new Promise<void>((resolver) => {
    setTimeout(resolver, ms);
  });
}

/* -------------------------------------------------------------------------- */
/* Chamada HTTP                                                               */
/* -------------------------------------------------------------------------- */

type RespostaBruta = { ok: true; dados: unknown; uso: Uso } | { ok: false; erro: string };

function usoDe(bruto: unknown): Uso {
  const u = objeto(objeto(bruto)["usage"]);
  return {
    entrada: inteiro(u["input_tokens"], 0, Number.MAX_SAFE_INTEGER, 0),
    saida: inteiro(u["output_tokens"], 0, Number.MAX_SAFE_INTEGER, 0),
    total: inteiro(u["total_tokens"], 0, Number.MAX_SAFE_INTEGER, 0),
  };
}

/**
 * A resposta vem em `output[].content[]`, e o JSON que pedimos está no primeiro
 * bloco de `type: "output_text"`. Os outros blocos (raciocínio, chamadas de
 * ferramenta) não interessam aqui.
 */
function textoDaResposta(bruto: unknown): string {
  const saida = objeto(bruto)["output"];
  if (!Array.isArray(saida)) return "";
  for (const item of saida) {
    const conteudo = objeto(item)["content"];
    if (!Array.isArray(conteudo)) continue;
    for (const parte of conteudo) {
      const p = objeto(parte);
      if (p["type"] === "output_text" && typeof p["text"] === "string") return p["text"];
    }
  }
  return "";
}

/** Extrai a mensagem que a própria API mandou, sem despejar JSON cru na tela. */
function mensagemDoErro(corpo: string, status: number): string {
  let detalhe = "";
  try {
    const erro = objeto(objeto(JSON.parse(corpo))["error"]);
    detalhe = txt(erro["message"], 300);
  } catch {
    // Corpo que não é JSON (um HTML de gateway, por exemplo): fica só o status.
  }

  if (status === 401 || status === 403) {
    return `A OpenAI recusou a chave (${status}). Confira a OPENAI_API_KEY no servidor.${detalhe ? ` Detalhe: ${detalhe}` : ""}`;
  }
  if (status === 429) {
    return `A OpenAI está limitando as chamadas agora (429). Tente de novo em alguns minutos.${detalhe ? ` Detalhe: ${detalhe}` : ""}`;
  }
  if (status >= 500) {
    return `A OpenAI respondeu com erro de servidor (${status}). Tente de novo mais tarde.`;
  }
  return `A OpenAI recusou a chamada (${status}).${detalhe ? ` Detalhe: ${detalhe}` : ""}`;
}

/**
 * Uma chamada, com timeout, repetição e erro legível.
 *
 * Repete só o que costuma passar sozinho: 429 (limite de taxa), 5xx e queda de
 * conexão. Um 400 é schema errado ou arquivo que a API não aceita — repetir três
 * vezes gastaria o triplo do tempo para chegar à mesma recusa.
 */
async function chamar(corpo: Record<string, unknown>): Promise<RespostaBruta> {
  const estado = iaConfigurada();
  if (!estado.ok) return { ok: false, erro: estado.motivo };

  let ultimoErro = "Não foi possível falar com a OpenAI.";

  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa += 1) {
    // Espera exponencial entre as tentativas: 1s, depois 2s. Bater de novo na
    // mesma hora em um 429 só empurra o limite de taxa para a frente.
    if (tentativa > 1) await esperar(1000 * 2 ** (tentativa - 2));

    const controlador = new AbortController();
    const alarme = setTimeout(() => {
      controlador.abort();
    }, TIMEOUT_MS);

    try {
      const resposta = await fetch(URL_RESPOSTAS, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${chaveApi()}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(corpo),
        signal: controlador.signal,
      });

      const bruto = await resposta.text();

      if (!resposta.ok) {
        const mensagem = mensagemDoErro(bruto, resposta.status);
        if (resposta.status === 429 || resposta.status >= 500) {
          ultimoErro = mensagem;
          continue;
        }
        return { ok: false, erro: mensagem };
      }

      let json: unknown;
      try {
        json = JSON.parse(bruto);
      } catch {
        ultimoErro = "A OpenAI devolveu uma resposta que não é JSON.";
        continue;
      }

      const conteudo = textoDaResposta(json);
      if (conteudo.length === 0) {
        // Acontece quando o modelo para por limite de saída: a resposta chega
        // 200, mas sem o bloco de texto. Repetir costuma resolver.
        ultimoErro = "A OpenAI respondeu sem conteúdo. A leitura pode ter sido interrompida.";
        continue;
      }

      let dados: unknown;
      try {
        dados = JSON.parse(conteudo);
      } catch {
        ultimoErro = "A OpenAI devolveu um JSON inválido no conteúdo da resposta.";
        continue;
      }

      return { ok: true, dados, uso: usoDe(json) };
    } catch (erro) {
      // `abort` chega aqui como DOMException/AbortError; queda de rede também.
      const nome = erro instanceof Error ? erro.name : "";
      ultimoErro =
        nome === "AbortError" || nome === "TimeoutError"
          ? `A OpenAI não respondeu em ${Math.round(TIMEOUT_MS / 1000)} segundos.`
          : "Falha de conexão com a OpenAI. Verifique a internet do servidor.";
    } finally {
      clearTimeout(alarme);
    }
  }

  return { ok: false, erro: ultimoErro };
}

/* -------------------------------------------------------------------------- */
/* Passe 1 — extração                                                          */
/* -------------------------------------------------------------------------- */

const ESQUEMA_EXTRACAO = {
  type: "object",
  additionalProperties: false,
  required: [
    "documentoValido",
    "tipoDocumento",
    "legibilidade",
    "nome",
    "nascimento",
    "idadeDeclarada",
    "bairro",
    "cep",
    "cidade",
    "uf",
    "telefone",
    "email",
    "linkedin",
    "resumoObjetivo",
    "formacoes",
    "empregos",
    "cursos",
    "idiomas",
    "softwares",
    "competencias",
    "especialidades",
    "registroProfissional",
    "pretensaoDeclarada",
    "dadosSensiveisPresentes",
    "observacoesDoLeitor",
  ],
  properties: {
    documentoValido: {
      type: "boolean",
      description: "true so se o arquivo for realmente o curriculo de uma pessoa",
    },
    tipoDocumento: {
      type: "string",
      description: "curriculo | carta | guia | foto-avulsa | documento | outro",
    },
    legibilidade: { type: "integer", description: "0 a 100: quanto deu para ler com seguranca" },
    nome: { type: "string" },
    nascimento: { type: "string", description: "AAAA-MM-DD, ou AAAA-MM, ou AAAA, ou vazio" },
    idadeDeclarada: { type: ["integer", "null"] },
    // Bairro e CEP existem por causa do calculo de proximidade da clinica
    // (ver lib/rh/ia/proximidade.ts). O modelo so COPIA o que esta escrito:
    // quem decide se e perto ou longe e codigo deterministico, porque pedir
    // distancia a um modelo devolve quilometro inventado com cara de exato.
    bairro: {
      type: "string",
      description: "bairro do endereco residencial, exatamente como escrito, ou vazio",
    },
    cep: { type: "string", description: "CEP so com digitos (8), ou vazio" },
    cidade: { type: "string" },
    uf: { type: "string", description: "sigla de duas letras, ou vazio" },
    telefone: { type: "string" },
    email: { type: "string" },
    linkedin: { type: "string" },
    resumoObjetivo: {
      type: "string",
      description: "o objetivo que a pessoa escreveu, verbatim e curto",
    },
    formacoes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["curso", "instituicao", "nivel", "conclusao", "emAndamento"],
        properties: {
          curso: { type: "string" },
          instituicao: { type: "string" },
          nivel: { type: "string", description: "medio | tecnico | superior | pos | outro" },
          conclusao: { type: "string", description: "AAAA-MM ou AAAA ou vazio" },
          emAndamento: { type: "boolean" },
        },
      },
    },
    empregos: {
      type: "array",
      description: "Na ordem em que aparecem no documento. NAO invente datas.",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "empresa",
          "cargo",
          "inicio",
          "fim",
          "atual",
          "duracaoMesesDeclarada",
          "descricao",
          "setor",
          "atendimentoPublico",
          "administrativo",
          "odontologico",
          "saude",
        ],
        properties: {
          empresa: { type: "string" },
          cargo: { type: "string" },
          inicio: {
            type: "string",
            description: "AAAA-MM, ou AAAA, ou vazio se o documento nao informa",
          },
          fim: {
            type: "string",
            description: "AAAA-MM, ou AAAA, ou vazio se atual ou nao informado",
          },
          duracaoMesesDeclarada: {
            type: ["integer", "null"],
            description:
              "So quando o curriculo informa a DURACAO em vez das datas: '2 anos' = 24, '6 meses' = 6, '1 ano e meio' = 18. null quando ha datas ou quando nao diz nada.",
          },
          atual: { type: "boolean" },
          descricao: { type: "string", description: "as atividades, resumidas em uma linha" },
          setor: {
            type: "string",
            description:
              "odontologia | saude | varejo | alimentacao | servicos | industria | educacao | financeiro | telemarketing | beleza | limpeza | outro",
          },
          atendimentoPublico: { type: "boolean" },
          administrativo: { type: "boolean" },
          odontologico: { type: "boolean" },
          saude: { type: "boolean" },
        },
      },
    },
    cursos: { type: "array", items: { type: "string" } },
    idiomas: { type: "array", items: { type: "string" } },
    softwares: {
      type: "array",
      items: { type: "string" },
      description: "Sistemas, prontuarios, ERPs e planilhas citados. Nada de suposicao.",
    },
    competencias: {
      type: "array",
      items: { type: "string" },
      description:
        "o que a pessoa sabe FAZER, em expressoes curtas do documento: atendimento ao publico, agendamento, faturamento de convenio, esterilizacao. Nunca inventar.",
    },
    especialidades: {
      type: "array",
      items: { type: "string" },
      description: "especialidades odontologicas escritas no documento, ou lista vazia",
    },
    registroProfissional: {
      type: "string",
      description:
        "Registro em conselho como aparece no documento: 'CRO-SP 12345', 'CRO/SP 12345 ASB', 'COREN...'. Vazio se o curriculo nao traz nenhum numero.",
    },
    pretensaoDeclarada: {
      type: "string",
      description: "Pretensao salarial escrita pela pessoa, verbatim. Vazio se nao houver.",
    },
    dadosSensiveisPresentes: {
      type: "array",
      items: { type: "string" },
      description:
        "APENAS a lista de CATEGORIAS encontradas no documento: 'estado civil', 'filhos', 'foto', 'religiao', 'idade', 'genero', 'origem', 'deficiencia', 'cpf', 'rg'. Nunca o valor.",
    },
    observacoesDoLeitor: {
      type: "array",
      items: { type: "string" },
      description:
        "Problemas do documento: sem datas, datas contraditorias, pagina cortada, ilegivel.",
    },
  },
};

const INSTRUCOES_EXTRACAO = `Voce le curriculos para a JP Clinica Integrada Odontologica, uma clinica de bairro na Vila Bruna, em Sao Paulo.
Sua unica tarefa nesta etapa e EXTRAIR o que esta escrito. Nao julgue, nao interprete, nao elogie, nao resuma opiniao.

Regras que nao podem ser quebradas:
- AS DATAS DOS EMPREGOS SAO O DADO MAIS IMPORTANTE DESTE TRABALHO. Toda a decisao da clinica sobre
  permanencia sai delas. PROCURE a data de cada vinculo antes de desistir: em curriculo brasileiro ela
  aparece em muitos formatos, e quase sempre esta la em algum lugar.
    "03/2023 a 04/2024"   "mar/23 - abr/24"   "2023 - 2024"   "03.2023 ate o momento"
    "Desde janeiro de 2022"   "Jan/2020 a Dez/2021"   "01/2019 - atual"   "2021 a 2023"
  Ela pode estar ao lado do nome da empresa, embaixo do cargo, numa coluna lateral, entre parenteses,
  no fim da descricao das atividades, ou em cabecalho de secao. Leia a pagina inteira antes de deixar
  inicio e fim vazios.
- NUNCA invente uma data. Se, depois de procurar, o vinculo realmente nao tem periodo escrito, deixe
  inicio e fim vazios. Data inventada destroi o calculo de permanencia.
- MAS SE O CURRICULO DIZ A DURACAO em vez das datas ("2 anos", "6 meses", "1 ano e meio", "18 meses"),
  ponha esse numero em duracaoMesesDeclarada, convertido para meses, e deixe inicio e fim vazios. Isso
  NAO e inventar: e copiar o que esta escrito. Quando houver datas, duracaoMesesDeclarada e null.
- Datas em AAAA-MM sempre que houver mes. So o ano quando so o ano aparece. Nunca converta "2 anos" em datas.
- competencias e o que a pessoa sabe FAZER, em expressoes curtas tiradas do documento: "atendimento ao
  publico", "agendamento", "faturamento de convenio", "esterilizacao", "controle de estoque". Vem tanto
  de uma secao de habilidades quanto da descricao das atividades dos empregos. Nao repita o nome do
  cargo, nao repita softwares (esses tem lista propria) e nao invente nada que o documento nao sustente.
- especialidades so para area clinica odontologica, e so o que estiver escrito ("ortodontia",
  "endodontia"). Lista vazia para todo mundo que nao e da area.
- "atual" e true apenas quando o documento diz que a pessoa ainda trabalha la (atual, presente, ate hoje, ate o momento).
- Mantenha a ordem em que os empregos aparecem no documento, mesmo que esteja fora de ordem cronologica.
- setor / atendimentoPublico / administrativo / odontologico / saude sao classificacoes objetivas do que
  esta escrito, nao suposicoes: "recepcionista em clinica odontologica" e odontologico, atendimentoPublico
  e administrativo; "auxiliar de producao" nao e nenhum dos tres. Na duvida, marque false.
- softwares e a lista do que a pessoa NOMEOU. "Informatica basica" nao e software; "Excel" e.
- registroProfissional so e preenchido se houver numero ou sigla de conselho escrita no documento.
  Dizer "sou ASB" nao e registro. Copie como esta escrito, sem completar nem corrigir.
- Se o arquivo nao for o curriculo de uma pessoa (um guia, uma carta, uma foto solta, um formulario em
  branco, um documento pessoal), marque documentoValido false e diga em tipoDocumento o que ele e.
- observacoesDoLeitor e onde voce avisa o RH do que atrapalhou a leitura.

SOBRE dadosSensiveisPresentes — leia com atencao:
Curriculo brasileiro costuma trazer foto, estado civil, numero de filhos, idade, religiao e CPF. A clinica
NAO PODE usar nada disso para decidir. Voce apenas LISTA as CATEGORIAS que encontrou, para que o sistema
registre que aquilo estava no documento e nao foi considerado. Voce NAO copia o valor, NAO comenta, NAO
avalia e NAO deixa isso influenciar nenhum outro campo desta extracao. Se nao houver nada, devolva lista vazia.`;

function normalizarEmpregos(bruto: unknown): ExtracaoCurriculo["empregos"] {
  if (!Array.isArray(bruto)) return [];
  return bruto.slice(0, 40).map((item) => {
    const e = objeto(item);
    return {
      empresa: txt(e["empresa"], 160),
      cargo: txt(e["cargo"], 160),
      inicio: txt(e["inicio"], 10),
      fim: txt(e["fim"], 10),
      atual: e["atual"] === true,
      duracaoMesesDeclarada: (() => {
        const v = e["duracaoMesesDeclarada"];
        if (typeof v !== "number" || !Number.isFinite(v)) return null;
        // Teto de 50 anos: duração absurda é alucinação, não carreira longa.
        return v > 0 && v <= 600 ? Math.round(v) : null;
      })(),
      descricao: txt(e["descricao"], 600),
      setor: txt(e["setor"], 40),
      atendimentoPublico: e["atendimentoPublico"] === true,
      administrativo: e["administrativo"] === true,
      odontologico: e["odontologico"] === true,
      saude: e["saude"] === true,
    };
  });
}

function normalizarFormacoes(bruto: unknown): ExtracaoCurriculo["formacoes"] {
  if (!Array.isArray(bruto)) return [];
  return bruto.slice(0, 20).map((item) => {
    const f = objeto(item);
    return {
      curso: txt(f["curso"], 160),
      instituicao: txt(f["instituicao"], 160),
      nivel: txt(f["nivel"], 40),
      conclusao: txt(f["conclusao"], 10),
      emAndamento: f["emAndamento"] === true,
    };
  });
}

/**
 * O `strict: true` do json_schema já garante o formato, mas a normalização fica:
 * um dia o schema muda, e o resto do sistema (que confia em string nunca-nula e
 * em array sempre presente) não pode quebrar por causa de um campo a mais.
 */
function normalizarExtracao(bruto: unknown): ExtracaoCurriculo {
  const o = objeto(bruto);
  const idade = inteiro(o["idadeDeclarada"], 0, 120, 0);
  return {
    ...extracaoVazia(),
    documentoValido: o["documentoValido"] === true,
    tipoDocumento: txt(o["tipoDocumento"], 40),
    legibilidade: inteiro(o["legibilidade"], 0, 100, 0),

    nome: txt(o["nome"], 120),
    nascimento: txt(o["nascimento"], 10),
    idadeDeclarada: idade > 0 ? idade : null,
    bairro: txt(o["bairro"], 120),
    cep: apenasDigitos(txt(o["cep"], 20)).slice(0, 8),
    cidade: txt(o["cidade"], 120),
    uf: txt(o["uf"], 2).toUpperCase(),
    telefone: txt(o["telefone"], 40),
    email: txt(o["email"], 254),
    linkedin: txt(o["linkedin"], 200),
    resumoObjetivo: txt(o["resumoObjetivo"], 600),

    formacoes: normalizarFormacoes(o["formacoes"]),
    empregos: normalizarEmpregos(o["empregos"]),
    cursos: textos(o["cursos"], 160, 40),
    idiomas: textos(o["idiomas"], 80, 12),
    competencias: textos(o["competencias"], 80, 16),
    especialidades: textos(o["especialidades"], 60, 10),
    softwares: textos(o["softwares"], 80, 30),

    registroProfissional: txt(o["registroProfissional"], 60),
    pretensaoDeclarada: txt(o["pretensaoDeclarada"], 60),

    dadosSensiveisPresentes: textos(o["dadosSensiveisPresentes"], 40, 15),
    observacoesDoLeitor: textos(o["observacoesDoLeitor"], 300, 12),
  };
}

/** Extensão em minúsculas, sem o ponto. "" quando o nome não tem extensão. */
function extensaoDe(nome: string): string {
  const corte = nome.lastIndexOf(".");
  return corte > 0 ? nome.slice(corte + 1).toLowerCase() : "";
}

type ParteDeEntrada = Record<string, unknown>;

/**
 * Texto de um .docx, sem dependência nenhuma.
 *
 * POR QUE ISTO EXISTE
 * A API não aceita .docx como arquivo de entrada, e o código simplesmente
 * recusava: "salve como PDF e importe de novo". Só que quem manda o currículo é
 * a candidata, não o RH — pedir para ela reenviar significa, na prática, perder
 * a candidatura. Dois currículos reais do acervo estavam parados por isso.
 *
 * COMO FUNCIONA
 * .docx é um ZIP. O texto vive em `word/document.xml`. Aqui o ZIP é lido na
 * mão: acha o fim do diretório central (EOCD), percorre as entradas, localiza
 * o documento e descomprime com o `zlib` que o Node já traz. Depois as tags
 * viram texto, com `</w:p>` virando quebra de linha para os parágrafos não
 * colarem uns nos outros.
 *
 * O .doc ANTIGO (binário do Word 97) continua de fora: não é ZIP, é um formato
 * OLE de 1997 cuja leitura exigiria um parser inteiro para um punhado de
 * arquivos. Para ele a mensagem de "salve como PDF" continua sendo a resposta
 * honesta.
 */
function textoDeDocx(bytes: Uint8Array): string | null {
  const b = Buffer.from(bytes);

  // O EOCD fica no fim do arquivo e tem assinatura 0x06054b50. O comentário do
  // ZIP pode empurrá-lo para trás, por isso a busca é de trás para frente.
  let eocd = -1;
  for (let i = b.length - 22; i >= 0 && i > b.length - 66000; i -= 1) {
    if (b.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;

  const entradas = b.readUInt16LE(eocd + 10);
  let ponteiro = b.readUInt32LE(eocd + 16);

  for (let n = 0; n < entradas; n += 1) {
    if (ponteiro + 46 > b.length || b.readUInt32LE(ponteiro) !== 0x02014b50) return null;

    const metodo = b.readUInt16LE(ponteiro + 10);
    const tamanhoComprimido = b.readUInt32LE(ponteiro + 20);
    const tamanhoNome = b.readUInt16LE(ponteiro + 28);
    const tamanhoExtra = b.readUInt16LE(ponteiro + 30);
    const tamanhoComentario = b.readUInt16LE(ponteiro + 32);
    const inicioLocal = b.readUInt32LE(ponteiro + 42);
    const nome = b.subarray(ponteiro + 46, ponteiro + 46 + tamanhoNome).toString("utf8");

    if (nome === "word/document.xml") {
      // O cabeçalho local repete o nome e o extra, e os tamanhos dele podem
      // diferir dos do diretório central — é o do LOCAL que diz onde os dados
      // começam.
      if (b.readUInt32LE(inicioLocal) !== 0x04034b50) return null;
      const nomeLocal = b.readUInt16LE(inicioLocal + 26);
      const extraLocal = b.readUInt16LE(inicioLocal + 28);
      const inicioDados = inicioLocal + 30 + nomeLocal + extraLocal;
      const dados = b.subarray(inicioDados, inicioDados + tamanhoComprimido);

      let xml: Buffer;
      try {
        xml = metodo === 0 ? Buffer.from(dados) : inflateRawSync(dados);
      } catch {
        return null;
      }

      const bruto = xml.toString("utf8");
      const texto = bruto
        // Parágrafo e quebra de linha viram \n ANTES de as tags sumirem, senão
        // o currículo inteiro chega ao modelo como uma linha só.
        .replace(/<\/w:p>/g, "\n")
        .replace(/<w:br\b[^>]*\/?>/g, "\n")
        .replace(/<w:tab\b[^>]*\/?>/g, "\t")
        .replace(/<[^>]+>/g, "")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      return texto.length > 0 ? texto : null;
    }

    ponteiro += 46 + tamanhoNome + tamanhoExtra + tamanhoComentario;
  }
  return null;
}

/**
 * O arquivo TEM CARA de PDF legível?
 *
 * Vale uma checagem local porque a alternativa é pagar uma chamada para a
 * OpenAI devolver "The file you uploaded is badly formatted or corrupted" — o
 * que aconteceu com um PDF de 69 bytes, sem uma única página dentro. Custa
 * dinheiro e produz um erro que não diz ao RH o que fazer.
 *
 * A checagem é deliberadamente frouxa: só recusa o que é obviamente inválido.
 * PDF estranho porém legível continua indo para o modelo, que lê melhor do que
 * qualquer heurística nossa.
 */
function pdfPareceLegivel(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 400) return false;
  const b = Buffer.from(bytes);
  if (!b.subarray(0, 5).toString("latin1").startsWith("%PDF-")) return false;
  const texto = b.toString("latin1");
  return /\/Type\s*\/Page[^s]/.test(texto) || /\/Pages\b/.test(texto);
}

/**
 * Monta o bloco de conteúdo do arquivo. PDF vai como `input_file`; foto vai como
 * `input_image` em `detail: "high"`, porque currículo fotografado de celular tem
 * letra pequena e em `low` o modelo perde justamente as datas.
 */
function conteudoDoArquivo(arquivo: {
  bytes: Uint8Array;
  nome: string;
  mime: string;
}): { ok: true; parte: ParteDeEntrada } | { ok: false; erro: string } {
  if (arquivo.bytes.byteLength === 0) {
    return { ok: false, erro: "O arquivo do currículo está vazio." };
  }
  // O teto é o mesmo do upload do site: acima disso a chamada custa caro, demora
  // e costuma ser digitalização em resolução de scanner, não currículo.
  if (arquivo.bytes.byteLength > TAMANHO_MAX_CURRICULO) {
    return {
      ok: false,
      erro: `O arquivo tem ${Math.round(arquivo.bytes.byteLength / (1024 * 1024))} MB e o limite para a leitura por IA é de 8 MB. Envie um PDF mais leve ou uma foto menor.`,
    };
  }

  const b64 = Buffer.from(arquivo.bytes).toString("base64");
  const ext = extensaoDe(arquivo.nome);
  const mime = arquivo.mime.toLowerCase();

  if (ext === "pdf" || mime === "application/pdf") {
    // Recusa local antes de gastar chamada: PDF sem página nenhuma faz a API
    // devolver "badly formatted or corrupted", que custa dinheiro e não diz ao
    // RH o que fazer.
    if (!pdfPareceLegivel(arquivo.bytes)) {
      return {
        ok: false,
        erro: "O PDF enviado está vazio ou corrompido — não tem nenhuma página legível dentro. Peça o currículo de novo, em PDF ou em foto.",
      };
    }
    return {
      ok: true,
      parte: {
        type: "input_file",
        filename: arquivo.nome || "curriculo.pdf",
        file_data: `data:application/pdf;base64,${b64}`,
      },
    };
  }

  if (ext === "png" || mime === "image/png") {
    return {
      ok: true,
      parte: { type: "input_image", image_url: `data:image/png;base64,${b64}`, detail: "high" },
    };
  }

  if (ext === "jpg" || ext === "jpeg" || mime === "image/jpeg") {
    return {
      ok: true,
      parte: { type: "input_image", image_url: `data:image/jpeg;base64,${b64}`, detail: "high" },
    };
  }

  // .docx é ZIP com XML dentro: dá para tirar o texto aqui e mandar como texto,
  // sem depender de a API aceitar o formato e sem pedir à candidata que reenvie.
  if (ext === "docx" || mime.includes("wordprocessingml")) {
    const texto = textoDeDocx(arquivo.bytes);
    if (texto !== null) {
      return {
        ok: true,
        parte: {
          type: "input_text",
          text: `CURRÍCULO (texto extraído de um arquivo .docx — sem imagens, e a diagramação original se perdeu):\n\n${texto.slice(0, 60000)}`,
        },
      };
    }
    return {
      ok: false,
      erro: "Não consegui extrair o texto deste .docx — o arquivo pode estar protegido ou corrompido. Peça o currículo em PDF ou em foto.",
    };
  }

  // O .doc antigo (binário do Word 97) não é ZIP e exigiria um parser OLE
  // inteiro para um punhado de arquivos. Aqui a mensagem em português é a
  // resposta honesta.
  if (ext === "doc") {
    return {
      ok: false,
      erro: "Arquivos .doc (Word antigo) não podem ser lidos pela IA. Salve o currículo como PDF ou .docx — ou tire uma foto dele.",
    };
  }

  return {
    ok: false,
    erro: `Formato não suportado para leitura por IA (${ext || arquivo.mime || "desconhecido"}). Use PDF, JPG ou PNG.`,
  };
}

export async function extrairCurriculo(arquivo: {
  bytes: Uint8Array;
  nome: string;
  mime: string;
}): Promise<ResultadoExtracao> {
  const conteudo = conteudoDoArquivo(arquivo);
  if (!conteudo.ok) return { ok: false, erro: conteudo.erro };

  const resposta = await chamar({
    model: modeloAtual(),
    instructions: INSTRUCOES_EXTRACAO,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "Extraia este currículo exatamente como está escrito. Não complete o que faltar.",
          },
          conteudo.parte,
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "extracao_curriculo",
        strict: true,
        schema: ESQUEMA_EXTRACAO,
      },
    },
  });

  if (!resposta.ok) return { ok: false, erro: resposta.erro };
  return { ok: true, extracao: normalizarExtracao(resposta.dados), uso: resposta.uso };
}

/* -------------------------------------------------------------------------- */
/* Passe 2 — avaliação                                                        */
/* -------------------------------------------------------------------------- */

const ESQUEMA_AVALIACAO = {
  type: "object",
  additionalProperties: false,
  required: [
    "estrelas",
    "notaGeral",
    "recomendacao",
    "resumoUmaLinha",
    "criterios",
    "pontosFortes",
    "pontosAtencao",
    "impressao",
    "perguntasEntrevista",
    "alertas",
    "confianca",
  ],
  properties: {
    estrelas: { type: "integer", description: "1 a 5" },
    notaGeral: {
      type: "integer",
      description: "0 a 100, coerente com as notas dos criterios e seus pesos",
    },
    recomendacao: {
      type: "string",
      enum: ["entrevistar-ja", "entrevistar", "talvez", "descartar"],
    },
    resumoUmaLinha: {
      type: "string",
      description: "no maximo 120 caracteres, o veredito em uma frase",
    },
    criterios: {
      type: "array",
      description:
        "Exatamente os seis criterios, nesta ordem: permanencia, aderencia, atendimento, administrativo, progressao, coerencia.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["chave", "nota", "justificativa", "evidencias"],
        properties: {
          chave: {
            type: "string",
            enum: [
              "permanencia",
              "aderencia",
              "atendimento",
              "administrativo",
              "progressao",
              "coerencia",
            ],
          },
          nota: { type: "integer", description: "0 a 10" },
          justificativa: {
            type: "string",
            description: "uma ou duas frases, citando fato do curriculo",
          },
          evidencias: {
            type: "array",
            items: { type: "string" },
            description: "trechos concretos: empresa, cargo, periodo",
          },
        },
      },
    },
    pontosFortes: { type: "array", items: { type: "string" } },
    pontosAtencao: { type: "array", items: { type: "string" } },
    impressao: {
      type: "string",
      description: "um paragrafo, tom de quem vai defender ou nao essa pessoa na reuniao",
    },
    perguntasEntrevista: {
      type: "array",
      description:
        "3 a 6 perguntas ESPECIFICAS deste curriculo. Nada de pergunta generica de entrevista.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["pergunta", "porque"],
        properties: {
          pergunta: { type: "string" },
          porque: { type: "string", description: "que duvida do curriculo essa pergunta resolve" },
        },
      },
    },
    alertas: {
      type: "array",
      description:
        "O que o RH precisa saber ANTES de ligar, e que os calculos ja recebidos nao cobrem. Nao repita um sinal que ja veio calculado.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["titulo", "detalhe", "severidade", "categoria", "perguntar"],
        properties: {
          titulo: { type: "string", description: "curto, ate 60 caracteres" },
          detalhe: { type: "string" },
          severidade: { type: "string", enum: ["critico", "alto", "medio", "baixo", "info"] },
          categoria: {
            type: "string",
            enum: ["permanencia", "coerencia", "documento", "contato", "conformidade", "aderencia"],
          },
          perguntar: {
            type: "string",
            description: "pergunta de entrevista que resolve, ou vazio quando nao vira pergunta",
          },
        },
      },
    },
    confianca: {
      type: "integer",
      description: "0 a 100: quanto voce confia nesta analise dado o que deu para ler",
    },
  },
};

const INSTRUCOES_AVALIACAO = `Voce e a pessoa mais experiente do RH da JP Clinica Integrada Odontologica, uma clinica
de bairro na Vila Bruna, em Sao Paulo, com mais de 20 anos de casa. Voce ja contratou e ja demitiu. Voce le
curriculo para decidir QUEM ENTREVISTAR PRIMEIRO, nao para escrever elogio.

COMO VOCE PENSA:
- Permanencia e o primeiro filtro, com peso maior no ULTIMO emprego. Quem trocou de emprego tres vezes em
  dois anos tende a trocar de novo, e treinar recepcao de clinica custa dois meses de agenda. Mas voce e
  justo: contrato temporario, empresa que fechou, primeiro emprego, mudanca de cidade e idade jovem explicam
  rotatividade. Diga qual e a hipotese quando der para saber, e transforme em pergunta quando nao der.
- Voce desconfia de curriculo bonito e vazio, e valoriza curriculo feio com a experiencia certa.
- Voce NUNCA inventa. Se o curriculo nao traz data, voce diz que nao traz data e transforma isso em pergunta
  de entrevista — nao em acusacao de rotatividade nem em elogio de estabilidade.
- Voce escreve como gente, em portugues do Brasil, direto, sem jargao de consultoria. Nada de "sinergia",
  "proatividade", "perfil colaborativo", "fit cultural". Fale de fatos: onde trabalhou, quanto tempo,
  fazendo o que, com qual sistema, atendendo quem.
- Discriminacao esta fora de questao: nao comente estado civil, filhos, religiao, aparencia, foto, origem,
  raca, genero, deficiencia nem estado de saude, e nao deixe nada disso pesar na nota, nem a favor nem
  contra. Idade so entra no criterio "coerencia entre idade e trajetoria", e apenas para dizer se a
  experiencia bate com o momento de vida — nunca para descartar alguem por ser jovem ou por ser mais velha.
- Se o dossie listar dados sensiveis encontrados no documento, ignore-os por completo na sua avaliacao.

OS SEIS CRITERIOS ESTAO NO DOSSIE, cada um com a sua tabela de faixas — a regua desta vaga — e, quando o
curriculo tem datas, com a faixa que os numeros dele indicam. Aquela tabela nao e enfeite: e a escala desta
clinica, e ela existe porque a mesma candidata estava tirando notas diferentes conforme quem lia.
- A FAIXA INDICADA PELOS NUMEROS E O PONTO DE PARTIDA. Voce pode sair dela em no maximo 1 ponto, e SO com
  justificativa escrita citando o curriculo. Sair mais que isso e ignorar o calculo — e o calculo esta certo.
- Escolha a FAIXA primeiro e a nota dentro da faixa depois. Comece cada justificativa dizendo a faixa que
  usou, assim: "faixa 7-8: ficou 2 anos e 4 meses na ultima clinica".
- Quando o dossie disser que o criterio NAO TEM NUMERO PARA ANCORAR porque o documento nao traz datas
  suficientes, avalie pelo texto e diga na justificativa que a nota e incerta por falta de datas. Nao invente
  ancora, nao suponha tempo de casa que o documento nao informa e nao trate ausencia de data como nota baixa.
- Quando o criterio for de julgamento (o dossie avisa quais sao), a faixa e sua: escolha pelos descritores
  escritos e cite o trecho do curriculo que sustenta a escolha.

A ARITMETICA JA ESTA FEITA — NAO RECALCULE DATAS. As metricas de permanencia e os sinais marcados como
"calculado" foram produzidos por codigo deterministico a partir das datas do proprio curriculo. OS NUMEROS
ABAIXO SAO A VERDADE. Use-os como vierem: nao recalcule, nao arredonde para outro valor, nao contradiga e
nao diga "cerca de" quando o numero exato esta escrito. Se um valor vier como nao informado, trate como
informacao ausente — nunca como zero. Sua contribuicao e a LEITURA e o JULGAMENTO, nao a conta.

SOBRE OS SINAIS JA CALCULADOS: eles ja vao ser mostrados na tela ao lado da sua analise. Nao repita nenhum
deles em "alertas". Use "alertas" so para o que voce percebeu lendo o texto e o codigo nao teria como ver.

ESTRELAS:
5 = entrevistar essa semana, perfil raro para a vaga
4 = entrevistar, perfil forte com alguma duvida
3 = talvez, depende do que aparecer na conversa
2 = so se faltar gente
1 = nao serve para esta vaga`;

function normalizarCriterios(bruto: unknown): CriterioIa[] {
  if (!Array.isArray(bruto)) return [];
  const vistas = new Set<string>();
  const criterios: CriterioIa[] = [];
  for (const item of bruto) {
    const c = objeto(item);
    const chave = txt(c["chave"], 20);
    if (!CHAVES_CRITERIO.includes(chave as ChaveCriterio) || vistas.has(chave)) continue;
    vistas.add(chave);
    criterios.push({
      chave: chave as ChaveCriterio,
      nota: inteiro(c["nota"], 0, 10, 0),
      justificativa: txt(c["justificativa"], 600),
      evidencias: textos(c["evidencias"], 200, 8),
    });
  }
  // Devolvidos na ordem canônica da rubrica, não na ordem em que o modelo
  // resolveu escrever: a tela mostra os seis lado a lado e a comparação entre
  // duas candidatas só funciona se a linha 3 for sempre "atendimento".
  return [...criterios].sort(
    (a, b) => CHAVES_CRITERIO.indexOf(a.chave) - CHAVES_CRITERIO.indexOf(b.chave),
  );
}

const SEVERIDADES_VALIDAS: SeveridadeSinal[] = ["critico", "alto", "medio", "baixo", "info"];
const RECOMENDACOES_VALIDAS: RecomendacaoIa[] = [
  "entrevistar-ja",
  "entrevistar",
  "talvez",
  "descartar",
];

function normalizarAlertas(bruto: unknown): AlertaIa[] {
  if (!Array.isArray(bruto)) return [];
  return bruto
    .slice(0, 12)
    .map((item): AlertaIa => {
      const a = objeto(item);
      const severidade = txt(a["severidade"], 10) as SeveridadeSinal;
      return {
        titulo: txt(a["titulo"], 120),
        detalhe: txt(a["detalhe"], 800),
        // Severidade desconhecida cai em "medio": nem some da tela, nem se
        // promove sozinha a crítico por causa de um typo do modelo.
        severidade: SEVERIDADES_VALIDAS.includes(severidade) ? severidade : "medio",
        categoria: txt(a["categoria"], 20) || "coerencia",
        perguntar: txt(a["perguntar"], 300),
      };
    })
    .filter((a) => a.titulo.length > 0);
}

function normalizarAvaliacao(bruto: unknown): AvaliacaoIa {
  const o = objeto(bruto);
  const recomendacao = txt(o["recomendacao"], 20) as RecomendacaoIa;
  return {
    estrelas: inteiro(o["estrelas"], 1, 5, 3),
    notaGeral: inteiro(o["notaGeral"], 0, 100, 0),
    recomendacao: RECOMENDACOES_VALIDAS.includes(recomendacao) ? recomendacao : "talvez",
    resumoUmaLinha: txt(o["resumoUmaLinha"], 200),
    criterios: normalizarCriterios(o["criterios"]),
    pontosFortes: textos(o["pontosFortes"], 300, 10),
    pontosAtencao: textos(o["pontosAtencao"], 300, 10),
    impressao: txt(o["impressao"], 2000),
    perguntasEntrevista: Array.isArray(o["perguntasEntrevista"])
      ? o["perguntasEntrevista"]
          .slice(0, 8)
          .map((item) => {
            const p = objeto(item);
            return { pergunta: txt(p["pergunta"], 300), porque: txt(p["porque"], 300) };
          })
          .filter((p) => p.pergunta.length > 0)
      : [],
    alertas: normalizarAlertas(o["alertas"]),
    confianca: inteiro(o["confianca"], 0, 100, 0),
  };
}

/** Linha da lista de vínculos, já com a duração calculada em código. */
function linhaDoVinculo(t: MetricasPermanencia["linhaDoTempo"][number]): string {
  const periodo = t.de ? `${t.de} → ${t.ate || "?"}` : "período não informado";
  const duracao = t.meses != null ? ` [${emAnosMeses(t.meses)}]` : " [duração não calculável]";
  const marcas = [
    t.odontologico ? "odonto" : "",
    t.atendimentoPublico ? "atendimento" : "",
    t.administrativo ? "administrativo" : "",
    t.setor ? `setor ${t.setor}` : "",
  ]
    .filter((m) => m.length > 0)
    .join(", ");
  return `- ${t.cargo || "cargo não informado"} — ${t.empresa || "empresa não informada"} | ${periodo}${duracao}${marcas ? ` | ${marcas}` : ""}`;
}

/**
 * O dossiê: tudo que o modelo precisa para julgar, e nada que ele precise
 * calcular. É aqui que a decisão de arquitetura vira texto — os números descem
 * prontos, com a etiqueta de "calculado em código".
 */
function montarDossie(entrada: {
  extracao: ExtracaoCurriculo;
  metricas: MetricasPermanencia;
  sinais: Sinal[];
  area: AreaVaga;
  tituloVaga: string;
  calibragem: string;
  /** O guia da clínica para esta vaga, quando existe — ver `rubricaPara`. */
  guia: GuiaEntrevista | null;
}): string {
  const { extracao: e, metricas: m, sinais } = entrada;
  const rubrica = rubricaPara(entrada.area, entrada.guia);
  const L: string[] = [];

  L.push(`VAGA: ${entrada.tituloVaga || rubrica.rotulo}`);
  L.push(`AREA: ${rubrica.rotulo}`);
  L.push(`O QUE IMPORTA NESTA VAGA:\n${rubrica.oQueImporta}`);
  L.push(
    `PESOS DOS CRITERIOS (a nota geral deve refletir isso): ${CHAVES_CRITERIO.map(
      (chave) => `${chave} ${rubrica.pesos[chave]}%`,
    ).join(", ")}`,
  );
  // A régua ancorada vem aqui, e não nas instruções fixas, porque a faixa
  // indicada depende das métricas DESTA candidata — e é justamente essa linha
  // ("pelos numeros deste curriculo, a faixa indicada e 7-8") que tira do
  // modelo a liberdade de inventar a própria escala.
  L.push(`\n${textoDasAncoras(rubrica, entrada.metricas)}`);
  if (rubrica.sinaisExtras.length) {
    L.push(`\nPROCURE TAMBEM POR:\n${rubrica.sinaisExtras.map((s) => `- ${s}`).join("\n")}`);
  }
  if (entrada.calibragem.trim().length > 0) {
    // O gosto DESTA clínica, e não critério de manual: é o que separa uma
    // triagem genérica de uma que já sabe quem o RH costuma chamar.
    L.push(`CALIBRAGEM — O QUE ESTE RH JA APROVOU E JA RECUSOU:\n${entrada.calibragem.trim()}`);
  }

  L.push("\n=== CANDIDATA ===");
  L.push(`Nome: ${e.nome || "(não identificado no documento)"}`);
  L.push(
    `Idade: ${e.idadeDeclarada ?? "não informada"} | Nascimento: ${e.nascimento || "não informado"}`,
  );
  L.push(
    `Onde mora: ${[e.bairro, e.cidade, e.uf].filter((p) => p.length > 0).join(", ") || "não informado"}`,
  );
  if (e.registroProfissional) L.push(`Registro no conselho: ${e.registroProfissional}`);
  if (e.pretensaoDeclarada) L.push(`Pretensão declarada: ${e.pretensaoDeclarada}`);
  if (e.resumoObjetivo) L.push(`Objetivo escrito por ela: ${e.resumoObjetivo}`);

  L.push("\n=== FORMACAO ===");
  L.push(
    e.formacoes.length
      ? e.formacoes
          .map((f) => {
            const cabeca = [f.nivel, f.curso, f.instituicao]
              .filter((p) => p.length > 0)
              .join(" | ");
            const cauda = f.emAndamento
              ? " (em andamento)"
              : f.conclusao
                ? ` (concluído ${f.conclusao})`
                : "";
            return `- ${cabeca}${cauda}`;
          })
          .join("\n")
      : "- nada informado",
  );
  if (e.cursos.length) L.push(`Cursos: ${e.cursos.join("; ")}`);
  if (e.softwares.length) L.push(`Sistemas citados: ${e.softwares.join("; ")}`);
  if (e.idiomas.length) L.push(`Idiomas: ${e.idiomas.join("; ")}`);

  L.push("\n=== HISTORICO PROFISSIONAL (linha do tempo calculada) ===");
  L.push(
    m.linhaDoTempo.length
      ? m.linhaDoTempo.map(linhaDoVinculo).join("\n")
      : "- nenhum emprego listado no documento",
  );
  const descricoes = e.empregos.filter((emp) => emp.descricao.length > 0);
  if (descricoes.length) {
    L.push("\nATIVIDADES DESCRITAS POR ELA:");
    L.push(
      descricoes
        .map((emp) => `- ${emp.cargo || "cargo"} em ${emp.empresa || "empresa"}: ${emp.descricao}`)
        .join("\n"),
    );
  }

  L.push("\n=== METRICAS DE PERMANENCIA (calculadas em codigo — use como verdade) ===");
  L.push(
    `Empregos listados: ${m.totalEmpregos} (com data: ${m.empregosDatados}, sem data: ${m.empregosSemData})`,
  );
  L.push(
    `Ultimo emprego: ${
      m.ultimoEmprego
        ? `${m.ultimoEmprego.cargo || "cargo não informado"} na ${m.ultimoEmprego.empresa || "empresa não informada"} — ${emAnosMeses(m.ultimoEmprego.meses)}`
        : "não identificado"
    }`,
  );
  L.push(
    `Esta empregada hoje: ${m.empregadaAtualmente === null ? "não dá para saber pelo documento" : m.empregadaAtualmente ? "sim" : "não consta vínculo em andamento"}`,
  );
  L.push(
    `Tempo medio por emprego: ${emAnosMeses(m.mediaMesesPorEmprego)} | mediana: ${emAnosMeses(m.medianaMeses)}`,
  );
  L.push(`Experiencia total somada: ${emAnosMeses(m.mesesExperienciaTotal)}`);
  L.push(
    `Em odontologia: ${emAnosMeses(m.mesesEmOdontologia)} | em saude: ${emAnosMeses(m.mesesEmSaude)}`,
  );
  L.push(`Com atendimento ao publico: ${emAnosMeses(m.mesesAtendimentoPublico)}`);
  L.push(`Com rotina administrativa: ${emAnosMeses(m.mesesAdministrativo)}`);
  L.push(
    `Empregos com menos de 1 ano: ${m.empregosCurtos}${m.proporcaoCurtos != null ? ` (${m.proporcaoCurtos}% dos datados)` : ""}`,
  );
  L.push(`Empregos iniciados nos ultimos 24 meses: ${m.inicios24Meses}`);
  L.push(
    `Lacunas de 4 meses ou mais: ${
      m.lacunas.length
        ? m.lacunas.map((l) => `${l.de} a ${l.ate} (${emAnosMeses(l.meses)})`).join("; ")
        : "nenhuma detectada"
    }`,
  );
  L.push(
    `Periodos sobrepostos: ${
      m.sobreposicoes.length
        ? m.sobreposicoes.map((s) => `${s.a} × ${s.b} (${emAnosMeses(s.meses)})`).join("; ")
        : "nenhum detectado"
    }`,
  );

  L.push("\n=== SINAIS JA CALCULADOS (nao repita, nao contradiga) ===");
  L.push(
    sinais.length
      ? sinais
          .map((s) => `- [${s.severidade}] ${s.titulo}: ${s.detalhe}`)
          .join("\n")
          .slice(0, 6000)
      : "- nenhum sinal automatico disparou",
  );

  L.push("\n=== QUALIDADE DO DOCUMENTO ===");
  L.push(
    `Documento valido: ${e.documentoValido ? "sim" : "NAO — a leitura nao reconheceu isto como curriculo"}`,
  );
  L.push(`Legibilidade: ${e.legibilidade}/100 | tipo: ${e.tipoDocumento || "não identificado"}`);
  if (e.observacoesDoLeitor.length)
    L.push(`Problemas na leitura: ${e.observacoesDoLeitor.join("; ")}`);
  if (e.dadosSensiveisPresentes.length) {
    L.push(
      `Dados sensiveis presentes no documento (IGNORE-OS por completo, estao aqui so para registro): ${e.dadosSensiveisPresentes.join(", ")}`,
    );
  }

  L.push("\nAvalie esta candidata para a vaga acima.");
  return L.join("\n");
}

export async function avaliarCandidata(entrada: {
  extracao: ExtracaoCurriculo;
  metricas: MetricasPermanencia;
  sinais: Sinal[];
  area: AreaVaga;
  tituloVaga: string;
  calibragem: string;
  guia: GuiaEntrevista | null;
}): Promise<ResultadoAvaliacao> {
  const resposta = await chamar({
    model: modeloAtual(),
    instructions: INSTRUCOES_AVALIACAO,
    input: [{ role: "user", content: [{ type: "input_text", text: montarDossie(entrada) }] }],
    text: {
      format: {
        type: "json_schema",
        name: "avaliacao_candidata",
        strict: true,
        schema: ESQUEMA_AVALIACAO,
      },
    },
  });

  if (!resposta.ok) return { ok: false, erro: resposta.erro };
  return { ok: true, avaliacao: normalizarAvaliacao(resposta.dados), uso: resposta.uso };
}

/* -------------------------------------------------------------------------- */
/* Passe 3 — ranking entre candidatas da mesma vaga                            */
/* -------------------------------------------------------------------------- */

const ESQUEMA_RANKING = {
  type: "object",
  additionalProperties: false,
  required: ["ordem", "shortlist", "observacaoGeral"],
  properties: {
    ordem: {
      type: "array",
      description: "TODAS as candidatas recebidas, da primeira a ser chamada ate a ultima.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "posicao", "porque"],
        properties: {
          id: { type: "string", description: "o id exatamente como veio na lista" },
          posicao: { type: "integer", description: "1 e quem a clinica liga primeiro" },
          porque: {
            type: "string",
            description: "uma frase dizendo o que colocou essa pessoa nesta posicao",
          },
        },
      },
    },
    shortlist: {
      type: "array",
      items: { type: "string" },
      description: "ids de quem entrevistar primeiro — no maximo 5, e menos se nao houver 5 boas",
    },
    observacaoGeral: {
      type: "string",
      description:
        "o que essa leva de curriculos tem de comum, o que falta, e o que a clinica deveria fazer",
    },
  },
};

const INSTRUCOES_RANKING = `Voce e a pessoa do RH da JP Clinica Integrada Odontologica que monta a fila de entrevistas.
Recebe as analises ja feitas de varias candidatas da MESMA vaga e responde a unica pergunta que a clinica tem:
EM QUE ORDEM LIGAR.

Regras:
- Ordene TODAS as candidatas recebidas. Ninguem fica de fora da lista, nem quem voce descartaria.
- Compare pessoas entre si, nao contra um ideal. A clinica vai contratar alguem desta lista.
- Os numeros de permanencia ja vieram calculados em codigo: use-os, nao recalcule.
- "porque" e uma frase concreta, comparando: "ficou 4 anos na mesma clinica, unica com experiencia
  odontologica de verdade" e util; "perfil alinhado" nao e.
- shortlist e quem a clinica liga esta semana: no maximo 5 nomes, e menos se nao houver 5 que valham a
  ligacao. Lista curta e honesta vale mais que lista cheia.
- observacaoGeral fala do CONJUNTO: se a leva toda e fraca em experiencia administrativa, se ninguem tem
  registro, se vale reabrir a divulgacao. E o que o dono da clinica le antes de decidir o proximo passo.
- Nao comente estado civil, filhos, foto, religiao, aparencia, origem, raca, genero ou deficiencia.`;

function normalizarRanking(bruto: unknown, idsValidos: string[]): RankingIa {
  const o = objeto(bruto);
  const permitidos = new Set(idsValidos);

  const ordem = Array.isArray(o["ordem"])
    ? o["ordem"]
        .slice(0, 200)
        .map((item) => {
          const r = objeto(item);
          return {
            id: txt(r["id"], 60),
            posicao: inteiro(r["posicao"], 1, 999, 999),
            porque: txt(r["porque"], 400),
          };
        })
        // Id inventado pelo modelo não pode entrar: a tela busca a candidatura
        // por esse id e um id fantasma viraria um card vazio no meio da fila.
        .filter((r) => permitidos.has(r.id))
    : [];

  // Reordena e renumera: a posição é do CÓDIGO, não do modelo. Ele erra a
  // sequência com facilidade (dois "3", nenhum "5") e a fila de entrevista
  // precisa ser 1, 2, 3 sem buraco.
  const vistos = new Set<string>();
  const unica = ordem
    .filter((r) => (vistos.has(r.id) ? false : (vistos.add(r.id), true)))
    .sort((a, b) => a.posicao - b.posicao)
    .map((r, indice) => ({ ...r, posicao: indice + 1 }));

  return {
    ordem: unica,
    shortlist: textos(o["shortlist"], 60, 5).filter((id) => permitidos.has(id)),
    observacaoGeral: txt(o["observacaoGeral"], 1500),
  };
}

function linhaDoResumo(r: ResumoParaRanking): string {
  const partes = [
    `id: ${r.id}`,
    `nome: ${r.nome || "(não identificada)"}`,
    `${r.estrelas} estrelas / nota ${r.notaGeral} / ${r.recomendacao}`,
    `último emprego: ${emAnosMeses(r.mesesUltimoEmprego)}`,
    `média por emprego: ${emAnosMeses(r.mediaMesesPorEmprego)}`,
    `empregos: ${r.totalEmpregos}`,
    `odontologia: ${emAnosMeses(r.mesesEmOdontologia)}`,
    `atendimento: ${emAnosMeses(r.mesesAtendimentoPublico)}`,
    `administrativo: ${emAnosMeses(r.mesesAdministrativo)}`,
  ];
  const linhas = [`- ${partes.join(" | ")}`];
  if (r.resumoUmaLinha) linhas.push(`  resumo: ${r.resumoUmaLinha}`);
  if (r.pontosFortes.length) linhas.push(`  fortes: ${r.pontosFortes.slice(0, 3).join("; ")}`);
  if (r.alertasGraves.length) linhas.push(`  atenção: ${r.alertasGraves.slice(0, 3).join("; ")}`);
  return linhas.join("\n");
}

export async function ranquear(entrada: {
  area: AreaVaga;
  tituloVaga: string;
  resumos: ResumoParaRanking[];
}): Promise<ResultadoRanking> {
  if (entrada.resumos.length === 0) {
    return { ok: false, erro: "Não há candidaturas analisadas para ranquear nesta seleção." };
  }

  const rubrica = rubricaPara(entrada.area);
  const dossie = [
    `VAGA: ${entrada.tituloVaga || rubrica.rotulo}`,
    `AREA: ${rubrica.rotulo}`,
    `O QUE IMPORTA NESTA VAGA:\n${rubrica.oQueImporta}`,
    `\n=== CANDIDATAS JA ANALISADAS (${entrada.resumos.length}) ===`,
    entrada.resumos.map(linhaDoResumo).join("\n"),
    "\nMonte a fila de entrevistas.",
  ].join("\n");

  const resposta = await chamar({
    model: modeloAtual(),
    instructions: INSTRUCOES_RANKING,
    input: [{ role: "user", content: [{ type: "input_text", text: dossie }] }],
    text: {
      format: {
        type: "json_schema",
        name: "ranking_candidatas",
        strict: true,
        schema: ESQUEMA_RANKING,
      },
    },
  });

  if (!resposta.ok) return { ok: false, erro: resposta.erro };
  return {
    ok: true,
    ranking: normalizarRanking(
      resposta.dados,
      entrada.resumos.map((r) => r.id),
    ),
    uso: resposta.uso,
  };
}

/* -------------------------------------------------------------------------- */
/* Passe 4 — ficha de entrevista no formato da clínica                        */
/* -------------------------------------------------------------------------- */

/**
 * O que o modelo escreve na ficha. É `FichaEntrevista` menos tudo que o
 * servidor carimba (guia, modelo, data, tokens) e menos tudo que pertence ao
 * entrevistador (respostas, notas, decisão, resumos).
 */
export type FichaGerada = {
  pontoForte: string;
  oQueValidar: string;
  triagem: ItemTriagem[];
  perguntasEspecificas: PerguntaFicha[];
  notasSugeridas: NotaSugerida[];
};

export type ResultadoFicha =
  { ok: true; ficha: FichaGerada; uso: Uso } | { ok: false; erro: string };

/** Quantos itens a ficha da clínica tem em cada bloco. O guia diz "exatamente 4". */
const ITENS_POR_BLOCO = 4;

/**
 * O schema muda com o guia: o `enum` de `chave` traz só os critérios que a IA
 * pode pontuar.
 *
 * É a mesma trava da instrução escrita, feita agora pelo formato: com o enum
 * restrito, o modelo não CONSEGUE devolver uma nota de "postura" — não depende
 * de ele ter lido a regra com atenção. Quando o guia não tem nenhum critério
 * pontuável (todo mundo marcado como "só na entrevista"), o enum ficaria vazio
 * e a API recusaria o schema; aí o campo vira string livre e a normalização
 * descarta tudo, que é o comportamento certo: nenhuma nota sugerida.
 */
function esquemaFicha(chavesPontuaveis: string[]): Record<string, unknown> {
  const chave =
    chavesPontuaveis.length > 0
      ? { type: "string", enum: chavesPontuaveis }
      : { type: "string", description: "nenhum criterio pode ser pontuado neste guia" };

  return {
    type: "object",
    additionalProperties: false,
    required: ["pontoForte", "oQueValidar", "triagem", "perguntasEspecificas", "notasSugeridas"],
    properties: {
      pontoForte: {
        type: "string",
        description:
          "Um paragrafo curto, 2 a 4 frases, com o que sustenta esta candidatura. Fatos do curriculo.",
      },
      oQueValidar: {
        type: "string",
        description:
          "Um paragrafo curto, 2 a 4 frases, com a duvida principal a confirmar na conversa.",
      },
      triagem: {
        type: "array",
        description:
          "EXATAMENTE 4 itens. Perguntas FECHADAS (sim/nao/parcial), eliminatorias ou quase, citando algo concreto deste curriculo.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["pergunta", "porque"],
          properties: {
            pergunta: {
              type: "string",
              description: "fechada, respondivel com sim, nao ou parcial",
            },
            porque: {
              type: "string",
              description: "o que este item elimina se a resposta vier errada",
            },
          },
        },
      },
      perguntasEspecificas: {
        type: "array",
        description:
          "EXATAMENTE 4 perguntas ABERTAS tiradas deste curriculo. Nenhuma pergunta generica de entrevista.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["pergunta", "porque"],
          properties: {
            pergunta: { type: "string" },
            porque: {
              type: "string",
              description: "que duvida do curriculo esta pergunta resolve",
            },
          },
        },
      },
      notasSugeridas: {
        type: "array",
        description:
          "Somente os criterios pontuaveis listados no dossie. Nenhuma nota para criterio 'so na entrevista'.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["chave", "nota", "evidencia"],
          properties: {
            chave,
            nota: { type: "integer", description: "0 a 5" },
            evidencia: {
              type: "string",
              description:
                "o trecho do curriculo que sustenta a nota: empresa, cargo, periodo, sistema",
            },
          },
        },
      },
    },
  };
}

/**
 * As instruções da ficha.
 *
 * É o texto mais longo do arquivo, e é assim de propósito: cada parágrafo aqui
 * corresponde a um erro concreto que a ficha não pode cometer na mesa da
 * clínica — pergunta genérica, nota inventada sobre o que não se viu, dado
 * sensível virando critério, data recalculada errada e imitação do conteúdo
 * (em vez da forma) das fichas de exemplo.
 */
const INSTRUCOES_FICHA = `Voce prepara a FICHA DE ENTREVISTA da JP Clinica Integrada Odontologica, uma clinica de bairro na Vila Bruna, em Sao Paulo.

QUEM VAI LER: a Dra. Ana Beatriz, dentista e coordenadora, e o Jefferson, gestor. Eles IMPRIMEM esta ficha e usam
na mesa, com a candidata sentada na frente. Cada linha vai ser lida em voz alta ou consultada de relance no meio da
conversa. Escreva para ser usado, nao para ser admirado: sem introducao, sem elogio, sem jargao de RH ("perfil
colaborativo", "proatividade", "fit cultural", "sinergia"). Portugues do Brasil, direto, como gente fala.

O METODO E DELES, NAO SEU. O guia que desce no dossie e o metodo de contratacao real da clinica: as perguntas
gerais, os criterios de 0 a 5 e as regras de desempate foram escritos pela propria Dra. Ana Beatriz e pelo
Jefferson. Voce nao propoe outro metodo, nao renomeia criterio, nao cria criterio novo e nao muda a estrutura da
ficha. Voce PREPARA a conversa dentro do metodo deles.

O QUE VOCE ESCREVE, E MAIS NADA:

1. PONTO FORTE - um paragrafo curto, de 2 a 4 frases, com o que sustenta esta candidatura. Fatos: onde trabalhou,
   quanto tempo, fazendo o que, com qual sistema, atendendo quem. Curriculo fraco tem ponto forte curto: diga qual
   e a unica coisa aproveitavel em vez de inventar forca que nao existe.

2. O QUE VALIDAR - um paragrafo curto, de 2 a 4 frases, com a duvida principal a confirmar na conversa. E a
   pergunta que a clinica ficaria com raiva de nao ter feito. Aponte o que o curriculo NAO prova.

3. TRIAGEM OBJETIVA - EXATAMENTE 4 itens, nem mais nem menos. Sao perguntas FECHADAS, respondiveis com sim, nao ou
   parcial, e eliminatorias ou quase: se a resposta vier errada, nao adianta seguir para as perguntas abertas.
   Disponibilidade real para o horario, deslocamento, vinculo atual em aberto, faculdade ou estagio conflitante,
   uso efetivo de um sistema, pratica real com convenio ou com caixa, capacidade de informar datas e empresas -
   e esse o tipo de coisa que entra aqui. Pergunta aberta NAO entra: "como voce se organiza" nao e item de triagem;
   "voce esta disponivel de segunda a sexta, das 8h as 18h" e.

4. PERGUNTAS DE INVESTIGACAO - EXATAMENTE 4 perguntas ABERTAS, nem mais nem menos, tiradas do curriculo desta
   pessoa.

REGRA DE OURO, VALE PARA OS DOIS BLOCOS DE PERGUNTA: toda pergunta cita algo CONCRETO do curriculo daquela pessoa -
nome de empresa, nome de sistema, ano, cargo, lacuna entre datas, motivo de saida, curso em andamento. Pergunta
generica de entrevista esta PROIBIDA: "quais sao seus pontos fracos", "onde voce se ve em cinco anos", "fale de um
desafio que voce superou", "por que devemos contratar voce" e qualquer outra que serviria identica para outra
candidata. Teste antes de escrever: se a pergunta caberia em qualquer curriculo, ela esta errada - troque por uma
que so cabe neste.
As perguntas gerais do guia ja vao ser feitas com TODAS as candidatas, do mesmo jeito, para dar comparabilidade.
NAO repita nenhuma delas: as suas quatro existem por causa DESTE curriculo, e so dele.

5. NOTAS SUGERIDAS - de 0 a 5, e SOMENTE para os criterios que o dossie listar como PONTUAVEIS. Cada nota vem com a
   evidencia que a sustenta, citando o curriculo: empresa, cargo, periodo, sistema.
   VOCE NAO VIU A PESSOA. NAO INVENTE NOTA DE POSTURA, DE COMUNICACAO, DE ORGANIZACAO NO APERTO, DE DISPONIBILIDADE
   REAL, DE ENTROSAMENTO COM A EQUIPE NEM DE PERSPECTIVA DE PERMANENCIA. Os criterios listados no dossie como "so
   na entrevista" ficam EM BRANCO na ficha impressa, de proposito, para a Dra. Ana Beatriz e o Jefferson
   preencherem na mesa depois de conversar. Sugerir nota neles seria dar aparencia de evidencia a um palpite, e a
   clinica decide contratacao com essa folha na mao. Nao pontue esses criterios e nao comente sobre eles em nenhum
   outro campo da ficha.
   Escala: 5 = evidencia forte, recente e verificavel; 4 = evidencia clara; 3 = evidencia parcial; 2 = indicio
   fraco; 1 = quase nada; 0 = o curriculo mostra o contrario do que o criterio pede. Curriculo silencioso sobre o
   criterio NAO e zero: de nota baixa e escreva na evidencia que o documento nao informa.

RESTRICAO ETICA - DURA, E VINDA DO PROPRIO GUIA DA CLINICA:
"[[NOTA_ETICA]]"
Na pratica: idade, aparencia, estado civil, maternidade, filhos, religiao, origem, raca, genero, deficiencia e
estado de saude NAO entram em campo nenhum da ficha - nem no ponto forte, nem no que validar, nem em pergunta de
triagem, nem em pergunta de investigacao, nem em evidencia de nota, nem como observacao lateral. Nao pergunte, nao
insinue e nao "leve em conta". Se o dossie listar dados sensiveis encontrados no documento, eles estao la para
registrar que existiam e foram IGNORADOS. Perguntar sobre disponibilidade de horario e legitimo; a mesma duvida
vestida de "voce tem filhos pequenos?" esta proibida e nao pode aparecer na ficha de jeito nenhum.

A ARITMETICA JA ESTA FEITA - NAO RECALCULE DATAS. As metricas de permanencia e os sinais marcados como calculados
vieram de codigo deterministico sobre as datas do proprio curriculo. OS NUMEROS DO DOSSIE SAO A VERDADE: use-os
como vierem, nao recalcule, nao arredonde para outro valor, nao contradiga e nao escreva "cerca de" onde o numero
exato esta escrito. Valor que vier como nao informado e informacao AUSENTE, nunca zero - e ausencia de data e
justamente o melhor material para um item de triagem ("consegue informar as datas exatas dos ultimos vinculos?").

SOBRE AS FICHAS DE EXEMPLO: o dossie traz fichas escritas A MAO pelos proprios entrevistadores da JP. Imite a
CONCISAO e a OBJETIVIDADE delas: o tamanho dos paragrafos, o corte seco das perguntas, o habito de citar empresa e
sistema pelo nome, a ausencia de rodeio. NUNCA imite o CONTEUDO - aquelas duvidas sao de outras pessoas, de outros
curriculos. Se a candidata deste dossie nunca trabalhou com convenio, nao pergunte sobre TISS so porque o exemplo
perguntava.`;

/** Critério do guia como o modelo precisa ver: rótulo, chave e o que observar. */
function linhaDoCriterio(c: { chave: string; rotulo: string; descricao: string }): string {
  return `- ${c.rotulo} [chave: ${c.chave}]${c.descricao ? ` — ${c.descricao}` : ""}`;
}

/**
 * O dossiê da ficha.
 *
 * Ordem deliberada: primeiro o método da clínica (é ele que manda), depois as
 * fichas escritas à mão (é delas que sai a forma), e só então a candidata. O
 * currículo vem por último porque tudo que veio antes é a régua com que ele
 * precisa ser lido.
 */
function montarDossieFicha(entrada: {
  extracao: ExtracaoCurriculo;
  metricas: MetricasPermanencia;
  sinais: Sinal[];
  analise: AnaliseIa;
  guia: GuiaEntrevista;
  tituloVaga: string;
  exemplos: string;
}): string {
  const { extracao: e, metricas: m, guia, analise } = entrada;
  const pontuaveis = criteriosPontuaveisPelaIa(guia);
  const soNaEntrevista = criteriosSoNaEntrevista(guia);
  const L: string[] = [];

  L.push("=== O GUIA DA CLINICA (o metodo, escrito por quem vai entrevistar) ===");
  L.push(`Guia: ${guia.titulo}`);
  if (guia.entrevistadores) L.push(`Entrevistadores: ${guia.entrevistadores}`);
  L.push(`Vaga: ${entrada.tituloVaga || guia.titulo}`);
  if (guia.objetivo) L.push(`Objetivo do guia: ${guia.objetivo}`);

  if (guia.perguntasGerais.length > 0) {
    L.push(
      `\nPERGUNTAS GERAIS, JA FEITAS COM TODAS AS CANDIDATAS (nao repita nenhuma):\n${guia.perguntasGerais
        .map((p, i) => `${i + 1}. ${p}`)
        .join("\n")}`,
    );
  }

  L.push(
    `\nCRITERIOS QUE VOCE PODE PONTUAR (0 a ${guia.notaMaxima}, use a chave exata):\n${
      pontuaveis.length > 0
        ? pontuaveis.map(linhaDoCriterio).join("\n")
        : "- nenhum: neste guia todos os criterios dependem da conversa, entao devolva notasSugeridas vazio"
    }`,
  );
  L.push(
    `\nCRITERIOS QUE VOCE NAO PODE PONTUAR — voce nao viu a pessoa, eles ficam em branco para a mesa:\n${
      soNaEntrevista.length > 0 ? soNaEntrevista.map(linhaDoCriterio).join("\n") : "- nenhum"
    }`,
  );

  if (guia.sinaisObservacao.length > 0) {
    L.push(
      `\nSINAIS QUE OS ENTREVISTADORES VAO OBSERVAR NA CONVERSA (suas perguntas precisam dar a eles a chance de ver isto):\n${guia.sinaisObservacao
        .map((sn) => `- ${sn}`)
        .join("\n")}`,
    );
  }
  if (guia.regrasDesempate.length > 0) {
    L.push(
      `\nCOMO A CLINICA DESEMPATA NO FINAL (e o que esta ficha precisa ajudar a decidir):\n${guia.regrasDesempate
        .map((r, i) => `${i + 1}. ${r}`)
        .join("\n")}`,
    );
  }

  if (entrada.exemplos.trim().length > 0) {
    L.push(
      `\n=== FICHAS ESCRITAS A MAO PELOS ENTREVISTADORES DA JP (imite a FORMA, nunca o conteudo) ===\n${entrada.exemplos.trim()}`,
    );
  }

  L.push("\n=== CANDIDATA DESTA FICHA ===");
  L.push(`Nome: ${e.nome || "(não identificado no documento)"}`);
  L.push(
    `Onde mora: ${[e.bairro, e.cidade, e.uf].filter((p) => p.length > 0).join(", ") || "não informado"}`,
  );
  if (e.registroProfissional) L.push(`Registro no conselho: ${e.registroProfissional}`);
  if (e.pretensaoDeclarada) L.push(`Pretensão declarada: ${e.pretensaoDeclarada}`);
  if (e.resumoObjetivo) L.push(`Objetivo escrito por ela: ${e.resumoObjetivo}`);

  L.push("\nFORMACAO:");
  L.push(
    e.formacoes.length
      ? e.formacoes
          .map((f) => {
            const cabeca = [f.nivel, f.curso, f.instituicao]
              .filter((p) => p.length > 0)
              .join(" | ");
            const cauda = f.emAndamento
              ? " (em andamento)"
              : f.conclusao
                ? ` (concluído ${f.conclusao})`
                : "";
            return `- ${cabeca}${cauda}`;
          })
          .join("\n")
      : "- nada informado",
  );
  if (e.cursos.length) L.push(`Cursos: ${e.cursos.join("; ")}`);
  if (e.softwares.length) L.push(`Sistemas citados: ${e.softwares.join("; ")}`);

  L.push("\nHISTORICO PROFISSIONAL (linha do tempo calculada em codigo):");
  L.push(
    m.linhaDoTempo.length
      ? m.linhaDoTempo.map(linhaDoVinculo).join("\n")
      : "- nenhum emprego listado no documento",
  );
  const descricoes = e.empregos.filter((emp) => emp.descricao.length > 0);
  if (descricoes.length) {
    L.push("\nATIVIDADES DESCRITAS POR ELA:");
    L.push(
      descricoes
        .map((emp) => `- ${emp.cargo || "cargo"} em ${emp.empresa || "empresa"}: ${emp.descricao}`)
        .join("\n"),
    );
  }

  L.push("\nNUMEROS JA CALCULADOS (verdade — nao recalcule):");
  L.push(
    `Empregos listados: ${m.totalEmpregos} (com data: ${m.empregosDatados}, sem data: ${m.empregosSemData})`,
  );
  L.push(
    `Ultimo emprego: ${
      m.ultimoEmprego
        ? `${m.ultimoEmprego.cargo || "cargo não informado"} na ${m.ultimoEmprego.empresa || "empresa não informada"} — ${emAnosMeses(m.ultimoEmprego.meses)}`
        : "não identificado"
    }`,
  );
  L.push(
    `Esta empregada hoje: ${m.empregadaAtualmente === null ? "não dá para saber pelo documento" : m.empregadaAtualmente ? "sim" : "não consta vínculo em andamento"}`,
  );
  L.push(`Tempo medio por emprego: ${emAnosMeses(m.mediaMesesPorEmprego)}`);
  L.push(`Experiencia total somada: ${emAnosMeses(m.mesesExperienciaTotal)}`);
  L.push(
    `Em odontologia: ${emAnosMeses(m.mesesEmOdontologia)} | em saude: ${emAnosMeses(m.mesesEmSaude)}`,
  );
  L.push(`Com atendimento ao publico: ${emAnosMeses(m.mesesAtendimentoPublico)}`);
  L.push(`Com rotina administrativa: ${emAnosMeses(m.mesesAdministrativo)}`);
  L.push(
    `Lacunas de 4 meses ou mais: ${
      m.lacunas.length
        ? m.lacunas.map((l) => `${l.de} a ${l.ate} (${emAnosMeses(l.meses)})`).join("; ")
        : "nenhuma detectada"
    }`,
  );
  L.push(
    `Periodos sobrepostos: ${
      m.sobreposicoes.length
        ? m.sobreposicoes.map((sp) => `${sp.a} × ${sp.b} (${emAnosMeses(sp.meses)})`).join("; ")
        : "nenhum detectado"
    }`,
  );

  L.push("\nSINAIS JA LEVANTADOS (nao repita, nao contradiga — vire pergunta quando couber):");
  L.push(
    entrada.sinais.length
      ? entrada.sinais
          .map((sn) => `- [${sn.severidade}] ${sn.titulo}: ${sn.detalhe}`)
          .join("\n")
          .slice(0, 5000)
      : "- nenhum sinal automatico disparou",
  );

  L.push("\nLEITURA JA FEITA PELA TRIAGEM (contexto, nao copie):");
  L.push(`Recomendacao: ${analise.recomendacao} | ${analise.estrelas} estrelas`);
  if (analise.resumoUmaLinha) L.push(`Resumo: ${analise.resumoUmaLinha}`);
  if (analise.pontosFortes.length) L.push(`Fortes: ${analise.pontosFortes.join("; ")}`);
  if (analise.pontosAtencao.length) L.push(`Atencao: ${analise.pontosAtencao.join("; ")}`);
  if (analise.perguntasEntrevista.length) {
    L.push(
      `Perguntas ja sugeridas na triagem (aproveite as boas, mas nao entregue as quatro iguais):\n${analise.perguntasEntrevista
        .map((p) => `- ${p.pergunta}`)
        .join("\n")}`,
    );
  }

  L.push("\nQUALIDADE DO DOCUMENTO:");
  L.push(`Legibilidade: ${e.legibilidade}/100 | tipo: ${e.tipoDocumento || "não identificado"}`);
  if (e.observacoesDoLeitor.length) {
    L.push(`Problemas na leitura: ${e.observacoesDoLeitor.join("; ")}`);
  }
  if (e.dadosSensiveisPresentes.length) {
    L.push(
      `Dados sensiveis presentes no documento (IGNORE-OS por completo, estao aqui so para registro): ${e.dadosSensiveisPresentes.join(", ")}`,
    );
  }

  L.push(
    `\nEscreva a ficha desta candidata: ponto forte, o que validar, ${ITENS_POR_BLOCO} itens de triagem objetiva, ${ITENS_POR_BLOCO} perguntas de investigacao e as notas sugeridas dos criterios pontuaveis.`,
  );
  return L.join("\n");
}

function normalizarPerguntas(bruto: unknown): { pergunta: string; porque: string }[] {
  if (!Array.isArray(bruto)) return [];
  return bruto
    .slice(0, ITENS_POR_BLOCO)
    .map((item) => {
      const p = objeto(item);
      return { pergunta: txt(p["pergunta"], 300), porque: txt(p["porque"], 300) };
    })
    .filter((p) => p.pergunta.length > 0);
}

/**
 * Corta o excesso, descarta o que não é do guia e NÃO completa o que faltar.
 *
 * Não inventar item faltante é decisão de projeto: uma quinta pergunta escrita
 * por nós para "fechar o formato" seria exatamente o tipo de pergunta genérica
 * que o guia proíbe. Vieram três? A ficha sai com três, e quem gerou vê que
 * saiu com três.
 */
function normalizarFicha(
  bruto: unknown,
  chavesPontuaveis: string[],
  notaMaxima: number,
): FichaGerada {
  const o = objeto(bruto);
  const permitidas = new Set(chavesPontuaveis);
  const vistas = new Set<string>();

  const notasSugeridas: NotaSugerida[] = Array.isArray(o["notasSugeridas"])
    ? o["notasSugeridas"]
        .slice(0, 20)
        .map((item): NotaSugerida => {
          const n = objeto(item);
          return {
            chave: txt(n["chave"], 40),
            nota: inteiro(n["nota"], 0, notaMaxima, 0),
            evidencia: txt(n["evidencia"], 600),
          };
        })
        // A trava final contra nota em critério de postura: mesmo que o modelo
        // devolva "comunicacao-postura", ela não chega ao disco. E a chave
        // repetida cai fora, senão duas notas disputariam a mesma linha da
        // tabela e o total /50 dependeria da ordem de renderização.
        .filter((n) => {
          if (!permitidas.has(n.chave) || vistas.has(n.chave)) return false;
          vistas.add(n.chave);
          return true;
        })
    : [];

  return {
    pontoForte: txt(o["pontoForte"], 1200),
    oQueValidar: txt(o["oQueValidar"], 1200),
    triagem: normalizarPerguntas(o["triagem"]),
    perguntasEspecificas: normalizarPerguntas(o["perguntasEspecificas"]),
    notasSugeridas,
  };
}

export async function gerarFichaEntrevista(entrada: {
  extracao: ExtracaoCurriculo;
  metricas: MetricasPermanencia;
  sinais: Sinal[];
  analise: AnaliseIa;
  guia: GuiaEntrevista;
  tituloVaga: string;
  exemplos: string;
}): Promise<ResultadoFicha> {
  const chavesPontuaveis = criteriosPontuaveisPelaIa(entrada.guia).map((c) => c.chave);
  const notaEtica = entrada.guia.notaEtica.trim();

  const resposta = await chamar({
    model: modeloAtual(),
    // A nota ética entra por substituição, e não escrita à mão dentro do texto:
    // se a clínica reescrever a nota no guia, é a nota NOVA que vira restrição.
    // O que o modelo obedece não pode divergir do papel que está na mesa.
    instructions: INSTRUCOES_FICHA.replace(
      "[[NOTA_ETICA]]",
      notaEtica.length > 0 ? notaEtica : NOTA_ETICA_JP,
    ),
    input: [{ role: "user", content: [{ type: "input_text", text: montarDossieFicha(entrada) }] }],
    text: {
      format: {
        type: "json_schema",
        name: "ficha_entrevista",
        strict: true,
        schema: esquemaFicha(chavesPontuaveis),
      },
    },
  });

  if (!resposta.ok) return { ok: false, erro: resposta.erro };
  return {
    ok: true,
    ficha: normalizarFicha(resposta.dados, chavesPontuaveis, entrada.guia.notaMaxima),
    uso: resposta.uso,
  };
}
