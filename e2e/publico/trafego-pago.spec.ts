import { expect, test, type Page } from "@playwright/test";

/**
 * O CAMINHO INTEIRO DO TRÁFEGO PAGO — anúncio, landing, WhatsApp.
 *
 * ============================================================================
 *  O QUE ESTES TESTES PROVAM QUE NENHUM TESTE DE UNIDADE PROVA.
 *
 *  `atribuicao.test.ts` prova que a função lê `gclid` de uma string. Isso não
 *  responde às perguntas que custam dinheiro:
 *
 *    o SSR entrega a página, ou o robô do Google Ads vê uma casca vazia?
 *    o `gclid` sobrevive ao React hidratar por cima?
 *    o CTA que aparece DEPOIS de rolar a página fala de implante?
 *    um clique produz UM lead, ou três?
 *    com o consentimento recusado, o WhatsApp ainda abre?
 *
 *  Cada uma dessas é um caminho inteiro — navegador, rota, hidratação, ouvinte
 *  de clique, `dataLayer` — e nenhuma delas cabe num teste de função pura.
 * ============================================================================
 *
 * O SERVIDOR NÃO TEM CRC, NEM GTM, NEM PIXEL — ver `scripts/servidor-site-e2e.mjs`.
 * É o ambiente que a campanha vai encontrar na primeira fase, e o `dataLayer`
 * continua sendo um array comum, que é o que permite contar eventos sem depender
 * do Google.
 */

const URL_ANUNCIO =
  "/implante-dentario?utm_source=google&utm_medium=cpc&utm_campaign=implante_search&utm_content=a01&gclid=TEST123";

type EventoDataLayer = Record<string, unknown>;

/** Lê o `dataLayer` como ele está. O `push` de consentimento entra como array;
 *  só os objetos com `event` são eventos nossos. */
async function eventos(page: Page): Promise<EventoDataLayer[]> {
  return page.evaluate(() => {
    const camada = (window as unknown as { dataLayer?: unknown[] }).dataLayer ?? [];
    return camada.filter(
      (e): e is Record<string, unknown> =>
        typeof e === "object" && e !== null && !Array.isArray(e) && "event" in e,
    );
  });
}

async function nomesDeEventos(page: Page): Promise<string[]> {
  return (await eventos(page)).map((e) => String(e["event"]));
}

/**
 * Espera o evento aparecer, em vez de ler o `dataLayer` na hora.
 *
 * `page.goto` devolve no `load`; os eventos saem de um `useEffect`, ou seja,
 * DEPOIS da hidratação. Ler imediatamente é uma corrida — e ela se comporta
 * como corrida: na primeira execução desta suíte, quatro das oito rotas pagas
 * passaram e três falharam, sem nenhuma diferença entre elas além do tempo que
 * o React levou. Um teste que depende de qual página hidratou mais rápido é um
 * teste que as pessoas aprendem a reexecutar.
 */
async function esperarEvento(page: Page, nome: string): Promise<void> {
  await expect
    .poll(async () => (await nomesDeEventos(page)).filter((e) => e === nome).length, {
      timeout: 10_000,
    })
    .toBeGreaterThan(0);
}

/**
 * O primeiro CTA de WhatsApp **visível**.
 *
 * `:visible` não é preciosismo: no celular o primeiro `a[href*="wa.me"]` do
 * documento é o do cabeçalho, que só aparece a partir de `xl`. Sem o filtro, a
 * suíte mobile testava um elemento que a pessoa nunca vê — e sete testes
 * reprovaram por isso, todos apontando para um link oculto.
 */
function ctaWhatsApp(page: Page) {
  return page.locator('a[href*="wa.me"]:visible').first();
}

/**
 * A mensagem do primeiro CTA de WhatsApp, esperando a hidratação.
 *
 * A referência de campanha é acrescentada por `useContatoWhatsApp` depois que o
 * componente monta — de propósito, para o HTML servido e o hidratado serem
 * iguais. Ler o `href` no instante do `load` devolveria a versão sem referência,
 * e o teste estaria medindo o primeiro render em vez do que a pessoa clica.
 */
async function mensagemDoPrimeiroCTA(page: Page): Promise<string> {
  const cta = ctaWhatsApp(page);
  await expect(cta).toBeVisible();
  const href = (await cta.getAttribute("href")) ?? "";
  return decodeURIComponent(href.split("text=")[1] ?? "");
}

/** A atribuição guardada, esperando o efeito que a grava. Mesma corrida de
 *  `esperarEvento`: `registrarEntrada` roda depois da hidratação. */
async function atribuicaoGuardada(page: Page): Promise<Record<string, string>> {
  await expect
    .poll(async () => page.evaluate(() => sessionStorage.getItem("jp:atribuicao")), {
      timeout: 10_000,
    })
    .not.toBeNull();

  const cru = await page.evaluate(() => sessionStorage.getItem("jp:atribuicao"));
  return JSON.parse(cru ?? "{}") as Record<string, string>;
}

/**
 * Impede a navegação do clique sem impedir o ouvinte de medir.
 *
 * O CTA é `target="_blank"` para o `wa.me`. Deixá-lo abrir levaria o teste para
 * fora do site (e, em CI, para um domínio que não responde). O `preventDefault`
 * entra na fase de BOLHA, depois do ouvinte de captura do site — então o evento
 * é contado exatamente como seria num clique de verdade.
 */
async function bloquearNavegacao(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.addEventListener(
      "click",
      (e) => {
        const alvo = e.target;
        if (alvo instanceof Element && alvo.closest('a[href*="wa.me"]')) e.preventDefault();
      },
      { capture: false },
    );
  });
}

test.describe("a landing page de anúncio", () => {
  test("responde, tem H1 e sobrevive ao SSR", async ({ page }) => {
    const resposta = await page.goto(URL_ANUNCIO);
    expect(resposta?.status()).toBe(200);

    // O H1 precisa estar no HTML SERVIDO: o robô do Google Ads que avalia a
    // experiência na landing não espera hidratação.
    const html = await (await page.request.get(URL_ANUNCIO)).text();
    expect(html).toContain("<h1");
    expect(html.toLowerCase()).toContain("implante");

    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("main")).toBeVisible();
  });

  test("não derruba o console", async ({ page }) => {
    const erros: string[] = [];
    page.on("pageerror", (e) => erros.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") erros.push(m.text());
    });

    await page.goto(URL_ANUNCIO);
    await page.waitForLoadState("networkidle");

    expect(erros).toEqual([]);
  });

  test("no modo anúncio não oferece outros tratamentos", async ({ page }) => {
    await page.goto(URL_ANUNCIO);
    // O cross-sell é a maior saída de uma LP paga: quem clicou em implante não
    // pode terminar a página sendo convidado a ler sobre ortodontia.
    await expect(page.getByText("Outros caminhos de cuidado")).toHaveCount(0);

    // E a orgânica continua oferecendo — o modo é o que muda, não a página.
    await page.goto("/tratamentos/implantes-dentarios");
    await expect(page.getByText("Outros caminhos de cuidado")).toHaveCount(1);
  });
});

/**
 * O MODO ANÚNCIO — o que a primeira dobra precisa dizer.
 *
 * Cada asserção aqui corresponde a uma pergunta que a pessoa que clicou no
 * anúncio faz nos primeiros segundos: "é disso que eu preciso?", "é perto de
 * mim?", "dá para confiar?", "como falo com eles?". Se a resposta não estiver
 * na primeira dobra, o clique já foi pago e a pessoa volta para a busca.
 */
test.describe("o modo anúncio da landing de implante", () => {
  test("o H1 comunica o procedimento E o bairro", async ({ page }) => {
    await page.goto(URL_ANUNCIO);

    const h1 = page.locator("h1");
    await expect(h1).toHaveCount(1);
    const texto = ((await h1.textContent()) ?? "").toLowerCase();

    // As duas coisas que a pessoa digitou na busca.
    expect(texto).toContain("implante");
    expect(texto).toContain("freguesia do ó");
  });

  test("o H1 sai no HTML SERVIDO — o robô do Google Ads não hidrata", async ({ page }) => {
    const html = await (await page.request.get(URL_ANUNCIO)).text();
    const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/u.exec(html)?.[1] ?? "";
    const limpo = h1.replace(/<[^>]*>/gu, " ").toLowerCase();

    expect(limpo).toContain("implante");
    expect(limpo).toContain("freguesia do ó");
  });

  test("a orgânica NÃO usa o H1 de anúncio — o modo é o que muda", async ({ page }) => {
    await page.goto("/tratamentos/implantes-dentarios");
    const texto = ((await page.locator("h1").textContent()) ?? "").toLowerCase();

    expect(texto).toContain("implante");
    // A orgânica abre com a promessa do tratamento, não com o bairro.
    expect(texto).not.toContain("freguesia do ó");
  });

  test("o CTA do hero é específico do tratamento", async ({ page }) => {
    await page.goto(URL_ANUNCIO);

    /*
     * O CTA DO HERO, e nao `ctaWhatsApp` — que devolve o primeiro link visivel
     * e no desktop e o do CABECALHO. O do cabecalho e generico de proposito:
     * ele acompanha a pessoa pelo site inteiro e nao pertence a uma pagina.
     * O especifico e o da primeira dobra, dentro do `main`.
     */
    const heroCta = page.locator('main a.button-primary[href*="wa.me"]').first();
    await expect(heroCta).toBeVisible();
    expect(((await heroCta.textContent()) ?? "").toLowerCase()).toContain("implante");

    // E a mensagem que ele abre continua falando do tratamento e da campanha.
    const msg = decodeURIComponent(
      ((await heroCta.getAttribute("href")) ?? "").split("text=")[1] ?? "",
    );
    expect(msg.toLowerCase()).toContain("implante");
  });

  test("a localização aparece na primeira dobra, fora do rodapé", async ({ page }) => {
    await page.goto(URL_ANUNCIO);

    const main = page.locator("main");
    await expect(main.getByText("Vila Bruna", { exact: false }).first()).toBeVisible();
    await expect(main.getByText("Freguesia do Ó", { exact: false }).first()).toBeVisible();
  });

  test("a prova social real continua acima da dobra", async ({ page }) => {
    await page.goto(URL_ANUNCIO);

    // Vem de `AVALIACOES` em jp.ts — nenhum número é digitado na página.
    const selo = page.locator("main").getByText("4,6", { exact: false }).first();
    await expect(selo).toBeVisible();
    await expect(page.locator("main").getByText("192", { exact: false }).first()).toBeVisible();
  });

  test("não há saída para 'Todos os tratamentos' na LP paga", async ({ page }) => {
    await page.goto(URL_ANUNCIO);
    await expect(page.getByRole("link", { name: /todos os tratamentos/iu })).toHaveCount(0);

    // Na orgânica ela continua: quem chegou pela busca pode estar comparando.
    await page.goto("/tratamentos/implantes-dentarios");
    await expect(page.getByRole("link", { name: /todos os tratamentos/iu })).toHaveCount(1);
  });

  test("o cabeçalho da LP paga não serve os seis caminhos de fuga", async ({ page }) => {
    await page.goto(URL_ANUNCIO);
    /*
     * `locator`, e nao `getByRole`: no celular a nav do desktop existe no DOM
     * com `display:none`, e `getByRole` so enxerga a arvore de acessibilidade —
     * ela devolveria 0 nas duas paginas e o teste passaria sem testar nada.
     * Aqui a pergunta e se os links ESTAO NO HTML, que e o que o robo do Google
     * Ads le e o que uma pessoa alcanca ao ampliar a janela.
     */
    await expect(page.locator('nav[aria-label="Navegação principal"]')).toHaveCount(0);

    // E o que NÃO pode sair continua: marca, telefone e o CTA.
    await expect(page.locator("header").getByRole("link", { name: /JP/iu }).first()).toBeVisible();
    // Mais de um: a barra de cima tem o telefone e o menu do celular repete.
    // O que importa e que exista pelo menos um caminho, nao quantos.
    expect(await page.locator('header a[href^="tel:"]').count()).toBeGreaterThan(0);
    expect(await page.locator('header a[href*="wa.me"]').count()).toBeGreaterThan(0);
  });

  test("a home e a orgânica continuam com a navegação completa", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('nav[aria-label="Navegação principal"]')).toHaveCount(1);

    await page.goto("/tratamentos/implantes-dentarios");
    await expect(page.locator('nav[aria-label="Navegação principal"]')).toHaveCount(1);
  });

  test("nenhuma promessa de resultado entrou na LP", async ({ page }) => {
    await page.goto(URL_ANUNCIO);
    const texto = ((await page.locator("main").textContent()) ?? "").toLowerCase();

    // Resolução CFO 196/2019 — e a tentação de escrever isto numa LP é grande.
    for (const proibido of [
      "resultado garantido",
      "sem dor",
      "indolor",
      "últimas vagas",
      "promoção",
      "melhor clínica",
      "sorriso perfeito",
    ]) {
      expect(texto).not.toContain(proibido);
    }
  });
});

test.describe("a atribuição da campanha", () => {
  test("captura UTM e gclid, e guarda pela sessão", async ({ page }) => {
    await page.goto(URL_ANUNCIO);

    const a = await atribuicaoGuardada(page);
    expect(a["utmSource"]).toBe("google");
    expect(a["utmMedium"]).toBe("cpc");
    expect(a["utmCampaign"]).toBe("implante_search");
    expect(a["utmContent"]).toBe("a01");
    expect(a["gclid"]).toBe("TEST123");
    expect(a["tratamento"]).toBe("implantes-dentarios");
    expect(a["landingPage"]).toBe("/implante-dentario");
  });

  test("sobrevive à navegação interna — o último clique é sempre interno", async ({ page }) => {
    await page.goto(URL_ANUNCIO);
    await atribuicaoGuardada(page);

    // Sair da LP e voltar por uma URL limpa não pode apagar a campanha: se
    // apagasse, toda conversão pareceria orgânica.
    await page.goto("/tratamentos/implantes-dentarios");

    const a = await atribuicaoGuardada(page);
    expect(a["gclid"]).toBe("TEST123");
    expect(a["utmCampaign"]).toBe("implante_search");
  });

  test("o gclid não vaza para a mensagem do paciente", async ({ page }) => {
    await page.goto(URL_ANUNCIO);
    const mensagem = await mensagemDoPrimeiroCTA(page);

    expect(mensagem).not.toContain("TEST123");
    expect(mensagem).not.toContain("gclid");
    expect(mensagem).not.toContain("utm_");
  });
});

test.describe("o WhatsApp mantém o contexto do implante", () => {
  test("o CTA do hero fala de implantes e traz a referência curta", async ({ page }) => {
    await page.goto(URL_ANUNCIO);
    // A referência só existe depois da hidratação — por isso o `poll`.
    await expect.poll(async () => mensagemDoPrimeiroCTA(page)).toContain("Ref.:");

    const mensagem = await mensagemDoPrimeiroCTA(page);
    expect(mensagem.toLowerCase()).toContain("implante");
    expect(mensagem).toContain("agendar uma avaliação");
    // `IMP` = implante, `G` = Google, `A01` = o criativo de `utm_content`.
    expect(mensagem).toContain("Ref.: IMP-G-A01");
  });

  test("o CTA que acompanha a rolagem também — era ele que ficava genérico", async ({ page }) => {
    await page.goto(URL_ANUNCIO);
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });

    const flutuantes = page.locator('a[href*="wa.me"]');
    const total = await flutuantes.count();
    expect(total).toBeGreaterThan(1);

    // TODOS os links de WhatsApp da LP falam do mesmo tratamento. É a asserção
    // que pega o caso de alguém acrescentar um CTA novo sem contexto.
    for (let i = 0; i < total; i++) {
      const href = (await flutuantes.nth(i).getAttribute("href")) ?? "";
      const mensagem = decodeURIComponent(href.split("text=")[1] ?? "");
      expect(mensagem.toLowerCase()).toContain("implante");
    }
  });

  test("sem campanha, a mensagem não ganha referência nenhuma", async ({ page }) => {
    await page.goto("/implante-dentario");
    await expect
      .poll(async () => (await mensagemDoPrimeiroCTA(page)).toLowerCase())
      .toContain("implante");

    const mensagem = await mensagemDoPrimeiroCTA(page);
    expect(mensagem).not.toContain("Ref.:");
  });
});

test.describe("dupla contagem — o teste que não pode ficar verde por acaso", () => {
  test("um clique em Agendar produz UM generate_lead, e nada mais", async ({ page }) => {
    await page.goto(URL_ANUNCIO);
    // A view prova que o React já hidratou — sem isso o clique pode chegar
    // antes de o ouvinte existir, e o teste mediria a ausência dele.
    await esperarEvento(page, "treatment_view");
    await bloquearNavegacao(page);

    const antes = await nomesDeEventos(page);
    expect(antes.filter((e) => e === "generate_lead")).toHaveLength(0);

    await ctaWhatsApp(page).click();

    const depois = await nomesDeEventos(page);
    const novos = depois.slice(antes.length);

    // A asserção é a CONTAGEM. Um clique, um evento — não um Contact mais dois
    // Leads, que era o que acontecia.
    expect(novos).toHaveLength(1);
    expect(novos[0]).toBe("generate_lead");
  });

  test("o lead carrega tratamento, canal e a campanha inteira", async ({ page }) => {
    await page.goto(URL_ANUNCIO);
    await esperarEvento(page, "treatment_view");
    await bloquearNavegacao(page);
    await ctaWhatsApp(page).click();

    const lead = (await eventos(page)).find((e) => e["event"] === "generate_lead");
    expect(lead).toBeDefined();
    expect(lead?.["treatment"]).toBe("implantes-dentarios");
    expect(lead?.["channel"]).toBe("whatsapp");
    expect(lead?.["utm_campaign"]).toBe("implante_search");
    expect(lead?.["utm_content"]).toBe("a01");
    expect(lead?.["gclid"]).toBe("TEST123");
    // O gancho para a Conversion API: sem `event_id` comum, a Meta contaria o
    // evento do navegador e o do servidor como dois.
    expect(String(lead?.["event_id"] ?? "")).not.toHaveLength(0);
  });

  test("nenhum dado pessoal ou clínico entra no evento", async ({ page }) => {
    await page.goto(URL_ANUNCIO);
    await esperarEvento(page, "treatment_view");
    await bloquearNavegacao(page);
    await ctaWhatsApp(page).click();

    const lead = (await eventos(page)).find((e) => e["event"] === "generate_lead");
    const chaves = Object.keys(lead ?? {});

    for (const proibida of ["nome", "telefone", "email", "mensagem", "diagnostico", "cpf"]) {
      expect(chaves).not.toContain(proibida);
    }
    expect(JSON.stringify(lead)).not.toContain("97616");
  });

  test("a view do tratamento dispara na LP paga — era o buraco do funil", async ({ page }) => {
    await page.goto(URL_ANUNCIO);
    await esperarEvento(page, "treatment_view");

    const vistas = (await eventos(page)).filter((e) => e["event"] === "treatment_view");
    expect(vistas).toHaveLength(1);
    expect(vistas[0]?.["treatment"]).toBe("implantes-dentarios");
  });
});

test.describe("nada disso pode impedir o paciente de falar com a clínica", () => {
  test("sem GTM e sem Pixel, o CTA continua sendo um link válido", async ({ page }) => {
    await page.goto(URL_ANUNCIO);

    // O servidor deste teste sobe sem container nenhum — confirmado aqui, para
    // o teste não passar por acidente num ambiente que tinha medição.
    expect(await page.evaluate(() => typeof (window as { fbq?: unknown }).fbq)).toBe("undefined");

    const href = await ctaWhatsApp(page).getAttribute("href");
    expect(href).toMatch(/^https:\/\/wa\.me\/\d+\?text=/u);
  });

  test("com o consentimento RECUSADO, o WhatsApp continua funcionando", async ({ page }) => {
    await page.goto(URL_ANUNCIO);

    await page.getByRole("button", { name: "Rejeitar" }).click();
    expect(await page.evaluate(() => localStorage.getItem("jp:consentimento"))).toBe("recusado");

    await bloquearNavegacao(page);
    const cta = ctaWhatsApp(page);
    await expect(cta).toBeVisible();
    await cta.click();

    // Medição desligada não pode apagar o link nem o clique.
    const href = await cta.getAttribute("href");
    expect(href).toContain("wa.me");
  });

  test("o aviso de cookies não cobre o CTA e some depois da escolha", async ({ page }) => {
    await page.goto(URL_ANUNCIO);

    const aviso = page.getByRole("dialog");
    await expect(aviso).toBeVisible();
    await page.getByRole("button", { name: "Aceitar" }).click();
    await expect(aviso).toHaveCount(0);

    // E não volta a perguntar na próxima página.
    await page.goto("/tratamentos/implantes-dentarios");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("o formulário da home abre o WhatsApp mesmo com o CRC fora do ar", async ({ page }) => {
    await page.goto("/#fale");

    /*
     * PRIMEIRO A PROVA DE QUE O CRC ESTÁ MESMO FORA.
     *
     * Sem isto o teste passaria num ambiente com banco configurado e não
     * provaria nada. O 503 é a resposta deliberada de `/api/crc/lead` sem banco
     * — ele prefere o erro honesto a um "recebemos" que ninguém recebeu.
     */
    const resposta = await page.request.post("/api/crc/lead", {
      data: { nome: "Teste E2E", telefone: "11999999999", mensagem: "x", url: "/", empresa: "" },
    });
    expect([503, 500]).toContain(resposta.status());

    // O aviso de cookies fica na base da tela e cobriria o botão de enviar.
    // Recusar é o caminho mais duro: o formulário tem de funcionar assim.
    await page.getByRole("button", { name: "Rejeitar" }).click();

    await page.locator("form input[name='name']").fill("Maria Teste");
    await page.locator("form input[name='tel']").fill("11999999999");

    /*
     * O BOTÃO É LOCALIZADO PELO `type=submit` DENTRO DO FORM, e não pelo nome.
     * Um `getByRole("button", {name: /agendar/})` casava antes com o botão de
     * FECHAR do CTA flutuante, cujo rótulo acessível é "Fechar convite para
     * agendar" — e o teste clicava em fechar achando que enviava.
     */
    const [popup] = await Promise.all([
      page.waitForEvent("popup", { timeout: 15_000 }),
      page.locator("form button[type='submit']").click(),
    ]);

    /*
     * `wa.me` REDIRECIONA para `api.whatsapp.com`, e a asserção precisa aceitar
     * os dois. Na primeira execução deste teste ele reprovou com a URL final na
     * mensagem de erro — o CTA tinha funcionado, e a asserção é que era estreita
     * demais. Prender um teste a um domínio que é implementação do WhatsApp o
     * faria quebrar no dia em que eles mudassem o destino.
     */
    expect(popup.url()).toMatch(/wa\.me|whatsapp\.com/u);
    // O `+` é espaço em querystring, e `decodeURIComponent` não o converte —
    // por isso a troca antes de procurar o nome.
    expect(decodeURIComponent(popup.url()).replace(/\+/gu, " ")).toContain("Maria Teste");
  });
});

test.describe("as outras sete rotas pagas", () => {
  const rotas: [string, string][] = [
    ["/protese-dentaria", "proteses-dentarias"],
    ["/ortodontia", "ortodontia"],
    ["/clareamento-dental", "clareamento-dental"],
    ["/odontopediatria", "odontopediatria"],
    ["/restauracao-dentaria", "restauracoes"],
    ["/limpeza-dental", "limpeza-profilaxia"],
    ["/harmonizacao-facial", "harmonizacao-orofacial"],
  ];

  for (const [rota, slug] of rotas) {
    test(`${rota} é reconhecida como ${slug}`, async ({ page }) => {
      await page.goto(`${rota}?utm_source=google&gclid=TEST${slug.slice(0, 3)}`);
      await esperarEvento(page, "treatment_view");

      const vistas = (await eventos(page)).filter((e) => e["event"] === "treatment_view");
      expect(vistas).toHaveLength(1);
      expect(vistas[0]?.["treatment"]).toBe(slug);

      await expect(page.locator("h1")).toHaveCount(1);
    });
  }
});
