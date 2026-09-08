/**
 * Instalação inicial — `/api/crc/instalar`.
 *
 * POR QUE UMA ROTA, E NÃO UM SCRIPT LOCAL
 * Porque o banco de produção é o Supabase, e quem vai rodar isto é quem
 * administra a clínica — não alguém com o repositório clonado e as variáveis
 * de ambiente na máquina. Uma rota protegida pelo mesmo `CRON_SECRET` que a
 * Vercel já usa resolve sem exigir ambiente local nenhum.
 *
 * A ORDEM CORRETA DE INSTALAÇÃO É:
 *   1. rodar `supabase/02-crc-schema.sql` no SQL Editor (uma vez);
 *   2. cadastrar CRC_SESSION_SECRET, CRC_ADMIN_EMAIL e CRC_ADMIN_SENHA;
 *   3. chamar esta rota com o Bearer do CRON_SECRET.
 *
 * A rota é IDEMPOTENTE: chamá-la de novo não duplica nada e não sobrescreve
 * automação que o gestor já ativou.
 *
 * `?exemplo=1` acrescenta pacientes fictícios, e a própria função de semente
 * recusa em produção — a trava não depende desta rota lembrar de conferir.
 */
import { createFileRoute } from "@tanstack/react-router";

function json(corpo: unknown, status: number): Response {
  return new Response(JSON.stringify(corpo, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/crc/instalar")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const segredo = process.env["CRON_SECRET"] ?? "";
        if (segredo.trim().length === 0) {
          return json({ erro: "CRON_SECRET não configurado; a instalação está bloqueada." }, 503);
        }

        const { autorizadoPorBearer } = await import("@/lib/crc/servidor/comparar");
        if (!(await autorizadoPorBearer(request, segredo))) {
          return json({ erro: "Não autorizado." }, 401);
        }

        const { bancoConfigurado } = await import("@/lib/crc/servidor/banco");
        const banco = bancoConfigurado();
        if (!banco.ok) {
          return json({ erro: banco.motivo }, 503);
        }

        const { descreverErro, registrar } = await import("@/lib/crc/servidor/registro");

        try {
          const { instalar, semearDesenvolvimento } = await import("@/lib/crc/servidor/instalacao");

          // `exactOptionalPropertyTypes` recusa `{ campo: undefined }` num campo
          // opcional: a chave precisa estar AUSENTE, não presente com undefined.
          const clinicaExternaId = (process.env["DENTAL_OFFICE_CLINIC_ID"] ?? "").trim();
          const resultado = await instalar(clinicaExternaId.length > 0 ? { clinicaExternaId } : {});

          const url = new URL(request.url);
          const exemplo =
            url.searchParams.get("exemplo") === "1"
              ? await semearDesenvolvimento(resultado.organizationId, resultado.clinicId)
              : null;

          return json(
            {
              ok: true,
              ...resultado,
              exemplo,
              proximosPassos: [
                resultado.usuarioAdmin.length === 0
                  ? "Cadastre CRC_ADMIN_EMAIL e CRC_ADMIN_SENHA e rode esta rota de novo para criar o primeiro usuário."
                  : `Entre em /crc com ${resultado.usuarioAdmin}.`,
                "As seis automações foram criadas em RASCUNHO e modo Simulação. Elas não enviam nada até um gestor ativar.",
                "Cadastre DENTAL_OFFICE_BASE_URL, DENTAL_OFFICE_CLIENT_ID e DENTAL_OFFICE_SECRET para a sincronização começar.",
              ],
            },
            200,
          );
        } catch (erro) {
          const detalhe = descreverErro(erro);
          registrar("erro", "Instalação do CRC falhou.", { detalhe });
          // O detalhe VAI na resposta aqui, ao contrário do health check: esta
          // rota exige o segredo de administração, e quem a chama é justamente
          // quem precisa saber que falta rodar o SQL do schema.
          return json({ erro: "A instalação falhou.", detalhe }, 500);
        }
      },
    },
  },
});
