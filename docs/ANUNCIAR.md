# Como anunciar — Google Ads e Meta Ads

Guia operacional para rodar tráfego pago para a JP. Escrito para quem vai abrir
o Gerenciador e configurar, não para quem vai programar.

**O que já está pronto no site** e o que **depende de você** estão separados de
propósito — a seção final lista só o que falta, e nada ali é código.

---

## 1. Para onde mandar o tráfego

O site tem **duas URLs para cada tratamento**, e elas servem a coisas
diferentes. Usar a errada custa dinheiro.

| Tratamento             | Anúncio manda para      | Busca orgânica indexa                 |
| ---------------------- | ----------------------- | ------------------------------------- |
| Implante               | `/implante-dentario`    | `/tratamentos/implantes-dentarios`    |
| Clareamento            | `/clareamento-dental`   | `/tratamentos/clareamento-dental`     |
| Ortodontia / aparelho  | `/ortodontia`           | `/tratamentos/ortodontia`             |
| Odontopediatria        | `/odontopediatria`      | `/tratamentos/odontopediatria`        |
| Prótese                | `/protese-dentaria`     | `/tratamentos/proteses-dentarias`     |
| Restauração            | `/restauracao-dentaria` | `/tratamentos/restauracoes`           |
| Limpeza                | `/limpeza-dental`       | `/tratamentos/limpeza-profilaxia`     |
| Harmonização orofacial | `/harmonizacao-facial`  | `/tratamentos/harmonizacao-orofacial` |

**É a mesma página nas duas URLs.** A diferença é o endereço e o título, que na
URL de anúncio repetem o termo pesquisado.

O título de cada LP, lido do HTML servido em 14/09/2026 — **use estas palavras
no anúncio**, porque é o que a pessoa vai reencontrar ao clicar:

| LP                      | Título publicado                                              |
| ----------------------- | ------------------------------------------------------------- |
| `/implante-dentario`    | Implante dentário na Freguesia do Ó \| JP Clínica             |
| `/ortodontia`           | Aparelho e ortodontia na Freguesia do Ó \| JP Clínica         |
| `/odontopediatria`      | Dentista infantil na Freguesia do Ó \| JP Clínica             |
| `/clareamento-dental`   | Clareamento dental na Freguesia do Ó \| JP Clínica            |
| `/protese-dentaria`     | Prótese dentária na Freguesia do Ó \| JP Clínica Odontológica |
| `/restauracao-dentaria` | Restauração dentária na Freguesia do Ó \| JP Clínica          |
| `/limpeza-dental`       | Limpeza dental na Freguesia do Ó \| JP Clínica Odontológica   |
| `/harmonizacao-facial`  | Harmonização orofacial na Freguesia do Ó \| JP Clínica        |

Repare que a marca **encolhe até caber**: "Prótese dentária" sobra espaço e leva
o nome inteiro; "Implante dentário" leva o médio. Nenhum passa de 60 caracteres,
que é onde o Google corta — a regra está em `src/lib/seo.ts`, e o título não é
digitado em lugar nenhum.

Repare em duas escolhas de URL que não são descuido: `/odontopediatria` tem o
título **"Dentista infantil na Freguesia do Ó"**, porque mãe procurando dentista
para o filho não digita o nome técnico; e a harmonização é `/harmonizacao-facial`,
sem o "oro", porque é assim que se busca. O título mantém "orofacial", que é o
nome correto do procedimento — a URL fala a língua da busca, o título fala a
língua da odontologia.

> **Por que isso importa em dinheiro, não em estética.** O Google cobra mais
> caro por clique quando a página de destino não conversa com o anúncio — é o
> Índice de Qualidade. Quem pesquisa _"implante dentário freguesia do ó"_, clica
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

O site **já dispara os eventos, já captura a campanha e já pede consentimento**.
O que falta são credenciais externas — e nenhuma delas exige tocar em código.

### Google Tag Manager

1. Crie o container em [tagmanager.google.com](https://tagmanager.google.com) —
   tipo **Web**, para `jpclinicaodontologica.com.br`.
2. Copie o ID (`GTM-XXXXXXX`).
3. Cadastre na Vercel como **`VITE_GTM_ID`** (Settings → Environment Variables)
   e faça um novo deploy. Só isso: não há linha de código a escrever.

> **Por que precisa de deploy:** o Vite troca a variável por um literal em tempo
> de build. Cadastrar sem reconstruir não muda nada na tela — e é o tipo de coisa
> que faz alguém passar uma tarde procurando defeito onde não há.
>
> **Como conferir se pegou**, sem depender do painel do Google: abra a LP,
> `Ctrl+U` para ver o código-fonte servido, e procure por `GTM-`. Se o ID
> aparecer ali, está no HTML que o navegador recebe — que é onde ele precisa
> estar. Se só aparecer depois, no inspetor, alguma coisa está errada.

### Google Analytics 4

1. Crie a propriedade em [analytics.google.com](https://analytics.google.com).
2. Copie o ID (`G-XXXXXXXXXX`).
3. No GTM, crie a tag **Google Tag** com esse ID, acionada em _Initialization —
   All Pages_.
4. Crie um **gatilho de evento personalizado** para cada evento da seção 3 que
   você quiser ver no GA4, começando por `generate_lead`.

### Google Ads

1. Em **Ferramentas → Conversões**, crie uma ação de conversão do tipo **Site**.
2. **Marque como conversão primária SOMENTE `generate_lead`.** Não marque
   `contact_click`, `phone_click`, `treatment_view`, `form_submit` nem
   `page_view` — a seção 3 explica por que cada um deles inflaria a contagem.
3. Vincule o Google Ads ao GA4 (**Ferramentas → Contas vinculadas**).
4. Ligue o **tagueamento automático** (Configurações da conta) — é o que faz o
   `gclid` chegar mesmo quando a UTM vem digitada errada.

### Meta Pixel

1. Crie o Pixel em [business.facebook.com](https://business.facebook.com) →
   **Gerenciador de Eventos**.
2. Copie o ID (15 a 16 dígitos).
3. Cadastre na Vercel como **`VITE_META_PIXEL_ID`** e faça um novo deploy.
4. No Gerenciador de Eventos, use **`Lead`** como evento de otimização. O site já
   traduz `generate_lead` → `Lead`, `contact_click` → `Contact` e
   `treatment_view` → `ViewContent`.

> **Nada quebra enquanto isso não existe.** Sem os IDs, nenhum script é pedido à
> rede e a camada de eventos continua empurrando para `window.dataLayer`, que sem
> GTM é só um array na memória da aba. Verificado por E2E: a suíte de tráfego
> pago roda contra um servidor **sem GTM, sem Pixel e sem CRC**, e o CTA de
> WhatsApp continua funcionando em todos os casos.

### Consentimento — já está pronto, e vem antes de tudo

O site implementa **Google Consent Mode v2**. A ordem no `<head>` é fixa e
importa: `dataLayer` → `consent default` com os quatro sinais **negados** → a
escolha já guardada, se houver → só então o GTM.

Você não precisa configurar nada para isso funcionar, mas precisa saber de duas
consequências no relatório:

- **Antes de alguém aceitar, o Google recebe a visita sem cookies** (modelagem de
  conversão). Os números do GA4 vão ser menores que os do painel de anúncios, e
  isso é esperado, não defeito.
- **Quem recusa não é medido**, e o WhatsApp dele funciona igual. Isso também é
  proposital: medição não pode ser condição para um paciente falar com a clínica.

O visitante pode rever a escolha pelo link no rodapé e na política de
privacidade.

### A atribuição da campanha — funciona sem nenhum container

Independentemente de GTM, GA4 ou Pixel, o site captura na primeira entrada:

`utm_source` · `utm_medium` · `utm_campaign` · `utm_content` · `utm_term` ·
`gclid` · `fbclid` · `gbraid` · `wbraid` · página de entrada

Guarda pela sessão (**first-touch**: navegar dentro do site não apaga a
campanha), manda junto em todo `generate_lead`, e resume numa **referência
curta** que vai na mensagem do WhatsApp — `Ref.: IMP-G-A01`, detalhada na
seção 3.

Basta marcar as URLs das campanhas:

```
https://www.jpclinicaodontologica.com.br/implante-dentario?utm_source=google&utm_medium=cpc&utm_campaign=implante_search&utm_content=a01&utm_term={keyword}
```

> **O que ela nunca guarda:** telefone, nome, e-mail, texto livre, nada de saúde
> — e nem a querystring inteira, só os campos conhecidos, um a um. É a diferença
> entre guardar "veio da campanha de implante" e guardar, sem querer, o telefone
> que alguém pôs num parâmetro.

### E o CRC, quando estiver no ar

Com o CRC ativo, o formulário do site também grava o lead com a mesma atribuição
no banco, e a tela **Investimento** passa a dar custo por paciente que
compareceu. **Isso é um ganho, não um pré-requisito:** com o CRC fora, o
endpoint responde 503, o formulário pede para tentar de novo ou ligar, e o botão
de WhatsApp continua abrindo normalmente. Ver
[crc/ATIVACAO-EM-PRODUCAO.md](crc/ATIVACAO-EM-PRODUCAO.md).

---

## 3. Os eventos que o site dispara

Todos já existem no código (`src/lib/analytics/eventos.ts` decide qual, e
`components/site/RastreioDeContato.tsx` escuta). Você não precisa pedir para
criar nenhum — precisa configurá-los no GTM e no Gerenciador da Meta.

### A REGRA, e ela é curta

**`generate_lead` é a ÚNICA conversão.** Não marque mais nada como conversão no
Google Ads nem como evento de otimização na Meta. Tudo o mais nesta lista existe
para ler o funil, não para o algoritmo aprender.

| Evento no site   | Quando dispara                                            | Nas LPs? | Vira, na Meta | Conversão? |
| ---------------- | --------------------------------------------------------- | -------- | ------------- | ---------- |
| `generate_lead`  | CTA de WhatsApp pedindo avaliação, ou envio do formulário | **sim**  | `Lead`        | **SIM**    |
| `contact_click`  | WhatsApp sem pedido de agendamento (dúvida)               | sim      | `Contact`     | não        |
| `phone_click`    | clique no telefone                                        | sim      | `Contact`     | não        |
| `treatment_view` | abriu página de tratamento — orgânica **ou LP**           | **sim**  | `ViewContent` | não        |
| `form_start`     | começou a preencher o formulário                          | sim      | —             | não        |
| `form_submit`    | enviou o formulário                                       | sim      | —             | não        |
| `map_click`      | abriu o mapa                                              | sim      | —             | não        |
| `review_click`   | abriu as avaliações no Google                             | sim      | —             | não        |
| `career_view`    | abriu `/carreiras` ou uma vaga                            | —        | —             | não        |
| `career_apply`   | clicou para se candidatar, e ao enviar                    | —        | —             | não        |

**Mapa, avaliação e carreira ficam fora de propósito.** Mapa e avaliação são
navegação, não intenção de marcar. Candidatura é gente procurando emprego —
mandá-la como conversão ensinaria o algoritmo a buscar candidato, não paciente,
e você pagaria por isso.

`form_submit` sai junto com `generate_lead` no envio do formulário, e é o único
caso de dois eventos numa ação só. Um é leitura de funil, o outro é a conversão;
**não marque `form_submit`**, ou o mesmo envio conta duas vezes.

### O que cada `generate_lead` carrega

```json
{
  "event": "generate_lead",
  "treatment": "implantes-dentarios",
  "channel": "whatsapp",
  "origem": "hero",
  "pagina": "/implante-dentario",
  "utm_source": "google",
  "utm_medium": "cpc",
  "utm_campaign": "implante_search",
  "utm_content": "a01",
  "gclid": "...",
  "event_id": "..."
}
```

`treatment` é o mesmo slug nas duas URLs do procedimento — a orgânica e a de
anúncio. É por ele que se agrupa o relatório, e não por `pagina`.

`event_id` existe para o dia em que houver Conversion API: sem um identificador
comum, a Meta contaria o evento do navegador e o do servidor como dois. Hoje
ninguém o consome, e ele não atrapalha nada.

### O defeito que existia aqui, e como ele custava dinheiro

Até 15/09/2026, um clique em "Agendar avaliação" dentro de uma página de
tratamento disparava **três** eventos: `whatsapp_click`, `schedule_click` e
`treatment_cta_click`. Traduzidos para a Meta, viravam **um `Contact` e dois
`Lead`**.

Isso não era imprecisão de relatório. Era o Google Ads e a Meta aprendendo que
aquele clique valeu três conversões e subindo o lance para comprar mais cliques
iguais — a clínica pagando mais caro por uma contagem que ela mesma inflou.

E a outra metade: `/implante-dentario` — a única rota que a clínica vai pagar
para trazer gente — **não disparava `treatment_view`**, porque o ouvinte
perguntava `pathname.startsWith("/tratamentos/")`. Medido em 14/09/2026, com o
site rodando: o `dataLayer` da LP ficava vazio.

Os dois estão corrigidos e cobertos por teste:

- `src/lib/analytics/eventos.test.ts` — um clique, um evento. 21 casos.
- `src/lib/analytics/rotas.test.ts` — as oito LPs reconhecidas. 19 casos.
- `e2e/publico/trafego-pago.spec.ts` — o caminho inteiro no navegador, desktop e
  celular. 24 casos por plataforma, incluindo a contagem de `generate_lead`
  depois de um clique real.

---

## 4. Campanhas sugeridas

Estrutura enxuta: **um grupo de anúncios por tratamento**, porque cada um tem
intenção e valor diferentes. Implante e prótese valem muito mais que limpeza.

### Google Ads — Pesquisa

| Grupo           | Palavras (correspondência de frase)                                   | Destino               |
| --------------- | --------------------------------------------------------------------- | --------------------- |
| Implante        | "implante dentário freguesia do ó", "implante dentário zona norte sp" | `/implante-dentario`  |
| Ortodontia      | "aparelho nos dentes freguesia do ó", "ortodontista zona norte"       | `/ortodontia`         |
| Odontopediatria | "dentista infantil freguesia do ó", "odontopediatra zona norte sp"    | `/odontopediatria`    |
| Clareamento     | "clareamento dental freguesia do ó"                                   | `/clareamento-dental` |
| Prótese         | "prótese dentária freguesia do ó", "dentadura fixa zona norte"        | `/protese-dentaria`   |
| Marca           | "jp clínica odontológica", "jp clínica freguesia do ó"                | `/`                   |

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

| Métrica                       | Onde                   | O que significa                             |
| ----------------------------- | ---------------------- | ------------------------------------------- |
| `whatsapp_click` por `pagina` | GA4 → Eventos          | qual página gera contato                    |
| Custo por `Contact`           | Google Ads / Meta      | o número que decide se a campanha continua  |
| Termos de pesquisa            | Google Ads → Termos    | de onde saem as próximas negativas          |
| Índice de Qualidade           | Google Ads → Palavras  | abaixo de 7, revise a correspondência da LP |
| **Custo por paciente**        | **CRC → Investimento** | **o único número que fecha a conta**        |

Repare que a primeira linha diz **`pagina`**, e não `tratamento`: nas LPs o campo
`tratamento` não existe — ver o aviso na seção 3.

### O número que importa tem tela própria agora

Ele não está no GA4 nem no Gerenciador: é **quantas pessoas sentaram na
cadeira**. Quem responde isso é a tela **Investimento** do CRC, que junta as duas
metades — a atribuição que o site já captura de cada lead e o gasto que alguém
precisa lançar lá, por mês, campanha e canal.

A conta que ela entrega em destaque é **custo por paciente que compareceu**, e
não custo por lead, porque só a primeira enxerga a diferença entre um anúncio que
traz cem contatos baratos e nenhum comparecimento e um que traz dez caros e cinco
na cadeira.

Duas honestidades que a tela mantém, e que você vai precisar explicar para quem
ler o relatório:

- **Sem gasto lançado, ela não inventa custo.** Mostra "—", não R$ 0,00 — um
  custo por paciente calculado sobre investimento zero é a leitura mais perigosa
  possível.
- **O corte é por mês de chegada do lead.** Quem chegou em março e compareceu em
  abril conta em março. É a única regra que não muda de resposta dependendo de
  quando se olha, e o rateio por campanha é chamado de estimativa na própria tela.

Continue perguntando na recepção como a pessoa chegou, e cruze com o painel.
Clique não é paciente — mas agora há onde comparar os dois.

---

## 7. Só isto depende de você

Tudo abaixo exige conta, credencial ou decisão comercial. **Nada exige código.**

- [ ] Criar o container do **Google Tag Manager** e cadastrar `VITE_GTM_ID` na Vercel
- [ ] Criar a propriedade do **GA4** e ligá-la pelo GTM
- [ ] Criar o **Pixel da Meta** e cadastrar `VITE_META_PIXEL_ID` na Vercel
- [ ] **Refazer o deploy** depois de cadastrar as duas — sem isso elas não existem no site
- [ ] No Google Ads, marcar como conversão primária **apenas `generate_lead`**
- [ ] Ligar o **tagueamento automático** do Google Ads (para o `gclid`)
- [ ] **Confirmar quem é o profissional responsável por implantes** — a LP não nomeia
      ninguém, e o repositório não tem esse dado. Só entra com nome, CRO conferido e
      retrato real; inventar um é infração ao CFO.
- [ ] **Vincular o site ao Perfil da Empresa no Google** — hoje a ficha mostra
      "Adicionar website". É tráfego local, gratuito e qualificado sendo perdido,
      e é o de maior retorno desta lista inteira.
- [ ] Definir orçamento diário por campanha
- [ ] **Corrigir o texto da ficha do Google**, que diz "Há 25 anos" — a clínica
      confirmou em 11/09/2026 que são **24**, fundada em 17/08/2002. O site já
      diz 24. Anúncio e ficha contando idades diferentes é o tipo de detalhe que
      derruba confiança de quem compara.
- [ ] **Conferir "8 especialistas"** no mesmo texto: desde 13/09/2026 o site
      publica **4 dentistas**, todos com CROSP conferido — a Dra. Júlia Vargas e
      a Raphaela saíram da grade quando deixaram a equipe. A distância entre 8 e
      4 ficou grande demais para conviver. Ou faltam profissionais no site (nome,
      especialidade e **CRO conferido** de cada um), ou o texto da ficha é que
      precisa mudar — e ele é a primeira coisa que alguém lê ao comparar clínicas.
- [ ] **Ligar o tagueamento automático do Google Ads** (Configurações da conta).
      É o que faz o `gclid` chegar no lead sem depender de UTM digitada certa.
- [ ] **Padronizar as UTMs antes da primeira campanha** — `utm_source=google` ou
      `meta`, `utm_medium=cpc`, `utm_campaign=<tratamento>-<bairro>`.
      Maiúsculas e espaços o CRC resolve sozinho (ele apara, colapsa espaço e
      baixa a caixa antes de agrupar: `Implantes`, `implantes ` e `IMPLANTES` são
      a mesma campanha). **Acento, não** — `implante-dentário` e
      `implante-dentario` viram duas linhas no relatório, com o gasto numa e os
      leads na outra.

---

## Onde mais olhar

- [README.md](../README.md) — arquitetura, rotas, SEO, decisões do projeto
- [DESIGN.md](../DESIGN.md) — o sistema visual e as regras de acessibilidade
- `src/lib/contato.ts` — as mensagens de WhatsApp e a tradução dos eventos
- `src/components/site/RastreioDeContato.tsx` — **quando** cada evento dispara
- `src/lib/crc/aplicacao/leads.ts` — a leitura de UTM, `gclid` e `fbclid`
- `src/lib/crc/aplicacao/investimento.ts` — a conta de custo por paciente
- `src/lib/jp.ts` — telefone, endereço, CRO, horário: a fonte de tudo

---

_Conferido contra o código em 14/09/2026. O que mudou desde a versão anterior: a
tabela de eventos passou a dizer quais deles não disparam nas LPs (medido), a
atribuição de lead por UTM/`gclid`/`fbclid` entrou como algo que já funciona sem
container nenhum, o custo por paciente ganhou tela no CRC, e o site publica
4 dentistas, não 6._
