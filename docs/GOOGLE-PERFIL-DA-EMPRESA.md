# Perfil da Empresa no Google — JP Clínica Odontológica

> **Documento vivo — escrito em 15/09/2026, no dia em que a clínica passou a ter acesso de administrador à ficha.**
>
> Estado observado da ficha nessa data: nota 4,6 com 192 avaliações, 715 interações com clientes, 482 visualizações mensais, categoria "Clínica odontológica", força do perfil "Informações completas", nenhuma campanha do Google Ads configurada.

> **Atualizado no fim de 15/09/2026.** A clínica respondeu um questionário por WhatsApp e fechou seis pendências que este documento listava. Em resumo, e detalhado adiante:
>
> - **Convênios**: SulAmérica, Porto Seguro, Bradesco, OdontoPrev, Dental Par e Rede Brazil Dental. O site passou a publicar a lista; a ficha ainda não.
> - **Serviços**: não são oito, são dezessete. Faltavam clínica geral, endodontia, periodontia, facetas, alinhadores, odontologia do esporte, DTM, atendimento a idosos e pacientes com necessidades especiais.
> - **Acessibilidade**: a clínica é acessível e tem barras de apoio — §3.3 podia ser respondido, e foi.
> - **Sábado**: não atende. §3.2 fechado.
> - **WhatsApp da placa**: a placa é que estava errada. O número do site, (11) 97616-5117, é o oficial; o antigo foi clonado e desativado. §1.5 e C7 fechados. **A placa foi trocada**: a foto de 21/09/2026 (`fachada-2026-completa.webp`) já mostra o número certo. As fotos antigas da fachada continuam mostrando o clonado — ver §1.4.
> - **Pontos de referência**: travessa da Av. Edgar Facó, esquina do supermercado Violeta, perto do Hospital Geral de Vila Penteado e das obras da futura estação Penteado. C5 entregue.

## Por que este documento existe agora

O repositório já sabia de coisas erradas na ficha do Google e não tinha como consertá-las. O comentário em [`src/lib/jp.ts:122`](../src/lib/jp.ts) é explícito:

> NEM "CORRIJA" PARA 25 OLHANDO A FICHA DO GOOGLE. O texto de apresentação do Perfil da Empresa diz "Há 25 anos" — conferido em 11/09/2026, e a clínica confirmou no mesmo dia que o número certo é 24. Quem está desatualizado é o perfil, não este arquivo. Enquanto os dois não baterem, esta divergência vai reaparecer a cada pessoa que comparar site e Google.

Era uma divergência sem dono: o site estava certo, o Google estava errado, e ninguém do projeto conseguia editar o Google. O acesso novo fecha esse caso e abre outros seis que dependiam dele — as avaliações que o site cita de segunda mão, as fotos reais que nunca subiram, os serviços que nunca foram cadastrados, o link do site que não é rastreado, o botão de agendamento vazio e a campanha que não existe.

Este documento separa o que se resolve **dentro do painel do Google** do que exige **mudança de código**. Os dois lados existem, e confundi-los é o motivo de esse trabalho nunca ter saído do lugar.

---

## 1. Faça hoje, nesta ordem

A ordem importa. Perfil recém-reivindicado que recebe muitas edições estruturais no mesmo dia entra em revisão com mais frequência — e um perfil em revisão some do Maps enquanto o Google reprocessa. Por isso: primeiro o que é leitura pura, depois texto, depois mídia, e só no fim o que toca endereço e categoria.

### 1.1 Ler as 192 avaliações — 30 min, risco zero

Botão **Ler avaliações**. Nada é editado aqui, então comece por isto enquanto o resto ainda está sendo decidido.

Saia com três coisas anotadas:

- **Os textos reais.** Os depoimentos publicados no site vieram de um agregador terceiro (DentMap), que capturou só parte das avaliações. Está registrado em [`src/lib/jp.ts:238`](../src/lib/jp.ts): *"vale conferir na ficha do Google e, se possível, ampliar a seleção. Não acrescente depoimento que não exista lá."* Agora dá para conferir na fonte.
- **As avaliações sem resposta.** Provavelmente a maioria das 192. Ver §5.
- **Qualquer avaliação suspeita** — sem texto, de perfil sem histórico, de concorrente. Ver §8.

### 1.2 Corrigir "Há 25 anos" para 24 — 5 min

**Editar perfil → Sobre → Descrição do negócio.** É a correção que motivou este documento.

Texto pronto para colar (715 caracteres; o limite do Google é 750):

```text
A JP Clínica Integrada Odontológica atende crianças, adultos e idosos na Vila Bruna, região da Freguesia do Ó, em São Paulo.

São 24 anos de história. A clínica começou em 2002, em Pirituba, e mudou para o endereço atual em 2024.

Atendemos em implantes dentários, próteses, ortodontia, odontopediatria, clareamento, restaurações, limpeza e profilaxia e harmonização orofacial. O atendimento clínico é feito por cirurgiões-dentistas identificados pelo número de registro no CRO.

Cada conduta é definida em avaliação individual, e o planejamento é apresentado ao paciente antes de começar.

Responsável técnica: Dra. Juliana Pelisser Barbosa — CROSP 75.159.

Segunda a sexta, das 8h às 18h. Telefone (11) 3975-9902.
```

O texto é derivado de `HISTORIA`, `TRATAMENTOS`, `RESPONSAVEL_TECNICA` e `CLINICA` em `src/lib/jp.ts`. Não tem superlativo, preço, promessa de resultado nem "sem dor" — as vedações do §19 do [`ANUNCIAR.md`](ANUNCIAR.md) valem aqui igual, porque a ficha é publicidade odontológica como qualquer outra.

Em 17/08/2027 este número vira 25, junto com `HISTORIA.anos`. Anote nos dois lugares.

### 1.3 Cadastrar os serviços — 40 min

**Editar serviços.** Hoje não há nenhum, e é o campo que mais alimenta a busca por procedimento ("implante dentário perto de mim"). Comece pelos oito de `TRATAMENTOS`, com a descrição que o site já publica — reaproveitar garante que as duas superfícies digam a mesma coisa:

| Serviço | Descrição para colar |
| --- | --- |
| Implantes dentários | Reabilitação de dentes ausentes com planejamento individual e acompanhamento profissional em cada etapa. |
| Próteses dentárias | Soluções protéticas fixas ou removíveis planejadas para apoiar mastigação, conforto e harmonia do sorriso. |
| Aparelhos e ortodontia | Alinhamento dos dentes e acompanhamento da mordida por meio de planejamento ortodôntico individualizado. |
| Odontopediatria | Cuidado odontológico para crianças com linguagem simples, acolhimento e construção gradual de confiança. |
| Clareamento dental | Protocolos de clareamento indicados após avaliação, respeitando as características e a sensibilidade de cada paciente. |
| Restaurações | Recuperação de dentes comprometidos por cárie ou perda de estrutura, buscando função, forma e integração estética. |
| Limpeza e profilaxia | Remoção de placa e tártaro, com orientação de higiene e acompanhamento preventivo individualizado. |
| Harmonização orofacial | Botox, preenchimento e skinbooster quando indicados, sempre mediante avaliação profissional e planejamento individual. |

E não pare nos oito. A clínica informou em 15/09/2026 que atende outras nove áreas, agora em `CUIDADOS_COMPLEMENTARES` (`src/lib/jp.ts`) e publicadas na home como lista:

> Clínica geral · Endodontia (tratamento de canal) · Periodontia (tratamento de gengiva) · Facetas · Alinhadores transparentes · Odontologia do esporte · DTM (disfunção temporomandibular) · Atendimento a idosos · Pacientes com necessidades especiais

Cadastre cada uma como serviço, sem descrição inventada — o nome já responde a busca, e descrição de procedimento clínico que a clínica não revisou é o tipo de texto que não se escreve por conta própria. As três últimas são as de maior retorno: quase nenhuma clínica da região cadastra atendimento a idosos ou a pacientes com necessidades especiais, e quem procura por elas procura por elas.

**Não escreva "Invisalign".** A clínica citou o nome sem ter certeza do credenciamento. Sem contrato, é alinhadores transparentes — o registro está em `A_CONFIRMAR`, no mesmo arquivo.

Nenhum serviço recebe preço. Preço na ficha é preço como chamariz, que o §19 do `ANUNCIAR.md` já veta.

### 1.4 Subir as fotos reais — 1 h

Este é o item de maior impacto visual. A foto que a ficha exibe hoje é captura de Street View de um prédio verde — e **a clínica mudou de endereço em 2024**, de Pirituba para a Vila Bruna. Há chance concreta de a imagem externa não ser sequer o prédio certo. Confira antes de qualquer outra coisa.

O repositório tem 40+ fotos reais em `src/assets/` que nunca chegaram ao Google:

| Categoria na ficha | Arquivos |
| --- | --- |
| Exterior | `fachada-2026-completa.webp` — placa nova, com o WhatsApp certo. **Nunca** `fachada.webp` nem `fachada-letreiro.webp`: mostram a placa antiga, com o número clonado (§1.5) |
| Recepção e espera | `recepcao.webp`, `recepcao-completa.webp`, `sala-espera-ortodontia-completa.webp`, `cantinho-cafe.webp` |
| Consultórios | `consultorio-1.webp`, `consultorio-2.webp`, `consultorio-cadeira-lilas.webp`, `consultorio-janela.webp`, `consultorio-implantes-1.webp`, `consultorio-implantes-2.webp`, `consultorio-bancada.webp`, `consultorio-wide.webp` |
| Estrutura | `esterilizacao.webp`, `equipamento.webp`, `escritorio.webp` |
| Equipe | `juliana-pelisser.webp`, `jeferson-barbosa.webp`, `ana-beatriz.webp`, `hugo-leonardo.webp`, `matheus-fraga.webp`, `sabrina-vamszer.webp` |
| Logo | `docs/marca/logo-jp.png` |

`esterilizacao.webp` merece destaque: sala de esterilização é o que um paciente novo procura e quase nenhuma clínica mostra.

**Não subir, em hipótese alguma:** `capa-recepcao-1100.webp` e `capa-recepcao-1536.webp`. A auditoria em [`social/instagram/ASSET-MANIFEST.md`](../social/instagram/ASSET-MANIFEST.md) §1.1 concluiu que não é a recepção da JP — é imagem de banco ou gerada, com uma recepcionista que não trabalha na clínica. Publicá-la na ficha é o tipo de coisa que o paciente descobre ao entrar pela primeira vez.

O Google converte de webp sem problema, mas se o painel recusar algum arquivo, exporte em JPG antes.

### 1.5 WhatsApp da placa — resolvido em 21/09/2026

A placa antiga mostrava **9 7169-4647**, um número que foi clonado e desativado. O oficial é o do site, **(11) 97616-5117** (`CLINICA.whatsapp` em [`src/lib/jp.ts`](../src/lib/jp.ts)). A clínica trocou a placa, e a foto de 21/09/2026 já mostra o número certo:

| Foto | WhatsApp na placa | Pode publicar? |
| --- | --- | --- |
| `fachada-2026-completa.webp` (21/09/2026) | **(11) 97616-5117** | sim, inteira |
| `fachada.webp`, `fachada-letreiro.webp` (placa antiga) | **9 7169-4647** — clonado | **não**, nem recortada |

As fotos antigas continuam no repositório porque o kit de Instagram gera derivados a partir de `fachada.webp` (`social/instagram/source/scripts/preparar-fotos.py`), mas saíram do site: a galeria usa a foto nova, e a prévia de link das páginas de tratamento (`og:image`) passou a ser `fachada-2026-previa.jpg`, um recorte horizontal dela.

Se a ficha do Google ou alguma rede ainda exibir uma foto da placa antiga, troque: quem salva o número da foto manda mensagem para um número clonado.

### 1.6 Horário, feriados e link do site — 20 min

- **Horários especiais.** O horário normal (seg–sex, 8h–18h) bate com `CLINICA.horario` e com o `openingHoursSpecification` do JSON-LD. O que falta são os feriados: sem eles a ficha diz "Aberto" num dia em que ninguém atende, e isso gera avaliação de uma estrela por porta fechada. Cadastre os feriados nacionais e o aniversário de São Paulo com antecedência.
- **Sábado.** O JSON-LD declara só seg–sex. Se a clínica atende sábado em alguma escala, os dois lados estão errados juntos.
- **Link do site.** Precisa apontar para `https://www.jpclinicaodontologica.com.br` — **com `www`**. O apex responde 308 e redireciona, e o redirecionamento é um salto a mais em cada visita vinda da ficha. Sobre a UTM que vai junto, ver §7.

### 1.7 Endereço e categoria — por último, e um de cada vez

**Não faça isto no mesmo dia dos itens acima.** Alteração de endereço e de categoria é o que dispara reverificação, e um perfil em reverificação some do Maps enquanto o Google reprocessa.

**O bairro.** A ficha renderiza `R. Rio Verde, 1029 - Freguesia do Ò` — com acento grave, que não é forma de escrita nenhuma. O site diz `Vila Bruna` como bairro e `região da Freguesia do Ó` como referência ([`src/lib/jp.ts:44`](../src/lib/jp.ts)).

Antes de mudar, **abra o formulário de endereço e veja o que está no campo Bairro**. Há dois casos, e eles pedem respostas opostas:

- Se o campo contém literalmente "Freguesia do Ò", alguém digitou errado. Corrija para `Vila Bruna` e o site e a ficha passam a concordar.
- Se o campo já diz "Vila Bruna" e o "Freguesia do Ò" vem da normalização do Google — que costuma exibir o **distrito** em vez do bairro, e Freguesia do Ó é distrito oficial de São Paulo — então não há o que corrigir, e forçar só vai piorar. Deixe como está.

Endereço divergente entre site e ficha é dos sinais que mais pesam em ranqueamento local, mas isso só vale para divergência de verdade. Confirme qual dos dois casos é o seu antes de tocar no campo.

**A categoria.** A ficha exibe "Clínica odontológica", que é a categoria principal correta. O que falta são as secundárias, e elas pesam para busca por procedimento. Candidatas, dado o que o site oferece: *Dentista*, *Implantodontista*, *Ortodontista*, *Odontopediatra*, *Protesista dentário*. Acrescente **uma por semana**, não todas de uma vez.

---

## 2. O que eu mudo no código

Tarefas de repositório, com arquivo. Nenhuma depende do painel para ser feita; quase todas dependem de dados que só a leitura da ficha fornece.

| # | Arquivo | O quê |
| --- | --- | --- |
| C1 | [`src/lib/jp.ts:54`](../src/lib/jp.ts) | Atualizar `AVALIACOES.nota`, `.total` e `.conferidoEm` com o que a ficha mostrar hoje. O site inteiro acompanha, inclusive a fatia da quinta estrela. |
| C2 | [`src/lib/jp.ts:238`](../src/lib/jp.ts) | Ampliar `DEPOIMENTOS` com avaliações lidas direto da ficha, substituindo as de segunda mão do agregador. |
| C3 | [`src/lib/analytics/eventos.ts:213`](../src/lib/analytics/eventos.ts) | Criar o link "avaliar no Google" que falta. Ver abaixo. |
| ~~C4~~ | [`src/lib/dadosEstruturados.ts`](../src/lib/dadosEstruturados.ts) | **Parcialmente feito em 15/09/2026.** Entraram `paymentAccepted`, `amenityFeature` (acessibilidade) e `areaServed` com as três regiões; `availableService` passou de 8 para 17. Continuam de fora `priceRange` (que é preço, e o §19 veta) e `isAcceptingNewPatients`. Falta o link do Maps em `sameAs`. |
| ~~C5~~ | [`src/routes/index.tsx`](../src/routes/index.tsx) | **Feito em 15/09/2026.** Bloco "Pontos de referência" abaixo do mapa, lendo `COMO_CHEGAR` — a mesma fonte alimenta a resposta "Onde fica a clínica, e como eu chego?" da FAQ, que vai para o `FAQPage`. Estacionamento continua de fora: a clínica não foi perguntada. |
| C6 | [`social/instagram/source/scripts/renderizar.mjs:60`](../social/instagram/source/scripts/renderizar.mjs) | Formato `google` no `VIEWPORT`, para as peças de Post. Ver §6. |
| ~~C7~~ | [`src/lib/jp.ts:80`](../src/lib/jp.ts) | **Resolvido sem código em 15/09/2026.** A clínica confirmou que o site está certo e a placa errada: o número antigo foi clonado e desativado. Nada a mudar aqui. **A placa foi trocada** — foto de 21/09/2026; ver §1.5. |

**Sobre C3, que é a mais curiosa.** O classificador de eventos já trata cliques em avaliação:

```ts
if (href.includes("google.com/search") || href.includes("g.page")) {
  return { evento: "review_click", dados: comum };
}
```

Esse ramo **nunca dispara**. Não existe um único link `g.page` ou `google.com/search` em todo o site — o único link para o Google é `CLINICA.mapsHref`, que cai no ramo de cima e vira `map_click`. Alguém construiu a medição de um convite para avaliar que nunca foi escrito.

O site mostra a nota em quatro lugares e não pede avaliação em lugar nenhum. É a fonte de avaliação nova mais barata que existe, e está desligada.

**Sobre C5, que já foi.** Nada no site respondia "como chego aí". Agora responde, com as referências que a própria clínica usa: travessa da Av. Edgar Facó, esquina do supermercado Violeta, perto do Hospital Geral de Vila Penteado e das obras da futura estação Penteado do metrô. É conteúdo que casa com a intenção de quem chega pela ficha do Google, e que a ficha sozinha não entrega. Estacionamento segue sem resposta — vale perguntar.

---

## 3. Decisões que dependem da clínica

Nada aqui deve ir ao ar antes de alguém da JP confirmar:

1. ~~**Qual WhatsApp está em uso**~~ — respondido: o do site. A placa foi trocada em 21/09/2026 (§1.5).
2. ~~**Se atende sábado**, e em qual escala.~~ **Respondido em 15/09/2026: não atende.** O horário do site, segunda a sexta das 8h às 18h, está correto e já é o que o `openingHoursSpecification` publica.
3. **Atributos da ficha**, agora em três estados:
   - **Pode marcar**: a clínica é acessível e tem barras de apoio; aceita cartão de crédito, boleto e parcelamento direto. Informado em 15/09/2026 e já publicado no site.
   - **NÃO marque ainda**: "atende sem transferência da cadeira de rodas". A clínica disse que a cadeira odontológica dela tem mecanismos para isso e mandou confirmar com a Ana. Está em `A_CONFIRMAR`, em `src/lib/jp.ts`, e é a diferença entre um diferencial e uma pessoa cadeirante atravessando São Paulo à toa.
   - **Continua sem resposta**: estacionamento, wi-fi, banheiro adaptado dito com essas palavras. Atributo errado na ficha é promessa quebrada na porta.
4. **Se a foto externa atual é o prédio certo** ou sobrou do endereço de Pirituba.
5. **Quem responde as avaliações** e com que prazo.
6. **Quem mais tem acesso administrativo** ao perfil (§8).

---

## 4. Avaliações — a conta

4,6 com 192 avaliações. Para o número exibido virar 4,7, a média precisa alcançar 4,65.

O detalhe que muda tudo: **4,6 já é um número arredondado**. A média real está em algum ponto entre 4,55 e 4,65, e onde exatamente ela cai altera a resposta por um fator de nove:

| Se a média real for | Avaliações 5★ novas até exibir 4,7 |
| --- | --- |
| 4,55 (pior caso) | **55** |
| 4,60 (caso médio) | **28** |
| 4,64 (melhor caso) | **6** |

Planeje com **28** e saiba que pode ser 55. Em qualquer cenário a conclusão é a mesma: **volume novo é o único caminho**. Não há como apagar avaliação antiga ruim; há como diluí-la. Vinte e oito avaliações em três meses é pouco mais de duas por semana — perfeitamente viável para uma clínica com a agenda cheia, e impossível se ninguém pedir.

O botão **Solicitar avaliações** gera o link curto do perfil. É esse link que deve ir para o WhatsApp do paciente depois da consulta, e é esse link que resolve o C3 acima.

---

## 5. Avaliações — como responder

Responder todas as 192 é trabalho de um dia e vale a pena: o Google usa a taxa de resposta como sinal, e o paciente que lê antes de escolher lê as respostas tanto quanto as avaliações.

**A regra que não pode ser quebrada:** a resposta pública **não pode confirmar que a pessoa é paciente**, nem mencionar tratamento, profissional que atendeu, data ou qualquer detalhe clínico. Quem avalia escolheu se expor; a clínica não pode escolher por ela. Confirmar publicamente que fulano fez implante é tratar dado de saúde como conteúdo de marketing — e dado de saúde é dado sensível na LGPD, com base legal própria.

Isso vale inclusive quando a avaliação já conta tudo. Ela conta por conta dela. A clínica não repete.

**5 estrelas, com texto**

```text
Obrigado pelo carinho de reservar um tempo para escrever, [nome]. Ler isso é o que mantém a equipe inteira animada. Estamos por aqui sempre que precisar.
```

**5 estrelas, sem texto**

```text
Obrigado pelas cinco estrelas! Ficamos felizes com a confiança. Qualquer coisa, é só chamar.
```

**4 estrelas**

```text
Obrigado pela avaliação, [nome]. Ficamos contentes com o retorno e queremos entender o que faltou para chegar nas cinco — se puder nos contar pelo (11) 3975-9902, a gente escuta e ajusta.
```

**1 ou 2 estrelas**

```text
Sentimos muito que sua experiência não tenha sido boa. Não conseguimos tratar detalhes por aqui, mas queremos muito entender o que aconteceu: fale com a gente pelo (11) 3975-9902 ou por mensagem, e vamos ouvir com atenção.
```

O modelo negativo é curto de propósito. Não contesta, não explica, não corrige a versão de quem escreveu, e não confirma atendimento — porque cada uma dessas coisas transforma uma avaliação ruim numa discussão pública, que rende muito pior do que a avaliação sozinha. Leve para o canal privado e resolva lá.

---

## 6. Posts do Google

Existem 535 peças prontas em `social/instagram/ENTREGA/`. A tentação é republicá-las na ficha, e ela tem um problema de formato.

**As peças do feed são 1080×1350 — retrato 4:5.** O cartão de Post do Google exibe em proporção próxima de 4:3 paisagem, recortando pelo centro. Um 4:5 perde faixa em cima e embaixo, que é exatamente onde o kit põe chip, headline e CTA. A peça não fica só diferente: fica sem a frase.

Três saídas, em ordem de esforço:

1. **Formatos que já sobrevivem ao recorte.** Os avatares de `01 - PERFIL` e as capas de destaque de `02 - DESTAQUES` são quadrados e de composição centrada. Servem para logo e imagens auxiliares, não para Post.
2. **Renderizar em 1200×900.** O gerador é dirigido por manifesto e o tamanho vem de um mapa único em [`renderizar.mjs:60`](../social/instagram/source/scripts/renderizar.mjs):

   ```js
   feed: { width: 1080, height: 1350 },
   quadrado: { width: 1080, height: 1080 },
   story: { width: 1080, height: 1920 },
   ```

   Acrescentar `google: { width: 1200, height: 900 }` é uma linha. O trabalho real é a variante paisagem dos templates, porque o CSS do kit foi desenhado para retrato.
3. **Foto real sem arte.** Post do Google aceita, e frequentemente rende mais, com foto da clínica e duas linhas de texto do que com peça gráfica. As fotos de `src/assets` já estão lá.

**Cadência.** Uma vez por semana, com CTA nativo. Não há motivo para mais: Post do Google não tem feed nem alcance orgânico próprio — ele aparece para quem já está olhando a ficha. Publicar três vezes por semana não triplica nada e só consome a equipe.

O [`CALENDAR-30D.md`](../social/instagram/CALENDAR-30D.md) já organiza 30 dias de tema. Pegue um tema por semana, quatro posts por mês, e reaproveite a legenda de [`CAPTIONS.md`](../social/instagram/CAPTIONS.md) encurtada.

---

## 7. Medição

**O problema.** Hoje a pessoa que clica no site pela ficha do Google chega como tráfego direto ou orgânico, indistinguível de quem digitou o endereço. As 482 visualizações mensais e as 715 interações vivem no painel "Desempenho" do Google e não conversam com nada.

**A correção.** O site já captura `utm_source`, `utm_medium`, `utm_campaign`, `utm_content` e `utm_term` em first-touch — está no §4 do [`ANUNCIAR.md`](ANUNCIAR.md) e implementado em `src/lib/analytics/atribuicao.ts`. Basta a ficha mandar os parâmetros.

URLs prontas, no padrão de nomes do §4 (minúsculas, sem espaço, sem acento):

**Campo "Site" da ficha**

```text
https://www.jpclinicaodontologica.com.br/?utm_source=google&utm_medium=gbp&utm_campaign=perfil_da_empresa&utm_content=site
```

**Campo "Agendamentos"**

```text
https://www.jpclinicaodontologica.com.br/?utm_source=google&utm_medium=gbp&utm_campaign=perfil_da_empresa&utm_content=agendamento
```

**Links dentro de cada Post** — troque `utm_content` pelo post

```text
https://www.jpclinicaodontologica.com.br/tratamentos/implantes-dentarios?utm_source=google&utm_medium=gbp&utm_campaign=perfil_da_empresa&utm_content=post_implantes
```

**Por que `utm_medium=gbp` e não `organic`.** `organic` faria o GA4 jogar esse tráfego no mesmo balde da busca orgânica, que é precisamente o que se está tentando separar — e ainda contaminaria o relatório de SEO com visitas que não vieram de busca. Um medium próprio cai em "Unassigned" até alguém criar um grupo de canais personalizado no GA4. Esse é o preço, e vale: um balde à parte que precisa de nome é melhor que nenhum balde.

**O que acompanhar, e quando.** O §17 do `ANUNCIAR.md` fixa a hierarquia: não otimizar por métrica de topo. Do painel "Desempenho", mensalmente:

- visualizações no Maps contra as da Busca;
- cliques no site, no telefone e em rotas;
- termos que levaram à ficha — é pesquisa de palavra-chave de graça, e alimenta as negativas do §9.

O número que importa continua sendo `generate_lead`, e agora ele vai vir carimbado com a origem.

---

## 8. Governança e risco

**O que faz perder o perfil.** Nome com palavra-chave é a causa mais comum de suspensão. "JP Clínica Odontológica — Implantes na Freguesia do Ó" parece esperto e é violação direta: o nome da ficha deve ser o nome real do negócio, e nada mais. O nome atual está correto — não mexa.

**Acesso.** Defina agora, enquanto o assunto está quente: no mínimo **dois** administradores, ambos em e-mail da empresa e não pessoal. Perfil cujo único acesso é o Gmail de quem saiu da clínica é um perfil que se recupera por formulário e semanas de espera. Reveja a lista de usuários no painel e remova quem não deveria estar lá.

**Avaliação falsa ou de concorrente.** Existe processo formal de contestação no próprio painel, por violação de política. Funciona quando a avaliação é claramente inelegível — sem relação com o serviço, spam, ataque pessoal. Não funciona para avaliação negativa legítima, e insistir só queima tempo. Responda bem e siga.

**Regra do CFO.** A Resolução 196/2019 já governa o site — está citada em `src/lib/jp.ts` e é o motivo de a página de harmonização terminar em "a indicação depende de avaliação individual". A ficha é publicidade odontológica pelo mesmo critério: Posts, Produtos, Serviços e fotos entram sob as mesmas regras.

---

## 9. O que não fazer

- **Não usar o botão "Anunciar" do painel.** Ele cria uma Campanha Inteligente, que não permite a ação de conversão própria que o §9 do `ANUNCIAR.md` exige — `generate_lead` como única primária — nem controle de negativas. O caminho certo é campanha de Search na própria conta do Google Ads, com as negativas do §9 e o raio de 4–6 km do §10, e depois vincular a ficha à conta para habilitar os recursos de local.
- **Não pôr palavra-chave no nome da ficha.**
- **Não oferecer desconto, brinde ou sorteio em troca de avaliação.** Viola a política do Google e esbarra no CFO.
- **Não filtrar quem recebe o pedido de avaliação** por nota esperada. Chama-se *review gating*, é violação explícita, e o pedido tem que ir para todo mundo.
- **Não subir `capa-recepcao-*.webp`** (§1.4).
- **Não subir `fachada.webp` nem `fachada-letreiro.webp`**: mostram a placa antiga, com o número clonado. A fachada certa é `fachada-2026-completa.webp` (§1.5).
- **Não publicar antes/depois** na ficha.
- **Não pôr preço** em Serviços ou Produtos.
- **Não mexer em nome, endereço e categoria no mesmo dia.**
- **Não acrescentar `aggregateRating` ao JSON-LD** do site com a nota do Google. A decisão está documentada e justificada em [`src/lib/dadosEstruturados.ts:12`](../src/lib/dadosEstruturados.ts): agregar avaliação de outro site não é recomendado pelo Google para `LocalBusiness`, e avaliação sobre si mesmo não é elegível ao resultado com estrelas. Mostrar a nota na página é certo; declará-la como schema próprio não é.

---

## 10. Impacto e esforço

| # | Tarefa | Onde | Impacto | Esforço |
| --- | --- | --- | --- | --- |
| 1.4 | Fotos reais da clínica | painel | alto | 1 h |
| 1.3 | Cadastrar os oito serviços | painel | alto | 40 min |
| 4 | Pedir avaliação a cada paciente | painel + C3 | alto | contínuo |
| 5 | Responder as 192 avaliações | painel | alto | 1 dia |
| 7 | UTM no site e no agendamento | painel | alto | 10 min |
| C3 | Link "avaliar no Google" | código | alto | 1 h |
| 1.2 | Corrigir "25 anos" para 24 | painel | médio | 5 min |
| 1.6 | Feriados e horários especiais | painel | médio | 20 min |
| 1.7 | Categorias secundárias | painel | médio | 5 min/semana |
| 8 | Segundo administrador | painel | médio | 10 min |
| 9 | Search própria, não "Anunciar" | Google Ads | médio | 1 dia |
| C1 | Sincronizar `AVALIACOES` | código | médio | minutos |
| C2 | Depoimentos reais da ficha | código | médio | 1 h |
| C5 | Bloco "como chegar" | código | médio | 2 h |
| ~~1.5~~ | ~~Decidir o WhatsApp da placa~~ — resolvido: placa trocada em 21/09/2026 | clínica | — | — |
| 1.1 | Ler as 192 avaliações | painel | insumo | 30 min |
| 1.7 | Conferir o campo Bairro | painel | baixo | 5 min |
| C4 | Propriedades novas no JSON-LD | código | baixo | 30 min |
| 6 | Posts em 1200×900 | código + painel | baixo | 1 dia |
