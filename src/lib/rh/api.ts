/**
 * Server functions do Portal de RH.
 *
 * Este arquivo é importado pelas telas, então o topo dele precisa ser seguro no
 * navegador: nada de `node:`, nada de `@tanstack/react-start/server`, nada dos
 * módulos de `./servidor`. Tudo isso entra por `await import()` **dentro** do
 * handler, que o compilador do Start remove do bundle do cliente.
 *
 * Convenção das rotas de admin: quando não há sessão elas devolvem
 * `{ ok: false, motivo: "nao-autenticado" }` em vez de lançar. Lançar cairia no
 * error boundary e mostraria tela de erro para quem só precisa fazer login.
 */
import { createServerFn } from "@tanstack/react-start";

import { LEITURAS } from "./duvidas";
import type { LeituraResposta } from "./duvidas";
import { DECISOES, fichaVazia, IMPRESSOES, RESPOSTAS_TRIAGEM } from "./ficha";
import type {
  DecisaoFicha,
  FichaEntrevista,
  ImpressaoFicha,
  NotaFicha,
  RespostaItemTriagem,
  RespostaPergunta,
  RespostaTriagem,
} from "./ficha";
import { apenasDigitos, formatarTamanho } from "./formatar";
import { chaveDeCriterio, decisaoFinalVazia, guiaVazio, NOTA_ETICA_JP, validarGuia } from "./guia";
import type { CriterioGuia, DecisaoFinal, GuiaEntrevista } from "./guia";
import { VERSAO_ANALISE } from "./ia/tipos";
import type { RankingSalvo } from "./ia/tipos";
import {
  AREAS,
  FAIXAS_EXPERIENCIA,
  MODELOS_TRABALHO,
  PRAZOS_INICIO,
  STATUS,
  STATUS_VAGA,
  VINCULOS,
} from "./opcoes";
import {
  candidaturaVazia,
  configuracoesPadrao,
  EXTENSOES_CURRICULO,
  LIMITES,
  TAMANHO_MAX_CURRICULO,
  TIPOS_CURRICULO,
  VERSAO_CONSENTIMENTO_LGPD,
  vagaVazia,
} from "./tipos";
import type {
  Anotacao,
  AreaVaga,
  Candidatura,
  CamposGeriveis,
  ConfiguracoesRh,
  ExperienciaItem,
  FaixaExperiencia,
  ModeloTrabalho,
  PrazoInicio,
  StatusCandidatura,
  StatusVaga,
  Vaga,
  Vinculo,
} from "./tipos";
import { gerarSlug, ordenarVagas, slugUnico, vagaAberta, validarVaga } from "./vagas";
import { validarTudo } from "./validar";

/* -------------------------------------------------------------------------- */
/* Formatos de retorno                                                        */
/* -------------------------------------------------------------------------- */

export type RespostaSessao = { autenticado: boolean; configurado: boolean; motivo: string };
export type RespostaLogin = { ok: true } | { ok: false; erro: string; segundos?: number };
export type RespostaEnvio =
  { ok: true; protocolo: string } | { ok: false; erros: Record<string, string> };
export type RespostaLista = { ok: true; itens: Candidatura[] } | { ok: false; motivo: string };
export type RespostaItem = { ok: true; item: Candidatura } | { ok: false; motivo: string };
export type RespostaSimples = { ok: true } | { ok: false; motivo: string };

const NAO_AUTENTICADO = "nao-autenticado";

type DadosSessao = { admin: boolean; entrouEm: string };

/* -------------------------------------------------------------------------- */
/* Normalização da entrada                                                    */
/* -------------------------------------------------------------------------- */

const LIMITE_TEXTO = 500;
const LIMITE_NOME = 120;
const MAX_ITENS = 30;

function objeto(valor: unknown): Record<string, unknown> {
  if (valor === null || typeof valor !== "object" || Array.isArray(valor)) return {};
  return valor as Record<string, unknown>;
}

function texto(valor: unknown, limite: number = LIMITE_TEXTO): string {
  return typeof valor === "string" ? valor.trim().slice(0, limite) : "";
}

function lista(valor: unknown, limite: number = LIMITE_TEXTO): string[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .slice(0, MAX_ITENS)
    .map((item) => texto(item, limite))
    .filter((item) => item.length > 0);
}

/**
 * Uniões do domínio: o valor volta vazio quando não está na lista conhecida.
 * String vazia é exatamente o estado que `validarTudo` recusa, então lixo vindo
 * de um POST fora do formulário vira erro de campo em vez de dado inválido no
 * disco.
 */
function uniao<T extends string>(valor: unknown, permitidos: readonly string[]): T {
  const v = texto(valor, 40);
  return (permitidos.includes(v) ? v : "") as T;
}

function experiencias(valor: unknown): ExperienciaItem[] {
  if (!Array.isArray(valor)) return [];
  return valor.slice(0, MAX_ITENS).map((item): ExperienciaItem => {
    const bruto = objeto(item);
    return {
      empresa: texto(bruto["empresa"], LIMITE_NOME),
      cargo: texto(bruto["cargo"], LIMITE_NOME),
      periodo: texto(bruto["periodo"], 60),
      atividades: texto(bruto["atividades"], 1000),
    };
  });
}

/**
 * Monta a candidatura só com os campos que o candidato tem direito de preencher.
 * Status, nota, etiquetas, responsável, anotações, protocolo e id são montados
 * aqui no servidor: nenhum deles é copiado do payload, senão bastaria um POST
 * artesanal para alguém se auto-aprovar (ou reescrever o protocolo de outra
 * pessoa).
 */
function montarCandidatura(bruto: Record<string, unknown>): Candidatura {
  return {
    ...candidaturaVazia(),

    // `vagaTitulo` fica de fora pelo mesmo motivo dos campos de gestão: quem
    // preenche é o servidor, a partir da vaga encontrada por este id. Aceitar o
    // título do cliente deixaria qualquer POST gravar a vaga que quisesse na
    // candidatura.
    vagaId: texto(bruto["vagaId"], 60),

    area: uniao<AreaVaga>(
      bruto["area"],
      AREAS.map((item) => item.valor),
    ),
    cargoDesejado: texto(bruto["cargoDesejado"], LIMITE_NOME),
    vinculo: uniao<Vinculo>(
      bruto["vinculo"],
      VINCULOS.map((item) => item.valor),
    ),
    especialidades: lista(bruto["especialidades"], 80),
    disponibilidade: lista(bruto["disponibilidade"], 40),
    inicioEm: uniao<PrazoInicio>(
      bruto["inicioEm"],
      PRAZOS_INICIO.map((item) => item.valor),
    ),
    pretensao: texto(bruto["pretensao"], 40),

    nome: texto(bruto["nome"], LIMITE_NOME),
    nascimento: texto(bruto["nascimento"], 20),
    cpf: apenasDigitos(texto(bruto["cpf"], 20)),
    email: texto(bruto["email"], 254),
    telefone: apenasDigitos(texto(bruto["telefone"], 25)),
    cep: apenasDigitos(texto(bruto["cep"], 12)),
    logradouro: texto(bruto["logradouro"], 200),
    bairro: texto(bruto["bairro"], LIMITE_NOME),
    cidade: texto(bruto["cidade"], LIMITE_NOME),
    uf: texto(bruto["uf"], 2).toUpperCase(),
    linkedin: texto(bruto["linkedin"], 200),
    instagram: texto(bruto["instagram"], 100),

    escolaridade: texto(bruto["escolaridade"], LIMITE_NOME),
    instituicao: texto(bruto["instituicao"], 200),
    anoFormacao: texto(bruto["anoFormacao"], 4),
    cro: texto(bruto["cro"], 20),
    croUf: texto(bruto["croUf"], 2).toUpperCase(),
    posGraduacoes: texto(bruto["posGraduacoes"], LIMITES.formacaoLivre),
    cursos: texto(bruto["cursos"], LIMITES.formacaoLivre),

    anosExperiencia: uniao<FaixaExperiencia>(
      bruto["anosExperiencia"],
      FAIXAS_EXPERIENCIA.map((item) => item.valor),
    ),
    experiencias: experiencias(bruto["experiencias"]),
    softwares: lista(bruto["softwares"], 80),
    competencias: lista(bruto["competencias"], 80),
    idiomas: lista(bruto["idiomas"], 80),

    cartaApresentacao: texto(bruto["cartaApresentacao"], LIMITES.textoLongo),
    origem: texto(bruto["origem"], LIMITE_NOME),
    indicadoPor: texto(bruto["indicadoPor"], LIMITE_NOME),
    consentimentoLgpd: bruto["consentimentoLgpd"] === true,
  };
}

/* -------------------------------------------------------------------------- */
/* Identidade de quem pediu                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Chave dos dois limitadores por IP. A regra mora em `servidor/sessao` porque
 * depende de variável de ambiente, que não pode ser lida no topo deste módulo
 * (a tela o importa). `getRequestIP()` sem opções devolve o endereço da
 * conexão; o header entra separado, e só é considerado quando há proxy
 * declarado como confiável — ver `chaveDeLimitePorIp`.
 */
async function ipDoPedido(): Promise<string> {
  const { getRequestHeader, getRequestIP } = await import("@tanstack/react-start/server");
  const { chaveDeLimitePorIp } = await import("./servidor/sessao");
  return chaveDeLimitePorIp(getRequestIP(), getRequestHeader("x-forwarded-for"));
}

/* -------------------------------------------------------------------------- */
/* Limite de envios por IP                                                    */
/* -------------------------------------------------------------------------- */

const MAX_ENVIOS_HORA = 5;
/**
 * Teto separado, e mais alto, para tentativas que não viraram candidatura.
 * Existe porque o robô que erra de propósito (JSON inválido, CPF errado, vaga
 * fechada, arquivo grande demais) nunca chega ao caminho de sucesso — sem
 * contar a tentativa, ele dispara à vontade, sondando quais `vagaId` existem ou
 * empurrando upload atrás de upload.
 */
const MAX_TENTATIVAS_HORA = 30;
const JANELA_ENVIOS_MS = 60 * 60 * 1000;

type MarcasEnvio = { tentativas: number[]; envios: number[] };

/**
 * Como o limitador de login, vive na memória da instância. Segura o robô de
 * formulário que descobre a URL da server function; um ataque distribuído passa,
 * mas aí o problema já é outro.
 */
const enviosPorIp = new Map<string, MarcasEnvio>();

function recentes(marcas: number[], agora: number): number[] {
  return marcas.filter((quando) => agora - quando < JANELA_ENVIOS_MS);
}

/**
 * Conta a tentativa e diz se ela pode seguir. Contar aqui, e não só no fim do
 * caminho feliz, é o ponto: quem chama registra a batida antes de validar
 * qualquer coisa.
 */
function registrarTentativa(ip: string, agora: number): boolean {
  const atual = enviosPorIp.get(ip) ?? { tentativas: [], envios: [] };
  const marcas: MarcasEnvio = {
    tentativas: [...recentes(atual.tentativas, agora), agora],
    envios: recentes(atual.envios, agora),
  };
  enviosPorIp.set(ip, marcas);

  if (enviosPorIp.size > 1000) {
    for (const [chave, guardadas] of enviosPorIp) {
      if (recentes(guardadas.tentativas, agora).length === 0) enviosPorIp.delete(chave);
    }
  }

  return marcas.tentativas.length <= MAX_TENTATIVAS_HORA && marcas.envios.length < MAX_ENVIOS_HORA;
}

function registrarEnvio(ip: string, agora: number): void {
  const atual = enviosPorIp.get(ip) ?? { tentativas: [], envios: [] };
  enviosPorIp.set(ip, { ...atual, envios: [...atual.envios, agora] });
}

/* -------------------------------------------------------------------------- */
/* Sessão                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Marca a resposta como não-armazenável.
 *
 * O payload de `listarCandidaturas` é a lista inteira de candidatos, com CPF,
 * data de nascimento e endereço. Sem este cabeçalho, um proxy corporativo ou
 * um CDN mal configurado no caminho pode guardar a resposta e devolvê-la a
 * outra pessoa — e o `Vary: Cookie` é o que impede que a versão do RH logado
 * seja servida para quem chega sem sessão. Vale para as respostas de erro
 * também: "não autenticado" cacheado tranca o painel do RH.
 */
async function naoArmazenar(): Promise<void> {
  const { setResponseHeader } = await import("@tanstack/react-start/server");
  setResponseHeader("cache-control", "private, no-store");
  setResponseHeader("vary", "Cookie");
}

/** Lê o cookie e diz se quem chamou é o admin. Não lança: cookie inválido é "não". */
async function exigirAdmin(): Promise<boolean> {
  // Antes de qualquer retorno: toda rota que passa por aqui devolve dado de
  // sessão ou dado pessoal, e nenhuma delas pode ficar em cache.
  await naoArmazenar();

  const { configuracaoSessao, segredosConfigurados } = await import("./servidor/sessao");
  if (!segredosConfigurados().ok) return false;

  // Renomeado no destructuring: `useSession` do Start não é hook de React, mas o
  // eslint-plugin-react-hooks julga pelo nome e acusaria chamada de hook fora de
  // componente.
  const { useSession: abrirSessao } = await import("@tanstack/react-start/server");
  try {
    const sessao = await abrirSessao<DadosSessao>(configuracaoSessao());
    return sessao.data.admin === true;
  } catch {
    // Cookie assinado com outro segredo (troca de RH_SESSION_SECRET) apenas
    // deslogaria; não faz sentido derrubar a página por isso.
    return false;
  }
}

export const sessaoRh = createServerFn({ method: "GET" }).handler(
  async (): Promise<RespostaSessao> => {
    const { segredosConfigurados } = await import("./servidor/sessao");
    const estado = segredosConfigurados();
    if (!estado.ok) return { autenticado: false, configurado: false, motivo: estado.motivo };

    return { autenticado: await exigirAdmin(), configurado: true, motivo: "" };
  },
);

export const entrarRh = createServerFn({ method: "POST" })
  .validator((entrada: unknown): { senha: string } => {
    const bruto = objeto(entrada);
    const senha = bruto["senha"];
    if (typeof senha !== "string") throw new Error("Informe a senha.");
    return { senha };
  })
  .handler(async ({ data }): Promise<RespostaLogin> => {
    const {
      configuracaoSessao,
      conferirSenha,
      estadoBloqueio,
      limparFalhas,
      registrarFalha,
      segredosConfigurados,
    } = await import("./servidor/sessao");

    const estado = segredosConfigurados();
    if (!estado.ok) return { ok: false, erro: estado.motivo };

    const ip = await ipDoPedido();
    const agora = Date.now();
    const { useSession: abrirSessao } = await import("@tanstack/react-start/server");

    const bloqueio = estadoBloqueio(ip, agora);
    if (bloqueio.bloqueado) {
      return {
        ok: false,
        erro: "Muitas tentativas seguidas. Aguarde para tentar de novo.",
        segundos: bloqueio.segundos,
      };
    }

    if (!conferirSenha(data.senha)) {
      registrarFalha(ip, agora);
      return { ok: false, erro: "Senha incorreta." };
    }

    limparFalhas(ip);
    const sessao = await abrirSessao<DadosSessao>(configuracaoSessao());
    await sessao.update({ admin: true, entrouEm: new Date().toISOString() });
    return { ok: true };
  });

export const sairRh = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ ok: true }> => {
    const { configuracaoSessao, segredosConfigurados } = await import("./servidor/sessao");
    if (segredosConfigurados().ok) {
      const { useSession: abrirSessao } = await import("@tanstack/react-start/server");
      const sessao = await abrirSessao<DadosSessao>(configuracaoSessao());
      await sessao.clear();
    }
    // Sem sessão para limpar o resultado é o mesmo: o usuário está deslogado.
    return { ok: true };
  },
);

/* -------------------------------------------------------------------------- */
/* Envio público                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Manda ler o currículo depois que a resposta já saiu.
 *
 * Sem `await` em lugar nenhum do caminho do candidato, e engolindo qualquer
 * erro: se a chave da OpenAI estiver errada, se a OpenAI estiver fora do ar ou
 * se o PDF for ilegivel, isso é problema do painel de RH — e já aparece lá,
 * porque a falha fica gravada dentro da própria ficha (`analise.erro`) e a
 * candidatura volta a contar como pendente.
 *
 * Aviso honesto para quem for mexer aqui: em hospedagem serverless o processo
 * pode ser congelado assim que a resposta HTTP fecha, e aí esta leitura não
 * termina. Não é perda: quem não foi lida continua na fila de pendentes da aba
 * Triagem, e o botão "Analisar todas" recolhe o que ficou para trás. Este
 * disparo é uma economia de trabalho, nunca a única garantia.
 */
function analisarDepoisDeResponder(id: string): void {
  void (async () => {
    try {
      const { iaConfigurada } = await import("./servidor/openai");
      // Sem chave nem adianta abrir o módulo de análise: ele gravaria uma falha
      // em toda ficha nova e a tela ficaria cheia de "a leitura falhou" onde a
      // verdade é que a IA nunca foi ligada.
      if (!iaConfigurada().ok) return;
      const { analisarCandidatura } = await import("./servidor/analise");
      await analisarCandidatura(id, {});
    } catch {
      // Silêncio de propósito: ninguém está esperando esta promessa, e um erro
      // não tratado aqui derrubaria o processo do servidor inteiro.
    }
  })();
}

export const enviarCandidatura = createServerFn({ method: "POST" })
  .validator((entrada: unknown): FormData => {
    if (!(entrada instanceof FormData)) {
      throw new Error("Envio inválido: era esperado um formulário.");
    }
    return entrada;
  })
  .handler(async ({ data }): Promise<RespostaEnvio> => {
    const ip = await ipDoPedido();
    const agora = Date.now();

    // A batida é contada antes de qualquer validação, de propósito: envio
    // recusado é tentativa, e o teto só existia para envio aceito.
    if (!registrarTentativa(ip, agora)) {
      return {
        ok: false,
        erros: {
          // Cobre os dois tetos (envios aceitos e tentativas): dizer "você já
          // enviou várias candidaturas" seria falso para quem só bateu no
          // limite de tentativas recusadas.
          geral: "Recebemos muitos envios deste endereço agora há pouco. Tente mais tarde.",
        },
      };
    }

    const cru = data.get("dados");
    let bruto: Record<string, unknown>;
    try {
      if (typeof cru !== "string") throw new Error("campo ausente");
      bruto = objeto(JSON.parse(cru));
    } catch {
      // Mensagem genérica: o candidato não tem o que fazer com o detalhe técnico.
      return { ok: false, erros: { geral: "Não foi possível ler os dados enviados." } };
    }

    const candidatura = montarCandidatura(bruto);
    const agoraData = new Date();

    const armazenamento = await import("./servidor/armazenamento");

    // A chave do banco de talentos entra na validação em vez de virar um `if`
    // solto aqui embaixo: é a MESMA regra que a tela roda no passo 1, e uma
    // regra escrita duas vezes é uma regra que vai divergir.
    const config = await armazenamento.lerConfiguracoes();
    const erros = validarTudo(candidatura, agoraData, {
      aceitandoEspontanea: config.aceitandoEspontanea,
    });

    if (candidatura.vagaId.length > 0) {
      const vaga = await armazenamento.lerVaga(candidatura.vagaId);
      if (vaga === null || !vagaAberta(vaga, agoraData)) {
        // A vaga pode ter encerrado entre abrir o formulário e enviar. A
        // mensagem precisa dizer o que fazer, senão a pessoa reenvia o mesmo
        // formulário sem entender por que não passa.
        erros["vagaId"] = config.aceitandoEspontanea
          ? "Esta vaga não está mais recebendo candidaturas. Escolha uma das vagas abertas ou envie sua candidatura para o banco de talentos."
          : "Esta vaga não está mais recebendo candidaturas. Escolha uma das vagas abertas.";
      } else {
        candidatura.vagaTitulo = vaga.titulo;
      }
    }

    if (Object.keys(erros).length > 0) return { ok: false, erros };

    const id = armazenamento.novoId();

    const enviado = data.get("curriculo");
    if (enviado instanceof File && enviado.size > 0) {
      if (enviado.size > TAMANHO_MAX_CURRICULO) {
        return {
          ok: false,
          erros: {
            curriculo: `O arquivo passa de ${formatarTamanho(TAMANHO_MAX_CURRICULO)}.`,
          },
        };
      }

      const nomeArquivo = armazenamento.nomeArquivoSeguro(enviado.name);
      const corte = nomeArquivo.lastIndexOf(".");
      const extensao = corte > 0 ? nomeArquivo.slice(corte) : "";

      // A extensão é obrigatória, e o mime é prova adicional — nunca substituta.
      // Enquanto os dois valiam em "ou", bastava um multipart forjado declarando
      // `Content-Type: application/pdf` para gravar "curriculo-maria.exe":
      // `nomeArquivoSeguro` preserva qualquer extensão alfanumérica, e o
      // download entregaria esse nome à pessoa do RH na pasta Downloads.
      // O mime sozinho continua NÃO bastando; o inverso (extensão conhecida,
      // mime esquisito) segue aceito porque Windows manda .doc como
      // "application/octet-stream", às vezes vazio, e recusar aí barraria
      // currículo legítimo.
      if (!EXTENSOES_CURRICULO.includes(extensao)) {
        return {
          ok: false,
          erros: { curriculo: "Formato não aceito. Envie PDF, DOC, DOCX, JPG ou PNG." },
        };
      }

      const bytes = new Uint8Array(await enviado.arrayBuffer());
      await armazenamento.salvarCurriculo(id, nomeArquivo, bytes);

      candidatura.curriculo = {
        nomeArquivo,
        nomeOriginal: texto(enviado.name, LIMITE_NOME),
        // `enviado.type` é string livre do cliente e vira header na rota de
        // download, onde string vazia cai em "application/octet-stream".
        // Guardar só o que está na lista branca evita ecoar "text/html" — ou um
        // valor com caractere proibido em header, que transformaria o download
        // daquele currículo num 500 permanente.
        tipo: TIPOS_CURRICULO.includes(enviado.type) ? enviado.type : "",
        tamanho: enviado.size,
        enviadoEm: new Date().toISOString(),
      };
    }

    const carimbo = new Date();
    const protocolo = await armazenamento.proximoProtocolo(carimbo.getFullYear());

    candidatura.id = id;
    candidatura.protocolo = protocolo;
    candidatura.criadoEm = carimbo.toISOString();
    candidatura.atualizadoEm = carimbo.toISOString();
    candidatura.status = "novo";
    candidatura.nota = 0;
    // Qual redação do aviso estava no ar quando a pessoa marcou a caixa. O
    // booleano sozinho prova que houve aceite, não o quê foi aceito.
    candidatura.consentimentoVersao = VERSAO_CONSENTIMENTO_LGPD;

    await armazenamento.salvarCandidatura(candidatura);
    registrarEnvio(ip, agora);

    // A leitura da IA NUNCA entra no caminho da resposta. Ela leva uns 30
    // segundos (são duas chamadas ao modelo) e a pessoa do outro lado está
    // olhando para um botão girando à espera do protocolo: fazer ela esperar por
    // uma análise que é do RH, e não dela, seria cobrar o custo de quem não
    // recebe o benefício. Por isso dispara e segue — o `void` é deliberado.
    if (config.analisarAoReceber) analisarDepoisDeResponder(id);

    return { ok: true, protocolo };
  });

/* -------------------------------------------------------------------------- */
/* Painel (exige admin)                                                       */
/* -------------------------------------------------------------------------- */

export const listarCandidaturas = createServerFn({ method: "GET" }).handler(
  async (): Promise<RespostaLista> => {
    if (!(await exigirAdmin())) return { ok: false, motivo: NAO_AUTENTICADO };

    const { listarTodas } = await import("./servidor/armazenamento");
    return { ok: true, itens: await listarTodas() };
  },
);

export const atualizarCandidatura = createServerFn({ method: "POST" })
  .validator((entrada: unknown): { id: string; campos: Partial<CamposGeriveis> } => {
    const bruto = objeto(entrada);
    const id = texto(bruto["id"], 60);
    if (id.length === 0) throw new Error("Candidatura não informada.");

    // Lista branca explícita: só estas chaves atravessam. Copiar o objeto inteiro
    // deixaria o painel (ou um POST forjado) reescrever CPF, currículo e protocolo.
    const recebidos = objeto(bruto["campos"]);
    const campos: Partial<CamposGeriveis> = {};

    if ("status" in recebidos) {
      const valor = texto(recebidos["status"], 20);
      if (!STATUS.some((item) => item.valor === valor)) throw new Error("Status desconhecido.");
      campos.status = valor as StatusCandidatura;
    }
    if ("nota" in recebidos) {
      const valor = recebidos["nota"];
      if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0 || valor > 5) {
        throw new Error("A nota precisa ficar entre 0 e 5.");
      }
      campos.nota = Math.round(valor);
    }
    if ("etiquetas" in recebidos) campos.etiquetas = lista(recebidos["etiquetas"], 40);
    if ("responsavel" in recebidos) campos.responsavel = texto(recebidos["responsavel"], 80);
    if ("entrevistaEm" in recebidos) campos.entrevistaEm = texto(recebidos["entrevistaEm"], 40);
    if ("arquivada" in recebidos) campos.arquivada = recebidos["arquivada"] === true;

    return { id, campos };
  })
  .handler(async ({ data }): Promise<RespostaItem> => {
    if (!(await exigirAdmin())) return { ok: false, motivo: NAO_AUTENTICADO };

    // Ler fora da fila e só enfileirar a gravação perde alteração: dar nota e
    // trocar o status no mesmo segundo faz os dois handlers partirem do mesmo
    // retrato, e o segundo grava por cima. `atualizarCandidaturaNoDisco` fecha
    // o ciclo inteiro dentro da fila.
    const { atualizarCandidaturaNoDisco } = await import("./servidor/armazenamento");
    const item = await atualizarCandidaturaNoDisco(data.id, (atual) => ({
      ...atual,
      ...data.campos,
      atualizadoEm: new Date().toISOString(),
    }));
    if (item === null) return { ok: false, motivo: "nao-encontrada" };

    return { ok: true, item };
  });

export const adicionarAnotacao = createServerFn({ method: "POST" })
  .validator((entrada: unknown): { id: string; texto: string } => {
    const bruto = objeto(entrada);
    const id = texto(bruto["id"], 60);
    if (id.length === 0) throw new Error("Candidatura não informada.");

    const conteudo = texto(bruto["texto"], 2000);
    if (conteudo.length === 0) throw new Error("Escreva a anotação antes de salvar.");

    return { id, texto: conteudo };
  })
  .handler(async ({ data }): Promise<RespostaItem> => {
    if (!(await exigirAdmin())) return { ok: false, motivo: NAO_AUTENTICADO };

    const { randomUUID } = await import("node:crypto");
    const anotacao: Anotacao = {
      id: randomUUID(),
      // Login único do painel: não há usuários separados para atribuir a autoria.
      autor: "Administração",
      texto: data.texto,
      criadoEm: new Date().toISOString(),
    };

    // Montada antes: o mutador roda dentro da fila e precisa ser síncrono.
    const { atualizarCandidaturaNoDisco } = await import("./servidor/armazenamento");
    const item = await atualizarCandidaturaNoDisco(data.id, (atual) => ({
      ...atual,
      anotacoes: [...atual.anotacoes, anotacao],
      atualizadoEm: new Date().toISOString(),
    }));
    if (item === null) return { ok: false, motivo: "nao-encontrada" };

    return { ok: true, item };
  });

export const removerAnotacao = createServerFn({ method: "POST" })
  .validator((entrada: unknown): { id: string; anotacaoId: string } => {
    const bruto = objeto(entrada);
    const id = texto(bruto["id"], 60);
    const anotacaoId = texto(bruto["anotacaoId"], 60);
    if (id.length === 0 || anotacaoId.length === 0) throw new Error("Anotação não informada.");
    return { id, anotacaoId };
  })
  .handler(async ({ data }): Promise<RespostaItem> => {
    if (!(await exigirAdmin())) return { ok: false, motivo: NAO_AUTENTICADO };

    const { atualizarCandidaturaNoDisco } = await import("./servidor/armazenamento");
    const item = await atualizarCandidaturaNoDisco(data.id, (atual) => ({
      ...atual,
      anotacoes: atual.anotacoes.filter((nota) => nota.id !== data.anotacaoId),
      atualizadoEm: new Date().toISOString(),
    }));
    if (item === null) return { ok: false, motivo: "nao-encontrada" };

    return { ok: true, item };
  });

export const excluirCandidatura = createServerFn({ method: "POST" })
  .validator((entrada: unknown): { id: string } => {
    const bruto = objeto(entrada);
    const id = texto(bruto["id"], 60);
    if (id.length === 0) throw new Error("Candidatura não informada.");
    return { id };
  })
  .handler(async ({ data }): Promise<RespostaSimples> => {
    if (!(await exigirAdmin())) return { ok: false, motivo: NAO_AUTENTICADO };

    const { excluirTudo, lerCandidatura } = await import("./servidor/armazenamento");
    const atual = await lerCandidatura(data.id);
    if (atual === null) return { ok: false, motivo: "nao-encontrada" };

    await excluirTudo(data.id);
    return { ok: true };
  });

/* -------------------------------------------------------------------------- */
/* Vagas e configurações — normalização                                       */
/* -------------------------------------------------------------------------- */

/**
 * Listas de vaga são bem menores que as do currículo: 20 itens de 300 caracteres
 * cobrem com folga "responsabilidades" e "requisitos" reais, e o teto impede que
 * um POST forjado transforme um arquivo de vaga em megabytes de texto.
 */
const MAX_ITENS_VAGA = 20;
const LIMITE_ITEM_VAGA = 300;

function listaVaga(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .slice(0, MAX_ITENS_VAGA)
    .map((item) => texto(item, LIMITE_ITEM_VAGA))
    .filter((item) => item.length > 0);
}

/**
 * Monta a vaga só com o que o painel tem direito de definir. `slug`, `criadoEm`,
 * `atualizadoEm` e `publicadoEm` são deliberadamente deixados vazios aqui: quem
 * carimba é o handler, com a lista completa em mãos. O `id` atravessa porque é
 * ele que diz QUAL vaga está sendo editada — e é conferido contra o disco antes
 * de qualquer escrita.
 */
function montarVaga(bruto: Record<string, unknown>): Vaga {
  const status = uniao<StatusVaga>(
    bruto["status"],
    STATUS_VAGA.map((item) => item.valor),
  );
  const modelo = uniao<ModeloTrabalho>(
    bruto["modelo"],
    MODELOS_TRABALHO.map((item) => item.valor),
  );

  const quantidadeBruta = bruto["quantidade"];
  const quantidade =
    typeof quantidadeBruta === "number" && Number.isFinite(quantidadeBruta)
      ? Math.min(99, Math.max(1, Math.trunc(quantidadeBruta)))
      : 1;

  return {
    ...vagaVazia(),

    id: texto(bruto["id"], 60),
    titulo: texto(bruto["titulo"], 120),

    area: uniao<AreaVaga>(
      bruto["area"],
      AREAS.map((item) => item.valor),
    ),
    vinculo: uniao<Vinculo>(
      bruto["vinculo"],
      VINCULOS.map((item) => item.valor),
    ),
    // Diferente de `area` e `vinculo`, aqui um valor desconhecido não pode virar
    // erro de formulário: o RH nunca digita o status, ele clica. Cai no estado
    // mais seguro, que é o que não publica nada.
    status: status.length > 0 ? status : "rascunho",
    destaque: bruto["destaque"] === true,

    resumo: texto(bruto["resumo"], LIMITE_ITEM_VAGA),
    descricao: texto(bruto["descricao"], LIMITES.textoLongo),
    responsabilidades: listaVaga(bruto["responsabilidades"]),
    requisitos: listaVaga(bruto["requisitos"]),
    diferenciais: listaVaga(bruto["diferenciais"]),
    beneficios: listaVaga(bruto["beneficios"]),
    especialidades: listaVaga(bruto["especialidades"]),

    jornada: texto(bruto["jornada"], 120),
    turnos: listaVaga(bruto["turnos"]),
    local: texto(bruto["local"], LIMITES.localVaga),
    modelo: modelo.length > 0 ? modelo : "presencial",

    salarioMin: texto(bruto["salarioMin"], 30),
    salarioMax: texto(bruto["salarioMax"], 30),
    mostrarSalario: bruto["mostrarSalario"] === true,

    quantidade,
    encerraEm: texto(bruto["encerraEm"], 10),
  };
}

function montarConfiguracoes(bruto: Record<string, unknown>): ConfiguracoesRh {
  const padrao = configuracoesPadrao();

  const tituloPortal = texto(bruto["tituloPortal"], 80);
  const mensagemSemVagas = texto(bruto["mensagemSemVagas"], 500);

  return {
    ...padrao,
    // Estes dois voltam ao padrão quando chegam vazios porque são estruturais:
    // sem título o portal fica sem cabeçalho, e sem a mensagem de "nenhuma vaga"
    // o candidato encontra uma página em branco justamente no pior momento.
    tituloPortal: tituloPortal.length > 0 ? tituloPortal : padrao.tituloPortal,
    mensagemSemVagas: mensagemSemVagas.length > 0 ? mensagemSemVagas : padrao.mensagemSemVagas,

    chamadaPortal: texto(bruto["chamadaPortal"], 400),
    textoSobre: texto(bruto["textoSobre"], LIMITES.textoSobre),
    beneficiosPadrao: listaVaga(bruto["beneficiosPadrao"]),
    emailRh: texto(bruto["emailRh"], 254),
    whatsappRh: texto(bruto["whatsappRh"], 25),
    aceitandoEspontanea: bruto["aceitandoEspontanea"] === true,
    // `=== true`, e não `!== false`. Antes era o contrário, para que um JSON
    // gravado por uma tela antiga (sem a chave) não desligasse a leitura
    // automática em silêncio. A conta do cliente inverteu a prioridade: o erro
    // caro é o outro — uma chave ausente ligar 200 análises que ninguém pediu.
    // Silêncio que custa dinheiro é pior que silêncio que custa um clique.
    analisarAoReceber: bruto["analisarAoReceber"] === true,
    assinaturaRh: texto(bruto["assinaturaRh"], 80),
    atualizadoEm: "",
  };
}

/* -------------------------------------------------------------------------- */
/* Portal público de vagas                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `agoraIso` é o relógio do SERVIDOR no instante da carga, e vai junto de
 * propósito. "Publicada há 16 minutos" é calculado a partir dele: se a tela
 * chamasse `new Date()` no inicializador do estado, o valor nasceria no
 * servidor, renasceria diferente no navegador (relógio adiantado, ou só a
 * virada de um balde de minuto entre o SSR e a hidratação) e o React 19
 * trataria o texto divergente como erro de hidratação, repintando a raiz
 * inteira — justamente na página pública que precisa ser indexada.
 */
export type RespostaPortal = { vagas: Vaga[]; config: ConfiguracoesRh; agoraIso: string };

export const listarVagasPublicas = createServerFn({ method: "GET" }).handler(
  async (): Promise<RespostaPortal> => {
    const { lerConfiguracoes, listarVagas } = await import("./servidor/armazenamento");
    const [todas, config] = await Promise.all([listarVagas(), lerConfiguracoes()]);

    // O filtro é do servidor, não da tela: mandar rascunho para o navegador e
    // esconder no CSS publicaria o texto para quem abrisse o HTML.
    const agora = new Date();
    return {
      vagas: ordenarVagas(todas.filter((v) => vagaAberta(v, agora))),
      config,
      agoraIso: agora.toISOString(),
    };
  },
);

export const obterVagaPublica = createServerFn({ method: "GET" })
  .validator((entrada: unknown): { slug: string } => {
    const bruto = objeto(entrada);
    // Slug vazio NÃO lança: `texto()` faz `trim()`, e um espaço não separável
    // colado do WhatsApp (`/carreiras/%C2%A0`) some ali. Lançar aqui caía no
    // error boundary — 500, com a mensagem técnica no payload — para uma URL
    // que precisa responder 404. Vazio simplesmente não casa com slug nenhum
    // (`gerarSlug` nunca devolve string vazia), o handler responde `vaga: null`
    // e o loader manda para a tela de vaga não encontrada.
    return { slug: texto(bruto["slug"], 120).toLowerCase() };
  })
  .handler(
    async ({
      data,
    }): Promise<{
      vaga: Vaga | null;
      config: ConfiguracoesRh;
      relacionadas: Vaga[];
      agoraIso: string;
    }> => {
      const { lerConfiguracoes, listarVagas } = await import("./servidor/armazenamento");
      const [todas, config] = await Promise.all([listarVagas(), lerConfiguracoes()]);

      const agora = new Date();
      const abertas = ordenarVagas(todas.filter((v) => vagaAberta(v, agora)));

      // Busca só entre as abertas: rascunho, vaga pausada e vaga vencida
      // respondem "não existe". Devolver o conteúdo com um aviso deixaria o
      // texto de uma vaga não publicada visível para quem adivinhasse o slug.
      const vaga = abertas.find((v) => v.slug === data.slug) ?? null;

      // Mesma área primeiro: quem se interessou por uma vaga de ASB tem muito
      // mais chance de servir para outra de ASB do que para o administrativo.
      const relacionadas =
        vaga === null
          ? []
          : [
              ...abertas.filter((v) => v.id !== vaga.id && v.area === vaga.area),
              ...abertas.filter((v) => v.id !== vaga.id && v.area !== vaga.area),
            ].slice(0, 3);

      // Mesmo motivo de `listarVagasPublicas`: os cartões de vagas relacionadas
      // imprimem "Publicada há X" no HTML do servidor.
      return { vaga, config, relacionadas, agoraIso: agora.toISOString() };
    },
  );

/* -------------------------------------------------------------------------- */
/* Vagas e configurações no painel (exige admin)                              */
/* -------------------------------------------------------------------------- */

export type RespostaVagas = { ok: true; itens: Vaga[] } | { ok: false; motivo: string };
export type RespostaVaga = { ok: true; item: Vaga } | { ok: false; motivo: string };
export type RespostaConfig = { ok: true; config: ConfiguracoesRh } | { ok: false; motivo: string };

export const listarVagasAdmin = createServerFn({ method: "GET" }).handler(
  async (): Promise<RespostaVagas> => {
    if (!(await exigirAdmin())) return { ok: false, motivo: NAO_AUTENTICADO };

    const { listarVagas } = await import("./servidor/armazenamento");
    return { ok: true, itens: await listarVagas() };
  },
);

export const salvarVagaAdmin = createServerFn({ method: "POST" })
  .validator((entrada: unknown): { vaga: Vaga } => {
    const bruto = objeto(entrada);
    return { vaga: montarVaga(objeto(bruto["vaga"])) };
  })
  .handler(async ({ data }): Promise<RespostaVaga> => {
    if (!(await exigirAdmin())) return { ok: false, motivo: NAO_AUTENTICADO };

    const erros = validarVaga(data.vaga);
    const primeiro = Object.values(erros)[0];
    if (primeiro !== undefined) return { ok: false, motivo: primeiro };

    const armazenamento = await import("./servidor/armazenamento");
    const todas = await armazenamento.listarVagas();

    const anterior =
      data.vaga.id.length > 0 ? (todas.find((v) => v.id === data.vaga.id) ?? null) : null;
    // Id que não existe mais não vira vaga nova: seria criar um registro
    // silencioso quando o certo é avisar que alguém apagou a vaga em outra aba.
    if (data.vaga.id.length > 0 && anterior === null)
      return { ok: false, motivo: "nao-encontrada" };

    const agoraIso = new Date().toISOString();
    const id = anterior?.id ?? armazenamento.novoIdVaga();

    // O slug é sempre recalculado do título, e a própria vaga fica de fora da
    // lista de concorrentes — senão salvar duas vezes sem mudar nada iria
    // empurrando "recepcionista" para "recepcionista-2", "-3", e cada gravação
    // quebraria o link que a clínica acabou de divulgar.
    const slug = slugUnico(
      gerarSlug(data.vaga.titulo),
      todas.filter((v) => v.id !== id).map((v) => v.slug),
    );

    // Carimbado uma vez só, na primeira publicação: é a data que ordena o portal
    // e que o candidato lê como "publicada em". Repetir o carimbo a cada edição
    // faria uma correção de vírgula empurrar a vaga de volta para o topo.
    const publicadoEm =
      data.vaga.status === "aberta" && (anterior?.publicadoEm ?? "").length === 0
        ? agoraIso
        : (anterior?.publicadoEm ?? "");

    const item: Vaga = {
      ...data.vaga,
      id,
      slug,
      criadoEm: anterior?.criadoEm ?? agoraIso,
      atualizadoEm: agoraIso,
      publicadoEm,
    };

    await armazenamento.salvarVaga(item);
    return { ok: true, item };
  });

export const excluirVagaAdmin = createServerFn({ method: "POST" })
  .validator((entrada: unknown): { id: string } => {
    const bruto = objeto(entrada);
    const id = texto(bruto["id"], 60);
    if (id.length === 0) throw new Error("Vaga não informada.");
    return { id };
  })
  .handler(async ({ data }): Promise<RespostaSimples> => {
    if (!(await exigirAdmin())) return { ok: false, motivo: NAO_AUTENTICADO };

    const { excluirVaga, lerVaga } = await import("./servidor/armazenamento");
    const atual = await lerVaga(data.id);
    if (atual === null) return { ok: false, motivo: "nao-encontrada" };

    await excluirVaga(data.id);
    return { ok: true };
  });

export const obterConfiguracoesAdmin = createServerFn({ method: "GET" }).handler(
  async (): Promise<RespostaConfig> => {
    if (!(await exigirAdmin())) return { ok: false, motivo: NAO_AUTENTICADO };

    const { lerConfiguracoes } = await import("./servidor/armazenamento");
    return { ok: true, config: await lerConfiguracoes() };
  },
);

export const salvarConfiguracoesAdmin = createServerFn({ method: "POST" })
  .validator((entrada: unknown): { config: ConfiguracoesRh } => {
    const bruto = objeto(entrada);
    return { config: montarConfiguracoes(objeto(bruto["config"])) };
  })
  .handler(async ({ data }): Promise<RespostaConfig> => {
    if (!(await exigirAdmin())) return { ok: false, motivo: NAO_AUTENTICADO };

    const { salvarConfiguracoes } = await import("./servidor/armazenamento");
    const config: ConfiguracoesRh = { ...data.config, atualizadoEm: new Date().toISOString() };
    await salvarConfiguracoes(config);
    return { ok: true, config };
  });

/* -------------------------------------------------------------------------- */
/* Triagem por IA (exige admin)                                               */
/* -------------------------------------------------------------------------- */

export type RespostaEstadoIa =
  | {
      ok: true;
      configurada: boolean;
      /** Por que a IA está desligada. "" quando está tudo certo. */
      motivo: string;
      modelo: string;
      pendentes: number;
      analisadas: number;
    }
  | { ok: false; motivo: string };

export type RespostaAnaliseLote =
  | { ok: true; feitos: number; falhas: { id: string; motivo: string }[]; itens: Candidatura[] }
  | { ok: false; motivo: string };

export type RespostaRanking = { ok: true; ranking: RankingSalvo } | { ok: false; motivo: string };

export type RespostaImportacao =
  | { ok: true; criadas: number; duplicadas: number; erros: { arquivo: string; motivo: string }[] }
  | { ok: false; motivo: string };

/**
 * Quantas candidaturas uma única chamada de "analisar todas" processa.
 *
 * Cada análise são duas chamadas ao modelo e pode levar bem mais de um minuto;
 * uma pasta inteira de uma vez estouraria o tempo máximo de resposta da
 * plataforma e o RH veria um erro de rede depois de dez minutos de espera, sem
 * saber quantas foram feitas. Com o teto, a tela chama de novo enquanto
 * `estadoIa().pendentes` for maior que zero — e cada rodada já fica gravada em
 * disco. Para o acervo inteiro (centenas de arquivos), o caminho é o script
 * `scripts/importar-curriculos.mjs`, que roda no terminal sem esse limite.
 */
const MAX_ANALISES_POR_CHAMADA = 20;

/** Uma candidatura precisa de análise quando nunca teve, falhou, ou é de uma versão antiga. */
function precisaAnalisar(c: Candidatura): boolean {
  return c.analise === null || c.analise.erro !== "" || c.analise.versao !== VERSAO_ANALISE;
}

export const estadoIa = createServerFn({ method: "GET" }).handler(
  async (): Promise<RespostaEstadoIa> => {
    if (!(await exigirAdmin())) return { ok: false, motivo: NAO_AUTENTICADO };

    const { iaConfigurada, modeloAtual } = await import("./servidor/openai");
    const { listarTodas } = await import("./servidor/armazenamento");

    const estado = iaConfigurada();
    const todas = await listarTodas();
    const pendentes = todas.filter(precisaAnalisar).length;

    return {
      ok: true,
      configurada: estado.ok,
      motivo: estado.motivo,
      modelo: modeloAtual(),
      pendentes,
      analisadas: todas.length - pendentes,
    };
  },
);

export const analisarUma = createServerFn({ method: "POST" })
  .validator((entrada: unknown): { id: string; forcar: boolean } => {
    const bruto = objeto(entrada);
    const id = texto(bruto["id"], 60);
    if (id.length === 0) throw new Error("Candidatura não informada.");
    return { id, forcar: bruto["forcar"] === true };
  })
  .handler(async ({ data }): Promise<RespostaItem> => {
    if (!(await exigirAdmin())) return { ok: false, motivo: NAO_AUTENTICADO };

    const { analisarCandidatura } = await import("./servidor/analise");
    const resultado = await analisarCandidatura(data.id, { forcar: data.forcar });
    if (!resultado.ok) return { ok: false, motivo: resultado.motivo };

    // Relê do disco em vez de devolver `resultado.analise` solta: a tela adota o
    // item inteiro da resposta, e ele precisa trazer também o nome e o telefone
    // que a leitura acabou de preencher numa ficha importada em branco.
    const { lerCandidatura } = await import("./servidor/armazenamento");
    const item = await lerCandidatura(data.id);
    if (item === null) return { ok: false, motivo: "nao-encontrada" };

    return { ok: true, item };
  });

export const analisarTodas = createServerFn({ method: "POST" })
  .validator((entrada: unknown): { ids: string[]; forcar: boolean } => {
    const bruto = objeto(entrada);
    const brutos = bruto["ids"];
    const ids = Array.isArray(brutos)
      ? brutos
          .slice(0, 500)
          .map((item) => texto(item, 60))
          .filter((item) => item.length > 0)
      : [];
    return { ids, forcar: bruto["forcar"] === true };
  })
  .handler(async ({ data }): Promise<RespostaAnaliseLote> => {
    if (!(await exigirAdmin())) return { ok: false, motivo: NAO_AUTENTICADO };

    const { iaConfigurada } = await import("./servidor/openai");
    const estado = iaConfigurada();
    if (!estado.ok) return { ok: false, motivo: estado.motivo };

    const { lerCandidatura, listarTodas } = await import("./servidor/armazenamento");
    const todas = await listarTodas();

    // Lista vazia significa "todas as pendentes", que é o botão que o RH mais
    // usa. Com `forcar`, "pendente" passa a ser todo mundo.
    const alvos =
      data.ids.length > 0
        ? todas.filter((c) => data.ids.includes(c.id))
        : todas.filter((c) => data.forcar || precisaAnalisar(c));

    const ids = alvos.slice(0, MAX_ANALISES_POR_CHAMADA).map((c) => c.id);
    if (ids.length === 0) return { ok: true, feitos: 0, falhas: [], itens: [] };

    const { analisarVarias } = await import("./servidor/analise");
    const resultado = await analisarVarias(ids);

    const itens: Candidatura[] = [];
    for (const id of ids) {
      const item = await lerCandidatura(id);
      if (item !== null) itens.push(item);
    }

    return { ok: true, feitos: resultado.feitos, falhas: resultado.falhas, itens };
  });

export const gerarRanking = createServerFn({ method: "POST" })
  .validator((entrada: unknown): { area: AreaVaga | ""; vagaId: string } => {
    const bruto = objeto(entrada);
    return {
      area: uniao<AreaVaga>(
        bruto["area"],
        AREAS.map((item) => item.valor),
      ),
      vagaId: texto(bruto["vagaId"], 60),
    };
  })
  .handler(async ({ data }): Promise<RespostaRanking> => {
    if (!(await exigirAdmin())) return { ok: false, motivo: NAO_AUTENTICADO };

    const { montarRanking } = await import("./servidor/analise");
    const resultado = await montarRanking({ area: data.area, vagaId: data.vagaId });
    if (!resultado.ok) return { ok: false, motivo: resultado.motivo };
    return { ok: true, ranking: resultado.ranking };
  });

/* -------------------------------------------------------------------------- */
/* Importação do acervo de currículos                                         */
/* -------------------------------------------------------------------------- */

/** Um lote por vez. Acima disso, o caminho é o script de terminal. */
const MAX_ARQUIVOS_IMPORTACAO = 40;

export const importarCurriculos = createServerFn({ method: "POST" })
  .validator((entrada: unknown): FormData => {
    if (!(entrada instanceof FormData)) {
      throw new Error("Envio inválido: era esperado um formulário.");
    }
    return entrada;
  })
  .handler(async ({ data }): Promise<RespostaImportacao> => {
    if (!(await exigirAdmin())) return { ok: false, motivo: NAO_AUTENTICADO };

    const arquivos = data
      .getAll("arquivos")
      .filter((item): item is File => item instanceof File && item.size > 0);
    if (arquivos.length === 0) return { ok: false, motivo: "Nenhum arquivo foi enviado." };
    if (arquivos.length > MAX_ARQUIVOS_IMPORTACAO) {
      return {
        ok: false,
        motivo: `Envie no máximo ${MAX_ARQUIVOS_IMPORTACAO} arquivos por vez. Para o acervo inteiro, use o script scripts/importar-curriculos.mjs.`,
      };
    }

    const area = uniao<AreaVaga>(
      data.get("area"),
      AREAS.map((item) => item.valor),
    );
    const vagaId = texto(data.get("vagaId"), 60);
    const analisar = texto(data.get("analisar"), 10) === "sim";

    const armazenamento = await import("./servidor/armazenamento");
    const { createHash } = await import("node:crypto");

    const vaga = vagaId.length > 0 ? await armazenamento.lerVaga(vagaId) : null;
    const jaNoAcervo = await armazenamento.listarParaDeduplicacao();
    const hashesConhecidos = new Set(
      jaNoAcervo.map((c) => c.hashArquivo).filter((h) => h.length > 0),
    );

    const erros: { arquivo: string; motivo: string }[] = [];
    const criados: string[] = [];
    let duplicadas = 0;

    for (const arquivo of arquivos) {
      const rotulo = texto(arquivo.name, LIMITE_NOME) || "arquivo sem nome";

      if (arquivo.size > TAMANHO_MAX_CURRICULO) {
        erros.push({
          arquivo: rotulo,
          motivo: `Passa de ${formatarTamanho(TAMANHO_MAX_CURRICULO)}.`,
        });
        continue;
      }

      const nomeArquivo = armazenamento.nomeArquivoSeguro(arquivo.name);
      const corte = nomeArquivo.lastIndexOf(".");
      const extensao = corte > 0 ? nomeArquivo.slice(corte) : "";
      if (!EXTENSOES_CURRICULO.includes(extensao)) {
        erros.push({
          arquivo: rotulo,
          motivo: "Formato não aceito (use PDF, DOC, DOCX, JPG, PNG).",
        });
        continue;
      }

      const bytes = new Uint8Array(await arquivo.arrayBuffer());
      const hash = createHash("sha256").update(bytes).digest("hex");
      // O mesmo PDF costuma aparecer em duas pastas do acervo. Pular por hash é
      // o que torna a importação repetível: rodar de novo não duplica ninguém.
      if (hashesConhecidos.has(hash)) {
        duplicadas += 1;
        continue;
      }
      hashesConhecidos.add(hash);

      const id = armazenamento.novoId();
      await armazenamento.salvarCurriculo(id, nomeArquivo, bytes);

      const carimbo = new Date();
      const protocolo = await armazenamento.proximoProtocolo(carimbo.getFullYear());

      const item: Candidatura = {
        ...candidaturaVazia(),
        id,
        protocolo,
        criadoEm: carimbo.toISOString(),
        atualizadoEm: carimbo.toISOString(),
        vagaId: vaga?.id ?? "",
        vagaTitulo: vaga?.titulo ?? "",
        // Área da vaga escolhida na importação; "outro" quando o RH não disse
        // nada, que é a rubrica genérica.
        area: vaga?.area ?? (area.length > 0 ? area : "outro"),
        // Nome, telefone e e-mail nascem vazios de propósito: quem os descobre é
        // a leitura do documento, e inventar aqui um nome a partir do arquivo
        // ("cv-final-2.pdf") encheria o painel de fichas com nome errado.
        status: "novo",
        curriculo: {
          nomeArquivo,
          nomeOriginal: rotulo,
          tipo: TIPOS_CURRICULO.includes(arquivo.type) ? arquivo.type : "",
          tamanho: arquivo.size,
          enviadoEm: carimbo.toISOString(),
        },
        // Currículo do acervo da própria clínica: não houve formulário, então não
        // há consentimento a registrar. Fica `false` — que é a verdade, e é o que
        // a tela de LGPD precisa ver para tratar esses casos separadamente.
        consentimentoLgpd: false,
        origemArquivo: rotulo,
        hashArquivo: hash,
      };

      await armazenamento.salvarCandidatura(item);
      criados.push(id);
    }

    if (analisar && criados.length > 0) {
      const { analisarVarias } = await import("./servidor/analise");
      const lote = await analisarVarias(criados.slice(0, MAX_ANALISES_POR_CHAMADA));
      for (const falha of lote.falhas) {
        erros.push({ arquivo: falha.id, motivo: falha.motivo });
      }
    }

    return { ok: true, criadas: criados.length, duplicadas, erros };
  });

/* -------------------------------------------------------------------------- */
/* Guia de entrevista (exige admin)                                           */
/* -------------------------------------------------------------------------- */

export type RespostaGuias = { ok: true; itens: GuiaEntrevista[] } | { ok: false; motivo: string };
export type RespostaGuia = { ok: true; item: GuiaEntrevista } | { ok: false; motivo: string };

/** Tetos do guia. Um guia grande é um guia real (15 perguntas, 10 critérios); um guia gigante é POST forjado. */
const MAX_PERGUNTAS_GUIA = 40;
const MAX_CRITERIOS_GUIA = 20;
const LIMITE_PERGUNTA = 400;

/**
 * Monta o guia só com o que o painel tem direito de definir.
 *
 * `slug`, `criadoEm` e `atualizadoEm` ficam vazios de propósito: quem carimba é
 * o handler, com a lista completa em mãos. O `id` atravessa porque é ele que diz
 * QUAL guia está sendo editado — e é conferido contra o disco antes de gravar.
 */
function montarGuia(bruto: Record<string, unknown>): GuiaEntrevista {
  const notaBruta = bruto["notaMaxima"];
  const notaMaxima =
    typeof notaBruta === "number" && Number.isFinite(notaBruta)
      ? Math.min(10, Math.max(1, Math.trunc(notaBruta)))
      : 5;

  // As chaves são geradas a partir do rótulo, e não digitadas: o RH escreve
  // "Rotinas financeiras", não "rotinas-financeiras". A desambiguação por
  // sufixo evita que dois critérios com nomes parecidos disputem a mesma linha
  // da tabela de notas — o que faria a soma /50 depender da ordem de render.
  const usadas = new Set<string>();
  const criteriosBrutos = Array.isArray(bruto["criterios"]) ? bruto["criterios"] : [];
  const criterios: CriterioGuia[] = criteriosBrutos
    .slice(0, MAX_CRITERIOS_GUIA)
    .map((item): CriterioGuia => {
      const c = objeto(item);
      const rotulo = texto(c["rotulo"], 80);
      const base = texto(c["chave"], 40) || chaveDeCriterio(rotulo);
      let chave = base;
      let n = 2;
      while (usadas.has(chave)) {
        chave = `${base}-${n}`;
        n += 1;
      }
      usadas.add(chave);
      return {
        chave,
        rotulo,
        soNaEntrevista: c["soNaEntrevista"] === true,
        descricao: texto(c["descricao"], 300),
      };
    })
    .filter((c) => c.rotulo.length > 0);

  return {
    ...guiaVazio(),

    id: texto(bruto["id"], 60),
    titulo: texto(bruto["titulo"], 120),
    area: uniao<AreaVaga>(
      bruto["area"],
      AREAS.map((item) => item.valor),
    ),
    vagaId: texto(bruto["vagaId"], 60),
    padrao: bruto["padrao"] === true,

    entrevistadores: texto(bruto["entrevistadores"], 200),
    objetivo: texto(bruto["objetivo"], 600),

    perguntasGerais: Array.isArray(bruto["perguntasGerais"])
      ? bruto["perguntasGerais"]
          .slice(0, MAX_PERGUNTAS_GUIA)
          .map((item) => texto(item, LIMITE_PERGUNTA))
          .filter((item) => item.length > 0)
      : [],
    criterios,
    sinaisObservacao: Array.isArray(bruto["sinaisObservacao"])
      ? bruto["sinaisObservacao"]
          .slice(0, MAX_CRITERIOS_GUIA)
          .map((item) => texto(item, 200))
          .filter((item) => item.length > 0)
      : [],
    // Cai na nota da clínica quando chega vazia: é ela que vira restrição dura
    // no prompt da ficha, e um guia sem nota ética deixaria a IA sem o limite
    // que a própria JP escreveu.
    notaEtica: texto(bruto["notaEtica"], 1000) || NOTA_ETICA_JP,
    regrasDesempate: Array.isArray(bruto["regrasDesempate"])
      ? bruto["regrasDesempate"]
          .slice(0, 10)
          .map((item) => texto(item, LIMITE_PERGUNTA))
          .filter((item) => item.length > 0)
      : [],
    notaMaxima,
    // A marca de "guia derivado" atravessa porque quem a desliga é uma pessoa,
    // no botão de revisão do painel: se ela fosse recalculada aqui, o aviso
    // voltaria a cada salvamento e a clínica aprenderia a ignorá-lo.
    derivado: bruto["derivado"] === true,
    decisaoFinal: montarDecisaoFinal(objeto(bruto["decisaoFinal"])),
  };
}

/**
 * A folha de decisão final, só com o que a tela tem direito de escrever.
 *
 * `registradaEm` fica de fora de propósito: data que a tela manda é data que um
 * POST forja. Quem carimba é o handler, comparando com o que já estava no
 * disco — assim "decidido em 12/09" significa mesmo o dia em que a clínica
 * decidiu, e não a última vez que alguém salvou uma vírgula do guia.
 */
function montarDecisaoFinal(bruto: Record<string, unknown>): DecisaoFinal {
  return {
    ...decisaoFinalVazia(),
    escolhidaId: texto(bruto["escolhidaId"], 60),
    escolhidaNome: texto(bruto["escolhidaNome"], LIMITE_NOME),
    reservaId: texto(bruto["reservaId"], 60),
    reservaNome: texto(bruto["reservaNome"], LIMITE_NOME),
    motivo: texto(bruto["motivo"], 1200),
    referenciasPendentes: texto(bruto["referenciasPendentes"], 1200),
  };
}

/** Só o conteúdo conta para decidir se a decisão mudou; o carimbo é consequência. */
function mesmaDecisao(a: DecisaoFinal, b: DecisaoFinal): boolean {
  return (
    a.escolhidaId === b.escolhidaId &&
    a.escolhidaNome === b.escolhidaNome &&
    a.reservaId === b.reservaId &&
    a.reservaNome === b.reservaNome &&
    a.motivo === b.motivo &&
    a.referenciasPendentes === b.referenciasPendentes
  );
}

function decisaoEmBranco(d: DecisaoFinal): boolean {
  return (
    d.escolhidaId.length === 0 &&
    d.escolhidaNome.length === 0 &&
    d.reservaId.length === 0 &&
    d.reservaNome.length === 0 &&
    d.motivo.length === 0 &&
    d.referenciasPendentes.length === 0
  );
}

export const listarGuiasAdmin = createServerFn({ method: "GET" }).handler(
  async (): Promise<RespostaGuias> => {
    if (!(await exigirAdmin())) return { ok: false, motivo: NAO_AUTENTICADO };

    const { listarGuias } = await import("./servidor/armazenamento");
    return { ok: true, itens: await listarGuias() };
  },
);

export const salvarGuiaAdmin = createServerFn({ method: "POST" })
  .validator((entrada: unknown): { guia: GuiaEntrevista } => {
    const bruto = objeto(entrada);
    return { guia: montarGuia(objeto(bruto["guia"])) };
  })
  .handler(async ({ data }): Promise<RespostaGuia> => {
    if (!(await exigirAdmin())) return { ok: false, motivo: NAO_AUTENTICADO };

    const erros = validarGuia(data.guia);
    const primeiro = Object.values(erros)[0];
    if (primeiro !== undefined) return { ok: false, motivo: primeiro };

    const armazenamento = await import("./servidor/armazenamento");
    const todos = await armazenamento.listarGuias();

    const anterior =
      data.guia.id.length > 0 ? (todos.find((g) => g.id === data.guia.id) ?? null) : null;
    // Id que não existe mais não vira guia novo: seria criar um registro
    // silencioso quando o certo é avisar que alguém apagou o guia em outra aba.
    if (data.guia.id.length > 0 && anterior === null) {
      return { ok: false, motivo: "nao-encontrada" };
    }

    const agoraIso = new Date().toISOString();
    const id = anterior?.id ?? armazenamento.novoIdGuia();
    const slug = slugUnico(
      gerarSlug(data.guia.titulo),
      todos.filter((g) => g.id !== id).map((g) => g.slug),
    );

    // Carimbo da decisão: só muda quando o conteúdo muda. Apagar a folha zera o
    // carimbo junto — uma decisão em branco com data seria a tela afirmando que
    // a clínica decidiu algo naquele dia.
    const decisaoAnterior = anterior?.decisaoFinal ?? decisaoFinalVazia();
    const decisaoFinal: DecisaoFinal = {
      ...data.guia.decisaoFinal,
      registradaEm: decisaoEmBranco(data.guia.decisaoFinal)
        ? ""
        : mesmaDecisao(decisaoAnterior, data.guia.decisaoFinal)
          ? decisaoAnterior.registradaEm
          : agoraIso,
    };

    const item: GuiaEntrevista = {
      ...data.guia,
      id,
      slug,
      decisaoFinal,
      criadoEm: anterior?.criadoEm ?? agoraIso,
      atualizadoEm: agoraIso,
    };

    await armazenamento.salvarGuia(item);

    // No máximo um guia padrão por área: marcar este desmarca o outro. Sem
    // isso, `guiaParaVaga` escolheria pelo acaso da ordenação, e duas
    // candidatas da mesma vaga poderiam ser entrevistadas por métodos
    // diferentes — que é exatamente o que o guia da clínica existe para evitar.
    if (item.padrao) {
      for (const outro of todos) {
        if (outro.id === id || outro.area !== item.area || !outro.padrao) continue;
        await armazenamento.salvarGuia({ ...outro, padrao: false, atualizadoEm: agoraIso });
      }
    }

    return { ok: true, item };
  });

export const excluirGuiaAdmin = createServerFn({ method: "POST" })
  .validator((entrada: unknown): { id: string } => {
    const bruto = objeto(entrada);
    const id = texto(bruto["id"], 60);
    if (id.length === 0) throw new Error("Guia não informado.");
    return { id };
  })
  .handler(async ({ data }): Promise<RespostaSimples> => {
    if (!(await exigirAdmin())) return { ok: false, motivo: NAO_AUTENTICADO };

    const { excluirGuia, lerGuia } = await import("./servidor/armazenamento");
    const atual = await lerGuia(data.id);
    if (atual === null) return { ok: false, motivo: "nao-encontrada" };

    // As fichas já geradas por este guia continuam válidas: elas guardam
    // `guiaTitulo` junto do id, então a ficha impressa continua dizendo por
    // qual método foi feita mesmo depois de o guia sair do ar.
    await excluirGuia(data.id);
    return { ok: true };
  });

/* -------------------------------------------------------------------------- */
/* Ficha de entrevista (exige admin)                                          */
/* -------------------------------------------------------------------------- */

export const gerarFichaAdmin = createServerFn({ method: "POST" })
  .validator((entrada: unknown): { id: string; forcar: boolean } => {
    const bruto = objeto(entrada);
    const id = texto(bruto["id"], 60);
    if (id.length === 0) throw new Error("Candidatura não informada.");
    return { id, forcar: bruto["forcar"] === true };
  })
  .handler(async ({ data }): Promise<RespostaItem> => {
    if (!(await exigirAdmin())) return { ok: false, motivo: NAO_AUTENTICADO };

    const { gerarFicha } = await import("./servidor/analise");
    const resultado = await gerarFicha(data.id, { forcar: data.forcar });
    if (!resultado.ok) return { ok: false, motivo: resultado.motivo };

    // Relê do disco pelo mesmo motivo de `analisarUma`: a tela adota o item
    // inteiro da resposta, e ele precisa trazer também a análise que pode ter
    // acabado de rodar junto (e o nome preenchido por ela).
    const { lerCandidatura } = await import("./servidor/armazenamento");
    const item = await lerCandidatura(data.id);
    if (item === null) return { ok: false, motivo: "nao-encontrada" };

    return { ok: true, item };
  });

/**
 * O que o entrevistador pode escrever na ficha. Nada da IA entra aqui.
 *
 * A lista branca existe pela mesma razão de `CamposGeriveis`, com um agravante:
 * `pontoForte`, `oQueValidar`, `perguntasEspecificas`, `notasSugeridas`,
 * `geradaEm` e `modelo` são o REGISTRO de que a IA escreveu aquilo, naquele
 * momento, com aquele modelo. Se a tela pudesse reenviar esses campos, bastaria
 * um POST (ou um bug de formulário devolvendo o estado local) para a ficha
 * passar a dizer que a IA sugeriu nota 5 em um critério onde ela nunca opinou —
 * e a clínica decide contratação com essa folha impressa na mão. Quem quiser
 * mudar o texto da IA gera de novo; quem quiser discordar dela escreve na
 * evidência da própria nota.
 */
type CamposDaFicha = Pick<
  FichaEntrevista,
  | "entrevistaEm"
  | "horario"
  | "entrevistadores"
  | "respostasTriagem"
  | "respostasPerguntas"
  | "notas"
  | "sinaisObservados"
  // Leitura e resposta do roteiro de dúvidas entram porque são do entrevistador:
  // quem marca "não convenceu" é quem estava na sala. A IA levanta a dúvida
  // (isso vem de `perguntasEspecificas` e dos sinais, que ela não pode reenviar),
  // o humano decide o que a resposta significa.
  | "leiturasDuvidas"
  | "respostasDuvidas"
  | "impressao"
  | "decisao"
  | "evidenciaPositiva"
  | "duvidaAberta"
  | "motivoParaAvancar"
  | "checarAntesDeContratar"
>;

/** Teto de itens em cada lista da ficha: o guia da JP tem 4 + 4 e 10 critérios. */
const MAX_ITENS_FICHA = 20;

/**
 * Teto de dúvidas anotadas em uma ficha.
 *
 * `montarDuvidas` soma triagem (4), o catálogo de sinais (~16), as perguntas da
 * ficha (4) e as da análise (4) e ainda deduplica, então na prática fica bem
 * abaixo disso. 60 dá folga para o catálogo crescer sem transformar a ficha em
 * depósito de qualquer coisa que um POST resolva mandar.
 */
const MAX_DUVIDAS_FICHA = 60;

/**
 * O formato dos ids que `duvidas.ts` gera: origem, hífen, chave da origem —
 * `triagem-2`, `sinal-ultimo-curto`, `analise-0`.
 */
const ID_DUVIDA = /^[a-z]+-[A-Za-z0-9-]+$/;

function idDeDuvida(chave: string): boolean {
  return chave.length <= 60 && ID_DUVIDA.test(chave);
}

/**
 * Leituras e respostas do roteiro, filtradas chave a chave.
 *
 * Chave fora do formato, leitura fora das quatro conhecidas: **descarta em
 * silêncio, sem lançar**. É deliberado. O id da dúvida nasce do currículo
 * analisado, e o RH deixa a gaveta aberta enquanto conversa — se o currículo for
 * reanalisado no meio da entrevista, a aba dela continua com ids de uma versão
 * anterior. Recusar o salvamento inteiro por causa de um id vencido faria a
 * pessoa perder a entrevista escrita à mão para proteger um registro que ela nem
 * consegue mais ver. O que ainda é válido é salvo; o que envelheceu cai fora,
 * que é o mesmo destino que `limparLeiturasOrfas` dá a ele.
 */
function leiturasDeDuvidas(bruto: unknown): Record<string, LeituraResposta> {
  const saida: Record<string, LeituraResposta> = {};
  for (const [chave, valor] of Object.entries(objeto(bruto))) {
    if (Object.keys(saida).length >= MAX_DUVIDAS_FICHA) break;
    if (!idDeDuvida(chave)) continue;
    const leitura = uniao<LeituraResposta>(
      valor,
      LEITURAS.map((o) => o.valor),
    );
    // `""` é "ainda não li esta dúvida", e é também o que `uniao` devolve para
    // valor desconhecido. Não guardar a chave diz a mesma coisa com menos ruído:
    // `duvidasEmAberto` já trata id ausente como não lido.
    if (leitura === "") continue;
    saida[chave] = leitura;
  }
  return saida;
}

function respostasDeDuvidas(bruto: unknown): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const [chave, valor] of Object.entries(objeto(bruto))) {
    if (Object.keys(saida).length >= MAX_DUVIDAS_FICHA) break;
    if (!idDeDuvida(chave)) continue;
    // Mesmo teto das outras anotações abertas da ficha: 2000 caracteres cortados
    // sem erro, porque anotação de entrevista é digitada com pressa e ninguém
    // quer descobrir no fim da conversa que o texto não coube.
    const resposta = texto(valor, 2000);
    if (resposta.length === 0) continue;
    saida[chave] = resposta;
  }
  return saida;
}

function montarCamposDaFicha(bruto: Record<string, unknown>): CamposDaFicha {
  const respostasTriagem: RespostaItemTriagem[] = Array.isArray(bruto["respostasTriagem"])
    ? bruto["respostasTriagem"]
        .slice(0, MAX_ITENS_FICHA)
        .map((item): RespostaItemTriagem => {
          const r = objeto(item);
          return {
            pergunta: texto(r["pergunta"], 400),
            resposta: uniao<RespostaTriagem>(
              r["resposta"],
              RESPOSTAS_TRIAGEM.map((o) => o.valor),
            ),
            observacao: texto(r["observacao"], 1000),
          };
        })
        .filter((r) => r.pergunta.length > 0)
    : [];

  const respostasPerguntas: RespostaPergunta[] = Array.isArray(bruto["respostasPerguntas"])
    ? bruto["respostasPerguntas"]
        .slice(0, MAX_ITENS_FICHA)
        .map((item): RespostaPergunta => {
          const r = objeto(item);
          return { pergunta: texto(r["pergunta"], 400), resposta: texto(r["resposta"], 2000) };
        })
        .filter((r) => r.pergunta.length > 0)
    : [];

  const notas: NotaFicha[] = Array.isArray(bruto["notas"])
    ? bruto["notas"]
        .slice(0, MAX_ITENS_FICHA)
        .map((item): NotaFicha => {
          const n = objeto(item);
          const valor = n["nota"];
          // `null` é "ainda não pontuei" e precisa atravessar: transformar em 0
          // faria uma ficha em branco somar zero como se a candidata tivesse
          // ido mal em tudo. O teto é 10 porque `notaMaxima` do guia vai até
          // lá; o guia da JP usa 5.
          const nota =
            typeof valor === "number" && Number.isFinite(valor)
              ? Math.min(10, Math.max(0, Math.round(valor)))
              : null;
          return { chave: texto(n["chave"], 40), nota, evidencia: texto(n["evidencia"], 1000) };
        })
        .filter((n) => n.chave.length > 0)
    : [];

  return {
    entrevistaEm: texto(bruto["entrevistaEm"], 10),
    horario: texto(bruto["horario"], 5),
    entrevistadores: texto(bruto["entrevistadores"], 200),
    respostasTriagem,
    respostasPerguntas,
    notas,
    // Os sinais marcados atravessam como texto: é assim que a ficha os guarda,
    // para o registro continuar dizendo o que foi observado mesmo depois de
    // alguém reordenar ou reescrever a lista de sinais do guia.
    sinaisObservados: Array.isArray(bruto["sinaisObservados"])
      ? bruto["sinaisObservados"]
          .slice(0, MAX_ITENS_FICHA)
          .map((s) => texto(s, 200))
          .filter((s) => s.length > 0)
      : [],
    leiturasDuvidas: leiturasDeDuvidas(bruto["leiturasDuvidas"]),
    respostasDuvidas: respostasDeDuvidas(bruto["respostasDuvidas"]),
    impressao: uniao<ImpressaoFicha>(
      bruto["impressao"],
      IMPRESSOES.map((o) => o.valor),
    ),
    decisao: uniao<DecisaoFicha>(
      bruto["decisao"],
      DECISOES.map((o) => o.valor),
    ),
    evidenciaPositiva: texto(bruto["evidenciaPositiva"], 2000),
    duvidaAberta: texto(bruto["duvidaAberta"], 2000),
    motivoParaAvancar: texto(bruto["motivoParaAvancar"], 2000),
    checarAntesDeContratar: texto(bruto["checarAntesDeContratar"], 2000),
  };
}

export const salvarFichaAdmin = createServerFn({ method: "POST" })
  .validator((entrada: unknown): { id: string; campos: CamposDaFicha } => {
    const bruto = objeto(entrada);
    const id = texto(bruto["id"], 60);
    if (id.length === 0) throw new Error("Candidatura não informada.");
    return { id, campos: montarCamposDaFicha(objeto(bruto["ficha"])) };
  })
  .handler(async ({ data }): Promise<RespostaItem> => {
    if (!(await exigirAdmin())) return { ok: false, motivo: NAO_AUTENTICADO };

    const agoraIso = new Date().toISOString();

    // Ciclo ler-mesclar-gravar inteiro dentro da fila, como em
    // `atualizarCandidatura`: salvar a ficha enquanto a IA regenera a parte dela
    // não pode ressuscitar o texto antigo do modelo, nem o contrário.
    const { atualizarCandidaturaNoDisco } = await import("./servidor/armazenamento");
    const item = await atualizarCandidaturaNoDisco(data.id, (atual) => {
      // Ficha ainda não gerada: o entrevistador pode ter anotado antes de mandar
      // gerar (uma conversa que aconteceu no balcão), e isso não se perde.
      const base = atual.ficha ?? fichaVazia();
      return {
        ...atual,
        ficha: { ...base, ...data.campos, atualizadaEm: agoraIso },
        atualizadoEm: agoraIso,
      };
    });
    if (item === null) return { ok: false, motivo: "nao-encontrada" };

    return { ok: true, item };
  });
