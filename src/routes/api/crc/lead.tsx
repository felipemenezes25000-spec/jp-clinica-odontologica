/**
 * Captura de lead — `/api/crc/lead`.
 *
 * É o endpoint que o formulário do site chama. Diferente de todas as outras
 * rotas do CRC, esta é PÚBLICA: quem preenche o formulário não tem sessão.
 *
 * ISSO MUDA O QUE PRECISA SER PROTEGIDO. Sem autenticação, a rota é um alvo
 * para envio automatizado — e cada envio vira uma oportunidade na fila de
 * alguém. As três defesas, em ordem de importância:
 *
 *   DEDUPLICAÇÃO POR TELEFONE + DIA (em `registrarLead`). Mil envios do mesmo
 *   número no mesmo dia viram um lead. É a proteção que funciona mesmo contra
 *   quem varia o resto do formulário.
 *
 *   CAMPO-ARMADILHA. Um campo que humano nenhum preenche porque não o vê. Bot
 *   que preenche formulário inteiro cai nele. Custa uma linha e pega a maior
 *   parte do lixo automatizado.
 *
 *   TETO DE TAMANHO. O corpo é lido com limite; `src/server.ts` já corta o que
 *   é grande demais antes de chegar aqui.
 *
 * A RESPOSTA É SEMPRE 200 PARA O NAVEGADOR, mesmo quando o lead é recusado como
 * duplicata. Dizer "já registramos você hoje" para quem clicou duas vezes é
 * pior do que confirmar — a pessoa acha que falhou e tenta de novo por outro
 * canal.
 */
import { createFileRoute } from "@tanstack/react-router";

function json(corpo: unknown, status: number): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export const Route = createFileRoute("/api/crc/lead")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { registrar, descreverErro } = await import("@/lib/crc/servidor/registro");

        let corpo: unknown;
        try {
          corpo = await request.json();
        } catch {
          return json({ ok: false, erro: "Corpo inválido." }, 400);
        }

        const o = (typeof corpo === "object" && corpo !== null ? corpo : {}) as Record<
          string,
          unknown
        >;

        const texto = (chave: string, limite: number): string =>
          typeof o[chave] === "string" ? o[chave].trim().slice(0, limite) : "";

        // O campo-armadilha. Se veio preenchido, quem preencheu não estava
        // olhando a tela. Responde 200 para não ensinar o bot que foi pego.
        if (texto("empresa", 100).length > 0) {
          registrar("aviso", "Envio de lead recusado pelo campo-armadilha.");
          return json({ ok: true, recebido: true }, 200);
        }

        const nome = texto("nome", 200);
        if (nome.length < 2) {
          return json({ ok: false, erro: "Informe seu nome." }, 400);
        }

        try {
          const { bancoConfigurado, selecionarUm } = await import("@/lib/crc/servidor/banco");
          if (!bancoConfigurado().ok) {
            // O formulário não pode dar erro para o visitante por causa de
            // configuração nossa. Registra e confirma.
            registrar("erro", "Lead recebido com banco não configurado — PERDIDO.");
            return json({ ok: true, recebido: true }, 200);
          }

          const clinica = await selecionarUm("crc_clinics", {
            colunas: "id,organization_id",
            filtros: [{ coluna: "ativa", op: "eq", valor: true }],
            ordenar: [{ coluna: "criado_em", ascendente: true }],
          });

          if (clinica === null) {
            registrar("erro", "Lead recebido sem clínica cadastrada — PERDIDO.");
            return json({ ok: true, recebido: true }, 200);
          }

          const { lerAtribuicao, registrarLead } = await import("@/lib/crc/aplicacao/leads");

          const resultado = await registrarLead({
            organizationId: String(clinica["organization_id"] ?? ""),
            clinicId: String(clinica["id"] ?? ""),
            nome,
            telefone: texto("telefone", 40),
            email: texto("email", 200),
            mensagem: texto("mensagem", 1000),
            // A URL de origem vem da página, porque é ela que conhece os
            // parâmetros de campanha. O `referer` não serve: ele diz de onde a
            // pessoa veio, não com quais parâmetros ela chegou.
            atribuicao: lerAtribuicao(texto("url", 1000)),
          });

          if (!resultado.criado && resultado.motivo === "sem_contato") {
            return json({ ok: false, erro: "Informe um telefone ou e-mail." }, 400);
          }

          // Duplicata também responde sucesso. Ver o cabeçalho.
          return json({ ok: true, recebido: true }, 200);
        } catch (erro) {
          // O visitante nunca vê erro nosso: ele preencheu o formulário
          // corretamente. O problema é registrado do nosso lado.
          registrar("erro", "Falha ao registrar lead.", { detalhe: descreverErro(erro) });
          return json({ ok: true, recebido: true }, 200);
        }
      },
    },
  },
});
