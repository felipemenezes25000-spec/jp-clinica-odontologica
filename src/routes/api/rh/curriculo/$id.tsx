/**
 * Download do currículo de uma candidatura — `/api/rh/curriculo/<id>`.
 *
 * Por que uma rota de servidor e não uma server function: server function
 * serializa a resposta como JSON, e currículo é binário. Passar um PDF por JSON
 * exigiria base64 (um terço a mais de tráfego), montagem de Blob no navegador e
 * perda do `Content-Disposition` — ou seja, o navegador deixaria de saber que
 * aquilo é um arquivo com nome. Aqui a resposta é o próprio arquivo, e o
 * `<a href>` da gaveta funciona como qualquer link de download.
 *
 * Esta rota não tem componente: é só o handler. Os módulos de servidor entram
 * por `await import()` dentro dele, no mesmo padrão de `src/lib/rh/api.ts` —
 * um import estático de `node:fs` no topo iria parar no bundle do cliente e
 * quebraria o build.
 */
import { createFileRoute } from "@tanstack/react-router";

import { TIPOS_CURRICULO } from "@/lib/rh/tipos";

/** Sessão do painel; o mesmo formato gravado por `entrarRh`. */
type DadosSessao = { admin: boolean; entrouEm: string };

function textoSimples(corpo: string, status: number): Response {
  return new Response(corpo, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      // Vale para o erro também: uma resposta de rota protegida não pode ficar
      // guardada em cache compartilhado.
      "cache-control": "private, no-store",
    },
  });
}

/**
 * Nome de arquivo no formato do RFC 5987, para o `filename*`.
 * `encodeURIComponent` deixa passar `!'()*`, que o RFC classifica como
 * "attr-char" proibido; sem trocá-los, um currículo chamado "josé (1).pdf"
 * chegaria com o nome truncado em alguns navegadores.
 */
function nomeRfc5987(nome: string): string {
  return encodeURIComponent(nome).replace(
    /['()*!]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export const Route = createFileRoute("/api/rh/curriculo/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { configuracaoSessao, segredosConfigurados } =
          await import("@/lib/rh/servidor/sessao");

        // Sem os segredos configurados ninguém está autenticado — nem quem tem
        // um cookie antigo, que deixaria de abrir de qualquer forma.
        if (!segredosConfigurados().ok) {
          return textoSimples("Portal de RH não configurado neste servidor.", 401);
        }

        // Renomeado no destructuring pelo mesmo motivo de `api.ts`: `useSession`
        // do Start não é hook de React, mas o eslint-plugin-react-hooks julga
        // pelo nome e acusaria chamada de hook fora de componente.
        const { useSession: abrirSessao } = await import("@tanstack/react-start/server");

        let admin = false;
        try {
          const sessao = await abrirSessao<DadosSessao>(configuracaoSessao());
          admin = sessao.data.admin === true;
        } catch {
          // Cookie assinado com outro segredo: é só um logout, não um erro 500.
          admin = false;
        }

        if (!admin) {
          return textoSimples("Faça login no portal de RH para baixar o currículo.", 401);
        }

        const { lerCandidatura, lerCurriculo } = await import("@/lib/rh/servidor/armazenamento");

        const candidatura = await lerCandidatura(params.id);
        // Mesma resposta para candidatura inexistente e para candidatura sem
        // anexo: quem chegou aqui já é admin, e distinguir os dois casos só
        // renderia detalhe de implementação sem utilidade para a tela.
        if (candidatura === null || candidatura.curriculo === null) {
          return textoSimples("Currículo não encontrado.", 404);
        }

        const arquivo = candidatura.curriculo;
        const bytes = await lerCurriculo(params.id, arquivo.nomeArquivo);
        if (bytes === null) {
          return textoSimples("O arquivo do currículo não está mais no servidor.", 404);
        }

        // `filename` (ASCII, já sanitizado na gravação) é o que navegador antigo
        // entende; `filename*` carrega o nome original com acento, e ganha dos
        // dois em qualquer navegador atual.
        const disposicao =
          `attachment; filename="${arquivo.nomeArquivo}"; ` +
          `filename*=UTF-8''${nomeRfc5987(arquivo.nomeOriginal || arquivo.nomeArquivo)}`;

        // `lerCurriculo` devolve uma *view* sobre o pool de Buffers do Node.
        // Recortar o próprio ArrayBuffer dá um bloco só nosso — o corpo da
        // resposta é lido depois, de forma assíncrona, e não pode apontar para
        // memória que o Node reaproveita para a próxima leitura de arquivo.
        const corpo = bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer;

        return new Response(corpo, {
          status: 200,
          headers: {
            // Só o que está na lista branca sai como Content-Type. Registros
            // antigos guardam o mime cru declarado no envio, e ecoá-lo faria a
            // resposta sair como "text/html" (contido por attachment +
            // nosniff, mas sem precisar depender deles) — ou, com um caractere
            // proibido em header, faria `new Response` lançar e transformaria
            // o download daquele currículo num 500 permanente para o RH.
            "content-type": TIPOS_CURRICULO.includes(arquivo.tipo)
              ? arquivo.tipo
              : "application/octet-stream",
            "content-length": String(corpo.byteLength),
            // Currículo é dado pessoal: nada de cache de CDN, nada de disco.
            "cache-control": "private, no-store",
            "content-disposition": disposicao,
            // O navegador não deve tentar adivinhar o tipo: um .doc mal
            // declarado não pode virar HTML executado na origem do site.
            "x-content-type-options": "nosniff",
          },
        });
      },
    },
  },
});
