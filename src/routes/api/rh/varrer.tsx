/**
 * Varredura da lixeira — `/api/rh/varrer`.
 *
 * Apaga de vez as candidaturas cuja data de exclusão já passou. É o que cumpre
 * a promessa de "some sozinho em 7 dias".
 *
 * POR QUE EXISTE, SE A LISTAGEM DO PAINEL JÁ VARRE
 * Porque a listagem só varre quando alguém abre o painel. Se ninguém abrir por
 * duas semanas, o currículo que deveria ter sumido no sétimo dia continua lá —
 * e aí a promessa vira mentira, o que num dado pessoal não é detalhe de
 * produto: é a base do consentimento que a pessoa deu no formulário.
 *
 * COMO É PROTEGIDA
 * Ela apaga dado sem sessão de ninguém, então não pode ficar aberta. O segredo
 * vem de `CRON_SECRET`, que é a variável que a própria Vercel envia como
 * `Authorization: Bearer <segredo>` nas chamadas de cron. Sem a variável
 * configurada a rota responde 503 e não apaga nada — falhar fechada é o único
 * comportamento aceitável aqui.
 *
 * A comparação é em tempo constante: comparar segredo com `===` vaza o
 * comprimento do prefixo correto pelo tempo de resposta.
 */
import { createFileRoute } from "@tanstack/react-router";

function texto(corpo: string, status: number): Response {
  return new Response(corpo, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "private, no-store",
    },
  });
}

/** Igualdade sem vazar o tamanho do prefixo certo pelo tempo gasto. */
async function iguais(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const x = new Uint8Array(ha);
  const y = new Uint8Array(hb);
  let diferenca = 0;
  for (let i = 0; i < x.length; i += 1) diferenca |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diferenca === 0;
}

export const Route = createFileRoute("/api/rh/varrer")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const segredo = process.env["CRON_SECRET"] ?? "";
        if (segredo.trim().length === 0) {
          return texto("CRON_SECRET não configurado; varredura desligada.", 503);
        }

        const cabecalho = request.headers.get("authorization") ?? "";
        const enviado = cabecalho.startsWith("Bearer ") ? cabecalho.slice(7) : "";
        if (!(await iguais(enviado, segredo))) return texto("Não autorizado.", 401);

        const { listarTodas, excluirTudo } = await import("@/lib/rh/servidor/armazenamento");
        const agora = Date.now();

        const vencidas = (await listarTodas()).filter((item) => {
          if (item.excluirEm.trim() === "") return false;
          const prazo = Date.parse(item.excluirEm);
          return Number.isFinite(prazo) && prazo <= agora;
        });

        for (const item of vencidas) await excluirTudo(item.id);

        // O corpo conta o que aconteceu porque é o log da Vercel que sobra: sem
        // isso, "a varredura rodou" e "a varredura apagou 3 fichas" ficam
        // indistinguíveis no painel de cron.
        return texto(`Varredura concluída. Apagadas: ${String(vencidas.length)}.`, 200);
      },
    },
  },
});
