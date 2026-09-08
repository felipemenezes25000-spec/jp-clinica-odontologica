/**
 * Comparação de segredo sem vazar pelo relógio.
 *
 * `a === b` em JavaScript para de comparar no primeiro byte diferente. Quem
 * controla o valor enviado mede o tempo de resposta e descobre o prefixo
 * correto caractere a caractere. Com segredo curto isso é minutos de trabalho.
 *
 * O hash antes da comparação resolve dois problemas de uma vez: iguala o
 * tamanho dos buffers (senão o próprio tamanho vira o vazamento) e garante que
 * o tempo do XOR seja o mesmo qualquer que seja a entrada.
 *
 * Mesma técnica que `src/routes/api/rh/varrer.tsx` já usa — extraída para cá
 * porque agora há mais de um lugar precisando dela, e uma cópia divergente
 * numa rota de webhook seria um furo silencioso.
 *
 * `crypto.subtle` e não `node:crypto`: esta função é chamada de rotas que
 * rodam no runtime de borda da Vercel, onde `node:crypto` pode não existir.
 */
export async function iguaisEmTempoConstante(a: string, b: string): Promise<boolean> {
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

/**
 * Lê o `Authorization: Bearer <segredo>` e compara com o esperado.
 *
 * É o formato que a própria Vercel usa ao chamar as rotas de cron declaradas em
 * `vercel.json`, com o valor de `CRON_SECRET`.
 */
export async function autorizadoPorBearer(
  request: Request,
  segredoEsperado: string,
): Promise<boolean> {
  if (segredoEsperado.trim().length === 0) return false;
  const cabecalho = request.headers.get("authorization") ?? "";
  const enviado = cabecalho.startsWith("Bearer ") ? cabecalho.slice(7) : "";
  return iguaisEmTempoConstante(enviado, segredoEsperado);
}
