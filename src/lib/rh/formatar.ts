/**
 * Máscaras e formatação de exibição do Portal de RH.
 *
 * Tudo aqui é função pura: o mesmo texto sai no servidor e no navegador. Isso
 * não é preciosismo — o formulário e o painel são renderizados no servidor, e
 * qualquer diferença de string entre os dois lados derruba a hidratação.
 */

/**
 * A clínica é em São Paulo e o Brasil não tem mais horário de verão desde 2019,
 * então um deslocamento fixo é suficiente e, ao contrário de `toLocaleString`,
 * dá o mesmo resultado em Node (que roda em UTC) e no navegador do usuário.
 */
const FUSO_BRASIL_MINUTOS = -180;

const PADRAO_ISO =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;

type PartesData = {
  ano: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  temHora: boolean;
};

function diasNoMes(ano: number, mes: number): number {
  if (mes === 2) {
    const bissexto = (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
    return bissexto ? 29 : 28;
  }
  return mes === 4 || mes === 6 || mes === 9 || mes === 11 ? 30 : 31;
}

function dataReal(ano: number, mes: number, dia: number): boolean {
  if (mes < 1 || mes > 12 || dia < 1) return false;
  return dia <= diasNoMes(ano, mes);
}

/** Quebra um Date em partes já no fuso da clínica, sempre pelos getters UTC. */
function partesLocais(data: Date): PartesData | null {
  const ms = data.getTime();
  if (Number.isNaN(ms)) return null;
  const deslocado = new Date(ms + FUSO_BRASIL_MINUTOS * 60_000);
  return {
    ano: deslocado.getUTCFullYear(),
    mes: deslocado.getUTCMonth() + 1,
    dia: deslocado.getUTCDate(),
    hora: deslocado.getUTCHours(),
    minuto: deslocado.getUTCMinutes(),
    temHora: true,
  };
}

/**
 * Decompõe uma string ISO. Se ela traz fuso (o `Z` de `toISOString`), converte
 * para o horário da clínica; se não traz, é lida ao pé da letra — é o caso de
 * `<input type="date">`, que devolve "2026-09-06" sem fuso nenhum.
 */
function decompor(iso: string): PartesData | null {
  const bruto = iso.trim();
  const m = PADRAO_ISO.exec(bruto);
  if (!m) return null;

  const ano = Number(m[1] ?? "");
  const mes = Number(m[2] ?? "");
  const dia = Number(m[3] ?? "");
  if (!dataReal(ano, mes, dia)) return null;

  const temHora = m[4] !== undefined;
  const hora = Number(m[4] ?? "0");
  const minuto = Number(m[5] ?? "0");
  if (hora > 23 || minuto > 59) return null;

  const zona = m[7];
  if (zona !== undefined) {
    const partes = partesLocais(new Date(Date.parse(bruto)));
    return partes;
  }

  return { ano, mes, dia, hora, minuto, temHora };
}

function doisDigitos(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function apenasDigitos(v: string): string {
  return v.replace(/\D+/g, "");
}

export function mascararCpf(v: string): string {
  const d = apenasDigitos(v).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function mascararTelefone(v: string): string {
  const d = apenasDigitos(v).slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  // O ponto de quebra muda com o tamanho: fixo tem 4 dígitos antes do hífen,
  // celular tem 5. Enquanto a pessoa digita, tratamos como fixo.
  const corte = d.length > 10 ? 7 : 6;
  if (d.length <= corte) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, corte)}-${d.slice(corte)}`;
}

export function mascararCep(v: string): string {
  const d = apenasDigitos(v).slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

/**
 * Recebe o que a pessoa digitou e trata cada dígito como centavo, do jeito que
 * teclado de celular espera. `Intl.NumberFormat` ficaria fora porque depende do
 * ICU instalado no runtime — no Node "slim" ele cai para en-US e o texto do
 * servidor sai diferente do texto do navegador.
 */
export function mascararMoeda(v: string): string {
  const d = apenasDigitos(v)
    .slice(0, 12)
    .replace(/^0+(?=\d)/, "");
  if (d.length === 0) return "";
  const cheio = d.padStart(3, "0");
  const centavos = cheio.slice(-2);
  const inteiros = cheio.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${inteiros},${centavos}`;
}

export function formatarData(iso: string): string {
  const p = decompor(iso);
  if (!p) return "";
  return `${doisDigitos(p.dia)}/${doisDigitos(p.mes)}/${p.ano}`;
}

/**
 * O DIA de um carimbo ISO, no fuso da clínica, como "AAAA-MM-DD".
 *
 * É o formato que `<input type="date">` usa, então o filtro compara string com
 * string e a comparação lexicográfica já é cronológica — sem `Date` nenhum no
 * meio, que é o que evita o clássico "a candidatura das 21h de terça aparece na
 * quarta" quando o navegador está em outro fuso.
 *
 * Passa pelo mesmo `decompor` do resto do arquivo de propósito: o painel inteiro
 * lê datas no horário de Brasília, e um filtro que discordasse disso mostraria
 * um número diferente do que a própria ficha diz que aconteceu.
 */
export function diaDe(iso: string): string {
  const p = decompor(iso);
  if (!p) return "";
  return `${String(p.ano)}-${doisDigitos(p.mes)}-${doisDigitos(p.dia)}`;
}

/** O mesmo, para um `Date` — é como "hoje" e "ontem" viram texto de filtro. */
export function diaDeData(data: Date): string {
  return diaDe(data.toISOString());
}

export function formatarDataHora(iso: string): string {
  const p = decompor(iso);
  if (!p) return "";
  const data = `${doisDigitos(p.dia)}/${doisDigitos(p.mes)}/${p.ano}`;
  if (!p.temHora) return data;
  return `${data} às ${doisDigitos(p.hora)}:${doisDigitos(p.minuto)}`;
}

/**
 * `agora` vem por parâmetro de propósito: com `new Date()` aqui dentro, servidor
 * e navegador calculariam instantes diferentes e o texto mudaria na hidratação.
 * Quem chama congela um `agora` só para a página inteira.
 */
export function tempoRelativo(iso: string, agora: Date): string {
  const alvo = Date.parse(iso.trim());
  if (Number.isNaN(alvo) || Number.isNaN(agora.getTime())) return "";

  const segundos = Math.round((agora.getTime() - alvo) / 1000);
  if (segundos < 0) return "agora mesmo";
  if (segundos < 60) return "agora mesmo";

  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return minutos === 1 ? "há 1 minuto" : `há ${minutos} minutos`;

  const horas = Math.floor(minutos / 60);
  if (horas < 6) return horas === 1 ? "há 1 hora" : `há ${horas} horas`;
  if (horas < 24) return "hoje";

  const dias = Math.floor(horas / 24);
  if (dias === 1) return "ontem";
  if (dias < 30) return `há ${dias} dias`;

  const meses = Math.floor(dias / 30);
  if (meses < 12) return meses === 1 ? "há 1 mês" : `há ${meses} meses`;

  const anos = Math.floor(dias / 365);
  return anos === 1 ? "há 1 ano" : `há ${anos} anos`;
}

/**
 * Quantos dias faltam para vencer o prazo de guarda de uma candidatura —
 * negativo quando já venceu, `null` quando a data de envio é ilegível.
 *
 * O aviso de LGPD promete guarda "de até 24 meses"; passado o prazo, manter o
 * CPF, a data de nascimento e o endereço no disco deixa de ter base legal. A
 * varredura não apaga nada sozinha (apagar currículo de gente é decisão de
 * pessoa, não de cron), mas o painel precisa dizer o que já venceu.
 *
 * Como todo o resto deste arquivo, `agora` vem por parâmetro: com `new Date()`
 * aqui dentro, servidor e navegador escreveriam contagens diferentes e a
 * hidratação quebraria.
 */
export function diasAteVencerGuarda(enviadoEm: string, agora: Date, meses: number): number | null {
  const p = decompor(enviadoEm);
  if (!p || Number.isNaN(agora.getTime())) return null;

  // Aritmética de calendário, e não "meses × 30 dias": o prazo prometido é em
  // meses, e 24 × 30 erra em quase um mês inteiro.
  const anosExtras = Math.floor((p.mes - 1 + meses) / 12);
  const mesLimite = ((p.mes - 1 + meses) % 12) + 1;
  const anoLimite = p.ano + anosExtras;
  const diaLimite = Math.min(p.dia, diasNoMes(anoLimite, mesLimite));

  const limite = Date.UTC(anoLimite, mesLimite - 1, diaLimite);
  const hoje = partesLocais(agora);
  if (!hoje) return null;
  const referencia = Date.UTC(hoje.ano, hoje.mes - 1, hoje.dia);

  return Math.round((limite - referencia) / 86400000);
}

export function formatarTamanho(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;

  const unidades = ["KB", "MB", "GB"];
  let valor = bytes / 1024;
  let i = 0;
  while (valor >= 1024 && i < unidades.length - 1) {
    valor /= 1024;
    i += 1;
  }
  return `${valor.toFixed(1).replace(".", ",")} ${unidades[i] ?? "KB"}`;
}

/** Partículas ignoradas para que "Ana de Souza" vire "AS", e não "AD". */
const PARTICULAS = new Set(["de", "da", "do", "das", "dos", "e", "di", "del", "van", "von"]);

export function iniciais(nome: string): string {
  const partes = nome
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0 && !PARTICULAS.has(p.toLowerCase()));

  const primeiro = partes[0];
  if (!primeiro) return "";

  const ultimo = partes.length > 1 ? partes[partes.length - 1] : undefined;
  const letra = (p: string): string => (p[0] ?? "").toUpperCase();
  return ultimo ? `${letra(primeiro)}${letra(ultimo)}` : letra(primeiro);
}

export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? "";
}

export function idade(nascimentoIso: string, agora: Date): number | null {
  const nascimento = decompor(nascimentoIso);
  const hoje = partesLocais(agora);
  if (!nascimento || !hoje) return null;

  let anos = hoje.ano - nascimento.ano;
  const aindaNaoFezAniversario =
    hoje.mes < nascimento.mes || (hoje.mes === nascimento.mes && hoje.dia < nascimento.dia);
  if (aindaNaoFezAniversario) anos -= 1;

  return anos < 0 || anos > 130 ? null : anos;
}
