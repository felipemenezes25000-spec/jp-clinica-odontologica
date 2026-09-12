/**
 * As constantes do E2E, e a tranca contra produção.
 *
 * A TRANCA É DUPLA — aqui e em `scripts/servidor-e2e.mjs` — porque as duas
 * pontas rodam em processos diferentes: o servidor tem o seu ambiente, e o
 * `globalSetup` do Playwright tem o dele. Uma trava só protegeria metade.
 *
 * O QUE ELA IMPEDE: o `globalSetup` chama `/api/crc/instalar?exemplo=1`. Contra
 * o Supabase real, isso criaria pacientes fictícios numa base com gente de
 * verdade — e eles conviveriam com pacientes reais até alguém notar que "Maria
 * Souza Lima" recebeu uma mensagem.
 */
export const URL_BANCO = (process.env["SUPABASE_URL"] ?? "").trim().replace(/\/+$/u, "");
export const CHAVE_BANCO = (process.env["SUPABASE_SERVICE_ROLE"] ?? "").trim();

export const CRON_SECRET = "cron-de-e2e";
export const ADMIN_EMAIL = "admin@e2e.local";
export const ADMIN_SENHA = "senha-de-e2e-bem-comprida";

/** O PostgREST puro serve na raiz; o Supabase, sob `/rest/v1`. */
export const PREFIXO = URL_BANCO.includes("supabase.co") ? "/rest/v1" : "";

export function exigirBancoDeTeste(): void {
  if (URL_BANCO.length === 0 || CHAVE_BANCO.length === 0) {
    throw new Error(
      "O E2E precisa de SUPABASE_URL e SUPABASE_SERVICE_ROLE de um banco de TESTE. Ver scripts/servidor-e2e.mjs.",
    );
  }
  if (/supabase\.co/u.test(URL_BANCO)) {
    throw new Error(
      "RECUSADO: SUPABASE_URL aponta para o Supabase. O E2E instala organização e semeia dados; ele nunca roda contra produção.",
    );
  }
}

const cabecalhos = (): Record<string, string> => ({
  apikey: CHAVE_BANCO,
  authorization: `Bearer ${CHAVE_BANCO}`,
  "content-type": "application/json",
  prefer: "return=representation",
});

/** Uma leitura direta no banco, para conferir o que a TELA gravou. */
export async function lerDoBanco<T = Record<string, unknown>>(caminho: string): Promise<T[]> {
  const r = await fetch(`${URL_BANCO}${PREFIXO}/${caminho}`, { headers: cabecalhos() });
  if (!r.ok) throw new Error(`Leitura falhou (${String(r.status)}): ${await r.text()}`);
  return (await r.json()) as T[];
}

/** Uma atualização direta, para repor o cenário entre execuções. */
export async function atualizarNoBanco(
  caminho: string,
  mudancas: Record<string, unknown>,
): Promise<void> {
  const r = await fetch(`${URL_BANCO}${PREFIXO}/${caminho}`, {
    method: "PATCH",
    headers: cabecalhos(),
    body: JSON.stringify(mudancas),
  });
  if (!r.ok) throw new Error(`Atualização em ${caminho} falhou (${String(r.status)}).`);
}

/** Uma remoção direta, para o cenário não carregar o que a execução anterior fez. */
export async function apagarDoBanco(caminho: string): Promise<void> {
  const r = await fetch(`${URL_BANCO}${PREFIXO}/${caminho}`, {
    method: "DELETE",
    headers: cabecalhos(),
  });
  if (!r.ok) throw new Error(`Remoção em ${caminho} falhou (${String(r.status)}).`);
}

/** Uma escrita direta, para montar cenário que a tela não sabe montar. */
export async function gravarNoBanco(
  tabela: string,
  linhas: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const r = await fetch(`${URL_BANCO}${PREFIXO}/${tabela}`, {
    method: "POST",
    headers: cabecalhos(),
    body: JSON.stringify(linhas),
  });
  if (!r.ok)
    throw new Error(`Gravação em ${tabela} falhou (${String(r.status)}): ${await r.text()}`);
  return (await r.json()) as Record<string, unknown>[];
}
