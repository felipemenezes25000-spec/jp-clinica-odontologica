/**
 * Importa o acervo de currículos da JP para o Portal de RH.
 *
 * Uso:
 *   node --env-file=.env scripts/importar-curriculos.mjs "<pasta>" [--sem-ia] [--forcar]
 *
 * Grava direto pela camada de armazenamento do projeto (não pela HTTP): copia o
 * arquivo para .data/rh/curriculos/<id>/, cria a candidatura e, por padrão,
 * roda a triagem por IA com concorrência 3.
 *
 * É RETOMÁVEL de propósito. O acervo da clínica tem centenas de arquivos, a
 * análise leva horas e qualquer coisa pode interromper (fechar o terminal, cair
 * a internet, acabar a cota da API). Rodar de novo não duplica ninguém — a
 * deduplicação é por sha-256 do conteúdo — e só analisa quem ainda não tem
 * análise. Com --forcar, reanalisa tudo (use quando o prompt mudar).
 *
 * Os módulos do portal são TypeScript, e este script é Node puro. Em vez de
 * duplicar a lógica de gravação aqui (que sairia do sincronismo no primeiro
 * campo novo da Candidatura), o script carrega os arquivos .ts pelo Vite, que já
 * é dependência do projeto — zero dependência nova, e a regra de negócio
 * continua morando em um lugar só.
 */
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ_PROJETO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const EXTENSOES = new Set([".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png"]);
const CONCORRENCIA = 3;

/* -------------------------------------------------------------------------- */
/* Argumentos                                                                 */
/* -------------------------------------------------------------------------- */

const argumentos = process.argv.slice(2);
const semIa = argumentos.includes("--sem-ia");
const forcar = argumentos.includes("--forcar");
const pastaAlvo = argumentos.find((a) => !a.startsWith("--"));

if (!pastaAlvo) {
  console.error(
    [
      "",
      "Informe a pasta com os currículos.",
      "",
      '  node --env-file=.env scripts/importar-curriculos.mjs "<pasta>" [--sem-ia] [--forcar]',
      "",
      "  --sem-ia   só importa os arquivos, sem chamar a IA",
      "  --forcar   reanalisa quem já tem análise (use quando o prompt mudar)",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

const PASTA = path.resolve(pastaAlvo);

/* -------------------------------------------------------------------------- */
/* Mapa de subpasta -> área, status e etiqueta                                */
/* -------------------------------------------------------------------------- */

/** minúsculo, sem acento, sem pontuação: "Não aceitou" e "nao-aceitou" viram iguais. */
function normalizar(texto) {
  return texto
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * As pastas do acervo dizem a área. A raiz fica sem área ("outro"), e aí a
 * rubrica genérica julga a pessoa pelo que o currículo mostra, sem cobrar
 * odontologia de quem nunca disse que queria vaga de odontologia.
 */
function areaDaPasta(segmentos) {
  for (const bruto of segmentos) {
    const s = normalizar(bruto);
    if (s.includes("asb") || s.includes("tsb") || s.includes("saude bucal")) return "asb-tsb";
    if (s.includes("dentista") || s.includes("odontolog")) return "dentista";
    if (s.includes("estagi")) return "estagio";
    if (s.includes("recepcion") || s.includes("recepcao")) return "recepcao";
    if (s.includes("administrativ")) return "administrativo";
  }
  return "outro";
}

/**
 * As pastas do acervo também guardam o veredito que a clínica já deu.
 *
 * "favoritos" vira status triagem + etiqueta "Favorito do RH"; "não aceitou"
 * vira reprovado + "Recusado antes". Não é enfeite: é exatamente isso que
 * `calibragemDoRh()` lê depois para ensinar à IA o gosto DESTA clínica — o que
 * o RH já aprovou e o que já recusou — em vez de aplicar critério de manual.
 */
function marcasDaPasta(segmentos) {
  let status = "novo";
  const etiquetas = [];
  for (const bruto of segmentos) {
    const s = normalizar(bruto);
    if (s.includes("favorito")) {
      status = "triagem";
      if (!etiquetas.includes("Favorito do RH")) etiquetas.push("Favorito do RH");
    }
    if (s.includes("nao aceitou") || s.includes("nao aceito") || s.includes("recusad")) {
      status = "reprovado";
      if (!etiquetas.includes("Recusado antes")) etiquetas.push("Recusado antes");
    }
  }
  return { status, etiquetas };
}

const MIMES = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

/* -------------------------------------------------------------------------- */
/* Caminhada na pasta                                                         */
/* -------------------------------------------------------------------------- */

async function listarArquivos(raiz) {
  const encontrados = [];

  async function caminhar(atual) {
    const entradas = await readdir(atual, { withFileTypes: true });
    for (const entrada of entradas) {
      const completo = path.join(atual, entrada.name);
      if (entrada.isDirectory()) {
        await caminhar(completo);
        continue;
      }
      if (!entrada.isFile()) continue;
      const ext = path.extname(entrada.name).toLowerCase();
      if (!EXTENSOES.has(ext)) continue;
      encontrados.push({
        completo,
        relativo: path.relative(raiz, completo).split(path.sep).join("/"),
        ext,
      });
    }
  }

  await caminhar(raiz);
  encontrados.sort((a, b) => a.relativo.localeCompare(b.relativo, "pt-BR"));
  return encontrados;
}

/* -------------------------------------------------------------------------- */
/* Saída no terminal                                                          */
/* -------------------------------------------------------------------------- */

function encurtar(texto, largura) {
  if (texto.length <= largura) return texto.padEnd(largura);
  return `…${texto.slice(texto.length - largura + 1)}`;
}

function estrelas(quantas) {
  const n = Math.max(0, Math.min(5, Number(quantas) || 0));
  return `${"★".repeat(n)}${"·".repeat(5 - n)}`;
}

function linhaProgresso(feitos, total, arquivo, situacao) {
  const contador = `[${String(feitos).padStart(String(total).length, " ")}/${total}]`;
  console.log(`${contador} ${encurtar(arquivo, 52)}  ${situacao}`);
}

/* -------------------------------------------------------------------------- */
/* Programa                                                                   */
/* -------------------------------------------------------------------------- */

async function principal() {
  const info = await stat(PASTA).catch(() => null);
  if (info === null || !info.isDirectory()) {
    console.error(`Pasta não encontrada: ${PASTA}`);
    process.exit(1);
  }

  // A camada de armazenamento resolve `.data/rh` a partir de `process.cwd()`.
  // Rodar o script de dentro de outra pasta gravaria o acervo no lugar errado.
  process.chdir(RAIZ_PROJETO);

  const arquivos = await listarArquivos(PASTA);
  if (arquivos.length === 0) {
    console.log(`Nenhum arquivo .pdf .doc .docx .jpg .jpeg .png em ${PASTA}`);
    return;
  }

  console.log("");
  console.log(`Pasta:   ${PASTA}`);
  console.log(`Destino: ${process.env.RH_DATA_DIR ?? path.join(RAIZ_PROJETO, ".data", "rh")}`);
  console.log(`Arquivos encontrados: ${arquivos.length}`);
  console.log(semIa ? "IA: desligada (--sem-ia)" : `IA: ligada (concorrência ${CONCORRENCIA})`);
  console.log("");

  const { createServer } = await import("vite");
  // `configFile: false`: os módulos do portal só importam caminhos relativos,
  // então não precisamos dos plugins do app (router, tailwind) — e sem eles a
  // carga é instantânea e não dispara geração de rotas.
  const vite = await createServer({
    configFile: false,
    root: RAIZ_PROJETO,
    logLevel: "error",
    appType: "custom",
    server: { middlewareMode: true, hmr: false, watch: null },
  });

  let resumo = { criadas: 0, duplicadas: 0, falhas: 0, analisadas: 0, jaAnalisadas: 0 };
  let tokensEntrada = 0;
  let tokensSaida = 0;
  const problemas = [];

  try {
    const armazenamento = await vite.ssrLoadModule("/src/lib/rh/servidor/armazenamento.ts");
    const tipos = await vite.ssrLoadModule("/src/lib/rh/tipos.ts");
    const analiseMod = semIa ? null : await vite.ssrLoadModule("/src/lib/rh/servidor/analise.ts");
    const openai = semIa ? null : await vite.ssrLoadModule("/src/lib/rh/servidor/openai.ts");

    if (openai) {
      const estado = openai.iaConfigurada();
      if (!estado.ok) {
        // A mensagem já vem pronta e em português da camada de servidor. Nunca
        // imprimimos a chave em si — nem um pedaço dela.
        console.error(`\n${estado.motivo}\n`);
        console.error("Rode com --sem-ia para importar sem analisar.\n");
        process.exitCode = 1;
        return;
      }
      console.log(`Modelo: ${openai.modeloAtual()}\n`);
    }

    await armazenamento.garantirDiretorios();

    const acervo = await armazenamento.listarParaDeduplicacao();
    const porHash = new Map();
    for (const item of acervo) {
      if (item.hashArquivo) porHash.set(item.hashArquivo, item.id);
    }

    /* ---------------------------------------------------------------- */
    /* 1) Importação                                                    */
    /* ---------------------------------------------------------------- */

    console.log("IMPORTANDO");
    const paraAnalisar = [];
    let lidos = 0;

    for (const arquivo of arquivos) {
      lidos += 1;
      try {
        const bytes = new Uint8Array(await readFile(arquivo.completo));
        if (bytes.byteLength === 0) {
          resumo.falhas += 1;
          problemas.push({ arquivo: arquivo.relativo, motivo: "arquivo vazio" });
          linhaProgresso(lidos, arquivos.length, arquivo.relativo, "vazio, ignorado");
          continue;
        }

        const hash = createHash("sha256").update(bytes).digest("hex");
        const existente = porHash.get(hash);
        if (existente) {
          resumo.duplicadas += 1;
          // Já está no acervo, mas pode nunca ter sido analisado: entra na fila
          // mesmo assim. É isso que faz o script ser retomável.
          paraAnalisar.push({ id: existente, arquivo: arquivo.relativo });
          linhaProgresso(lidos, arquivos.length, arquivo.relativo, `duplicado (${existente})`);
          continue;
        }

        const segmentos = arquivo.relativo.split("/").slice(0, -1);
        const area = areaDaPasta(segmentos);
        const marcas = marcasDaPasta(segmentos);

        const id = armazenamento.novoId();
        const nomeArquivo = armazenamento.nomeArquivoSeguro(path.basename(arquivo.completo));
        await armazenamento.salvarCurriculo(id, nomeArquivo, bytes);

        const carimbo = new Date();
        const protocolo = await armazenamento.proximoProtocolo(carimbo.getFullYear());

        await armazenamento.salvarCandidatura({
          ...tipos.candidaturaVazia(),
          id,
          protocolo,
          criadoEm: carimbo.toISOString(),
          atualizadoEm: carimbo.toISOString(),
          area,
          status: marcas.status,
          etiquetas: marcas.etiquetas,
          curriculo: {
            nomeArquivo,
            nomeOriginal: path.basename(arquivo.completo),
            tipo: MIMES[arquivo.ext] ?? "",
            tamanho: bytes.byteLength,
            enviadoEm: carimbo.toISOString(),
          },
          // Acervo interno da clínica: não houve formulário, então não há
          // consentimento a registrar. `false` é a verdade.
          consentimentoLgpd: false,
          origemArquivo: arquivo.relativo,
          hashArquivo: hash,
        });

        porHash.set(hash, id);
        resumo.criadas += 1;
        paraAnalisar.push({ id, arquivo: arquivo.relativo });

        const rotulo = [area, marcas.etiquetas.join(", ")].filter(Boolean).join(" · ");
        linhaProgresso(lidos, arquivos.length, arquivo.relativo, `criado · ${rotulo}`);
      } catch (erro) {
        resumo.falhas += 1;
        problemas.push({ arquivo: arquivo.relativo, motivo: mensagem(erro) });
        linhaProgresso(lidos, arquivos.length, arquivo.relativo, `ERRO: ${mensagem(erro)}`);
      }
    }

    /* ---------------------------------------------------------------- */
    /* 2) Análise                                                       */
    /* ---------------------------------------------------------------- */

    if (analiseMod && paraAnalisar.length > 0) {
      console.log("");
      console.log("ANALISANDO");

      let proximo = 0;
      let concluidos = 0;

      const trabalhador = async () => {
        for (;;) {
          const indice = proximo;
          proximo += 1;
          if (indice >= paraAnalisar.length) return;
          const alvo = paraAnalisar[indice];

          try {
            if (!forcar) {
              const atual = await armazenamento.lerCandidatura(alvo.id);
              if (atual?.analise && atual.analise.erro === "") {
                resumo.jaAnalisadas += 1;
                concluidos += 1;
                linhaProgresso(concluidos, paraAnalisar.length, alvo.arquivo, "já analisado");
                continue;
              }
            }

            const resultado = await analiseMod.analisarCandidatura(alvo.id, { forcar });
            concluidos += 1;

            if (resultado.ok) {
              resumo.analisadas += 1;
              tokensEntrada += resultado.analise.tokensEntrada;
              tokensSaida += resultado.analise.tokensSaida;
              const a = resultado.analise;
              const nome = a.extracao.nome || "(sem nome)";
              linhaProgresso(
                concluidos,
                paraAnalisar.length,
                alvo.arquivo,
                `${estrelas(a.estrelas)} ${String(a.recomendacao).padEnd(14)} ${nome}`,
              );
            } else {
              resumo.falhas += 1;
              problemas.push({ arquivo: alvo.arquivo, motivo: resultado.motivo });
              linhaProgresso(
                concluidos,
                paraAnalisar.length,
                alvo.arquivo,
                `ERRO: ${resultado.motivo}`,
              );
            }
          } catch (erro) {
            concluidos += 1;
            resumo.falhas += 1;
            problemas.push({ arquivo: alvo.arquivo, motivo: mensagem(erro) });
            linhaProgresso(
              concluidos,
              paraAnalisar.length,
              alvo.arquivo,
              `ERRO: ${mensagem(erro)}`,
            );
          }
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(CONCORRENCIA, paraAnalisar.length) }, () => trabalhador()),
      );
    }
  } finally {
    await vite.close();
  }

  /* ------------------------------------------------------------------ */
  /* 3) Resumo                                                          */
  /* ------------------------------------------------------------------ */

  console.log("");
  console.log("RESUMO");
  console.log(`  Fichas criadas:      ${resumo.criadas}`);
  console.log(`  Arquivos duplicados: ${resumo.duplicadas} (pulados)`);
  console.log(`  Análises novas:      ${resumo.analisadas}`);
  console.log(`  Já analisadas antes: ${resumo.jaAnalisadas}`);
  console.log(`  Falhas:              ${resumo.falhas}`);
  if (!semIa) {
    console.log(
      `  Tokens:              ${tokensEntrada.toLocaleString("pt-BR")} de entrada + ${tokensSaida.toLocaleString("pt-BR")} de saída = ${(tokensEntrada + tokensSaida).toLocaleString("pt-BR")}`,
    );
  }

  if (problemas.length > 0) {
    console.log("");
    console.log("O QUE FALHOU");
    for (const p of problemas.slice(0, 40)) {
      console.log(`  - ${p.arquivo}: ${p.motivo}`);
    }
    if (problemas.length > 40) console.log(`  ... e mais ${problemas.length - 40}.`);
    console.log("");
    console.log("Rode o comando de novo para tentar só o que faltou: nada é duplicado.");
  }
  console.log("");
}

function mensagem(erro) {
  return erro instanceof Error ? erro.message : String(erro);
}

principal().catch((erro) => {
  console.error(`\nFalhou: ${mensagem(erro)}\n`);
  process.exit(1);
});
