/**
 * Os campos de um Instant Form, normalizados — §18.2.
 *
 * ============================================================================
 *  O §18.2 PROÍBE, COM ESTAS PALAVRAS:
 *
 *      campo[0] = nome
 *      campo[1] = telefone
 *
 *  E a proibição é sobre um defeito que acontece de verdade, toda vez: o
 *  Instant Form é EDITADO no Gerenciador de Anúncios. Alguém sobe a pergunta
 *  "melhor horário para ligar?" para o segundo lugar, e a partir daquele
 *  instante todo lead novo entra com o horário no campo de telefone.
 *
 *  Ninguém descobre no dia. Descobre-se quando a recepção liga para "manhã".
 * ============================================================================
 *
 * ============================================================================
 *  E O SEGUNDO REQUISITO É IGUALMENTE IMPORTANTE: O IMPORTADOR NUNCA QUEBRA
 *  POR CAMPO DESCONHECIDO.
 *
 *  A clínica acrescenta "você tem convênio?" ao formulário. O CRC não conhece
 *  esse campo. As duas saídas erradas são:
 *
 *    LANÇAR   → o lead não entra. Uma pergunta nova no formulário derruba a
 *               aquisição inteira, e a campanha continua gastando.
 *
 *    IGNORAR  → o lead entra sem a resposta. A clínica perguntou porque queria
 *               saber, e a informação que ela pagou para coletar é jogada fora
 *               em silêncio.
 *
 *  A saída certa é a terceira: guardar de forma controlada. Os conhecidos vão
 *  para coluna; os desconhecidos, para `crc_leads.campos` (jsonb), com a
 *  pergunta original como chave.
 * ============================================================================
 *
 * ARQUIVO PURO. É o que permite testar "a ordem dos campos mudou" sem Meta, sem
 * banco e sem rede — que é o teste do §52 nominalmente pedido.
 */

/* -------------------------------------------------------------------------- */
/* A entrada                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Um par do `field_data` da Meta.
 *
 * O formato oficial é `{ name: "phone_number", values: ["+5511..."] }` — uma
 * LISTA de valores, mesmo para campo de texto único. Checkbox múltiplo traz
 * vários; tudo o mais traz um.
 */
export type CampoDoFormulario = {
  name: string;
  values: readonly string[];
};

export type CamposNormalizados = {
  nome: string | null;
  telefone: string | null;
  email: string | null;
  /**
   * O que não cabe nas três colunas, com a pergunta como chave.
   *
   * A CHAVE É O `name` ORIGINAL, e não uma versão "limpa" dele: é assim que
   * quem for conferir no Gerenciador de Anúncios encontra a mesma pergunta. Um
   * `slug` nosso obrigaria a traduzir de volta.
   */
  extras: Record<string, string>;
  /**
   * Quantos campos vieram e não foram reconhecidos como contato.
   *
   * Não é estatística: é o que faz a tela poder dizer "este formulário tem 4
   * perguntas além do contato" em vez de esconder que existem.
   */
  desconhecidos: number;
};

/* -------------------------------------------------------------------------- */
/* Os apelidos                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Os nomes que a Meta usa para a MESMA coisa.
 *
 * ============================================================================
 *  A LISTA NÃO É DEFENSIVA — ELA É NECESSÁRIA.
 *
 *  A Meta emite nomes diferentes conforme o formulário foi montado, o idioma da
 *  conta e a idade do formulário:
 *
 *      full_name · first_name + last_name · name
 *      phone_number · phone · telefone
 *      email
 *
 *  E os campos CUSTOMIZADOS vêm com o nome que a clínica digitou — em
 *  português, com acento, com interrogação. Por isso a comparação é
 *  normalizada, e por isso `extras` guarda o nome original.
 * ============================================================================
 */
const APELIDOS: Readonly<Record<string, "nome" | "primeiro" | "ultimo" | "telefone" | "email">> = {
  full_name: "nome",
  name: "nome",
  nome: "nome",
  nome_completo: "nome",
  first_name: "primeiro",
  primeiro_nome: "primeiro",
  last_name: "ultimo",
  sobrenome: "ultimo",
  phone_number: "telefone",
  phone: "telefone",
  telefone: "telefone",
  celular: "telefone",
  whatsapp: "telefone",
  email: "email",
  e_mail: "email",
  "e-mail": "email",
};

/** `"Qual seu e-mail?"` → `"qual_seu_e_mail"`. */
function chaveDe(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
}

/* -------------------------------------------------------------------------- */

/**
 * Normaliza o `field_data` de um lead.
 *
 * NUNCA LANÇA. Um formulário vazio devolve tudo nulo, e quem chama decide o que
 * fazer — e o que ele faz é registrar o lead mesmo assim, com o `leadgen_id`,
 * para que ninguém se perca. Ver o cabeçalho de `aplicacao/lead-ads.ts`.
 */
export function normalizarCampos(campos: readonly CampoDoFormulario[]): CamposNormalizados {
  let nome: string | null = null;
  let primeiro: string | null = null;
  let ultimo: string | null = null;
  let telefone: string | null = null;
  let email: string | null = null;

  const extras: Record<string, string> = {};
  let desconhecidos = 0;

  for (const campo of campos) {
    const bruto = (campo.name ?? "").trim();
    if (bruto.length === 0) continue;

    /*
     * MÚLTIPLOS VALORES VIRAM UMA FRASE, separados por ", ".
     *
     * É o caso do checkbox múltiplo: "implante, clareamento". Pegar só o
     * primeiro perderia metade do interesse que a pessoa declarou — e é
     * justamente o interesse que decide para qual fila o lead vai.
     */
    const valor = (campo.values ?? [])
      .map((v) => String(v).trim())
      .filter((v) => v.length > 0)
      .join(", ");

    if (valor.length === 0) continue;

    const alvo = APELIDOS[chaveDe(bruto)];

    if (alvo === "nome") nome ??= valor;
    else if (alvo === "primeiro") primeiro ??= valor;
    else if (alvo === "ultimo") ultimo ??= valor;
    else if (alvo === "telefone") telefone ??= valor;
    else if (alvo === "email") email ??= valor;
    else {
      // O NOME ORIGINAL É A CHAVE. Ver `CamposNormalizados.extras`.
      extras[bruto.slice(0, 120)] = valor.slice(0, 500);
      desconhecidos += 1;
    }
  }

  /*
   * `full_name` VENCE `first_name + last_name`, e a ordem importa.
   *
   * Alguns formulários mandam os TRÊS. Concatenar primeiro e último por cima do
   * completo produziria "Maria Silva Maria Silva" em metade dos leads — e a
   * recepção começaria a mensagem chamando a pessoa pelo nome duplicado.
   */
  const composto = [primeiro, ultimo].filter((p): p is string => p !== null).join(" ");
  const nomeFinal = nome ?? (composto.length > 0 ? composto : null);

  return {
    nome: nomeFinal === null ? null : nomeFinal.slice(0, 200),
    telefone,
    email: email === null ? null : email.toLowerCase(),
    extras,
    desconhecidos,
  };
}

/* -------------------------------------------------------------------------- */
/* O interesse                                                                */
/* -------------------------------------------------------------------------- */

/**
 * O tratamento que a pessoa declarou, quando ela declarou.
 *
 * ============================================================================
 *  ISTO NÃO É DIAGNÓSTICO, E A FRONTEIRA É EXATA — §4.4, §44.
 *
 *  O que esta função lê é o que a PESSOA ESCOLHEU numa lista que a clínica
 *  montou: "implante", "aparelho", "clareamento". É classificação
 *  ADMINISTRATIVA — serve para escolher a fila e o assunto da conversa.
 *
 *  O que ela NÃO faz, e não pode fazer:
 *
 *    · inferir tratamento de sintoma ("dói ao morder" → não vira "canal");
 *    · concluir elegibilidade ("posso fazer implante?" → não vira "sim");
 *    · nomear condição.
 *
 *  A lista de palavras é de TRATAMENTO OFERECIDO, e não de doença. É a
 *  diferença entre "esta pessoa quer falar de implante" e "esta pessoa precisa
 *  de implante" — a primeira é agenda, a segunda é consulta.
 * ============================================================================
 *
 * `null` quando nada casa, e `null` é resposta legítima: o §44 manda usar
 * `OUTRO`/`REVISAR` abaixo do limiar em vez de chutar.
 */
const TRATAMENTOS: readonly { chave: string; palavras: readonly string[] }[] = [
  { chave: "IMPLANTE", palavras: ["implante", "implantes", "protese sobre implante"] },
  { chave: "ORTODONTIA", palavras: ["aparelho", "ortodontia", "alinhador", "invisalign"] },
  { chave: "CLAREAMENTO", palavras: ["clareamento", "clarear", "branqueamento"] },
  { chave: "PROTESE", palavras: ["protese", "dentadura", "coroa", "ponte"] },
  { chave: "HARMONIZACAO", palavras: ["harmonizacao", "botox", "preenchimento"] },
  { chave: "AVALIACAO", palavras: ["avaliacao", "consulta", "orcamento", "avaliar"] },
  { chave: "LIMPEZA", palavras: ["limpeza", "profilaxia", "tartaro"] },
  { chave: "ODONTOPEDIATRIA", palavras: ["crianca", "filho", "filha", "odontopediatria"] },
];

export function interesseDeclarado(texto: string): string | null {
  const limpo = texto.normalize("NFD").replace(/[̀-ͯ]/gu, "").toLowerCase();

  if (limpo.trim().length === 0) return null;

  for (const t of TRATAMENTOS) {
    if (t.palavras.some((p) => limpo.includes(p))) return t.chave;
  }

  return null;
}
