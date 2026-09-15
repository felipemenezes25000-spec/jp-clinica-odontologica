import { tratamentoDaRota } from "./rotas";

/**
 * DE ONDE ESTA VISITA VEIO — a camada de atribuição do site público.
 *
 * ============================================================================
 *  POR QUE ELA EXISTE SEPARADA DA DO CRC.
 *
 *  `src/lib/crc/aplicacao/leads.ts` já lê UTM, `gclid` e `fbclid` — mas só no
 *  servidor, e só quando alguém envia o formulário com o banco do CRC no ar.
 *  A primeira fase de tráfego pago não tem CRC operacional e converte por
 *  WhatsApp, onde não há POST nenhum para o servidor ler.
 *
 *  Então esta camada é do navegador: ela captura a atribuição na PRIMEIRA
 *  entrada, guarda pela sessão, e entrega a quem precisar — o evento de
 *  conversão e a referência curta que vai na mensagem do WhatsApp.
 *
 *  As duas leem os mesmos parâmetros de propósito. Quando o CRC entrar, os
 *  números têm de bater; se uma lesse `utm_campaign` e a outra `campaign`, a
 *  conciliação viraria trabalho manual para sempre.
 * ============================================================================
 *
 * O QUE ELA NUNCA GUARDA: telefone, nome, e-mail, texto livre, nada de saúde.
 * A querystring inteira também não — só os campos conhecidos, um a um. É a
 * diferença entre guardar "veio da campanha de implante" e guardar, sem querer,
 * o telefone que alguém pôs num parâmetro.
 */

/** Um valor de parâmetro nunca passa disto. Campanha longa é campanha mal
 *  nomeada, e o teto evita que uma URL forjada encha o sessionStorage. */
const LIMITE = 120;

export type Atribuicao = {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  gclid: string | null;
  fbclid: string | null;
  /**
   * Os dois identificadores de clique do Google para tráfego de app e de web
   * quando o `gclid` não é possível (iOS/consentimento). Custam duas linhas e
   * evitam que uma campanha inteira chegue como "orgânico".
   */
  gbraid: string | null;
  wbraid: string | null;
  /** Só o caminho. A querystring já foi decomposta acima; repeti-la aqui
   *  duplicaria dado pessoal no dia em que alguém puser telefone num parâmetro. */
  landingPage: string | null;
  /** O slug do tratamento da página de entrada, quando ela for de tratamento. */
  tratamento: string | null;
};

export const ATRIBUICAO_VAZIA: Atribuicao = {
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  utmContent: null,
  utmTerm: null,
  gclid: null,
  fbclid: null,
  gbraid: null,
  wbraid: null,
  landingPage: null,
  tratamento: null,
};

/**
 * Limpa um valor vindo da URL.
 *
 * Tira controle e quebra de linha porque o valor vai parar em duas telas que
 * não esperam isso — o relatório e, pela referência curta, a mensagem do
 * WhatsApp. Um `\n` numa UTM quebraria a mensagem em duas.
 */
function limpar(bruto: string | null): string | null {
  if (bruto === null) return null;

  /*
   * A troca é por CÓDIGO, e não por expressão regular, de propósito.
   *
   * A classe equivalente (`[\x00-\x1f\x7f]`) cai na regra `no-control-regex` do
   * ESLint — que está certa no geral e errada aqui, já que remover caractere de
   * controle é exatamente o objetivo. A alternativa era um `eslint-disable`, e
   * ele vive brigando com o Prettier pela linha em que fica. Percorrer os
   * caracteres não precisa de supressão nenhuma e diz o que faz.
   */
  let semControle = "";
  for (const caractere of bruto) {
    const codigo = caractere.codePointAt(0) ?? 0;
    semControle += codigo < 0x20 || codigo === 0x7f ? " " : caractere;
  }

  const limpo = semControle.trim().slice(0, LIMITE);
  return limpo.length === 0 ? null : limpo;
}

/**
 * Extrai a atribuição de uma URL. **Pura** — é o que a torna testável sem
 * navegador, e o que permite ao servidor usá-la se um dia precisar.
 *
 * Nunca lança: uma URL malformada devolve atribuição vazia. Perder a origem é
 * ruim; perder o visitante por causa de uma exceção num parâmetro é pior.
 */
export function lerAtribuicao(url: string | null | undefined): Atribuicao {
  if (url === null || url === undefined || url.length === 0) return { ...ATRIBUICAO_VAZIA };

  try {
    const u = new URL(url);
    const p = (chave: string) => limpar(u.searchParams.get(chave));

    return {
      utmSource: p("utm_source"),
      utmMedium: p("utm_medium"),
      utmCampaign: p("utm_campaign"),
      utmContent: p("utm_content"),
      utmTerm: p("utm_term"),
      gclid: p("gclid"),
      fbclid: p("fbclid"),
      gbraid: p("gbraid"),
      wbraid: p("wbraid"),
      landingPage: u.pathname.slice(0, 300),
      tratamento: tratamentoDaRota(u.pathname),
    };
  } catch {
    return { ...ATRIBUICAO_VAZIA };
  }
}

/** Se veio alguma marca de campanha. Sem isso, a visita é orgânica ou direta —
 *  e nenhuma referência é mostrada ao paciente. */
export function temCampanha(a: Atribuicao): boolean {
  return (
    a.utmSource !== null ||
    a.utmCampaign !== null ||
    a.utmMedium !== null ||
    a.gclid !== null ||
    a.fbclid !== null ||
    a.gbraid !== null ||
    a.wbraid !== null
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* A referência curta que a recepção lê                                       */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Três letras por tratamento. Fixas e explícitas: derivar do slug daria "IMP"
 * para implantes e "IMP" para nada mais hoje, mas geraria colisão no dia em que
 * entrar "implante-unitario" — e uma colisão silenciosa num código que a
 * recepção anota à mão é pior do que oito linhas de tabela.
 */
const SIGLA: Readonly<Record<string, string>> = {
  "implantes-dentarios": "IMP",
  "proteses-dentarias": "PRO",
  ortodontia: "ORT",
  "clareamento-dental": "CLA",
  odontopediatria: "ODP",
  restauracoes: "RES",
  "limpeza-profilaxia": "LIM",
  "harmonizacao-orofacial": "HAR",
};

/** Uma letra por origem. `gclid`/`gbraid`/`wbraid` vencem a UTM pelo mesmo
 *  motivo do CRC: a plataforma põe o identificador, e humano digita "gogle". */
function letraDoCanal(a: Atribuicao): string {
  if (a.gclid !== null || a.gbraid !== null || a.wbraid !== null) return "G";
  if (a.fbclid !== null) return "M";

  const fonte = (a.utmSource ?? "").toLowerCase();
  if (fonte.includes("google")) return "G";
  if (fonte.includes("insta") || fonte.includes("face") || fonte.includes("meta")) return "M";
  return "O";
}

/** O criativo, reduzido ao que cabe num bloco de anotação: letras e dígitos,
 *  caixa alta, no máximo seis. "video03" vira "VIDEO0"; "a01" fica "A01". */
function pedacoDoCriativo(a: Atribuicao): string | null {
  const bruto = a.utmContent ?? a.utmCampaign;
  if (bruto === null) return null;
  const so = bruto.toUpperCase().replace(/[^A-Z0-9]/gu, "");
  return so.length === 0 ? null : so.slice(0, 6);
}

/**
 * `IMP-G-A01` — curto, sem dado pessoal, fácil de ditar no telefone.
 *
 * Devolve `null` quando não há campanha, e é por isso que a mensagem orgânica
 * continua exatamente como era. Nunca sai daqui um `gclid`: são 90 caracteres
 * de ruído que o paciente lê antes da recepção, e que não dizem nada a ela.
 */
export function referenciaCurta(a: Atribuicao): string | null {
  if (!temCampanha(a)) return null;

  const partes = [
    a.tratamento !== null ? (SIGLA[a.tratamento] ?? "JP") : "JP",
    letraDoCanal(a),
    pedacoDoCriativo(a),
  ].filter((p): p is string => p !== null && p.length > 0);

  return partes.join("-");
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Persistência de sessão                                                     */
/* ────────────────────────────────────────────────────────────────────────── */

const CHAVE = "jp:atribuicao";

/**
 * SESSIONSTORAGE, E NÃO LOCALSTORAGE — e não é detalhe.
 *
 * A atribuição pertence a ESTA visita. Guardada em `localStorage`, a campanha
 * de setembro continuaria carimbando o contato que a pessoa faz em dezembro
 * depois de chegar pelo Google orgânico — e a clínica pagaria duas vezes pelo
 * mesmo paciente no relatório. A sessão termina, a atribuição termina.
 *
 * Também é o que mantém a coisa proporcional do lado da privacidade: nada aqui
 * sobrevive ao fechamento da aba, e nada aqui identifica pessoa.
 */
function lerGuardado(): Atribuicao | null {
  try {
    const cru = sessionStorage.getItem(CHAVE);
    if (cru === null) return null;
    const objeto = JSON.parse(cru) as Partial<Atribuicao>;
    return { ...ATRIBUICAO_VAZIA, ...objeto };
  } catch {
    return null;
  }
}

/**
 * Guarda a atribuição da PRIMEIRA entrada e devolve a que vale para a sessão.
 *
 * FIRST-TOUCH, e a escolha tem consequência: quem chega pelo anúncio, navega
 * para a home e volta para a LP continua atribuído ao anúncio. Sobrescrever a
 * cada navegação interna faria toda conversão parecer orgânica, porque o último
 * clique quase sempre é interno — é o erro clássico dessa camada.
 *
 * A exceção é chegar de NOVO com campanha: uma segunda entrada paga, na mesma
 * sessão, é um clique que a clínica pagou de novo e precisa aparecer.
 */
export function registrarEntrada(url: string): Atribuicao {
  const atual = lerAtribuicao(url);
  const guardada = lerGuardado();

  if (guardada !== null && !temCampanha(atual)) return guardada;

  const valendo = temCampanha(atual) ? atual : (guardada ?? atual);
  try {
    sessionStorage.setItem(CHAVE, JSON.stringify(valendo));
  } catch {
    /* modo privado pode bloquear; a atribuição então só não sobrevive à navegação */
  }
  return valendo;
}

/** A atribuição desta sessão, sem tocar em nada. Fora do navegador, vazia. */
export function atribuicaoDaSessao(): Atribuicao {
  if (typeof window === "undefined") return { ...ATRIBUICAO_VAZIA };
  return lerGuardado() ?? { ...ATRIBUICAO_VAZIA };
}

/**
 * Os campos da atribuição achatados para dentro de um evento, sem as chaves
 * nulas. GA4 e GTM lidam mal com `undefined`, e um relatório cheio de "(not
 * set)" é pior do que um campo ausente.
 */
export function camposDeAtribuicao(a: Atribuicao): Record<string, string> {
  const pares: [string, string | null][] = [
    ["utm_source", a.utmSource],
    ["utm_medium", a.utmMedium],
    ["utm_campaign", a.utmCampaign],
    ["utm_content", a.utmContent],
    ["utm_term", a.utmTerm],
    ["gclid", a.gclid],
    ["fbclid", a.fbclid],
    ["gbraid", a.gbraid],
    ["wbraid", a.wbraid],
    ["landing_page", a.landingPage],
  ];

  const saida: Record<string, string> = {};
  for (const [chave, valor] of pares) if (valor !== null) saida[chave] = valor;
  return saida;
}
