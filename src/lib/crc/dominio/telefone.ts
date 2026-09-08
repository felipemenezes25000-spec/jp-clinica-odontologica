/**
 * Telefone brasileiro: forma canônica, forma de tela, e a variação do nono
 * dígito.
 *
 * POR QUE ISTO É UM ARQUIVO INTEIRO
 * Porque é aqui que a mensagem encontra — ou perde — o paciente. O Dental
 * Office guarda `(11) 99999-8888`, o WhatsApp entrega `5511999998888`, e o
 * cadastro antigo tem `11 9999-8888` sem o nono dígito. Se as três formas não
 * convergirem para a mesma chave, a resposta do paciente vira uma conversa órfã
 * e alguém liga para quem já respondeu.
 *
 * A FORMA CANÔNICA é E.164 sem o '+': `5511999998888`. Escolhida porque é
 * exatamente o que a Cloud API do WhatsApp usa como `wa_id`, o que elimina uma
 * conversão no caminho mais quente do sistema.
 *
 * O ORIGINAL NUNCA É JOGADO FORA (item 166). `telefone_bruto` guarda o que veio
 * do Dental Office: quando a normalização erra — e ela erra, em número antigo
 * mal cadastrado — é o bruto que permite a pessoa conferir e corrigir.
 */

const DDDS_VALIDOS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43,
  44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77,
  79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

export function apenasDigitos(texto: string): string {
  return texto.replace(/\D+/g, "");
}

/**
 * Normaliza para E.164 sem '+'. Devolve `null` quando não dá para ter certeza.
 *
 * Aceita, nesta ordem:
 *   5511999998888  (13) já canônico, celular
 *   551133334444   (12) já canônico, fixo
 *   11999998888    (11) sem país, celular
 *   1133334444     (10) sem país, fixo
 *
 * RECUSA número de 8 ou 9 dígitos sem DDD. Poderia completar com o DDD da
 * clínica, e essa é justamente a tentação a evitar: um cadastro de paciente que
 * mudou de cidade viraria uma mensagem para um desconhecido em São Paulo.
 */
export function normalizarTelefone(entrada: string | null | undefined): string | null {
  if (entrada === null || entrada === undefined) return null;
  let d = apenasDigitos(entrada);
  if (d.length === 0) return null;

  // Prefixo internacional escrito como 00 55 ...
  if (d.startsWith("00")) d = d.slice(2);

  // Já vem com o país.
  if (d.length === 13 || d.length === 12) {
    if (!d.startsWith("55")) return null;
    return validarNacional(d.slice(2)) ? d : null;
  }

  if (d.length === 11 || d.length === 10) {
    return validarNacional(d) ? "55" + d : null;
  }

  return null;
}

/** DDD conhecido e primeiro dígito do assinante coerente com o tamanho. */
function validarNacional(nacional: string): boolean {
  if (nacional.length !== 10 && nacional.length !== 11) return false;
  const ddd = Number.parseInt(nacional.slice(0, 2), 10);
  if (!DDDS_VALIDOS.has(ddd)) return false;

  const assinante = nacional.slice(2);
  if (assinante.length === 9) {
    // Celular: começa obrigatoriamente com 9.
    return assinante.startsWith("9");
  }
  // Fixo: 2 a 5. O 9 de oito dígitos é celular antigo, que não existe mais.
  const primeiro = assinante.charCodeAt(0) - 48;
  return primeiro >= 2 && primeiro <= 5;
}

/**
 * As formas equivalentes de um mesmo telefone, para busca.
 *
 * O problema real: a base tem celular gravado sem o nono dígito (antes de 2016)
 * e o WhatsApp entrega com. `5511987654321` e `551187654321` são a mesma pessoa,
 * e nenhum `=` no banco descobre isso. Quem procura paciente por telefone
 * consulta com esta lista, e não com um valor só.
 *
 * A lista inclui sempre o próprio número, e vem sem repetição.
 */
export function variacoesDeTelefone(canonico: string | null): string[] {
  if (canonico === null || canonico.length === 0) return [];
  const variacoes = new Set<string>([canonico]);

  if (canonico.startsWith("55") && canonico.length === 13) {
    const ddd = canonico.slice(2, 4);
    const assinante = canonico.slice(4);
    // 9XXXXXXXX -> XXXXXXXX (tira o nono dígito)
    if (assinante.startsWith("9")) variacoes.add("55" + ddd + assinante.slice(1));
  }

  if (canonico.startsWith("55") && canonico.length === 12) {
    const ddd = canonico.slice(2, 4);
    const assinante = canonico.slice(4);
    // XXXXXXXX -> 9XXXXXXXX (põe o nono dígito), só quando o resultado é
    // celular plausível: fixo começa em 2..5 e ganhar um 9 na frente o
    // transformaria num número que não existe.
    const primeiro = assinante.charCodeAt(0) - 48;
    if (primeiro >= 6) variacoes.add("55" + ddd + "9" + assinante);
  }

  return [...variacoes];
}

/** `(11) 99999-8888` — item 220. Devolve o original quando não reconhece. */
export function telefoneParaTela(canonico: string | null | undefined): string {
  if (canonico === null || canonico === undefined || canonico.length === 0) return "";
  const d = apenasDigitos(canonico);
  const nacional = d.startsWith("55") && d.length >= 12 ? d.slice(2) : d;

  if (nacional.length === 11) {
    return `(${nacional.slice(0, 2)}) ${nacional.slice(2, 7)}-${nacional.slice(7)}`;
  }
  if (nacional.length === 10) {
    return `(${nacional.slice(0, 2)}) ${nacional.slice(2, 6)}-${nacional.slice(6)}`;
  }
  return canonico;
}

/** Para log e para tela de auditoria: `(11) 9****-8888`. Item 75. */
export function telefoneMascarado(canonico: string | null | undefined): string {
  const bonito = telefoneParaTela(canonico);
  if (bonito.length === 0) return "";
  return bonito.replace(/(\d)\d{3,4}(-\d{4})$/u, "$1****$2");
}
