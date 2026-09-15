/**
 * A Meta de ponta a ponta, com um sandbox local — §54.
 *
 * ============================================================================
 *  O §54 PEDE UM FAKE LOCAL, E A RAZÃO É ARITMÉTICA.
 *
 *  "Não dependa da Meta real para CI." O App Review leva semanas, a conta de
 *  teste tem cota própria, e um pipeline que precisa de Instagram real para
 *  rodar é um pipeline que roda uma vez e é desligado.
 *
 *  O FAKE AQUI TEM DUAS METADES, e as duas são necessárias:
 *
 *    A ENTRADA  este arquivo MONTA o webhook e o ASSINA com o app secret do
 *               E2E. Ou seja: a verificação de assinatura — que é a fronteira
 *               de segurança da integração (§11) — é exercitada de verdade, e
 *               não contornada.
 *
 *    A SAÍDA    `META_SANDBOX=1` troca os adapters por um fake em memória que
 *               registra os envios. A prova, deste lado, é a mensagem em
 *               `crc_messages` com `provider_message_id` começando em
 *               `sandbox-meta-` — o fake vive no processo do SERVIDOR, e o
 *               banco é o que os dois lados compartilham.
 * ============================================================================
 *
 * ============================================================================
 *  A CADEIA QUE SÓ AQUI É EXERCITADA:
 *
 *    HTTP real → rota TanStack → verificação de assinatura → normalização →
 *    roteamento de tenant → inbox pattern → aplicação → PostgREST → tela
 *
 *  Os testes de unidade provam cada peça. Os de integração provam o banco.
 *  NENHUM prova que a rota chega ao banco — e é ali que mora o defeito que
 *  derruba a clínica: uma variável de ambiente faltando, um import estático
 *  quebrando o bundle, um `params.canal` que não chega.
 * ============================================================================
 */
import { createHmac } from "node:crypto";

import { expect, test } from "@playwright/test";

import { BASE_URL } from "../playwright.config";
import { apagarDoBanco, gravarNoBanco, lerDoBanco } from "./apoio/ambiente";
import { CLINICA_B } from "./apoio/instalar";
import { abrirAba, entrarNoCrc } from "./apoio/entrar";

/** O mesmo valor de `scripts/servidor-e2e.mjs`. Ver o cabeçalho de lá. */
const APP_SECRET = "app-secret-de-e2e-do-crc";

const PAGE_A = "104000000000001";
const IGID_A = "17841400000000099";
const PAGE_B = "104000000000002";
const IGID_B = "17841400000000199";

const IGSID = "17841400000000001";
const IGSID_OUTRO = "17841400000000002";

const MIDIA_DE_CAPTACAO = "media-de-captacao-e2e";

/** O recorte de `crc_regras_sociais` que o teste do §66 confere. */
type Regra = { id: string; ativa: boolean; nao_contem: string[] };

/* -------------------------------------------------------------------------- */
/* O cenário                                                                  */
/* -------------------------------------------------------------------------- */

type Cenario = {
  organizationId: string;
  clinicId: string;
  clinicBId: string;
  canalA: string;
  canalB: string;
};

/**
 * Semeia as duas contas da Meta, uma por clínica.
 *
 * ============================================================================
 *  DUAS CONTAS, SEMPRE — o mesmo argumento de `semearDuasClinicas` nos testes
 *  de integração: um cenário de um tenant só não consegue provar isolamento,
 *  porque não existe o que errar.
 *
 *  A clínica B existe aqui para que vazamento tenha onde aparecer.
 * ============================================================================
 *
 * O CANAL É SEMEADO PELO BANCO, e não pela tela, por um motivo honesto: a tela
 * exige um Page Access Token, e não existe token de verdade para colar. O que o
 * teste exercita é o caminho de ENTRADA, que não usa o token — ele usa o
 * `appSecret` do app, que vem do ambiente.
 */
async function montarCenario(): Promise<Cenario> {
  /*
   * ==========================================================================
   *  A ÂNCORA É A CLÍNICA `vizinha`, E NÃO "a primeira do banco".
   *
   *  O mesmo Postgres serve os testes de integração, e eles deixam clínicas de
   *  outras organizações para trás. Pegar a primeira por `criado_em` escolhia
   *  uma dessas — e o `insert` batia na chave estrangeira composta
   *  `(organization_id, clinic_id)`, que existe exatamente para impedir que um
   *  canal aponte para a clínica de outra organização.
   *
   *  `instalar.ts` cria a `vizinha` DENTRO da organização do E2E. Partir dela e
   *  procurar a matriz na MESMA organização é o que torna este cenário imune ao
   *  que outra suíte deixou no banco.
   * ==========================================================================
   */
  const clinicas = await lerDoBanco<{ id: string; organization_id: string; slug: string }>(
    `crc_clinics?select=id,organization_id,slug&order=criado_em.asc`,
  );

  const segunda = clinicas.find((c) => c.slug === CLINICA_B.slug);
  const matriz =
    segunda === undefined
      ? undefined
      : clinicas.find(
          (c) => c.organization_id === segunda.organization_id && c.slug !== CLINICA_B.slug,
        );
  if (matriz === undefined || segunda === undefined) {
    throw new Error("O cenário do E2E precisa das duas clínicas. Ver e2e/apoio/instalar.ts.");
  }

  /*
   * ==========================================================================
   *  A LIMPEZA É DO CENÁRIO **E** DO RASTRO — e a segunda metade foi aprendida
   *  quebrando o teste de outra pessoa.
   *
   *  O banco do E2E é COMPARTILHADO e os arquivos rodam em série. Este spec
   *  criava oportunidade (`origem` = `instagram:comentario`, `meta_lead_ads`) e
   *  não apagava — e `radar.spec.ts`, que roda depois e exige base vazia,
   *  reprovava com "Nenhuma oportunidade aberta" ausente.
   *
   *  A falha aparecia num arquivo que ninguém tinha tocado, o que é o pior
   *  desfecho possível: quem investiga começa pelo Radar.
   *
   *  O FILTRO É POR `origem`, e não um `delete` geral: a semente de exemplo tem
   *  oportunidades que as outras telas usam, e levar tudo junto trocaria um
   *  teste quebrado por três.
   *
   *  A ORDEM TAMBÉM IMPORTA: oportunidade referencia lead, então ela sai antes.
   * ==========================================================================
   */
  const daMatriz = `organization_id=eq.${matriz.organization_id}`;

  await apagarDoBanco(
    `crc_opportunities?${daMatriz}&origem=in.(instagram:comentario,meta_lead_ads)`,
  );
  await apagarDoBanco(`crc_canais_meta?${daMatriz}`);
  await apagarDoBanco(`crc_social_events?${daMatriz}`);
  await apagarDoBanco(`crc_private_replies?${daMatriz}`);
  await apagarDoBanco(`crc_regras_sociais?${daMatriz}`);
  await apagarDoBanco(`crc_conversations?${daMatriz}&canal=in.(instagram,messenger)`);
  await apagarDoBanco(`crc_leads?${daMatriz}&meta_lead_id=not.is.null`);
  await apagarDoBanco(`crc_leads?${daMatriz}&utm_content=eq.${MIDIA_DE_CAPTACAO}`);
  await apagarDoBanco(`crc_webhook_inbox?provedor=eq.meta`);

  /*
   * ==========================================================================
   *  AS IDENTIDADES TAMBÉM, e este foi o defeito mais sutil deste arquivo.
   *
   *  O teste de vínculo grava `EXTERNAL_ID / instagram / <IGSID>` — e essa
   *  linha SOBREVIVE, porque é isso que ela existe para fazer. Na volta
   *  seguinte, `resolverConversaNoCanal` acha o paciente pela identidade e a
   *  conversa nasce JÁ VINCULADA.
   *
   *  O teste que afirma "ela nasce sem paciente, e isso é o caso normal" então
   *  falhava — e a falha era verdadeira: o comportamento do sistema estava
   *  certo, e o cenário do teste é que não estava limpo.
   * ==========================================================================
   */
  for (const valor of [IGSID, IGSID_OUTRO]) {
    await apagarDoBanco(
      `crc_patient_identities?organization_id=eq.${matriz.organization_id}&valor=eq.${valor}`,
    );
  }

  const criados = await gravarNoBanco("crc_canais_meta", [
    {
      organization_id: matriz.organization_id,
      clinic_id: matriz.id,
      provider: "meta",
      produtos: ["instagram", "messenger", "comentarios", "lead_ads"],
      page_id: PAGE_A,
      instagram_account_id: IGID_A,
      display_name: "JP Clinica",
      username: "jpclinica",
      ativo: true,
    },
    {
      organization_id: matriz.organization_id,
      clinic_id: segunda.id,
      provider: "meta",
      produtos: ["instagram"],
      page_id: PAGE_B,
      instagram_account_id: IGID_B,
      display_name: "JP Centro",
      // AS DUAS LINHAS TÊM AS MESMAS CHAVES, e isso não é estilo.
      //
      // O PostgREST recusa inserção em lote quando os objetos diferem em
      // chave — `PGRST102: All object keys must match`. O erro não diz qual
      // chave falta, e omitir `username` na segunda derrubava as doze provas
      // deste arquivo de uma vez.
      username: "jpcentro",
      ativo: true,
    },
  ]);

  return {
    organizationId: matriz.organization_id,
    clinicId: matriz.id,
    clinicBId: segunda.id,
    canalA: String(criados[0]?.["id"] ?? ""),
    canalB: String(criados[1]?.["id"] ?? ""),
  };
}

/**
 * Manda um webhook ASSINADO para a rota da Meta.
 *
 * ============================================================================
 *  A ASSINATURA É CALCULADA SOBRE OS BYTES QUE VÃO NO FIO.
 *
 *  `JSON.stringify` é feito UMA vez, e a mesma string é assinada e enviada.
 *  Assinar o objeto e serializar de novo mudaria ordem de chave e espaçamento —
 *  e a conferência falharia em 100% dos casos, com o sintoma "a Meta não está
 *  mandando nada".
 * ============================================================================
 */
async function webhook(canalId: string, payload: unknown): Promise<number> {
  const corpo = JSON.stringify(payload);
  const assinatura =
    "sha256=" + createHmac("sha256", APP_SECRET).update(corpo, "utf8").digest("hex");

  const r = await fetch(`${BASE_URL}/api/crc/meta/${canalId}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": assinatura,
    },
    body: corpo,
  });

  return r.status;
}

function directDoInstagram(p: { conta: string; de: string; mid: string; texto: string }) {
  return {
    object: "instagram",
    entry: [
      {
        id: p.conta,
        time: Math.floor(Date.now() / 1000),
        messaging: [
          {
            sender: { id: p.de },
            recipient: { id: p.conta },
            timestamp: Date.now(),
            message: { mid: p.mid, text: p.texto },
          },
        ],
      },
    ],
  };
}

function comentario(p: { conta: string; id: string; ator: string; texto: string }) {
  return {
    object: "instagram",
    entry: [
      {
        id: p.conta,
        time: Math.floor(Date.now() / 1000),
        changes: [
          {
            field: "comments",
            value: {
              id: p.id,
              text: p.texto,
              from: { id: p.ator, username: "joao_do_e2e" },
              media: { id: MIDIA_DE_CAPTACAO },
              created_time: Math.floor(Date.now() / 1000),
            },
          },
        ],
      },
    ],
  };
}

function leadgen(p: { conta: string; leadgenId: string }) {
  return {
    object: "page",
    entry: [
      {
        id: p.conta,
        time: Math.floor(Date.now() / 1000),
        changes: [
          {
            field: "leadgen",
            value: {
              leadgen_id: p.leadgenId,
              page_id: p.conta,
              form_id: "form-do-e2e",
              adgroup_id: "ad-do-e2e",
              created_time: Math.floor(Date.now() / 1000),
            },
          },
        ],
      },
    ],
  };
}

/* -------------------------------------------------------------------------- */
/* E2E 1 — o direct entra na Inbox, e a resposta sai                          */
/* -------------------------------------------------------------------------- */

test("o direct do Instagram entra na Inbox, e a resposta da recepção sai", async ({ page }) => {
  const cenario = await montarCenario();
  const mid = `mid.e2e.${String(Date.now())}`;

  const status = await webhook(
    cenario.canalA,
    directDoInstagram({
      conta: IGID_A,
      de: IGSID,
      mid,
      texto: "quanto custa um implante?",
    }),
  );
  expect(status).toBe(200);

  /*
   * A CONVERSA NASCEU COM O CANAL E COM O IGSID — e não com um telefone
   * inventado. Ver `resolverConversaNoCanal`: reaproveitar o caminho de
   * telefone faria o IGSID casar com um paciente por coincidência numérica.
   */
  await expect
    .poll(
      async () => {
        const linhas = await lerDoBanco<{ canal: string; contato_externo: string }>(
          `crc_conversations?contato_externo=eq.${IGSID}&select=canal,contato_externo`,
        );
        return linhas[0]?.canal ?? null;
      },
      { timeout: 15_000, message: "a conversa do Instagram não apareceu no banco" },
    )
    .toBe("instagram");

  await entrarNoCrc(page);
  await abrirAba(page, "Conversas");

  /*
   * O SELO DE CANAL É A PROVA VISUAL DO §22.
   *
   * Ele é o que responde "de onde veio isto?" antes de a pessoa abrir a
   * conversa — e o que impede o erro que a Inbox unificada torna possível:
   * responder no Instagram achando que é WhatsApp.
   *
   * A busca é por `aria-label`, e não por texto: no celular o texto do selo
   * dentro da lista vira texto só para leitor, e o rótulo acessível é o que
   * permanece nos dois tamanhos.
   */
  const conversa = page
    .getByRole("option")
    .filter({ has: page.getByLabel("conversa por direct do Instagram") })
    .first();
  await expect(conversa).toBeVisible({ timeout: 15_000 });
  await conversa.click();

  await expect(page.getByText("quanto custa um implante?")).toBeVisible();

  /*
   * ASSUMIR É OBRIGATÓRIO, E A ESPERA TAMBÉM — §28.
   *
   * O painel monta em duas etapas, e um `isVisible()` disparado antes da
   * segunda devolve `false` sem esperar. O resultado é o teste PULAR o clique,
   * o "Enviar" ser recusado com "assuma antes de responder", e a falha aparecer
   * vinte segundos depois como "o envio não chegou ao adapter" — três camadas
   * longe da causa. Foi exatamente isso na primeira volta deste arquivo.
   *
   * A espera é pelo DONO NO BANCO, e não pelo botão sumir: é o dono que o
   * servidor confere quando o envio chega.
   */
  const assumir = page.getByRole("button", { name: "Assumir conversa" });
  await expect(assumir).toBeVisible({ timeout: 15_000 });
  await assumir.click();

  await expect
    .poll(
      async () => {
        const linhas = await lerDoBanco<{ assigned_to: string | null }>(
          `crc_conversations?contato_externo=eq.${IGSID}&select=assigned_to`,
        );
        return linhas[0]?.assigned_to ?? null;
      },
      { timeout: 15_000, message: "a conversa não ficou com dono, e o envio seria recusado" },
    )
    .not.toBeNull();

  const resposta = `Bom dia! Vamos marcar sua avaliação. ${String(Date.now())}`;
  await page.getByLabel("Resposta ao paciente").fill(resposta);
  await page.getByRole("button", { name: "Enviar" }).click();

  /*
   * ==========================================================================
   *  A PROVA DE QUE O ENVIO SAIU É O `provider_message_id` DO SANDBOX.
   *
   *  O fake vive no processo do SERVIDOR; o teste não tem acesso à memória
   *  dele. O que os dois compartilham é o banco — e uma mensagem `SENT` com
   *  `sandbox-meta-*` só existe se o adapter foi chamado de verdade.
   *
   *  Uma asserção sobre a bolha aparecer na tela passaria com uma interface que
   *  só empurra o texto no estado local, que é exatamente o defeito que este
   *  teste existe para pegar.
   * ==========================================================================
   */
  await expect
    .poll(
      async () => {
        const linhas = await lerDoBanco<{ provider_message_id: string | null }>(
          `crc_messages?direcao=eq.SAIDA&conteudo=eq.${encodeURIComponent(resposta)}` +
            `&select=provider_message_id,status_entrega`,
        );
        return linhas[0]?.provider_message_id ?? null;
      },
      { timeout: 20_000, message: "o envio pelo Instagram não chegou ao adapter" },
    )
    .toContain("sandbox-meta-");
});

/* -------------------------------------------------------------------------- */
/* E2E 2 — o mesmo webhook duas vezes não duplica                             */
/* -------------------------------------------------------------------------- */

test("o mesmo direct entregue duas vezes produz UMA mensagem", async () => {
  const cenario = await montarCenario();
  const mid = `mid.dedupe.${String(Date.now())}`;
  const envelope = directDoInstagram({
    conta: IGID_A,
    de: IGSID,
    mid,
    texto: "tem horário hoje?",
  });

  /*
   * A META REENTREGA quando não recebe 200 rápido o bastante. Sem a dedupe, a
   * mesma pergunta viraria três mensagens na Inbox, três classificações de IA
   * cobradas e três respostas para a mesma pessoa.
   */
  expect(await webhook(cenario.canalA, envelope)).toBe(200);
  expect(await webhook(cenario.canalA, envelope)).toBe(200);
  expect(await webhook(cenario.canalA, envelope)).toBe(200);

  await expect
    .poll(
      async () => {
        const linhas = await lerDoBanco<{ id: string }>(
          `crc_messages?provider_message_id=eq.${mid}&select=id`,
        );
        return linhas.length;
      },
      { timeout: 15_000, message: "a dedupe por provider_message_id não valeu" },
    )
    .toBe(1);
});

/* -------------------------------------------------------------------------- */
/* E2E 3 — o comentário IMPLANTE dispara private reply EXATAMENTE uma vez     */
/* -------------------------------------------------------------------------- */

test("comentário IMPLANTE vira lead e recebe private reply UMA vez", async () => {
  const cenario = await montarCenario();

  // A regra, com o veto real de uma clínica odontológica e a mídia listada.
  await gravarNoBanco("crc_regras_sociais", [
    {
      organization_id: cenario.organizationId,
      clinic_id: null,
      nome: "Implante E2E",
      canal: "instagram",
      evento: "comment.created",
      contem: ["implante"],
      nao_contem: ["capilar"],
      exigir_captacao: true,
      midias: [MIDIA_DE_CAPTACAO],
      criar_lead: true,
      criar_oportunidade: true,
      enviar_private_reply: true,
      intencao: "INTERESSE",
      cooldown_horas: 168,
      ativa: true,
    },
  ]);

  /*
   * A autonomia precisa permitir: private reply é risco MÉDIO (contato não
   * solicitado), e isso exige nível 4 com a flag de envio ligada — §27.
   *
   * APAGAR ANTES DE GRAVAR, porque as duas tabelas têm chave única e a suíte
   * roda mais de uma vez contra o mesmo banco. Sem isto, a segunda volta morre
   * com `23505` — e o sintoma é um teste que passa na máquina de quem escreveu
   * e falha em toda execução seguinte.
   */
  await apagarDoBanco(
    `crc_feature_flags?organization_id=eq.${cenario.organizationId}&chave=eq.ai_agente_envio`,
  );
  await gravarNoBanco("crc_feature_flags", [
    { organization_id: cenario.organizationId, chave: "ai_agente_envio", ligada: true },
  ]);
  await apagarDoBanco(
    `crc_autonomia?organization_id=eq.${cenario.organizationId}&dominio=eq.mensagens&clinic_id=is.null`,
  );
  await gravarNoBanco("crc_autonomia", [
    {
      organization_id: cenario.organizationId,
      clinic_id: null,
      dominio: "mensagens",
      canal: "",
      nivel: 4,
    },
  ]);

  const marca = String(Date.now());

  /*
   * TRÊS COMENTÁRIOS DA MESMA PESSOA, com ids diferentes.
   *
   * ==========================================================================
   *  É O §17 LITERAL: "a mesma pessoa comentando 10 vezes não pode receber 10
   *  directs idênticos".
   *
   *  E o que protege NÃO é a dedupe por id de comentário — cada comentário tem
   *  id próprio, e cada um passaria. É a reserva por
   *  `regra + ator + mídia + janela`, decidida pelo BANCO.
   * ==========================================================================
   */
  for (let i = 1; i <= 3; i += 1) {
    const status = await webhook(
      cenario.canalA,
      comentario({
        conta: IGID_A,
        id: `comment.${marca}.${String(i)}`,
        ator: IGSID_OUTRO,
        texto: "quero saber do IMPLANTE 🦷",
      }),
    );
    expect(status).toBe(200);
  }

  // Os três comentários foram REGISTRADOS: comentário que não vira lead ainda é
  // o denominador da taxa de conversão de conteúdo.
  await expect
    .poll(
      async () => {
        const linhas = await lerDoBanco<{ id: string }>(
          `crc_social_events?external_actor_id=eq.${IGSID_OUTRO}&select=id`,
        );
        return linhas.length;
      },
      { timeout: 15_000, message: "os comentários não foram registrados" },
    )
    .toBe(3);

  // UM lead, e não três: a política de dedupe é contato + dia.
  const leads = await lerDoBanco<{ id: string; origem: string; utm_content: string }>(
    `crc_leads?utm_content=eq.${MIDIA_DE_CAPTACAO}&select=id,origem,utm_content`,
  );
  expect(leads).toHaveLength(1);
  expect(leads[0]?.origem).toBe("INSTAGRAM");

  /*
   * E UMA reserva, com UM envio. É a asserção central deste arquivo.
   */
  const reservas = await lerDoBanco<{
    status: string;
    provider_message_id: string | null;
    erro: string | null;
  }>(
    `crc_private_replies?external_actor_id=eq.${IGSID_OUTRO}` +
      `&select=status,provider_message_id,erro`,
  );
  expect(reservas).toHaveLength(1);

  /*
   * O `motivo` ENTRA NA ASSERÇÃO, e não só o status.
   *
   * `BLOQUEADO` pode vir de quatro lugares — política do canal, autonomia,
   * porta não configurada, ou a regra não casar. Um `expect(status).toBe(...)`
   * sozinho diz "deu BLOQUEADO" e esconde qual dos quatro: a falha obriga a
   * reproduzir à mão para descobrir. Com o motivo na mensagem, a saída do CI
   * basta.
   */
  expect(`${reservas[0]?.status ?? "?"} — ${reservas[0]?.erro ?? "sem motivo"}`).toContain(
    "ENVIADO",
  );
  expect(reservas[0]?.provider_message_id ?? "").toContain("sandbox-meta-");
});

test("`implante capilar` NÃO vira lead — o veto do §43", async () => {
  const cenario = await montarCenario();

  await gravarNoBanco("crc_regras_sociais", [
    {
      organization_id: cenario.organizationId,
      clinic_id: null,
      nome: "Implante E2E veto",
      canal: "instagram",
      evento: "comment.created",
      contem: ["implante"],
      nao_contem: ["capilar"],
      exigir_captacao: true,
      midias: [MIDIA_DE_CAPTACAO],
      criar_lead: true,
      enviar_private_reply: true,
      cooldown_horas: 168,
      ativa: true,
    },
  ]);

  const marca = String(Date.now());
  expect(
    await webhook(
      cenario.canalA,
      comentario({
        conta: IGID_A,
        id: `comment.veto.${marca}`,
        ator: IGSID_OUTRO,
        texto: "vocês fazem implante capilar?",
      }),
    ),
  ).toBe(200);

  /*
   * O EVENTO É REGISTRADO COM O MOTIVO, e nada mais acontece. É a diferença
   * entre "o CRC ignorou" e "o CRC não viu": o motivo na tela é o que permite a
   * alguém entender por que nada aconteceu, em vez de responder à mão.
   */
  await expect
    .poll(
      async () => {
        const linhas = await lerDoBanco<{ processing_status: string; resultado: string }>(
          `crc_social_events?external_event_id=eq.comment.veto.${marca}&select=processing_status,resultado`,
        );
        return linhas[0]?.processing_status ?? null;
      },
      { timeout: 15_000, message: "o comentário vetado não foi registrado" },
    )
    .toBe("IGNORADO");

  const eventos = await lerDoBanco<{ resultado: string }>(
    `crc_social_events?external_event_id=eq.comment.veto.${marca}&select=resultado`,
  );
  expect(eventos[0]?.resultado ?? "").toContain("capilar");

  expect(
    await lerDoBanco<{ id: string }>(
      `crc_private_replies?external_actor_id=eq.${IGSID_OUTRO}&select=id`,
    ),
  ).toHaveLength(0);
});

/* -------------------------------------------------------------------------- */
/* E2E 4 — o lead de anúncio aparece no funil, com a origem                   */
/* -------------------------------------------------------------------------- */

test("o lead de Instant Form aparece no funil com a origem correta", async ({ page }) => {
  const cenario = await montarCenario();
  const leadgenId = `lead.e2e.${String(Date.now())}`;

  expect(await webhook(cenario.canalA, leadgen({ conta: PAGE_A, leadgenId }))).toBe(200);

  /*
   * ==========================================================================
   *  O LEAD ENTRA MESMO SEM A GRAPH API — e é o teste que mais vale dinheiro.
   *
   *  Não há token real neste ambiente, então a busca dos detalhes falha. A
   *  ordem `persistir leadgen_id → buscar na Graph` é exatamente o que faz o
   *  lead NÃO ser perdido: ele nasce com o id e o nome provisório, e a
   *  reconciliação o completa depois.
   *
   *  Chamar a Graph primeiro e gravar depois perderia o lead junto com a falha,
   *  e ele nunca voltaria: o webhook não reenvia.
   * ==========================================================================
   */
  await expect
    .poll(
      async () => {
        const linhas = await lerDoBanco<{ origem: string; utm_medium: string }>(
          `crc_leads?meta_lead_id=eq.${leadgenId}&select=origem,utm_medium`,
        );
        return linhas[0]?.utm_medium ?? null;
      },
      { timeout: 20_000, message: "o lead do Instant Form não entrou" },
    )
    .toBe("lead_ads");

  // A oportunidade nasceu junto: sem ela o lead não aparece na fila de ninguém.
  const oportunidades = await lerDoBanco<{ origem: string; tipo: string }>(
    `crc_opportunities?origem=eq.meta_lead_ads&select=origem,tipo`,
  );
  expect(oportunidades.length).toBeGreaterThan(0);
  expect(oportunidades[0]?.tipo).toBe("NEW_LEAD");

  // E o toque de atribuição, que é o primeiro elo da cadeia do §19.
  const toques = await lerDoBanco<{ elo: string; canal: string }>(
    `crc_attribution_events?chave_dedupe=eq.meta_lead:${leadgenId}&select=elo,canal`,
  );
  expect(toques).toHaveLength(1);
  expect(toques[0]?.elo).toBe("ACAO");

  // A ORIGEM APARECE NO CARD — §42. Uma linha, e só.
  await entrarNoCrc(page);
  await abrirAba(page, "Funil");
  await expect(page.getByText("Meta Lead Ads").first()).toBeVisible({ timeout: 15_000 });
});

/* -------------------------------------------------------------------------- */
/* E2E 5 — o evento da clínica B nunca aparece na A                           */
/* -------------------------------------------------------------------------- */

test("o direct da clínica B NÃO entra na clínica A", async () => {
  const cenario = await montarCenario();
  const mid = `mid.tenant.${String(Date.now())}`;

  /*
   * ==========================================================================
   *  O TESTE MAIS IMPORTANTE DESTE ARQUIVO.
   *
   *  Num sistema de saúde, dado de paciente atravessando a fronteira de uma
   *  organização não é defeito funcional: é a conversa de alguém aparecendo
   *  para quem não deveria vê-la.
   *
   *  A cadeia exercitada aqui não existe em nenhum outro teste: HTTP →
   *  `params.canal` → `crc_canais_meta` → `resolverTenantDaMeta` → a clínica
   *  gravada na conversa.
   * ==========================================================================
   */
  expect(
    await webhook(
      cenario.canalB,
      directDoInstagram({ conta: IGID_B, de: IGSID_OUTRO, mid, texto: "oi, sou da unidade B" }),
    ),
  ).toBe(200);

  await expect
    .poll(
      async () => {
        const linhas = await lerDoBanco<{ clinic_id: string }>(
          `crc_conversations?contato_externo=eq.${IGSID_OUTRO}&canal=eq.instagram&select=clinic_id`,
        );
        return linhas[0]?.clinic_id ?? null;
      },
      { timeout: 15_000, message: "a conversa da clínica B não apareceu" },
    )
    .toBe(cenario.clinicBId);

  // E NENHUMA linha ficou na matriz.
  const naMatriz = await lerDoBanco<{ id: string }>(
    `crc_conversations?contato_externo=eq.${IGSID_OUTRO}&clinic_id=eq.${cenario.clinicId}&select=id`,
  );
  expect(naMatriz).toHaveLength(0);
});

test("um corpo assinado por um canal, endereçado a OUTRA conta, é recusado", async () => {
  const cenario = await montarCenario();

  /*
   * ==========================================================================
   *  A ASSINATURA PROVA QUE O CORPO É AUTÊNTICO — não que ele é DESTA conta.
   *
   *  Um tenant com acesso ao próprio app secret poderia assinar um corpo
   *  dizendo ser de outra Página. Sem a conferência de conta, o direct entraria
   *  na Inbox do vizinho com assinatura válida.
   *
   *  Aqui o corpo é assinado corretamente E endereçado à conta da clínica B,
   *  mandado para a rota da clínica A.
   * ==========================================================================
   */
  const status = await webhook(
    cenario.canalA,
    directDoInstagram({
      conta: IGID_B,
      de: IGSID_OUTRO,
      mid: `mid.intruso.${String(Date.now())}`,
      texto: "deveria ser recusado",
    }),
  );

  expect(status).toBe(401);
});

test("um webhook SEM assinatura é recusado", async () => {
  const cenario = await montarCenario();

  /*
   * SEM ISTO, QUALQUER PESSOA QUE DESCUBRA A URL É A META — e o webhook
   * alimenta a Inbox, a IA e a automação. Um POST forjado dizendo "a paciente
   * Ana escreveu: cancele minha consulta" seria obedecido.
   */
  const r = await fetch(`${BASE_URL}/api/crc/meta/${cenario.canalA}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(
      directDoInstagram({ conta: IGID_A, de: IGSID, mid: "mid.sem.assinatura", texto: "forjado" }),
    ),
  });

  expect(r.status).toBe(401);

  // E NADA foi gravado.
  const linhas = await lerDoBanco<{ id: string }>(
    `crc_messages?provider_message_id=eq.mid.sem.assinatura&select=id`,
  );
  expect(linhas).toHaveLength(0);
});

test("o handshake de verificação devolve o desafio como texto puro", async () => {
  const cenario = await montarCenario();

  const r = await fetch(
    `${BASE_URL}/api/crc/meta/${cenario.canalA}` +
      `?hub.mode=subscribe&hub.verify_token=verify-token-de-e2e-do-crc&hub.challenge=1158201444`,
  );

  expect(r.status).toBe(200);
  /*
   * SEM ASPAS E SEM JSON: a Meta compara byte a byte com o que ela mandou.
   * `JSON.stringify(desafio)` acrescenta aspas e a validação falha — com a
   * mensagem inútil "The URL couldn't be validated".
   */
  expect((await r.text()).trim()).toBe("1158201444");

  const errado = await fetch(
    `${BASE_URL}/api/crc/meta/${cenario.canalA}` +
      `?hub.mode=subscribe&hub.verify_token=token-errado&hub.challenge=x`,
  );
  expect(errado.status).toBe(403);
});

/* -------------------------------------------------------------------------- */
/* E2E 6 — a identidade cross-channel                                         */
/* -------------------------------------------------------------------------- */

test("o perfil do Instagram é vinculado a um paciente pela Inbox", async ({ page }) => {
  const cenario = await montarCenario();
  const mid = `mid.vinculo.${String(Date.now())}`;

  expect(
    await webhook(
      cenario.canalA,
      directDoInstagram({ conta: IGID_A, de: IGSID, mid, texto: "sou a Maria, já fui aí" }),
    ),
  ).toBe(200);

  await expect
    .poll(
      async () => {
        const linhas = await lerDoBanco<{ patient_id: string | null }>(
          `crc_conversations?contato_externo=eq.${IGSID}&select=patient_id`,
        );
        return linhas.length;
      },
      { timeout: 15_000, message: "a conversa não apareceu" },
    )
    .toBe(1);

  /*
   * ELA NASCE SEM PACIENTE, E ISSO É O CASO NORMAL. Quem chega por direct quase
   * nunca tem ficha — é prospect. O painel de vínculo existe para o momento em
   * que quem atende descobre quem é.
   */
  const antes = await lerDoBanco<{ patient_id: string | null }>(
    `crc_conversations?contato_externo=eq.${IGSID}&select=patient_id`,
  );
  expect(antes[0]?.patient_id ?? null).toBeNull();

  const paciente = await lerDoBanco<{ id: string; nome: string }>(
    `crc_patients?external_id=eq.e2e-matriz&select=id,nome`,
  );
  const alvo = paciente[0];
  if (alvo === undefined) throw new Error("O cenário precisa do paciente da matriz.");

  await entrarNoCrc(page);
  await abrirAba(page, "Conversas");

  const conversa = page
    .getByRole("option")
    .filter({ has: page.getByLabel("conversa por direct do Instagram") })
    .first();
  await expect(conversa).toBeVisible({ timeout: 15_000 });
  await conversa.click();

  // O painel de vínculo aparece na própria conversa — §25.
  const busca = page.getByLabel("Buscar paciente por nome, telefone ou e-mail");
  await expect(busca).toBeVisible();
  await busca.fill(alvo.nome.slice(0, 8));
  await page.getByRole("button", { name: "Buscar" }).click();

  /*
   * O BOTÃO É O DA LINHA DO PACIENTE CERTO, e não o primeiro da lista.
   *
   * A busca por nome pode devolver mais de um — e `.first()` escolheria por
   * ordem de retorno. Num teste que existe para provar que o vínculo liga a
   * pessoa CERTA, pegar a primeira linha é medir a sorte.
   */
  await page
    .getByRole("listitem")
    .filter({ hasText: alvo.nome })
    .first()
    .getByRole("button", { name: "Vincular" })
    .click();

  /*
   * ==========================================================================
   *  A PROVA É A IDENTIDADE GRAVADA COM NAMESPACE.
   *
   *  `EXTERNAL_ID / instagram / <IGSID>` — e nunca `dental-office`. Um IGSID
   *  gravado com o namespace do prontuário é exatamente a colisão que o
   *  `supabase/45` existe para impedir: o direct de um estranho entrando na
   *  ficha de um paciente escolhido por coincidência numérica.
   * ==========================================================================
   */
  await expect
    .poll(
      async () => {
        const linhas = await lerDoBanco<{ namespace: string; tipo: string }>(
          `crc_patient_identities?valor=eq.${IGSID}&select=namespace,tipo`,
        );
        return linhas[0]?.namespace ?? null;
      },
      { timeout: 20_000, message: "a identidade do perfil não foi gravada" },
    )
    .toBe("instagram");

  // E a conversa ficou com o paciente — junto com as mensagens já recebidas.
  const depois = await lerDoBanco<{ patient_id: string | null }>(
    `crc_conversations?contato_externo=eq.${IGSID}&select=patient_id`,
  );
  expect(depois[0]?.patient_id).toBe(alvo.id);

  const mensagens = await lerDoBanco<{ patient_id: string | null }>(
    `crc_messages?provider_message_id=eq.${mid}&select=patient_id`,
  );
  expect(mensagens[0]?.patient_id).toBe(alvo.id);
});

/* -------------------------------------------------------------------------- */
/* E2E 7 — a tela de Integrações não mente                                    */
/* -------------------------------------------------------------------------- */

test("a tela da Meta mostra estado medido, e nunca token", async ({ page }) => {
  const cenario = await montarCenario();

  await entrarNoCrc(page);
  await abrirAba(page, "Integrações");

  const cartao = page.getByLabel("Integração com a Meta");
  await expect(cartao).toBeVisible({ timeout: 15_000 });

  /*
   * ==========================================================================
   *  A CONTA ACABOU DE SER CADASTRADA E NENHUM WEBHOOK CHEGOU AINDA.
   *
   *  O §74 proíbe a UI dizer "Conectado" quando só existe credencial, e o §39
   *  proíbe "tudo certo porque as env vars existem". O estado honesto aqui é
   *  ATENÇÃO — porque a causa mais comum de silêncio é a subscrição do webhook
   *  ter ficado sem o campo certo, e isso não dá erro nenhum.
   * ==========================================================================
   */
  await expect(cartao.getByText("nenhum webhook chegou ainda", { exact: false })).toBeVisible();

  // A conta aparece com os ids, e o token NUNCA.
  await expect(cartao.getByText(PAGE_A, { exact: false })).toBeVisible();
  await expect(cartao.getByText("app-secret-de-e2e-do-crc")).toHaveCount(0);

  // E o estado passa a CONECTADO depois de um webhook de verdade.
  expect(
    await webhook(
      cenario.canalA,
      directDoInstagram({
        conta: IGID_A,
        de: IGSID,
        mid: `mid.saude.${String(Date.now())}`,
        texto: "oi",
      }),
    ),
  ).toBe(200);

  await page.reload();
  await abrirAba(page, "Integrações");

  /*
   * A ASSERÇÃO É SOBRE A FRASE DO ESTADO `CONECTADO`, e não sobre o rótulo do
   * sinal.
   *
   * "Último webhook" é rótulo de linha: ele está na tela nos QUATRO estados, e
   * uma asserção sobre ele passaria com o cartão ainda em ATENÇÃO. "sem falhas
   * pendentes" só existe no desfecho `CONECTADO` de `lerSaudeDaMeta` — é a
   * frase que prova que o estado virou por causa do webhook que acabou de
   * chegar.
   */
  await expect(
    page.getByLabel("Integração com a Meta").getByText("sem falhas pendentes", { exact: false }),
  ).toBeVisible({ timeout: 15_000 });
});

/* -------------------------------------------------------------------------- */

test("o webhook de um canal desconhecido é 404, e não vira linha de fila", async () => {
  await montarCenario();

  /*
   * 404 E NÃO 503: canal inexistente não é falha de configuração que se resolve
   * sozinha — é uma URL que não corresponde a nada, e 503 faria a Meta reenviar
   * para sempre.
   */
  const r = await fetch(`${BASE_URL}/api/crc/meta/00000000-0000-4000-8000-000000000000`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ object: "instagram", entry: [] }),
  });

  expect(r.status).toBe(404);

  // Nenhuma linha de fila: gravar uma para cada sondagem encheria a tabela.
  const linhas = await lerDoBanco<{ id: string }>(`crc_webhook_inbox?provedor=eq.meta&select=id`);
  expect(linhas).toHaveLength(0);
});

/* -------------------------------------------------------------------------- */
/* E2E 8 — a regra de comentário é editável pela tela (§66)                   */
/* -------------------------------------------------------------------------- */

test("a regra de comentário é criada, editada e removida pela tela", async ({ page }) => {
  /*
   * ============================================================================
   *  AS FUNÇÕES DE SERVIDOR EXISTIAM E NINGUÉM AS CHAMAVA.
   *
   *  `salvarRegraDeComentario` e `removerRegraDeComentario` estavam prontas e
   *  testadas por unidade, e o cartão da Meta só LISTAVA as regras. O §66 pede
   *  configuração pela tela, e uma função de servidor sem chamador é a pior
   *  forma de "pronto": ela passa em todo teste e não existe para quem usa.
   *
   *  Este teste é o que amarra os dois lados. A prova é a linha em
   *  `crc_regras_sociais` — uma asserção sobre a lista da tela passaria com um
   *  formulário que só pinta o estado local.
   * ============================================================================
   */
  const cenario = await montarCenario();
  const nome = `Implante E2E ${String(Date.now())}`;

  await entrarNoCrc(page);
  await abrirAba(page, "Integrações");

  const cartao = page.getByLabel("Integração com a Meta");
  await expect(cartao).toBeVisible({ timeout: 15_000 });

  await cartao.getByRole("button", { name: "Nova regra" }).click();

  const modal = page.getByRole("dialog");
  await expect(modal).toBeVisible();

  await modal.getByLabel("Nome da regra").fill(nome);
  await modal.getByLabel("Contém (separe por vírgula)").fill("implante, implantes");
  await modal.getByLabel("NÃO contém (o veto)").fill("capilar, cabelo");
  await modal.getByLabel("IDs das mídias de captação").fill(MIDIA_DE_CAPTACAO);

  /*
   * A REGRA É ATIVADA AQUI, DE PROPÓSITO.
   *
   * O padrão do formulário é INATIVA — §4.5, o caminho do esquecimento leva ao
   * seguro. O que o teste prova é que a pessoa consegue ligar quando quer, e
   * que o estado chega ao banco.
   */
  await modal.getByRole("checkbox", { name: /Regra ativa/u }).check();
  await modal.getByRole("button", { name: "Salvar regra" }).click();

  const consultar = async (): Promise<Regra | null> => {
    const linhas = await lerDoBanco<Regra>(
      `crc_regras_sociais?nome=eq.${encodeURIComponent(nome)}&select=id,ativa,nao_contem`,
    );
    return linhas[0] ?? null;
  };

  await expect
    .poll(async () => (await consultar())?.ativa ?? null, {
      timeout: 15_000,
      message: "a regra não foi gravada, ou não ficou ativa",
    })
    .toBe(true);

  const gravada = await consultar();
  // O VETO CHEGOU INTEIRO. "implante capilar" é o falso positivo real de uma
  // clínica odontológica, e é o campo que mais importa deste formulário.
  expect(gravada?.nao_contem).toContain("capilar");

  /* ---------------------------------------------------------------------- */
  /* Editar: desligar a regra pela tela                                     */
  /* ---------------------------------------------------------------------- */

  const linha = cartao.locator(".crc-meta-canal").filter({ hasText: nome });
  await expect(linha).toBeVisible({ timeout: 15_000 });
  await linha.getByRole("button", { name: "Editar" }).click();

  const edicao = page.getByRole("dialog");
  await edicao.getByRole("checkbox", { name: /Regra ativa/u }).uncheck();
  await edicao.getByRole("button", { name: "Salvar regra" }).click();

  await expect
    .poll(
      async () => {
        const linhas = await lerDoBanco<{ ativa: boolean }>(
          `crc_regras_sociais?nome=eq.${encodeURIComponent(nome)}&select=ativa`,
        );
        return linhas[0]?.ativa ?? null;
      },
      { timeout: 15_000, message: "a edição não chegou ao banco" },
    )
    .toBe(false);

  /* ---------------------------------------------------------------------- */
  /* Remover                                                                */
  /* ---------------------------------------------------------------------- */

  const linhaDepois = cartao.locator(".crc-meta-canal").filter({ hasText: nome });
  await expect(linhaDepois).toBeVisible({ timeout: 15_000 });
  await linhaDepois.getByRole("button", { name: "Remover" }).click();

  await expect
    .poll(
      async () => {
        const linhas = await lerDoBanco(
          `crc_regras_sociais?nome=eq.${encodeURIComponent(nome)}&select=id`,
        );
        return linhas.length;
      },
      { timeout: 15_000, message: "a regra não foi removida" },
    )
    .toBe(0);

  // E a organização continua existindo: remover regra não mexe em canal.
  const canais = await lerDoBanco(
    `crc_canais_meta?organization_id=eq.${cenario.organizationId}&select=id`,
  );
  expect(canais.length).toBeGreaterThan(0);
});
