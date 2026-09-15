/**
 * Entrada HTTP da Meta.
 *
 * `/api/crc/meta/:canal` continua sendo o webhook por conta. Dois pseudo-canais
 * reservados fecham funções do próprio aplicativo sem criar outra árvore de
 * rotas: `analytics` (sessão + RBAC) e `data-deletion` (signed_request Meta).
 */
import { createFileRoute } from "@tanstack/react-router";

function texto(corpo: string, status: number): Response {
  return new Response(corpo, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function contextoAnalytics(): Promise<
  | {
      ok: true;
      organizationId: string;
      clinicIds: string[] | null;
    }
  | { ok: false; status: number; code: string; message: string }
> {
  const { useSession: abrirSessao } = await import("@tanstack/react-start/server");
  const { autorizar, configuracaoSessao, sessaoConfigurada } =
    await import("@/lib/crc/servidor/sessao");
  const { novoRequestId } = await import("@/lib/crc/servidor/registro");

  const configurada = sessaoConfigurada();
  if (!configurada.ok) {
    return {
      ok: false,
      status: 503,
      code: "INTEGRACAO_NAO_CONFIGURADA",
      message: configurada.motivo,
    };
  }

  const sessao = await abrirSessao<{
    userId: string;
    organizationId: string;
    entrouEm: string;
  }>(configuracaoSessao());
  const dados = sessao.data;
  const segura =
    typeof dados.userId === "string" &&
    dados.userId.length > 0 &&
    typeof dados.organizationId === "string" &&
    dados.organizationId.length > 0
      ? {
          userId: dados.userId,
          organizationId: dados.organizationId,
          entrouEm: typeof dados.entrouEm === "string" ? dados.entrouEm : "",
        }
      : null;

  const autorizacao = await autorizar(segura, novoRequestId(), "ver_analytics_gerencial");
  if (!autorizacao.ok) {
    return {
      ok: false,
      status: autorizacao.codigo === "NAO_AUTENTICADO" ? 401 : 403,
      code: autorizacao.codigo,
      message: autorizacao.motivo,
    };
  }

  const papel = autorizacao.ctx.usuario.papel;
  return {
    ok: true,
    organizationId: autorizacao.ctx.organizationId,
    // Admin e marketing têm visão organizacional. Outros papéis continuam
    // limitados às unidades que o ContextoCrc já autorizou.
    clinicIds: papel === "admin" || papel === "marketing" ? null : autorizacao.ctx.clinicIds,
  };
}

function signedRequestDoCorpo(corpo: string, contentType: string): string {
  if (contentType.includes("application/json")) {
    try {
      const valor: unknown = JSON.parse(corpo);
      if (typeof valor === "object" && valor !== null && !Array.isArray(valor)) {
        const signed = (valor as Record<string, unknown>)["signed_request"];
        return typeof signed === "string" ? signed : "";
      }
    } catch {
      return "";
    }
    return "";
  }

  return new URLSearchParams(corpo).get("signed_request") ?? "";
}

async function analytics(request: Request): Promise<Response> {
  const contexto = await contextoAnalytics();
  if (!contexto.ok) {
    return json({ ok: false, code: contexto.code, message: contexto.message }, contexto.status);
  }

  const url = new URL(request.url);
  const pedido = Number(url.searchParams.get("dias") ?? "30");
  const dias = Number.isFinite(pedido) ? Math.max(1, Math.min(365, Math.trunc(pedido))) : 30;

  const { rpc } = await import("@/lib/crc/servidor/banco");
  const linhas = await rpc<Record<string, unknown>>("crc_meta_analytics", {
    p_organization_id: contexto.organizationId,
    p_clinic_ids: contexto.clinicIds,
    p_dias: dias,
  });

  return json({ ok: true, painel: linhas[0] ?? {} });
}

async function statusDeExclusao(request: Request): Promise<Response> {
  const codigo = new URL(request.url).searchParams.get("code")?.trim() ?? "";
  if (codigo.length < 16) return json({ ok: false, status: "NAO_ENCONTRADO" }, 404);

  const { rpc } = await import("@/lib/crc/servidor/banco");
  const linhas = await rpc<Record<string, unknown>>("crc_meta_status_exclusao", {
    p_confirmation_code: codigo,
  });
  const estado = linhas[0] ?? { ok: false, status: "NAO_ENCONTRADO" };
  return estado["ok"] === true ? json(estado) : json(estado, 404);
}

async function receberExclusao(request: Request): Promise<Response> {
  const corpo = await request.text();
  const signedRequest = signedRequestDoCorpo(
    corpo,
    request.headers.get("content-type")?.toLowerCase() ?? "",
  );
  if (signedRequest.length === 0) {
    return json({ ok: false, message: "signed_request ausente." }, 400);
  }

  const { appSecretDoAmbiente } = await import("@/lib/crc/integracoes/meta/config");
  const { verificarSignedRequestMeta } = await import("@/lib/crc/integracoes/meta/data-deletion");
  const verificado = verificarSignedRequestMeta(signedRequest, appSecretDoAmbiente());
  if (!verificado.ok) {
    const status = verificado.motivo === "sem_segredo" ? 503 : 401;
    return json({ ok: false, message: "Pedido de exclusão inválido." }, status);
  }

  const { randomBytes } = await import("node:crypto");
  const confirmationCode = randomBytes(24).toString("hex");
  const { rpc } = await import("@/lib/crc/servidor/banco");

  await rpc("crc_meta_registrar_exclusao", {
    p_confirmation_code: confirmationCode,
    p_meta_user_id: verificado.userId,
  });
  await rpc("crc_meta_processar_exclusao", { p_confirmation_code: confirmationCode });

  const configurada = (process.env["CRC_URL_PUBLICA"] ?? "").trim().replace(/\/+$/u, "");
  const origem = configurada.length > 0 ? configurada : new URL(request.url).origin;
  const statusUrl = `${origem}/api/crc/meta/data-deletion?code=${encodeURIComponent(confirmationCode)}`;

  // Contrato esperado pela Meta: URL consultável + confirmation_code.
  return json({ url: statusUrl, confirmation_code: confirmationCode });
}

export const Route = createFileRoute("/api/crc/meta/$canal")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (params.canal === "analytics") return analytics(request);
        if (params.canal === "data-deletion") return statusDeExclusao(request);

        const url = new URL(request.url);
        const { canalMetaPorId, verifyTokenDoCanal } =
          await import("@/lib/crc/integracoes/meta/canais");
        const canal = await canalMetaPorId(params.canal);
        if (canal === null) return texto("Canal não encontrado.", 404);

        const { responderDesafio } = await import("@/lib/crc/integracoes/meta/assinatura");
        const r = await responderDesafio({
          modo: url.searchParams.get("hub.mode"),
          token: url.searchParams.get("hub.verify_token") ?? "",
          desafio: url.searchParams.get("hub.challenge") ?? "",
          esperado: verifyTokenDoCanal(canal),
        });

        return r.ok ? texto(r.resposta, 200) : texto(r.motivo, r.status);
      },

      POST: async ({ request, params }) => {
        if (params.canal === "data-deletion") return receberExclusao(request);
        if (params.canal === "analytics") {
          return json({ ok: false, message: "Método não permitido." }, 405);
        }

        const { registrar, descreverErro } = await import("@/lib/crc/servidor/registro");
        const corpoCru = await request.text();

        const { canalMetaPorId, appSecretDoCanal } =
          await import("@/lib/crc/integracoes/meta/canais");
        const canal = await canalMetaPorId(params.canal);
        if (canal === null) {
          registrar("aviso", "Webhook da Meta para canal desconhecido ou inativo.", {
            canal: params.canal,
          });
          return texto("Canal não encontrado.", 404);
        }

        const { verificarAssinaturaMeta } = await import("@/lib/crc/integracoes/meta/assinatura");
        const assinatura = verificarAssinaturaMeta(
          { corpoCru, cabecalhos: request.headers },
          appSecretDoCanal(canal),
        );

        if (!assinatura.valida) {
          registrar("aviso", "Webhook da Meta com assinatura inválida foi recusado.", {
            canal: canal.id,
            organizationId: canal.organizationId,
            motivo: assinatura.motivo,
          });
          return assinatura.motivo === "sem_segredo"
            ? texto("Canal sem app secret configurado.", 503)
            : texto("Assinatura inválida.", 401);
        }

        let payload: unknown;
        try {
          payload = JSON.parse(corpoCru);
        } catch {
          return texto("Corpo inválido.", 400);
        }

        const { interpretarWebhookMeta } = await import("@/lib/crc/integracoes/meta/normalizar");
        const envelope = interpretarWebhookMeta(payload);
        const conhecidas = new Set(
          [canal.pageId, canal.instagramAccountId].filter((c): c is string => c !== null),
        );
        const intrusa = envelope.contas.find((c) => !conhecidas.has(c));

        if (intrusa !== undefined) {
          registrar("erro", "Webhook da Meta assinado por um canal, endereçado a outro.", {
            canal: canal.id,
            organizationId: canal.organizationId,
            esperado: [...conhecidas].join(","),
            recebido: intrusa,
          });
          return texto("Conta não confere com o canal.", 401);
        }

        try {
          const { processarWebhookMeta } = await import("@/lib/crc/aplicacao/meta");
          const resultado = await processarWebhookMeta(envelope, {
            organizationId: canal.organizationId,
            clinicId: canal.clinicId,
          });

          if (resultado.mensagens > 0 || resultado.leads > 0) {
            const { tocarPulso } = await import("@/lib/crc/automacao/pulso");
            await tocarPulso();
          }

          return texto("ok", 200);
        } catch (erro) {
          // O envelope já foi persistido em `crc_webhook_inbox`; a repescagem é
          // nossa. Responder 500 aqui só faria a Meta multiplicar a entrega.
          registrar("erro", "Falha ao processar webhook da Meta.", {
            canal: canal.id,
            organizationId: canal.organizationId,
            detalhe: descreverErro(erro),
          });
          return texto("ok", 200);
        }
      },
    },
  },
});
