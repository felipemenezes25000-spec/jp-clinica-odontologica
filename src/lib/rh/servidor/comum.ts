/**
 * O que os dois drivers de armazenamento compartilham.
 *
 * Existe por um motivo concreto: `nomeArquivoSeguro` gerou os nomes dos 54
 * currículos que já estão gravados. Se o driver de disco e o do Supabase
 * tiverem cada um a sua versão da função, um currículo salvo por um e lido pelo
 * outro simplesmente não é encontrado — o registro aponta para
 * "curriculo-jose.pdf" e o outro driver procura por "curricul-jos.pdf". Duas
 * implementações "equivalentes" de normalização nunca são equivalentes de
 * verdade; é sempre o acento que denuncia.
 *
 * Nada aqui faz I/O, então pode ser importado por qualquer um dos dois lados sem
 * arrastar `node:fs` junto.
 */

/**
 * Bytes aleatórios em hexadecimal, via Web Crypto.
 *
 * Web Crypto, e não `node:crypto`, porque este módulo é carregado também pelo
 * driver do Supabase — que precisa rodar em ambiente sem os módulos do Node.
 * `globalThis.crypto` existe no Node 18+, na função da Vercel e no runtime de
 * borda, então é o denominador comum.
 */
function hexAleatorio(bytes: number): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function novoId(): string {
  return `cand_${hexAleatorio(8)}`;
}

export function novoIdVaga(): string {
  return `vaga_${hexAleatorio(8)}`;
}

export function novoIdGuia(): string {
  return `guia_${hexAleatorio(8)}`;
}

/**
 * Transforma o nome que a candidata enviou num nome de arquivo previsível.
 *
 * O nome vira parte de um caminho — de disco num lado, de bucket no outro —
 * então tudo que não é letra, número ou ponto sai fora. A extensão é preservada
 * porque é ela que faz o navegador abrir o PDF em vez de baixar um binário sem
 * tipo. O nome original continua guardado no registro, e é ele que aparece na
 * hora de baixar.
 */
export function nomeArquivoSeguro(nomeOriginal: string): string {
  const semCaminho = nomeOriginal.trim().replace(/\\/g, "/").split("/").pop() ?? "";
  const corte = semCaminho.lastIndexOf(".");
  const parteNome = corte > 0 ? semCaminho.slice(0, corte) : semCaminho;
  const parteExtensao = corte > 0 ? semCaminho.slice(corte + 1) : "";

  const miolo =
    parteNome
      // NFD separa o acento da letra, e \p{Mn} varre as marcas soltas: "José"
      // vira "jose" em vez de "jos-".
      .normalize("NFD")
      .replace(/\p{Mn}/gu, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 60) || "curriculo";

  const extensao = parteExtensao
    .replace(/[^A-Za-z0-9]/g, "")
    .toLowerCase()
    .slice(0, 8);
  return extensao ? `${miolo}.${extensao}` : miolo;
}

export function chaveRankingSegura(chave: string): string {
  const limpa = chave
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80);
  return limpa.length > 0 ? limpa : "geral";
}

/**
 * Identificador que vai virar caminho: rejeita o que escaparia da pasta.
 *
 * Vale para os dois drivers pelo mesmo motivo em formas diferentes: no disco,
 * `..` sobe de diretório e vaza o `.env`; no bucket, uma barra a mais cria uma
 * pasta fantasma e o arquivo some da vista de quem for procurar depois.
 */
export function identificadorValido(valor: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(valor) && !valor.includes("..");
}

/**
 * Completa o objeto lido com os campos que o tipo atual tem e o registro
 * gravado não tinha.
 *
 * Uma candidatura salva antes da IA existir precisa continuar abrindo no painel
 * depois que `analise` e `ficha` entraram no tipo. Sem isso, cada campo novo
 * exigiria migração de todos os registros — e o primeiro esquecimento derrubaria
 * a listagem inteira.
 */
export function comPadrao<T extends object>(vazio: T, bruto: unknown): T {
  if (bruto === null || typeof bruto !== "object") return vazio;
  const entrada = bruto as Record<string, unknown>;
  const saida = { ...vazio } as Record<string, unknown>;
  for (const chave of Object.keys(saida)) {
    if (chave in entrada && entrada[chave] !== undefined) saida[chave] = entrada[chave];
  }
  return saida as T;
}
