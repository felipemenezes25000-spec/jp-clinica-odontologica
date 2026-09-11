/**
 * Cifra de segredo em repouso — AES-256-GCM.
 *
 * O QUE ISTO PROTEGE, exatamente: um dump do banco, um backup vazado, um
 * `select *` de quem tem acesso de leitura ao Postgres. Nesses três cenários a
 * coluna `segredo_cifrado` é ruído.
 *
 * O QUE ISTO NÃO PROTEGE, e está aqui para ninguém se enganar lendo o nome do
 * arquivo: o servidor da aplicação decifra, porque é o trabalho dele. Quem tiver
 * o ambiente do servidor tem as chaves de todas as clínicas. Não existe BYOK em
 * SaaS que resolva isso sem um HSM por cliente, e prometer o contrário seria
 * pior do que não cifrar — porque alguém tomaria decisão de risco confiando na
 * promessa.
 *
 * GCM E NÃO CBC: GCM autentica. Com CBC, alguém com acesso de escrita ao banco
 * pode alterar o texto cifrado e a aplicação decifra lixo sem perceber; com GCM
 * a verificação da tag falha e o erro é explícito.
 *
 * SEM CHAVE NO AMBIENTE, NADA É GRAVADO. A alternativa — guardar em claro
 * "só por enquanto" — produz a chave da OpenAI de uma clínica em texto puro numa
 * tabela, e ninguém volta para consertar.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITMO = "aes-256-gcm";
const TAMANHO_IV = 12;
const VERSAO = "v1";

/**
 * A chave, em base64 ou hexa, de 32 bytes.
 *
 * Gerar com: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
 */
function chave(): Buffer | null {
  const cru = (process.env["CRC_SEGREDO_CHAVE"] ?? "").trim();
  if (cru.length === 0) return null;

  const bytes = /^[0-9a-f]{64}$/iu.test(cru) ? Buffer.from(cru, "hex") : Buffer.from(cru, "base64");

  // 32 bytes ou nada. Uma chave curta "funcionaria" com `createCipheriv`
  // lançando, e o erro apareceria no meio de uma gravação em vez de na
  // verificação de configuração.
  return bytes.length === 32 ? bytes : null;
}

export function cifraConfigurada(): { ok: boolean; motivo: string } {
  const k = chave();
  if (k === null) {
    return {
      ok: false,
      motivo:
        "Falta CRC_SEGREDO_CHAVE no servidor (32 bytes em base64 ou hexa). Sem ela, chave de provedor não pode ser guardada.",
    };
  }
  return { ok: true, motivo: "" };
}

/**
 * Cifra e devolve `v1:iv:tag:conteudo`, tudo em base64url.
 *
 * O PREFIXO DE VERSÃO É O QUE PERMITE TROCAR DE ALGORITMO DEPOIS sem adivinhar o
 * formato de cada linha antiga. Sem ele, migrar exigiria tentar decifrar de dois
 * jeitos e ver qual não estoura.
 */
export function cifrar(texto: string): string {
  const k = chave();
  if (k === null) throw new Error(cifraConfigurada().motivo);

  const iv = randomBytes(TAMANHO_IV);
  const cifra = createCipheriv(ALGORITMO, k, iv);
  const conteudo = Buffer.concat([cifra.update(texto, "utf8"), cifra.final()]);
  const tag = cifra.getAuthTag();

  return [
    VERSAO,
    iv.toString("base64url"),
    tag.toString("base64url"),
    conteudo.toString("base64url"),
  ].join(":");
}

/**
 * Decifra. Devolve `null` em qualquer problema, e nunca lança.
 *
 * `null` e não exceção porque quem chama é o gateway de modelos, no meio de um
 * turno: uma chave que não decifra tem que virar "provedor indisponível" —
 * desfecho nomeado, ADR-11 — e não derrubar o atendimento.
 */
export function decifrar(guardado: string): string | null {
  const k = chave();
  if (k === null) return null;

  const partes = guardado.split(":");
  if (partes.length !== 4 || partes[0] !== VERSAO) return null;

  try {
    const iv = Buffer.from(partes[1] ?? "", "base64url");
    const tag = Buffer.from(partes[2] ?? "", "base64url");
    const conteudo = Buffer.from(partes[3] ?? "", "base64url");
    if (iv.length !== TAMANHO_IV) return null;

    const decifra = createDecipheriv(ALGORITMO, k, iv);
    decifra.setAuthTag(tag);
    return Buffer.concat([decifra.update(conteudo), decifra.final()]).toString("utf8");
  } catch {
    // Tag inválida cai aqui: ou a chave mudou, ou alguém mexeu na linha.
    return null;
  }
}

/**
 * A dica que fica em claro: começo e fim, nunca o meio.
 *
 * Serve para uma pessoa conferir na tela que colou a chave certa sem ninguém
 * precisar decifrar nada. Oito caracteres de um segredo de cinquenta não o
 * reconstroem, e o começo (`sk-proj-`) é público de qualquer forma.
 */
export function dicaDoSegredo(segredo: string): string {
  const s = segredo.trim();
  if (s.length <= 12) return "•".repeat(Math.max(s.length, 4));
  return `${s.slice(0, 7)}…${s.slice(-4)}`;
}
