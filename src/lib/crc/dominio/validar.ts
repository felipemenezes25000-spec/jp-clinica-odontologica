/**
 * Validação de payload que veio de fora.
 *
 * Os itens 114 e 115 do contrato pedem duas coisas juntas: zero `any`
 * desnecessário, e nunca confiar em resposta do Dental Office, do WhatsApp ou
 * do modelo de IA. `as Resposta` resolve o TypeScript e não resolve nada em
 * tempo de execução — quando o campo vem `null`, o erro só aparece três
 * chamadas adiante, num lugar que não tem contexto para explicá-lo.
 *
 * POR QUE NÃO ZOD
 * Item 150: não adicionar biblioteca grande para funcionalidade pequena. O
 * projeto inteiro hoje tem cinco dependências de runtime, todas React/TanStack.
 * O que o CRC precisa validar são payloads rasos com dez campos — abaixo tem
 * 150 linhas que fazem isso e produzem mensagem de erro dizendo QUAL campo
 * quebrou, que é a parte que importa quando a API muda sem avisar.
 *
 * TUDO AQUI DEVOLVE `Resultado`, NUNCA LANÇA. Uma resposta malformada de um
 * paciente entre 5.000 não pode derrubar o lote (item 16).
 */

export type Valido<T> = { ok: true; valor: T };
export type Invalido = { ok: false; erro: string; campo: string };
export type Validacao<T> = Valido<T> | Invalido;

function bom<T>(valor: T): Valido<T> {
  return { ok: true, valor };
}

function ruim(campo: string, erro: string): Invalido {
  return { ok: false, campo, erro };
}

/* -------------------------------------------------------------------------- */
/* Leitura de campo                                                           */
/* -------------------------------------------------------------------------- */

export function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/**
 * Lê um caminho aninhado: `campo(o, "customer.address.city")`.
 *
 * Existe porque as APIs entregam formatos diferentes para a mesma coisa
 * dependendo do endpoint, e escrever a descida à mão em cada mapper enche o
 * código de `?.` que escondem de onde o dado saiu.
 */
export function campo(objeto: unknown, caminho: string): unknown {
  let atual: unknown = objeto;
  for (const parte of caminho.split(".")) {
    if (!ehObjeto(atual)) return undefined;
    atual = atual[parte];
  }
  return atual;
}

/**
 * O primeiro caminho que tiver valor útil.
 *
 * A API do Dental Office chama o mesmo campo de `birth_date` num endpoint e
 * `birthDate` em outro. Isto absorve a variação num lugar só, em vez de
 * espalhar `?? ` pelo mapper.
 */
export function primeiroCampo(objeto: unknown, ...caminhos: string[]): unknown {
  for (const c of caminhos) {
    const v = campo(objeto, c);
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

/* -------------------------------------------------------------------------- */
/* Tipos primitivos                                                           */
/* -------------------------------------------------------------------------- */

/** Texto não vazio. Espaço em branco não conta como conteúdo. */
export function texto(valor: unknown, nome: string): Validacao<string> {
  if (typeof valor === "string") {
    const limpo = valor.trim();
    if (limpo.length > 0) return bom(limpo);
    return ruim(nome, `"${nome}" veio vazio.`);
  }
  // Número onde se esperava texto é comum em ID de API. Converter é seguro e
  // evita rejeitar um paciente por causa de um `id: 4211` sem aspas.
  if (typeof valor === "number" && Number.isFinite(valor)) return bom(String(valor));
  return ruim(nome, `"${nome}" não é texto (veio ${descreverTipo(valor)}).`);
}

export function textoOpcional(valor: unknown): string | null {
  if (typeof valor === "string") {
    const limpo = valor.trim();
    return limpo.length > 0 ? limpo : null;
  }
  if (typeof valor === "number" && Number.isFinite(valor)) return String(valor);
  return null;
}

export function booleanoOpcional(valor: unknown, padrao: boolean): boolean {
  if (typeof valor === "boolean") return valor;
  if (typeof valor === "number") return valor !== 0;
  if (typeof valor === "string") {
    const v = valor.trim().toLowerCase();
    if (v === "true" || v === "1" || v === "sim" || v === "s") return true;
    if (v === "false" || v === "0" || v === "nao" || v === "não" || v === "n") return false;
  }
  return padrao;
}

export function numeroOpcional(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor === "string") {
    const n = Number.parseFloat(valor.trim().replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Data/hora para ISO, ou `null`.
 *
 * O CASO QUE IMPORTA: a API devolve `"2026-09-08 14:30:00"` sem fuso. Isso é
 * horário LOCAL da clínica, e `Date.parse` de string sem fuso é
 * implementation-defined — em alguns runtimes vira UTC, o que joga a consulta
 * três horas para trás e faz a automação de confirmação disparar no dia
 * errado. Por isso o formato sem fuso recebe o deslocamento explicitamente.
 */
export function dataHoraIso(valor: unknown, fusoOffset = "-03:00"): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  if (limpo.length === 0) return null;

  // "YYYY-MM-DD HH:mm[:ss]" ou "YYYY-MM-DDTHH:mm[:ss]" sem fuso.
  const semFuso = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(:\d{2})?$/u.exec(limpo);
  if (semFuso !== null) {
    const t = Date.parse(
      `${semFuso[1] ?? ""}T${semFuso[2] ?? ""}${semFuso[3] ?? ":00"}${fusoOffset}`,
    );
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
  }

  const t = Date.parse(limpo);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** Só a data, `YYYY-MM-DD`. Nascimento não tem hora nem fuso. */
export function dataIso(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  if (limpo.length === 0) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})/u.exec(limpo);
  if (iso !== null) return `${iso[1] ?? ""}-${iso[2] ?? ""}-${iso[3] ?? ""}`;

  // "08/09/1990" — formato brasileiro, que aparece em CSV de importação.
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/u.exec(limpo);
  if (br !== null) return `${br[3] ?? ""}-${br[2] ?? ""}-${br[1] ?? ""}`;

  return null;
}

export function lista(valor: unknown): unknown[] {
  return Array.isArray(valor) ? valor : [];
}

/**
 * Encontra o array de itens numa resposta paginada.
 *
 * APIs discordam sobre onde colocar a lista: `data`, `items`, `results`,
 * `content`, ou o array na raiz. Tentar todas é mais honesto do que fixar uma e
 * quebrar em silêncio quando o endpoint seguinte usa outra.
 */
export function extrairItens(corpo: unknown): unknown[] {
  if (Array.isArray(corpo)) return corpo;
  if (!ehObjeto(corpo)) return [];
  for (const chave of ["data", "items", "results", "content", "records", "rows"]) {
    const v = corpo[chave];
    if (Array.isArray(v)) return v;
  }
  return [];
}

function descreverTipo(valor: unknown): string {
  if (valor === null) return "null";
  if (valor === undefined) return "ausente";
  if (Array.isArray(valor)) return "lista";
  return typeof valor;
}

/* -------------------------------------------------------------------------- */
/* Enums                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Confere que o valor está na lista permitida.
 *
 * É o que impede a IA devolver `"acao": "APAGAR_TUDO"` e o executor tentar
 * honrar (item 174). O erro nomeia o que veio, porque quando o modelo inventa
 * uma ação a informação útil é justamente qual foi.
 */
export function umDe<T extends string>(
  valor: unknown,
  permitidos: readonly T[],
  nome: string,
): Validacao<T> {
  if (typeof valor !== "string") {
    return ruim(nome, `"${nome}" não é texto (veio ${descreverTipo(valor)}).`);
  }
  const limpo = valor.trim().toUpperCase();
  const achado = permitidos.find((p) => p.toUpperCase() === limpo);
  if (achado === undefined) {
    return ruim(nome, `"${nome}" recebeu "${valor}", que não está entre os valores aceitos.`);
  }
  return bom(achado);
}

/** Número dentro de um intervalo fechado. Usado pela confiança da IA (0..1). */
export function numeroEntre(
  valor: unknown,
  min: number,
  max: number,
  nome: string,
): Validacao<number> {
  const n = numeroOpcional(valor);
  if (n === null) return ruim(nome, `"${nome}" não é número.`);
  if (n < min || n > max) {
    return ruim(
      nome,
      `"${nome}" precisa estar entre ${String(min)} e ${String(max)}; veio ${String(n)}.`,
    );
  }
  return bom(n);
}
