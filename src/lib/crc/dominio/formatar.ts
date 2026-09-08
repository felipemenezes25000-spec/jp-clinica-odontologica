/**
 * Números, datas e dinheiro do jeito que o Brasil lê — itens 219 a 221.
 *
 * A REGRA DO DINHEIRO É ABSOLUTA: nada aqui aceita `number` para valor
 * monetário. O banco devolve `numeric(12,2)` como string exatamente para não
 * perder centavo no caminho, e converter para `number` só para formatar
 * desfaria a proteção. `4800.55` em float é 4800.549999999999 — some um centavo
 * em cem operações e o relatório passa a não bater com o caixa.
 *
 * O FUSO É SEMPRE EXPLÍCITO. A Vercel roda em UTC e a clínica opera em -03:
 * `new Date(iso).toLocaleDateString("pt-BR")` sem `timeZone` mostraria a
 * consulta das 21h de terça como quarta-feira.
 */

const FUSO_PADRAO = "America/Sao_Paulo";

/* -------------------------------------------------------------------------- */
/* Dinheiro                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `"4800.5"` → `"R$ 4.800,50"`. Entrada nula vira travessão, não "R$ 0,00":
 * "não sabemos o valor" e "o valor é zero" são coisas diferentes, e o item 63
 * proíbe o dashboard mentir por omissão.
 */
export function dinheiro(valor: string | null | undefined): string {
  if (valor === null || valor === undefined || valor.trim().length === 0) return "—";
  const n = Number.parseFloat(valor);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Para KPI grande: `"R$ 42,8 mil"`. Cabeçalho não comporta seis dígitos. */
export function dinheiroCurto(valor: string | null | undefined): string {
  if (valor === null || valor === undefined) return "—";
  const n = Number.parseFloat(valor);
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) < 1000) return dinheiro(valor);
  if (Math.abs(n) < 1_000_000) {
    return `R$ ${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  }
  return `R$ ${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mi`;
}

/**
 * Soma valores monetários sem passar por float.
 *
 * Converte para centavos inteiros, soma, e volta. É o único jeito de garantir
 * que 0.1 + 0.2 dê 0.30 e não 0.30000000000000004 — que vira "R$ 0,30" na tela
 * por sorte do arredondador, e vira divergência no relatório quando são 4.000
 * linhas.
 */
export function somarDinheiro(valores: readonly (string | null | undefined)[]): string {
  let centavos = 0;
  for (const v of valores) {
    if (v === null || v === undefined) continue;
    const n = Number.parseFloat(v);
    if (!Number.isFinite(n)) continue;
    centavos += Math.round(n * 100);
  }
  return (centavos / 100).toFixed(2);
}

/* -------------------------------------------------------------------------- */
/* Datas                                                                      */
/* -------------------------------------------------------------------------- */

function comoData(iso: string | null | undefined): Date | null {
  if (iso === null || iso === undefined || iso.length === 0) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t) : null;
}

/** `08/09/2026` */
export function data(iso: string | null | undefined, fuso = FUSO_PADRAO): string {
  const d = comoData(iso);
  if (d === null) return "—";
  return d.toLocaleDateString("pt-BR", { timeZone: fuso });
}

/** `08/09/2026 14:30` */
export function dataHora(iso: string | null | undefined, fuso = FUSO_PADRAO): string {
  const d = comoData(iso);
  if (d === null) return "—";
  return `${d.toLocaleDateString("pt-BR", { timeZone: fuso })} ${d.toLocaleTimeString("pt-BR", {
    timeZone: fuso,
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

/** `14:30` */
export function hora(iso: string | null | undefined, fuso = FUSO_PADRAO): string {
  const d = comoData(iso);
  if (d === null) return "—";
  return d.toLocaleTimeString("pt-BR", { timeZone: fuso, hour: "2-digit", minute: "2-digit" });
}

/** `qua, 08 de set` — para cabeçalho de agenda. */
export function dataCurta(iso: string | null | undefined, fuso = FUSO_PADRAO): string {
  const d = comoData(iso);
  if (d === null) return "—";
  return d.toLocaleDateString("pt-BR", {
    timeZone: fuso,
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

/**
 * `há 3 minutos`, `ontem`, `há 8 meses`.
 *
 * Usa `Intl.RelativeTimeFormat` em vez de tabela própria porque ele já resolve
 * plural e concordância em português — "há 1 mês" e "há 2 meses" saem certos
 * sem um único `if`.
 */
export function tempoRelativo(iso: string | null | undefined, agora = new Date()): string {
  const d = comoData(iso);
  if (d === null) return "—";

  const segundos = Math.round((d.getTime() - agora.getTime()) / 1000);
  const abs = Math.abs(segundos);
  const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

  if (abs < 45) return "agora";
  if (abs < 3600) return rtf.format(Math.round(segundos / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(segundos / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(segundos / 86400), "day");
  if (abs < 86400 * 365) return rtf.format(Math.round(segundos / (86400 * 30)), "month");
  return rtf.format(Math.round(segundos / (86400 * 365)), "year");
}

/** `Sincronizado há 3 min` / `Nunca sincronizado` — item 136. */
export function frescor(iso: string | null | undefined, agora = new Date()): string {
  if (iso === null || iso === undefined) return "Nunca sincronizado";
  return `Sincronizado ${tempoRelativo(iso, agora)}`;
}

/** O cumprimento do topo da Home, no fuso da clínica. */
export function saudacao(agora = new Date(), fuso = FUSO_PADRAO): string {
  const h = Number.parseInt(
    agora.toLocaleString("pt-BR", { timeZone: fuso, hour: "2-digit", hour12: false }),
    10,
  );
  if (!Number.isFinite(h)) return "Olá";
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

/* -------------------------------------------------------------------------- */
/* Texto                                                                      */
/* -------------------------------------------------------------------------- */

/** Iniciais para avatar. `"Maria de Souza"` → `"MS"` — ignora a partícula. */
export function iniciais(nome: string): string {
  const partes = nome
    .trim()
    .split(/\s+/u)
    .filter((p) => p.length > 2 || /^[A-ZÀ-Ý]/u.test(p));
  const primeira = partes[0] ?? "";
  const ultima = partes.length > 1 ? (partes[partes.length - 1] ?? "") : "";
  return ((primeira.charAt(0) ?? "") + (ultima.charAt(0) ?? "")).toUpperCase() || "?";
}

/** Primeiro nome, para a mensagem soar de gente. */
export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/u)[0] ?? nome;
}

export function truncar(texto: string, limite: number): string {
  const limpo = texto.replace(/\s+/gu, " ").trim();
  if (limpo.length <= limite) return limpo;
  return limpo.slice(0, Math.max(0, limite - 1)).trimEnd() + "…";
}

/** `17 oportunidades` / `1 oportunidade` — o plural que a Home precisa. */
export function plural(n: number, singular: string, plural_: string): string {
  return `${n.toLocaleString("pt-BR")} ${n === 1 ? singular : plural_}`;
}

export function porcentagem(parte: number, total: number): string {
  if (total <= 0) return "—";
  return `${Math.round((parte / total) * 100).toLocaleString("pt-BR")}%`;
}
