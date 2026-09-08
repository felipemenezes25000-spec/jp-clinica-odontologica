/**
 * Leitor de CSV — a base do importador de orçamentos e de cobranças.
 *
 * POR QUE ESCREVER UM, E NÃO USAR BIBLIOTECA
 * Item 150 (performance budget): não trazer biblioteca grande para
 * funcionalidade pequena. Mas a razão principal é outra — o que quebra num
 * importador brasileiro não é o parsing de RFC 4180, é a bagunça específica que
 * o Excel em pt-BR produz:
 *
 *   separador ";" em vez de ","  (porque a vírgula é o decimal)
 *   "1.234,56" como número
 *   BOM invisível no começo do arquivo
 *   fim de linha do Windows
 *   cabeçalho com acento, maiúscula e espaço: "Valor Total"
 *   linhas em branco no fim
 *
 * Uma biblioteca genérica resolve as aspas e deixa TODO o resto por conta de
 * quem chama. O que está aqui resolve a bagunça, que é o trabalho de verdade.
 *
 * TUDO É PURO. É o que permite testar cada armadilha acima sem arquivo, sem
 * upload e sem banco.
 */

/**
 * Os dois caracteres invisíveis que este arquivo precisa tratar, construídos
 * por código em vez de escritos literalmente.
 *
 * POR QUE ASSIM: um BOM ou um espaço não-quebrável no meio do código-fonte é
 * impossível de revisar, some em copiar-e-colar, é reprovado pelo lint como
 * espaço irregular, e sobrevive mal a qualquer ferramenta que reprocesse o
 * arquivo. `String.fromCharCode` deixa a intenção explícita e mantém o
 * código-fonte inteiramente legível.
 */

/** U+FEFF — o BOM que o Excel escreve no começo do CSV. */
const BOM = String.fromCharCode(0xfeff);

/**
 * U+00A0 — espaço não-quebrável. Algumas configurações regionais do Excel o
 * usam como separador de milhar, e ele NÃO é coberto por `\s` em todo runtime.
 */
const ESPACO_FIXO = String.fromCharCode(0x00a0);

export type LinhaCsv = Record<string, string>;

export type ResultadoCsv = {
  /** Os cabeçalhos como vieram no arquivo, para a tela de mapeamento mostrar. */
  colunas: string[];
  linhas: LinhaCsv[];
  /** O separador detectado, para a tela poder dizer o que assumiu. */
  separador: string;
};

/**
 * Descobre o separador contando ocorrências FORA de aspas na primeira linha.
 *
 * Contar dentro de aspas é o erro clássico: um cabeçalho como
 * `"Paciente, nome completo";Valor` faria a vírgula ganhar, e o arquivo
 * inteiro seria lido com uma coluna só.
 *
 * O padrão é ponto e vírgula porque em arquivo brasileiro ele é o caso comum —
 * a vírgula quase sempre é decimal.
 */
export function detectarSeparador(primeiraLinha: string): string {
  const candidatos = [";", ",", "\t", "|"];
  let melhor = ";";
  let maior = 0;

  for (const sep of candidatos) {
    let contagem = 0;
    let dentroDeAspas = false;

    for (let i = 0; i < primeiraLinha.length; i += 1) {
      const c = primeiraLinha[i];
      if (c === '"') dentroDeAspas = !dentroDeAspas;
      else if (c === sep && !dentroDeAspas) contagem += 1;
    }

    if (contagem > maior) {
      maior = contagem;
      melhor = sep;
    }
  }

  return melhor;
}

/**
 * Quebra uma linha respeitando aspas e o escape `""`.
 *
 * O caso que obriga isto a existir: `"Implante, unitário";1500,00`. Sem
 * tratamento de aspas, a descrição vira duas colunas e todas as seguintes
 * andam uma casa — o valor de um procedimento acaba no campo de quantidade, e
 * o erro passa despercebido porque o número continua sendo número.
 */
export function quebrarLinha(linha: string, separador: string): string[] {
  const campos: string[] = [];
  let atual = "";
  let dentroDeAspas = false;

  for (let i = 0; i < linha.length; i += 1) {
    const c = linha[i];

    if (c === '"') {
      // `""` dentro de campo entre aspas é uma aspa literal.
      if (dentroDeAspas && linha[i + 1] === '"') {
        atual += '"';
        i += 1;
      } else {
        dentroDeAspas = !dentroDeAspas;
      }
      continue;
    }

    if (c === separador && !dentroDeAspas) {
      campos.push(atual.trim());
      atual = "";
      continue;
    }

    atual += c;
  }

  campos.push(atual.trim());
  return campos;
}

/**
 * Normaliza o nome da coluna para casar com o mapeamento.
 *
 * `"Valor Total "`, `"valor_total"` e `"VALOR TOTAL"` viram `valortotal`. Sem
 * isso, o importador exigiria que a clínica escrevesse o cabeçalho exatamente
 * como o código espera — e o arquivo vem do sistema deles, não do nosso.
 *
 * A remoção de acento usa `NFD` + faixa de marcas combinantes: depois da
 * decomposição, o acento vira um caractere separado que a faixa remove.
 */
export function normalizarColuna(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/gu, "");
}

/**
 * Lê o CSV inteiro.
 *
 * As linhas são devolvidas com as chaves ORIGINAIS do cabeçalho, e não as
 * normalizadas: a tela de preview precisa mostrar o que estava no arquivo, e
 * "valortotal" na tela seria confuso para quem exportou "Valor Total".
 */
export function lerCsv(texto: string, separadorForcado?: string): ResultadoCsv {
  // O BOM que o Excel escreve vira parte do PRIMEIRO cabeçalho se não for
  // removido — e aí "Paciente" nunca casa, porque o nome real passa a ser
  // BOM + "Paciente": visualmente idêntico, e não a mesma string.
  const semBom = texto.startsWith(BOM) ? texto.slice(BOM.length) : texto;

  // As três formas de fim de linha viram "\n": o arquivo pode vir do Excel no
  // Windows, de um Mac antigo, ou de um export Unix.
  const limpo = semBom.replace(/\r\n/gu, "\n").replace(/\r/gu, "\n");

  const linhas = limpo.split("\n");
  const primeira = linhas[0] ?? "";
  const separador = separadorForcado ?? detectarSeparador(primeira);

  const colunas = quebrarLinha(primeira, separador).map((c) => c.trim());

  const dados: LinhaCsv[] = [];
  for (let i = 1; i < linhas.length; i += 1) {
    const bruta = linhas[i] ?? "";
    // Linha em branco no fim do arquivo é o padrão, não exceção.
    if (bruta.trim().length === 0) continue;

    const campos = quebrarLinha(bruta, separador);
    const linha: LinhaCsv = {};
    colunas.forEach((coluna, indice) => {
      linha[coluna] = campos[indice] ?? "";
    });
    dados.push(linha);
  }

  return { colunas, linhas: dados, separador };
}

/**
 * Encontra o valor de uma coluna aceitando variações de nome.
 *
 * O arquivo pode chamar de "Valor", "Valor Total", "Total" ou "vlr_total". A
 * lista de sinônimos evita obrigar a clínica a renomear coluna antes de
 * importar — que é o tipo de exigência que faz alguém desistir do importador e
 * voltar para a planilha.
 */
export function valorDaColuna(linha: LinhaCsv, ...nomes: string[]): string | null {
  const normalizadas = new Map<string, string>();
  for (const [chave, valor] of Object.entries(linha)) {
    normalizadas.set(normalizarColuna(chave), valor);
  }

  for (const nome of nomes) {
    const v = normalizadas.get(normalizarColuna(nome));
    if (v !== undefined && v.trim().length > 0) return v.trim();
  }
  return null;
}

/**
 * Dinheiro brasileiro → decimal com ponto, como TEXTO.
 *
 * Devolve string porque o item 221 proíbe float para dinheiro, e converter para
 * `number` aqui só para devolver string depois já teria perdido a precisão no
 * meio do caminho.
 *
 * A REGRA DE DECISÃO entre `1.234,56` e `1,234.56`: vence o separador que
 * aparece POR ÚLTIMO — ele é o decimal. É o que distingue os dois formatos sem
 * precisar saber a origem do arquivo.
 *
 *   "R$ 1.234,56" → "1234.56"   (vírgula por último = decimal brasileiro)
 *   "1,234.56"    → "1234.56"   (ponto por último = decimal americano)
 *   "1234"        → "1234.00"
 *   "1.234"       → "1234.00"   (ver o comentário sobre ambiguidade abaixo)
 */
export function lerDinheiro(bruto: string | null): string | null {
  if (bruto === null) return null;

  // O espaço não-quebrável sai por `split`/`join`, e não pelo regex: escrevê-lo
  // dentro da classe reintroduziria no código-fonte o caractere invisível que a
  // constante existe justamente para evitar.
  let limpo = bruto
    .replace(/[R$\s]/gu, "")
    .split(ESPACO_FIXO)
    .join("")
    .trim();

  if (limpo.length === 0) return null;

  const negativo = limpo.startsWith("-") || /^\(.*\)$/u.test(limpo);
  limpo = limpo.replace(/[()-]/gu, "");

  const ultimaVirgula = limpo.lastIndexOf(",");
  const ultimoPonto = limpo.lastIndexOf(".");

  let normalizado: string;

  if (ultimaVirgula === -1 && ultimoPonto === -1) {
    normalizado = limpo;
  } else if (ultimaVirgula > ultimoPonto) {
    // Vírgula é o decimal: tira os pontos de milhar.
    normalizado = limpo.replace(/\./gu, "").replace(",", ".");
  } else if (ultimoPonto > ultimaVirgula && ultimaVirgula !== -1) {
    // Ponto é o decimal e há vírgula de milhar.
    normalizado = limpo.replace(/,/gu, "");
  } else {
    // Só ponto. AMBÍGUO: "1.234" pode ser mil duzentos e trinta e quatro
    // (milhar brasileiro) ou 1,234 (decimal americano).
    //
    // A DECISÃO: com exatamente três dígitos depois do ponto, tratamos como
    // MILHAR. Valor de orçamento odontológico raramente tem três casas
    // decimais, e o custo dos dois erros é diferente — errar para milhar
    // transforma R$ 1,23 em R$ 1.234, que salta aos olhos na conferência;
    // errar para decimal transforma R$ 1.234 em R$ 1,23, que passa
    // despercebido e some do relatório.
    const depois = limpo.length - ultimoPonto - 1;
    normalizado = depois === 3 ? limpo.replace(/\./gu, "") : limpo;
  }

  const n = Number.parseFloat(normalizado);
  if (!Number.isFinite(n)) return null;

  return ((negativo ? -1 : 1) * n).toFixed(2);
}

/**
 * Data brasileira ou ISO → `YYYY-MM-DD`.
 *
 * Recusa o que não reconhece em vez de chutar: uma data de emissão errada
 * coloca o orçamento na janela errada de recuperação, e o paciente recebe
 * "ficou alguma dúvida?" sobre algo de ontem ou de dois anos atrás. Numa
 * cobrança, o efeito é pior — o tom da mensagem depende da fase do atraso.
 */
export function lerData(bruto: string | null): string | null {
  if (bruto === null) return null;
  const limpo = bruto.trim();
  if (limpo.length === 0) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})/u.exec(limpo);
  if (iso !== null) return `${iso[1] ?? ""}-${iso[2] ?? ""}-${iso[3] ?? ""}`;

  const br = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/u.exec(limpo);
  if (br !== null) {
    const dia = (br[1] ?? "").padStart(2, "0");
    const mes = (br[2] ?? "").padStart(2, "0");
    let ano = br[3] ?? "";

    // Ano de dois dígitos: 90 vira 1990, 25 vira 2025. O corte em 70 cobre data
    // de nascimento sem transformar um orçamento de 2025 em 1925.
    if (ano.length === 2) {
      const n = Number.parseInt(ano, 10);
      ano = n >= 70 ? `19${ano}` : `20${ano}`;
    }

    if (Number.parseInt(mes, 10) > 12 || Number.parseInt(dia, 10) > 31) return null;
    return `${ano}-${mes}-${dia}`;
  }

  return null;
}
