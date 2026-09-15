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

## 2. Como instalar cada container — o passo a passo

O site **já dispara os eventos, já captura a campanha e já pede consentimento**.
O que falta são credenciais externas — e nenhuma delas exige tocar em código.

> Esta seção é o **como**, com o detalhe de cada painel. A **lista para marcar**,
> na ordem de execução, está na [seção 8](#8-o-que-felipe-ainda-precisa-configurar).
> Se você já sabe o caminho das contas, pule para lá.

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

> ⛔ **EVENTOS ANTIGOS / NÃO USAR.** Os três nomes citados nesta seção —
> `whatsapp_click`, `schedule_click` e `treatment_cta_click` — **não existem
> mais no código**. Não crie gatilho, conversão, público ou relatório com eles:
> não vão disparar nunca. Estão aqui só para explicar por que a semântica atual é
> o que é. A lista válida é a tabela acima.

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

### Negativas desde o primeiro dia

Estas economizam mais que qualquer ajuste de lance, e nenhuma delas tem chance
de ser um paciente:

```
grátis · gratuito · sus · curso · faculdade · apostila
emprego · vaga · salário · concurso
como fazer · caseiro · DIY · passo a passo
```

> **`emprego`, `vaga` e `salário` não são teoria.** O site tem portal de vagas
> em `/carreiras`, e sem essas negativas você paga clique de gente procurando
> trabalho.

### `preço` e `quanto custa` NÃO entram nessa lista

Esta orientação mudou, e vale explicar por quê: quem pesquisa **"quanto custa
implante dentário"** está decidindo, não passeando. É uma das consultas de maior
intenção comercial do setor — a pessoa já aceitou que vai fazer e está
orçando.

Negativar isso no primeiro dia é recusar, sem dado nenhum, o pesquisador mais
perto de fechar.

**O que fazer em vez disso:** deixe rodar, e decida pelo **relatório de termos de
pesquisa** depois de 30 dias ou 20 contatos. Se `preço` trouxer contato que não
agenda, negative _aquele termo específico_ — com número na mão.

`barato` merece o mesmo tratamento, com uma ressalva: ele costuma sinalizar
sensibilidade a preço que não combina com o ticket de implante. Analise
separadamente, mas também **não bloqueie sem dado**.

> **A regra geral:** negative o que não pode virar paciente (emprego, curso, SUS).
> Não negative o que pode virar paciente caro (preço, valor, quanto custa,
> parcelamento) só porque a palavra incomoda.
>
> Cuidado com o outro lado: a página **não pode responder** a essa busca com
> preço. A Resolução CFO 196/2019 veda preço como atrativo — ver a seção 5. Você
> compra o clique de quem pergunta o preço e responde com avaliação, não com
> tabela.

**Extensões**: local (vinculando o Perfil da Empresa), chamada com o telefone
da clínica, e sitelinks para os outros tratamentos.

### Meta Ads

Público de tráfego frio, **raio de 5 km** em volta da Vila Bruna — a clínica
atende quem mora perto; anunciar para a cidade inteira é pagar por gente que
não vai atravessar São Paulo.

Público de remarketing: quem visitou uma LP e **não** disparou `generate_lead`
em 30 dias. É o mais barato que existe, porque a pessoa já demonstrou interesse.

> **Três limites, e eles não são burocracia.**
>
> **Só alcança quem consentiu.** Sem aceite no aviso de cookies o Pixel não
> envia evento, então o público de remarketing é menor que o total de visitas —
> e isso é o correto, não um defeito de implementação.
>
> **Nada de inferir condição clínica.** O `treatment` do evento diz de que
> PÁGINA a pessoa veio, que é contexto de campanha. Ele não é, e não pode virar,
> um diagnóstico: montar público de "pessoas que precisam de implante" ou
> "pessoas sem dentes" é exatamente o que as políticas de saúde da Meta proíbem,
> e é o tipo de coisa que derruba uma conta inteira.
>
> **O anúncio de remarketing segue o CFO** igual ao resto — sem antes e depois,
> sem promessa, sem preço como atrativo.

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

### A hierarquia, de cima para baixo

```
generate_lead  ←  a métrica digital desta fase
      ↓
agendamento
      ↓
comparecimento
      ↓
paciente fechado
      ↓
receita
```

**Nesta fase, sem CRC operacional, a métrica principal é o custo por
`generate_lead`** — em linguagem de negócio, **custo por contato qualificado de
WhatsApp**. Os três degraus abaixo dele existem na recepção, não no painel.

| Métrica                            | Onde                  | O que significa                                |
| ---------------------------------- | --------------------- | ---------------------------------------------- |
| **Custo por `generate_lead`**      | Google Ads / Meta     | **o número que decide se a campanha continua** |
| `generate_lead` por `treatment`    | GA4 → Eventos         | qual procedimento puxa contato                 |
| `generate_lead` por `utm_campaign` | GA4 → Eventos         | qual campanha puxa contato                     |
| `treatment_view` → `generate_lead` | GA4 → Eventos         | a taxa de conversão da landing                 |
| Termos de pesquisa                 | Google Ads → Termos   | de onde saem as próximas negativas             |
| Índice de Qualidade                | Google Ads → Palavras | abaixo de 7, revise a correspondência da LP    |

**Agrupe por `treatment`, não por `pagina`.** As duas URLs do mesmo procedimento
— `/implante-dentario` e `/tratamentos/implantes-dentarios` — produzem o MESMO
valor, `implantes-dentarios`. É isso que impede o relatório de rachar em duas
linhas para o mesmo tratamento só porque metade do tráfego veio pago.

`pagina` continua no evento e serve para separar **pago de orgânico** dentro do
mesmo tratamento, que é outra pergunta.

### Quando o CRC entrar

Aí a conta passa a fechar sozinha, e a métrica sobe um degrau:

```
Custo por paciente comparecido
Custo por paciente fechado
CAC
Receita
ROAS real
```

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

## 7. O que já está pronto no código

Nada desta lista precisa de você. Está no ar desde 15/09/2026, coberto por 58
testes de unidade e 48 E2E que rodam no CI a cada push.

| Pronto                                       | O quê                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------ |
| **8 landing pages de anúncio**               | uma por tratamento, com `canonical` para a orgânica                                  |
| **Modo anúncio**                             | H1 com procedimento + bairro, CTA específico, sem cross-sell e sem navegação de fuga |
| **UTM**                                      | `source`, `medium`, `campaign`, `content`, `term`                                    |
| **`gclid` · `fbclid` · `gbraid` · `wbraid`** | capturados e guardados pela sessão                                                   |
| **Atribuição first-touch**                   | a campanha da primeira entrada não é apagada por navegação interna                   |
| **Referência de campanha**                   | `Ref.: IMP-G-A01` na mensagem do WhatsApp, para a recepção                           |
| **`generate_lead`**                          | a conversão única, com tratamento, canal e campanha juntos                           |
| **Tradução para a Meta**                     | `Lead`, `Contact`, `ViewContent` — um evento por ação                                |
| **`event_id`**                               | o gancho de deduplicação para uma Conversion API futura (server-side)                |
| **Consentimento**                            | Consent Mode v2, banner, e revisão pelo rodapé                                       |
| **GTM e Pixel**                              | opcionais, por variável de ambiente, validados antes de entrar no `<script>`         |
| **E2E do funil pago**                        | desktop e celular, sem banco, sem CRC e sem container                                |

---

## 8. O que Felipe ainda precisa configurar

Tudo abaixo exige conta, credencial ou decisão comercial. **Nada exige código.**
O detalhe de cada painel está na [seção 2](#2-como-instalar-cada-container--o-passo-a-passo);
aqui é a ordem e o que marcar.

### A sequência que liga a medição

1. [ ] Criar o container do **Google Tag Manager**
2. [ ] Criar a propriedade do **GA4**
3. [ ] **Vincular o GA4 ao Google Ads** (Ferramentas → Contas vinculadas)
4. [ ] Criar a ação de conversão e marcar **somente `generate_lead`** como primária
5. [ ] Ligar o **tagueamento automático** no Google Ads (é o que traz o `gclid`)
6. [ ] Criar o **Pixel da Meta**
7. [ ] Cadastrar `VITE_GTM_ID` e `VITE_META_PIXEL_ID` na **Vercel**
8. [ ] **Fazer um novo deploy** — sem rebuild as variáveis não existem no site
9. [ ] Testar no **GTM Preview**
10. [ ] Testar no **GA4 DebugView**
11. [ ] Testar no **Gerenciador de Eventos da Meta**

> Para os passos 9 a 11, use a URL de campanha da seção 1 e clique no CTA uma
> vez. O esperado é **um** `generate_lead` e **um** `Lead` — nunca dois, nunca um
> `Contact` junto.

### As decisões que não são técnicas

- [ ] **Definir o orçamento diário.** Abaixo de ~R$ 3.000/mês o lance automático
      do Google fica sem as 15 a 30 conversões/mês de que precisa para aprender.
- [ ] **Combinar quem responde o WhatsApp, e em quanto tempo.** É o maior fator
      isolado de conversão desta operação, e custa zero de mídia.
- [ ] **Rodar o anúncio só no horário da recepção.** Contato que espera não vira
      paciente, e o clique foi pago igual.
- [ ] **Confirmar o profissional responsável por implantes** — nome, CRO
      conferido e retrato. O repositório não tem esse dado, e a LP não nomeia
      ninguém de propósito: inventar registro é infração à Resolução CFO
      196/2019.
- [ ] **Vincular o site ao Perfil da Empresa no Google** — hoje a ficha mostra
      "Adicionar website". É tráfego local, gratuito e qualificado sendo perdido,
      e é o de maior retorno desta lista inteira.
- [ ] **Corrigir "Há 25 anos" na ficha do Google** — a clínica confirmou em
      11/09/2026 que são **24**, fundada em 17/08/2002. O site já diz 24.
- [ ] **Conferir "8 especialistas" na mesma ficha** — o site publica **4
      dentistas**, todos com CROSP conferido. Ou faltam profissionais no site,
      ou o texto da ficha precisa mudar.
- [ ] **Padronizar as UTMs antes da primeira campanha** — `utm_source=google` ou
      `meta`, `utm_medium=cpc`, `utm_campaign=<tratamento>-<bairro>`. Maiúsculas
      e espaços o CRC resolve sozinho; **acento, não** — `implante-dentário` e
      `implante-dentario` viram duas linhas no relatório.

---

## 9. O CRC não é pré-requisito

Vale repetir porque é a pergunta que mais trava projeto de tráfego:

> **CRC NÃO É PRÉ-REQUISITO PARA COMEÇAR GOOGLE ADS OU META ADS.**

O fluxo da primeira fase é inteiro sem ele:

```
Google Ads  →  LP de implante  →  WhatsApp  →  recepção humana
Instagram   →  WhatsApp  (ou  →  LP  →  WhatsApp)
```

A atribuição chega à recepção pela `Ref.:` dentro da mensagem, e a medição
digital chega ao Google e à Meta pelo `generate_lead`. Nenhum dos dois caminhos
passa pelo CRC.

**Verificado, não suposto:** a suíte `npm run e2e:site` sobe um servidor sem
Postgres, sem CRC, sem GTM e sem Pixel, e prova que o CTA de WhatsApp continua
funcionando — inclusive com o consentimento recusado. Ela roda no CI a cada push.

Quando o CRC entrar, ele **acrescenta** o outro lado da conta (comparecimento,
fechamento, custo por paciente). Não substitui nada do que está acima.

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
