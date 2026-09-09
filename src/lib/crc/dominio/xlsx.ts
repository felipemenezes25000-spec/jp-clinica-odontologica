/**
 * Ler .xlsx sem dependência — o suficiente para uma planilha de exportação.
 *
 * POR QUE NÃO UMA BIBLIOTECA
 * A resposta padrão seria SheetJS. Duas coisas pesaram contra: o pacote `xlsx`
 * do npm deixou de ser publicado pelos mantenedores (eles migraram para o
 * registro próprio), e uma biblioteca completa carrega fórmulas, estilos,
 * gráficos e macros — nada disso importa para "converter a exportação do Dental
 * Office em linhas". O que importa cabe neste arquivo.
 *
 * O QUE ESTE LEITOR SUPORTA, E É DELIBERADAMENTE POUCO:
 *
 *   A PRIMEIRA PLANILHA da pasta. Exportação de sistema tem uma aba. Adivinhar
 *   qual de cinco abas é a boa seria escolher pelo usuário, e escolher errado
 *   importa dado errado sem ninguém perceber.
 *
 *   TEXTO, NÚMERO E DATA. Não há fórmula numa exportação — há o resultado dela,
 *   que o Excel grava junto no `<v>`. É esse valor que lemos.
 *
 *   O QUE NÃO SUPORTA falha ALTO: arquivo protegido por senha, .xls antigo
 *   (formato binário completamente diferente) e pasta sem planilha devolvem
 *   erro nomeado. Nunca uma planilha vazia fingindo sucesso — importar zero
 *   linha "com sucesso" é a pior saída possível.
 *
 * A SAÍDA É CSV, e isso é a decisão central deste arquivo. O resto do sistema
 * de importação — validação, mapeamento de coluna, deduplicação, preview — já
 * existe e opera sobre CSV. Converter aqui faz o XLSX ganhar tudo isso de
 * graça, em vez de criar um segundo caminho de importação que precisaria
 * aprender as mesmas regras de novo (e divergir delas com o tempo).
 */

export type ResultadoXlsx =
  { ok: true; csv: string; linhas: number; planilha: string } | { ok: false; motivo: string };

/* -------------------------------------------------------------------------- */
/* ZIP                                                                        */
/* -------------------------------------------------------------------------- */

type EntradaZip = { nome: string; dados: Uint8Array; comprimido: boolean };

/**
 * Lê o diretório central do ZIP.
 *
 * PELO FIM, E NÃO PELO COMEÇO. Varrer cabeçalhos locais do início parece mais
 * simples e quebra em arquivo com "data descriptor" — o caso em que o tamanho
 * do conteúdo só é conhecido DEPOIS dele, e o cabeçalho local traz zero. O
 * diretório central sempre tem os tamanhos certos.
 */
function lerZip(buffer: ArrayBuffer): EntradaZip[] | null {
  const b = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // O "end of central directory" fica no fim, depois de um comentário de até
  // 64 KB. Procurar de trás para frente acha o de verdade, e não a assinatura
  // que por acaso apareça dentro de um arquivo comprimido.
  let fim = -1;
  const minimo = Math.max(0, bytes.length - 65_557);
  for (let i = bytes.length - 22; i >= minimo; i -= 1) {
    if (b.getUint32(i, true) === 0x06054b50) {
      fim = i;
      break;
    }
  }
  if (fim < 0) return null;

  const total = b.getUint16(fim + 10, true);
  let p = b.getUint32(fim + 16, true);

  const entradas: EntradaZip[] = [];
  for (let i = 0; i < total; i += 1) {
    if (p + 46 > bytes.length || b.getUint32(p, true) !== 0x02014b50) return null;

    const metodo = b.getUint16(p + 10, true);
    const tamanhoComprimido = b.getUint32(p + 20, true);
    const tamanhoNome = b.getUint16(p + 28, true);
    const tamanhoExtra = b.getUint16(p + 30, true);
    const tamanhoComentario = b.getUint16(p + 32, true);
    const deslocamentoLocal = b.getUint32(p + 42, true);

    const nome = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + tamanhoNome));

    // O cabeçalho local tem os PRÓPRIOS tamanhos de nome e extra, que podem
    // diferir dos do diretório central. Ler os do central aqui é o erro
    // clássico: desloca o início do conteúdo em alguns bytes.
    const nomeLocal = b.getUint16(deslocamentoLocal + 26, true);
    const extraLocal = b.getUint16(deslocamentoLocal + 28, true);
    const inicio = deslocamentoLocal + 30 + nomeLocal + extraLocal;

    entradas.push({
      nome,
      dados: bytes.subarray(inicio, inicio + tamanhoComprimido),
      comprimido: metodo === 8,
    });

    p += 46 + tamanhoNome + tamanhoExtra + tamanhoComentario;
  }

  return entradas;
}

/** Descomprime uma entrada. `deflate-raw` existe no navegador e no Node 18+. */
async function conteudo(entrada: EntradaZip): Promise<string> {
  if (!entrada.comprimido) return new TextDecoder().decode(entrada.dados);

  const fluxo = new Blob([entrada.dados as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(fluxo).text();
}

/* -------------------------------------------------------------------------- */
/* XML                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Desfaz as entidades XML.
 *
 * `&amp;` PRECISA VIR POR ÚLTIMO. Trocá-lo primeiro transformaria `&amp;lt;`
 * — que é o texto literal "&lt;" — em `<`, corrompendo justamente o dado de
 * quem escreveu um nome com "&" no sistema de origem.
 */
function desescapar(texto: string): string {
  return texto
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&#(\d+);/gu, (_t, n: string) => String.fromCodePoint(Number.parseInt(n, 10)))
    .replace(/&amp;/gu, "&");
}

/** Todo o texto dentro de `<t>…</t>`, na ordem. */
function textosDe(xml: string): string[] {
  const saida: string[] = [];
  for (const m of xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/gu)) {
    saida.push(desescapar(m[1] ?? ""));
  }
  return saida;
}

/**
 * A tabela de textos compartilhados.
 *
 * Cada `<si>` é UMA célula, mas pode conter vários `<t>` quando o Excel guarda
 * o texto em pedaços com formatação diferente ("**Maria** Souza" vira dois).
 * Concatenar dentro do `<si>` é o que impede o nome de virar duas colunas.
 */
function lerCompartilhados(xml: string): string[] {
  const saida: string[] = [];
  for (const m of xml.matchAll(/<si[^>]*>([\s\S]*?)<\/si>/gu)) {
    saida.push(textosDe(m[1] ?? "").join(""));
  }
  return saida;
}

/* -------------------------------------------------------------------------- */
/* Células                                                                     */
/* -------------------------------------------------------------------------- */

/** "BC12" → 54 (índice da coluna, base zero). */
function indiceDaColuna(referencia: string): number {
  const letras = /^([A-Z]+)/u.exec(referencia.toUpperCase());
  if (letras === null) return 0;
  let n = 0;
  for (const c of letras[1] ?? "") n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * O número de série do Excel vira data ISO.
 *
 * A ÉPOCA É 1899-12-30, e não 1900-01-01: o Excel acredita que 1900 foi
 * bissexto (não foi) e essa data-base absorve o erro. Usar 1900-01-01 deixa
 * toda data um ou dois dias fora — o tipo de defeito que ninguém vê no
 * preview e aparece meses depois num relatório.
 */
function dataDeSerie(serie: number): string {
  const ms = Math.round((serie - 25_569) * 86_400_000);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return String(serie);
  return d.toISOString().slice(0, 10);
}

/**
 * A célula tem formato de data?
 *
 * Os códigos embutidos 14–22 e 45–47 são os de data e hora do Excel. Formato
 * personalizado não é resolvido aqui — a célula sai como número, e o preview
 * mostra isso antes de qualquer gravação.
 */
function ehFormatoDeData(codigo: number): boolean {
  return (codigo >= 14 && codigo <= 22) || (codigo >= 45 && codigo <= 47);
}

function lerFormatosDasCelulas(xml: string): number[] {
  const bloco = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/u.exec(xml);
  if (bloco === null) return [];

  const codigos: number[] = [];
  for (const m of (bloco[1] ?? "").matchAll(/<xf\b[^>]*>/gu)) {
    const n = /numFmtId="(\d+)"/u.exec(m[0] ?? "");
    codigos.push(n === null ? 0 : Number.parseInt(n[1] ?? "0", 10));
  }
  return codigos;
}

/* -------------------------------------------------------------------------- */
/* CSV                                                                        */
/* -------------------------------------------------------------------------- */

/** Aspas só onde precisa. Aspear tudo dobraria o arquivo sem ganho nenhum. */
function celulaCsv(valor: string): string {
  if (!/[";\n\r]/u.test(valor)) return valor;
  return `"${valor.replace(/"/gu, '""')}"`;
}

/* -------------------------------------------------------------------------- */
/* A conversão                                                                */
/* -------------------------------------------------------------------------- */

export async function xlsxParaCsv(buffer: ArrayBuffer): Promise<ResultadoXlsx> {
  const entradas = lerZip(buffer);
  if (entradas === null) {
    return {
      ok: false,
      motivo:
        "Este arquivo não parece um .xlsx. Se for .xls antigo, abra no Excel e salve como .xlsx ou .csv.",
    };
  }

  // Pasta protegida por senha é um ZIP criptografado: ela tem estes nomes no
  // lugar das partes do documento. Dizer isso é mais útil que "arquivo
  // inválido", porque a saída é conhecida — tirar a senha.
  if (entradas.some((e) => e.nome === "EncryptedPackage" || e.nome === "EncryptionInfo")) {
    return {
      ok: false,
      motivo: "A planilha está protegida por senha. Remova a senha e tente de novo.",
    };
  }

  const planilhas = entradas
    .filter((e) => /^xl\/worksheets\/sheet\d+\.xml$/u.test(e.nome))
    .sort((a, b) => a.nome.localeCompare(b.nome, "en", { numeric: true }));

  const primeira = planilhas[0];
  if (primeira === undefined) {
    return { ok: false, motivo: "A pasta de trabalho não tem nenhuma planilha." };
  }

  let xmlPlanilha: string;
  let compartilhados: string[] = [];
  let formatos: number[] = [];

  try {
    xmlPlanilha = await conteudo(primeira);

    const strings = entradas.find((e) => e.nome === "xl/sharedStrings.xml");
    if (strings !== undefined) compartilhados = lerCompartilhados(await conteudo(strings));

    const estilos = entradas.find((e) => e.nome === "xl/styles.xml");
    if (estilos !== undefined) formatos = lerFormatosDasCelulas(await conteudo(estilos));
  } catch {
    return {
      ok: false,
      motivo: "Não conseguimos descompactar a planilha. O arquivo pode estar corrompido.",
    };
  }

  const linhas: string[][] = [];
  let largura = 0;

  for (const linhaXml of xmlPlanilha.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gu)) {
    const celulas: string[] = [];

    for (const c of (linhaXml[1] ?? "").matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/gu)) {
      const atributos = c[1] ?? "";
      const corpo = c[2] ?? "";

      // A referência é o que preserva colunas VAZIAS. Sem ela, uma linha em
      // que a segunda coluna está em branco empurra tudo uma casa para a
      // esquerda — e o telefone entra na coluna do nome.
      const ref = /r="([A-Z]+\d+)"/u.exec(atributos);
      const coluna = ref === null ? celulas.length : indiceDaColuna(ref[1] ?? "A1");
      while (celulas.length < coluna) celulas.push("");

      const tipo = /t="([^"]+)"/u.exec(atributos)?.[1] ?? "n";
      const estilo = /s="(\d+)"/u.exec(atributos);
      const bruto = /<v>([\s\S]*?)<\/v>/u.exec(corpo)?.[1] ?? "";

      let valor: string;
      if (tipo === "s") {
        // Índice na tabela compartilhada.
        valor = compartilhados[Number.parseInt(bruto, 10)] ?? "";
      } else if (tipo === "inlineStr" || tipo === "str") {
        valor = tipo === "str" ? desescapar(bruto) : textosDe(corpo).join("");
      } else if (tipo === "b") {
        valor = bruto === "1" ? "VERDADEIRO" : "FALSO";
      } else if (bruto.length === 0) {
        valor = "";
      } else {
        const codigo = estilo === null ? 0 : (formatos[Number.parseInt(estilo[1] ?? "0", 10)] ?? 0);
        const n = Number(bruto);
        valor = ehFormatoDeData(codigo) && Number.isFinite(n) ? dataDeSerie(n) : bruto;
      }

      celulas[coluna] = valor;
    }

    // Linha totalmente vazia no meio da planilha é separador visual de quem
    // montou o arquivo, e não registro. Gravá-la produziria uma linha de erro
    // no preview para cada espaço em branco da exportação.
    if (celulas.some((v) => v.trim().length > 0)) {
      linhas.push(celulas);
      largura = Math.max(largura, celulas.length);
    }
  }

  if (linhas.length === 0) {
    return { ok: false, motivo: "A primeira planilha está vazia." };
  }

  // Ponto e vírgula: é o separador que o Excel em português gera e espera, e a
  // detecção do lado do CSV já o reconhece.
  const csv = linhas
    .map((l) => {
      const completa = [...l];
      while (completa.length < largura) completa.push("");
      return completa.map(celulaCsv).join(";");
    })
    .join("\n");

  return { ok: true, csv, linhas: linhas.length, planilha: primeira.nome };
}
