# Como anunciar — Google Ads e Meta Ads

Guia operacional para rodar tráfego pago para a JP. Escrito para quem vai abrir
o Gerenciador e configurar, não para quem vai programar.

**O que já está pronto no site** e o que **depende de você** estão separados de
propósito — a seção final lista só o que falta, e nada ali é código.

---

## 1. Para onde mandar o tráfego

O site tem **duas URLs para cada tratamento**, e elas servem a coisas
diferentes. Usar a errada custa dinheiro.

| Tratamento             | Anúncio manda para       | Busca orgânica indexa                     |
| ---------------------- | ------------------------ | ----------------------------------------- |
| Implante               | `/implante-dentario`     | `/tratamentos/implantes-dentarios`        |
| Clareamento            | `/clareamento-dental`    | `/tratamentos/clareamento-dental`         |
| Ortodontia / aparelho  | `/ortodontia`            | `/tratamentos/ortodontia`                 |
| Odontopediatria        | `/odontopediatria`       | `/tratamentos/odontopediatria`            |
| Prótese                | `/protese-dentaria`      | `/tratamentos/proteses-dentarias`         |
| Restauração            | `/restauracao-dentaria`  | `/tratamentos/restauracoes`               |
| Limpeza                | `/limpeza-dental`        | `/tratamentos/limpeza-profilaxia`         |
| Harmonização orofacial | — (sem LP)               | `/tratamentos/harmonizacao-orofacial`     |

**É a mesma página nas duas URLs.** A diferença é o endereço e o título, que na
URL de anúncio repetem o termo pesquisado.

> **Por que isso importa em dinheiro, não em estética.** O Google cobra mais
> caro por clique quando a página de destino não conversa com o anúncio — é o
> Índice de Qualidade. Quem pesquisa *"implante dentário freguesia do ó"*, clica
> num anúncio com esse título e cai numa página cujo endereço e título dizem
> outra coisa, volta para a busca. Você pagou o clique e não levou nada.
>
> As LPs têm `canonical` apontando para a página orgânica: as duas servem o mesmo
> conteúdo, e sem isso elas competiriam entre si no índice do Google. **Não mexa
> nisso** — anúncio manda tráfego para a LP, o Google indexa a orgânica.

**Nunca mande anúncio de tratamento para a home.** A home fala de tudo; quem
procurou implante quer ver implante na primeira tela.

---

## 2. O que falta instalar — e é só isto

O site **já dispara os eventos**. Eles não chegam a lugar nenhum porque não há
container instalado. Assim que houver, tudo começa a chegar sem tocar em código.

### Google Tag Manager

1. Crie o container em [tagmanager.google.com](https://tagmanager.google.com) —
   tipo **Web**, para `jpclinicaodontologica.com.br`.
2. Copie o ID (`GTM-XXXXXXX`).
3. Peça para colar no site. **São duas linhas em `src/routes/__root.tsx`** e
   nada além disso.

### Google Analytics 4

1. Crie a propriedade em [analytics.google.com](https://analytics.google.com).
2. Copie o ID (`G-XXXXXXXXXX`).
3. No GTM, crie a tag **Google Tag** com esse ID, acionada em *Initialization —
   All Pages*.

### Google Ads

1. Em **Ferramentas → Conversões**, crie uma ação de conversão do tipo **Site**.
2. Marque como conversão os eventos `whatsapp_click` e `schedule_click` — são os
   que representam contato de verdade.
3. Vincule o Google Ads ao GA4 (**Ferramentas → Contas vinculadas**).

### Meta Pixel

1. Crie o Pixel em [business.facebook.com](https://business.facebook.com) →
   **Gerenciador de Eventos**.
2. Copie o ID (15 a 16 dígitos).
3. Peça para instalar. O site **já traduz** os eventos para o vocabulário da
   Meta — ver a tabela na seção 3.

> **Nada quebra enquanto isso não existe.** A função que registra evento
> verifica se o container está presente; sem ele, não faz nada e não lança erro.
> Conferido: nenhum clique de WhatsApp depende de analytics para funcionar.

---

## 3. Os eventos que o site dispara

Todos já existem no código (`src/lib/contato.ts`). Você não precisa pedir para
criar nenhum — precisa configurá-los no GTM e no Gerenciador da Meta.

| Evento no site        | Quando dispara                        | Vira, na Meta  |
| --------------------- | ------------------------------------- | -------------- |
| `whatsapp_click`      | qualquer botão de WhatsApp            | `Contact`      |
| `schedule_click`      | o CTA "Agendar avaliação"             | `Lead`         |
| `phone_click`         | clique no telefone                    | `Contact`      |
| `treatment_view`      | abriu uma página de tratamento ou LP  | `ViewContent`  |
| `treatment_cta_click` | CTA dentro de uma página de tratamento| `Lead`         |
| `form_start`          | começou a preencher o formulário      | —              |
| `form_submit`         | enviou o formulário                   | `Lead`         |
| `map_click`           | abriu o mapa                          | —              |
| `review_click`        | abriu as avaliações no Google         | —              |
| `career_view`         | abriu uma vaga                        | —              |
| `career_apply`        | enviou candidatura                    | —              |

**Os quatro últimos não viram conversão de propósito.** Mapa e avaliação são
navegação, não intenção de marcar. Candidatura é gente procurando emprego —
mandá-la como conversão ensinaria o algoritmo a buscar candidato, não paciente,
e você pagaria por isso.

Cada evento leva junto de onde veio (`origem`) e, quando faz sentido, qual
tratamento (`tratamento`) — é o que permite saber **qual anúncio gerou qual
contato**.

---

## 4. Campanhas sugeridas

Estrutura enxuta: **um grupo de anúncios por tratamento**, porque cada um tem
intenção e valor diferentes. Implante e prótese valem muito mais que limpeza.

### Google Ads — Pesquisa

| Grupo           | Palavras (correspondência de frase)                                            | Destino                 |
| --------------- | ------------------------------------------------------------------------------ | ----------------------- |
| Implante        | "implante dentário freguesia do ó", "implante dentário zona norte sp"          | `/implante-dentario`    |
| Ortodontia      | "aparelho nos dentes freguesia do ó", "ortodontista zona norte"                | `/ortodontia`           |
| Odontopediatria | "dentista infantil freguesia do ó", "odontopediatra zona norte sp"             | `/odontopediatria`      |
| Clareamento     | "clareamento dental freguesia do ó"                                            | `/clareamento-dental`   |
| Prótese         | "prótese dentária freguesia do ó", "dentadura fixa zona norte"                 | `/protese-dentaria`     |
| Marca           | "jp clínica odontológica", "jp clínica freguesia do ó"                         | `/`                     |

**Negativas desde o primeiro dia**, e elas economizam mais que qualquer ajuste
de lance: `grátis`, `gratuito`, `sus`, `preço`, `quanto custa`, `barato`,
`curso`, `faculdade`, `emprego`, `vaga`, `salário`, `concurso`.

> **`emprego`, `vaga` e `salário` não são teoria.** O site tem portal de vagas
> em `/carreiras`, e sem essas negativas você paga clique de gente procurando
> trabalho.

**Extensões**: local (vinculando o Perfil da Empresa), chamada com o telefone
da clínica, e sitelinks para os outros tratamentos.

### Meta Ads

Público de tráfego frio, **raio de 5 km** em volta da Vila Bruna — a clínica
atende quem mora perto; anunciar para a cidade inteira é pagar por gente que
não vai atravessar São Paulo.

Público de remarketing: quem visitou uma LP e **não** disparou `Contact` em 30
dias. É o mais barato que existe, porque a pessoa já demonstrou interesse.

Criativo: **foto real da clínica**. O site inteiro é fotografado na clínica, e
banco de imagem genérico destoa do que a pessoa encontra ao clicar — o que
derruba conversão exatamente como o descasamento de mensagem no Google.

---

## 5. O que a publicidade odontológica não permite

Isto não é recomendação de marketing. É a **Resolução CFO 196/2019**, e vale
para o anúncio tanto quanto para o site.

**Não pode:**

- **Antes e depois.** Vedado, inclusive em foto de anúncio.
- **Preço, promoção, desconto, parcelamento** como atrativo.
- **Promessa de resultado** — "sorriso perfeito", "resultado garantido".
- **"Sem dor", "indolor"**.
- **Superlativo sobre a clínica** — "a melhor", "a mais moderna", "referência".
- **Sorteio, brinde ou concurso.**

**Pode, e é o que converte de verdade:** a especialidade, o endereço, o horário,
a nota real do Google, o nome dos profissionais **com CRO**, a estrutura, e o
convite para agendar uma avaliação.

> Todo anúncio precisa trazer o nome da clínica e **o CRO da responsável
> técnica**. Está em `src/lib/jp.ts`, em `RESPONSAVEL_TECNICA` — copie de lá, não
> de memória.

---

## 6. O que olhar depois que rodar

Na primeira semana, **não mexa em lance.** Volume baixo faz qualquer número
parecer tendência, e otimizar em cima de ruído piora.

| Métrica                     | Onde                       | O que significa                                 |
| --------------------------- | -------------------------- | ----------------------------------------------- |
| `whatsapp_click` por origem | GA4 → Eventos              | qual página gera contato                        |
| Custo por `Contact`         | Google Ads / Meta          | o número que decide se a campanha continua      |
| Termos de pesquisa          | Google Ads → Termos        | de onde saem as próximas negativas              |
| Índice de Qualidade         | Google Ads → Palavras      | abaixo de 7, revise a correspondência da LP     |

**O número que importa não está em nenhuma dessas telas:** é quantas pessoas
sentaram na cadeira. Pergunte na recepção como a pessoa chegou, e cruze com o
que o painel diz. Clique não é paciente.

---

## 7. Só isto depende de você

Tudo abaixo exige conta, credencial ou decisão comercial. **Nada exige código.**

- [ ] Criar o container do **Google Tag Manager** e passar o `GTM-XXXXXXX`
- [ ] Criar a propriedade do **GA4** e passar o `G-XXXXXXXXXX`
- [ ] Criar o **Pixel da Meta** e passar o ID
- [ ] Configurar as ações de conversão no **Google Ads**
- [ ] **Vincular o site ao Perfil da Empresa no Google** — hoje a ficha mostra
      "Adicionar website". É tráfego local, gratuito e qualificado sendo perdido,
      e é o de maior retorno desta lista inteira.
- [ ] Definir orçamento diário por campanha

---

## Onde mais olhar

- [README.md](../README.md) — arquitetura, rotas, SEO, decisões do projeto
- [DESIGN.md](../DESIGN.md) — o sistema visual e as regras de acessibilidade
- `src/lib/contato.ts` — os eventos e as mensagens de WhatsApp
- `src/lib/jp.ts` — telefone, endereço, CRO, horário: a fonte de tudo
