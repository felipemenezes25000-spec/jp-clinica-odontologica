/**
 * VOZ — a narração que MANDA no tempo do vídeo.
 *
 * ============================================================================
 *  A INVERSÃO.
 *
 *  Antes, o roteiro dizia "esta cena dura 5,0 s" e a legenda era colada por
 *  cima. Isso é o caminho que produz vídeo de IA: a imagem tem um tempo, a
 *  fala tem outro, e a frase é cortada no meio do corte.
 *
 *  Aqui é o contrário. A cena dura o que a FALA dura, mais o respiro. Ninguém
 *  escolhe 5,0 s: o sintetizador devolve 4,37 s e a cena passa a durar
 *  4,37 + entrada + respiro. Por isso nenhuma frase é cortada ao meio — é
 *  matematicamente impossível.
 *
 *  Cada cena também recebe a LISTA DE PALAVRAS com o instante de cada uma. É
 *  o que permite a legenda acender a palavra no quadro em que a voz a diz, e
 *  o título revelar-se no ritmo da fala em vez de num tempo fixo.
 * ============================================================================
 *
 *  MIXAGEM. Três camadas, nesta ordem de prioridade:
 *
 *    1. VOZ ....... normalizada, sempre inteligível. É o conteúdo.
 *    2. TRILHA .... abaixada automaticamente quando a voz entra
 *                   (`sidechaincompress`), e cheia nos respiros. É o que dá
 *                   energia sem disputar com a voz.
 *    3. REALCE .... um corpo grave curto no gancho e no cartão final.
 *
 *  A trilha NÃO é abaixada num valor fixo: ela é abaixada PELA voz, quadro a
 *  quadro. Volume fixo obriga a escolher entre música inaudível o vídeo todo
 *  ou voz encoberta nas frases mais baixas.
 */
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const SCRIPTS = join(AQUI, "..");

/** A voz da casa. Escolhida com teste cego de pronúncia contra o vocabulário
 *  clínico do kit: "dói", "gengiva", "retração gengival", "alinhador",
 *  "tártaro", "siso". As vozes multilíngues en-US erram essas seis — e são
 *  exatamente as que carregam o conteúdo. Trocar aqui troca os 17. */
export const VOZ_PADRAO = "pt-BR-AntonioNeural";

/** Quanto a fala espera depois que a cena começa a entrar. A voz não pode
 *  nascer no meio da transição: o ouvido lê isso como corte errado. */
const ENTRADA = 0.14;

/** Respiro no fim da cena, antes do corte. Sem ele a frase seguinte pisa no
 *  fim desta e o vídeo soa afobado. */
const RESPIRO = 0.3;

/** O teto do limitador antes do AAC. Vale para os dezessete; um roteiro
 *  pode baixar o seu com `"teto": 0.70`.
 *
 *  O ESTOURO DO CODIFICADOR VARIA COM O MATERIAL, e é por isso que existe a
 *  exceção. Com 0,72 dezesseis vídeos ficaram em -0,9 dBTP ou abaixo e o da
 *  afta parou em -0,8: a trilha dele tem mais transiente agudo, e transiente
 *  agudo é justamente o que o AAC devolve maior do que recebeu. Baixar o teto
 *  dos dezessete para acomodar um só seria pagar em todos por um problema de
 *  um — e a diferença entre 0,70 e 0,72 é inaudível de qualquer forma. */
const TETO_PADRAO = 0.72;

/** O cartão final segura mais: é o tempo de ler o telefone e decidir. */
const RESPIRO_CTA = 0.9;

function rodar(cmd, argv) {
  return new Promise((ok, falha) => {
    const p = spawn(cmd, argv, { stdio: ["ignore", "pipe", "pipe"] });
    let saida = "";
    let erro = "";
    p.stdout.on("data", (d) => (saida += String(d)));
    p.stderr.on("data", (d) => (erro += String(d)));
    p.on("error", falha);
    p.on("close", (c) =>
      c === 0 ? ok(saida.trim()) : falha(new Error(`${cmd} saiu com ${String(c)}: ${erro}`)),
    );
  });
}

/**
 * Sintetiza a narração do roteiro e REESCREVE `t` de cada cena com o tempo
 * que a fala pediu. Devolve a trilha de voz para a mixagem.
 */
export async function aplicarVoz(roteiro, tmp, opcoes = {}) {
  const voz = opcoes.voz ?? roteiro.voz ?? VOZ_PADRAO;
  /* +8%. Medido, não escolhido: a mesma passagem com o vocabulário clínico
     do kit ("dói", "gengiva", "retração gengival", "alinhador", "tártaro")
     transcreve 100% correta nesta velocidade na voz pt-BR, e derruba ~3 s de
     um Reel de 38 s — que é a diferença entre "acima do ideal" e dentro da
     faixa de 20 a 35 s. É também o "ritmo ligeiramente dinâmico" do briefing:
     a +0% a locução soa institucional demais para o feed.

     +12% foi medido depois, na mesma prova: mantém os mesmos 96,9% de
     acerto do +8% e tira mais 3,6% do tempo. +16% já cai para 95,4% — é
     onde a dicção começa a ceder, então o teto é +12%. */
  const ritmo = opcoes.ritmo ?? roteiro.ritmo ?? "+12%";

  const pedido = join(tmp, `${roteiro.arquivo}.voz-pedido.json`);
  const resposta = join(tmp, `${roteiro.arquivo}.voz.json`);
  await writeFile(
    pedido,
    JSON.stringify({
      voz,
      ritmo,
      cenas: roteiro.cenas.map((c) => ({
        narracao: (c.narracao ?? "").replace(/\[\[|\]\]/g, "").replace(/ /g, " "),
        voz: c.voz,
        ritmo: c.ritmo,
      })),
    }),
    "utf8",
  );

  await rodar("python", [join(SCRIPTS, "narracao.py"), pedido, resposta]);
  const falas = JSON.parse(await readFile(resposta, "utf8")).cenas;

  const camadas = [];
  let relogio = 0;
  roteiro.cenas.forEach((c, i) => {
    const fala = falas[i];
    const ehCta = c.tipo === "cta" || (i === roteiro.cenas.length - 1 && c.selo);
    const respiro = c.respiro ?? (ehCta ? RESPIRO_CTA : RESPIRO);
    const entrada = c.entradaVoz ?? ENTRADA;

    if (!fala?.arquivo) {
      // cena muda (um respiro visual proposital) mantém o tempo do roteiro
      c.t = c.t ?? 2.0;
      c._voz = null;
    } else {
      const dur = fala.duracao;
      c.t = Math.max(c.tMin ?? 0, entrada + dur + respiro);
      // as palavras passam a valer em tempo DA CENA, não do arquivo
      c._voz = {
        inicio: entrada,
        dur,
        palavras: fala.palavras.map((p) => ({
          texto: p.texto,
          ini: +(entrada + p.inicio).toFixed(3),
          fim: +(entrada + p.inicio + p.dur).toFixed(3),
        })),
      };
      camadas.push({ arquivo: fala.arquivo, em: +(relogio + entrada).toFixed(3) });
    }
    relogio += c.t;
  });

  return { voz, ritmo, camadas, total: +relogio.toFixed(3) };
}

/**
 * VOZ + TRILHA + VÍDEO → o MP4 final.
 *
 * A trilha entra por `sidechaincompress`: a própria voz é a chave que a
 * abaixa. `threshold`/`ratio` estão calibrados para a música cair ~9 dB sob a
 * fala e voltar inteira no respiro, com `release` longo o bastante para não
 * "bombear" entre palavras.
 */
export function filtroMixagem(camadas, teto = TETO_PADRAO) {
  const partes = [];
  const rotulos = [];

  camadas.forEach((c, i) => {
    // adelay trabalha em milissegundos, nos dois canais
    const ms = Math.round(c.em * 1000);
    partes.push(`[${String(i + 2)}:a]adelay=${String(ms)}|${String(ms)},apad[v${String(i)}]`);
    rotulos.push(`[v${String(i)}]`);
  });

  // todas as falas numa só camada de voz
  partes.push(
    `${rotulos.join("")}amix=inputs=${String(camadas.length)}:normalize=0:dropout_transition=0[vozcrua]`,
  );
  // a voz sobe para um nível de fala constante e ganha um corte de graves
  // (o sintetizador põe energia abaixo de 80 Hz que só embola com a música)
  partes.push(
    `[vozcrua]highpass=f=85,dynaudnorm=f=180:g=9:p=0.62:m=7,alimiter=limit=0.94[vozpronta]`,
  );
  /* A voz é usada DUAS vezes — como chave do compressor e na mistura — e no
     ffmpeg um rótulo só pode ser consumido uma vez. Sem este `asplit` a
     segunda menção é lida como especificador de arquivo e o render morre. */
  partes.push(`[vozpronta]asplit=2[vozchave][vozmix]`);
  // a trilha é a cadeia que cede: a voz é a chave do compressor
  partes.push(`[1:a]volume=0.82[trilhav]`);
  partes.push(
    `[trilhav][vozchave]sidechaincompress=threshold=0.045:ratio=9:attack=14:release=340:makeup=1[trilhaduck]`,
  );
  partes.push(`[trilhaduck][vozmix]amix=inputs=2:normalize=0:dropout_transition=0[mix]`);
  /* -14 LUFS é o alvo do Instagram e do Facebook: mais alto que isso as duas
     plataformas ABAIXAM o vídeo na reprodução, e o que elas abaixam é o mix
     inteiro — a voz junto. Entregar já no alvo é a única forma de a narração
     chegar no volume em que foi mixada. TP -1.5 dB deixa margem para o que o
     recodificador delas faz depois. */
  /* O `loudnorm` de uma passada só ACERTA o volume médio e ERRA o teto: no
     primeiro lote ele entregou -14,4 LUFS (certo) com pico real de +1,1 dBFS
     (errado). Pico entre amostras acima de zero é o que o recodificador do
     Instagram transforma em estalo. O limitador depois dele é o teto de
     verdade — 0,89 linear ≈ -1,0 dBFS, com `level=disabled` para ele apenas
     conter, sem mexer no volume que o loudnorm acabou de acertar.

     0,83 e não 0,89: com teto de amostra em -1,0 dBFS o pico ENTRE amostras
     ainda mediu -0,4. O estouro entre amostras é de ~0,6 dB neste material,
     então o teto de amostra precisa ficar em -1,6 dBFS (0,83 linear) para o
     pico real cair em -1,0, que é a margem que as plataformas pedem.

     E ainda faltava uma volta. Com o teto de amostra em -1,6 dBFS o arquivo
     ENTREGUE media +0,6 dBTP: quem estoura é o codificador AAC, que devolve
     na decodificação mais do que entrou — medido em +1,7 dB neste material.
     E a primeira tentativa de consertar isso estava errada. Limitar a
     192 kHz e reamostrar DEPOIS não funciona: medido no Reel 16, com teto de
     0,70 (-3,1 dBFS) o arquivo saiu com pico de amostra em -1,6 dBFS. O
     filtro anti-serrilhado da reamostragem toca acima do teto que o
     limitador acabou de impor, e o que sobra de margem é o que ele deixou.

     Por isso são DOIS limitadores. O de cima, a 192 kHz, contém o pico entre
     amostras; o de baixo, já a 48 kHz, é o teto de verdade — aplicado na
     taxa em que o arquivo é gravado, depois de tudo o que poderia furá-lo.

     0,72 e não 0,76 depois de medir os dezessete: com 0,76 dezesseis
     ficaram em -0,9 dBTP ou abaixo e UM, o do bruxismo, parou em -0,3. O
     estouro do codificador varia com o material, então o teto tem de caber
     no pior caso medido, não no caso médio. */
  partes.push(
    `[mix]loudnorm=I=-14:TP=-1.5:LRA=11,` +
      // 1. a 192 kHz o limitador enxerga o pico ENTRE amostras e o contém
      `aresample=192000,alimiter=limit=${String(teto + 0.06)}:level=disabled,` +
      // 2. de volta a 48 kHz — e é AQUI que a reamostragem devolve parte do
      //    estouro, com o filtro anti-serrilhado tocando acima do teto
      `aresample=48000,` +
      // 3. o teto de verdade, aplicado na taxa em que o arquivo sai
      `alimiter=limit=${String(teto)}:level=disabled[saida]`,
  );

  return partes.join(";");
}
