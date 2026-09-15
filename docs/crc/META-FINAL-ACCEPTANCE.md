# Matriz de aceite — Meta Omnichannel no CRC

> **Este documento não declara a integração pronta.** Ele diz, produto por
> produto, o que está provado e o que não está. Linha sem evidência não recebe
> estado melhor que `IMPLEMENTADO`.

Gerado em 15/09/2026, ao fim da implementação. Os estados seguem o §74 do
mega-prompt e são exatamente quatro:

| Estado                 | O que significa                                                            |
| ---------------------- | -------------------------------------------------------------------------- |
| `IMPLEMENTADO`         | o código existe e tem teste. Nada foi exercitado contra a Meta.            |
| `TESTADO_COM_SANDBOX`  | provado ponta a ponta contra o fake local do §54, com assinatura real.     |
| `TESTADO_COM_API_REAL` | provado contra a Graph de verdade, com conta e token de verdade.           |
| `BLOCKED_EXTERNAL`     | o código está pronto e falta algo que não é código: App Review, conta, ID. |

**Nenhuma linha deste documento está em `TESTADO_COM_API_REAL`**, e a razão é
uma só: não existe App da Meta configurado para esta clínica ainda. O caminho
para sair desse estado está em
[META-ATIVACAO-E-HOMOLOGACAO.md](META-ATIVACAO-E-HOMOLOGACAO.md), e ele é de
quem tem acesso ao Business Manager da JP — não de quem escreve código.

---

## Leitura rápida

|                                                   |                                             |
| ------------------------------------------------- | ------------------------------------------- |
| **Instagram Direct (receber + responder)**        | `TESTADO_COM_SANDBOX`                       |
| **Facebook Messenger**                            | `TESTADO_COM_SANDBOX`                       |
| **Comentários do Instagram → lead**               | `TESTADO_COM_SANDBOX`                       |
| **Private reply (resposta privada a comentário)** | `TESTADO_COM_SANDBOX` + App Review pendente |
| **Meta Lead Ads (Instant Form)**                  | `TESTADO_COM_SANDBOX`                       |
| **Identidade cruzada entre canais**               | `TESTADO_COM_SANDBOX`                       |
| **Etiqueta `HUMAN_AGENT` (fora das 24h)**         | `BLOCKED_EXTERNAL` — App Review             |
| **Data Deletion Callback**                        | **NÃO IMPLEMENTADO**                        |
| **Reconciliação automática (diária)**             | `TESTADO_COM_SANDBOX`                       |
| **Seguro ligar em produção hoje?**                | **NÃO** — ver "O que falta"                 |

O "não" tem uma causa só, e ela não é código: **o App da Meta não existe
ainda.** Sem App ID, App Secret e uma Página conectada, não há webhook para
chegar e não há token para enviar. Tudo abaixo está esperando isso.

---

## 1. Por produto

### 1.1 Instagram Direct — `TESTADO_COM_SANDBOX`

| O que                                 | Onde                                                  |
| ------------------------------------- | ----------------------------------------------------- |
| Recebe `entry[].messaging[]`          | `integracoes/meta/normalizar.ts`                      |
| Roteia para a clínica dona da conta   | `integracoes/meta/canais.ts` → `resolverTenantDaMeta` |
| Cria/reabre conversa e grava mensagem | `aplicacao/mensagens.ts` → `receberMensagemDoCanal`   |
| Responde pela Inbox                   | `aplicacao/mensagens.ts` → `enviarNoCanal`            |
| Fala com a Graph                      | `integracoes/meta/porta.ts` → `portaInstagram`        |
| Política de 24h                       | `dominio/politica-de-canal.ts`                        |

**Provado:** DM chega por HTTP assinado → aparece na Inbox → a recepção
responde pela tela → o fake registrou o envio (`provider_message_id` começando
em `sandbox-meta-`). Entrega repetida três vezes produz **uma** mensagem.

**Não provado:** que a Graph aceita o corpo que montamos. O formato veio da
documentação conferida em 15/09/2026, e documentação não é execução.

### 1.2 Facebook Messenger — `TESTADO_COM_SANDBOX`

Mesmo caminho do direct, com `object: "page"` e PSID em vez de IGSID. A
diferença que importa está no namespace de identidade: um PSID e um IGSID com o
mesmo número são **duas pessoas diferentes**, e é por isso que
`crc_patient_identities` ganhou a coluna `namespace`.

**Provado:** o mesmo valor em namespaces diferentes resolve para identidades
diferentes — teste de integração contra Postgres real.

### 1.3 Comentários do Instagram — `TESTADO_COM_SANDBOX`

| O que                      | Onde                             |
| -------------------------- | -------------------------------- |
| Recebe `entry[].changes[]` | `integracoes/meta/normalizar.ts` |
| Casa regra por palavra     | `dominio/regras-sociais.ts`      |
| Reserva ANTES de decidir   | `aplicacao/social.ts`            |
| Cria lead e oportunidade   | idem                             |

**Provado:** comentário com `IMPLANTE` entregue três vezes produz **um** lead e
**uma** private reply. `implante capilar` não vira lead — o veto do §43
funciona. A reserva sob concorrência real (20 inserções simultâneas) produz
exatamente uma linha.

**A ordem é deliberada:** a reserva vem antes da política e da autonomia. Fazer
o contrário deixa uma janela entre "decidi responder" e "gravei que respondi",
e é nessa janela que dois webhooks simultâneos viram dois directs.

### 1.4 Private reply — `TESTADO_COM_SANDBOX`, e App Review pendente

O envio usa `recipient: { comment_id }`, e vale **uma vez por comentário**,
dentro de 7 dias. O código está pronto e provado contra o fake.

O que falta é externo: a permissão `instagram_business_manage_messages` sai do
modo de desenvolvimento só com App Review. Até lá funciona apenas com as contas
de teste do App.

### 1.5 Meta Lead Ads — `TESTADO_COM_SANDBOX`

**A ordem é `persistir leadgen_id → buscar na Graph`, e não o contrário.** O
webhook de leadgen falha em silêncio de três formas — token rotacionado, app
desassinado da Página, e o nosso próprio 500 durante um deploy — e nas três a
Meta considera entregue e **nunca reenvia**. Gravar o id primeiro é o que
transforma "lead perdido" em "lead que ainda não foi buscado".

**Provado:** lead do Instant Form → aparece no funil com origem correta;
reconciliação é idempotente (rodar duas vezes não duplica); o cursor sobrevive
entre voltas.

**Sinal de alarme, e não de sucesso:** se a reconciliação importa algum lead
(`importados > 0`), significa que um webhook se perdeu. O runbook trata isso
como incidente.

### 1.6 Identidade cruzada — `TESTADO_COM_SANDBOX`

Um IGSID novo com telefone conhecido só vira vínculo por **ação humana na
Inbox** — não há fusão automática por heurística. A tela mostra `@usuario`, e
nunca o id de 17 dígitos (§24).

**Provado:** vínculo pela UI grava a identidade com `namespace: "instagram"`.

### 1.7 Etiqueta `HUMAN_AGENT` — `BLOCKED_EXTERNAL`

É o único caminho oficial para responder fora das 24 horas no Instagram e no
Messenger: 7 dias, e **só quando quem responde é uma pessoa**. IA e automação
nunca a usam — seria mentir para a Meta sobre quem está do outro lado, e a
consequência é a conta.

Está implementada e testada na decisão de política. Não pode ser exercitada
porque a feature exige App Review, e o padrão de
`humanAgentAprovado(canal)` é **falso** — um sistema que assume aprovação
envia, a Meta recusa com `(#10) permission`, e o erro não parece com "falta App
Review".

### 1.8 Data Deletion Callback — **NÃO IMPLEMENTADO**

A Meta exige, para App Review, uma URL que receba pedidos de exclusão de dados
de usuário. **Ela não existe neste código.**

Isto está aqui, e não escondido, porque é um bloqueador de App Review: sem ela,
a submissão é recusada. O que existe hoje é a exclusão pelo CRC (LGPD, §64), que
é outro caminho e não substitui o callback da Meta.

---

## 2. O que foi medido

### 2.1 Testes

| Suíte                         | Arquivos | Testes | Como rodar                |
| ----------------------------- | -------- | ------ | ------------------------- |
| Unidade (repositório inteiro) | 135      | 2464   | `npm test`                |
| — destes, da Meta             | 18       | 401    | —                         |
| Integração (Postgres real)    | 7        | 128    | `npm run test:integracao` |
| — destes, da Meta             | 1        | 28     | —                         |
| E2E de navegador (Meta)       | 1        | 13     | `npm run e2e`             |

Todas verdes. O E2E precisa do Postgres de teste com PostgREST na frente — ver o
cabeçalho de `scripts/servidor-e2e.mjs`.

A linha de base antes desta entrega era **116 arquivos / 2042 testes** de
unidade. O crescimento é todo da Meta e do que ela obrigou a mudar.

### 2.2 Defeitos injetados — §55

`node scripts/injetar-defeitos-meta.mjs` estraga o código de propósito, roda a
suíte, e confere que ela reprova. **7 de 7 mordem:**

| #   | Defeito injetado                           | Teste que reprova                                  |
| --- | ------------------------------------------ | -------------------------------------------------- |
| 1   | remove o índice de dedupe por mensagem     | "a garantia real é POR MENSAGEM"                   |
| 2   | tenant vira "primeira clínica ativa"       | "o evento da clínica B NUNCA aparece na clínica A" |
| 3   | ignora a assinatura do webhook             | "recusa quando o corpo mudou UM byte"              |
| 4   | tira o namespace do filtro de identidade   | "o MESMO valor em namespaces diferentes são DUAS"  |
| 5   | backfill passa a emitir `message.received` | "o backfill NÃO emite `message.received`"          |
| 6   | trava de sandbox volta a ser de build      | "`ehProducao` chega em `process` por `globalThis`" |
| 7   | a saída ignora o canal da conversa         | "o direct sai como texto, e a mensagem fica SENT"  |

Um teste que não reprova quando o código quebra é uma linha verde, e não uma
prova. Estes sete são os invariantes que custam dinheiro ou paciente.

Os dois últimos são novos, e cada um é uma "limpeza" que já aconteceu: a forma
direta de ler `NODE_ENV` parece equivalente e desliga o sandbox no artefato; a
porta fixa parece mais simples e manda a resposta pelo canal errado. Nos dois, o
sintoma é silêncio.

### 2.3 O que o E2E encontrou — três defeitos que nenhum outro teste podia ver

Isto está aqui porque é a evidência de que a suíte E2E vale o que custa. Os três
passaram por 133 arquivos de teste de unidade e 7 de integração sem serem vistos,
porque nenhum deles atravessa a função de servidor.

**1. A Inbox não conseguia responder no Instagram nem no Messenger.**

`responderConversa` montava o provedor de WhatsApp **sempre**. Numa Inbox só de
WhatsApp isso estava certo; numa Inbox unificada é o defeito central. Alguém
escrevia para a clínica pelo Instagram, a recepção respondia, e a tela recusava
com "credencial de WhatsApp só existe no ambiente" — uma frase sem relação
nenhuma com o que a pessoa estava fazendo. O paciente ficava sem resposta.

Consertado com `enviarNoCanal` em `aplicacao/mensagens.ts` — que espelha
`enviarMensagem` (grava antes de mandar, mesma chave de dedupe, mesmos três
estados de falha) e troca as três peças do WhatsApp pelas do canal: destino
discriminado, `PortaCanal`, e `avaliarPoliticaDoCanal`. Coberto agora por 20
testes de unidade em `aplicacao/enviar-no-canal.test.ts`.

**2. `META_APP_ID` ausente recusava TODO webhook, dizendo que faltava o
segredo.**

O `appSecret` era lido por `appDoAmbiente()`, que é tudo-ou-nada. Um deploy com
o segredo **certo** e sem o app id — que não participa do HMAC e não é consumido
em lugar nenhum — recusava tudo com `motivo: "sem_segredo"`. O sintoma mandava
conferir o segredo, que estava certo.

Consertado: o segredo tem leitura própria, e a variável ausente aparece com o
próprio nome num sinal novo da tela de saúde ("Variáveis do aplicativo"), que
vira `ERRO` **antes** de qualquer outro — porque é ela que explica todo o resto.

**3. As duas travas de sandbox eram resolvidas em tempo de BUILD, e o caminho
do sandbox não existia no artefato.**

`process.env["NODE_ENV"] === "production"` é substituído por um literal no bundle
do servidor — e **não é o `--mode` que decide**: o build do servidor define
`"production"` nas duas passagens. O efeito, medido no artefato:

```
// src/lib/crc/integracoes/meta/config.ts
export function sandboxLigado(): boolean {
  if (process.env["NODE_ENV"] === "production") return false;
  return (process.env["META_SANDBOX"] ?? "").trim() === "1";
}

// .output/server/_ssr/ssr.mjs
function sandboxLigado() { return false; }

grep -c META_SANDBOX .output/server/_ssr/ssr.mjs   →  0
```

`META_SANDBOX` não era ignorado: **não era nem lido.** A trava do WhatsApp
(`criarProvedorMensageria`) tinha exatamente o mesmo destino.

Consequência honesta: **nenhuma execução anterior do E2E provou envio de
mensagem** — nem do Instagram, nem do WhatsApp. O que passava era tudo que não
envia. E o sintoma ficava a três camadas da causa: _"a conta da Meta está
cadastrada para receber, mas não tem token de envio"_.

Consertado com `servidor/ambiente.ts`, e **duas formas não bastaram** — o que
vale registrar, porque a terceira parece rebuscada sem esse contexto:

```
process.env["NODE_ENV"]                →  "production"
const v = process.env; v["NODE_ENV"]   →  "production"   (propagou pela variável)
globalThis.process?.env?.["NODE_ENV"]  →  sobreviveu
```

A substituição casa o caminho a partir do **identificador** `process`. Chegar
nele por `globalThis` sai do casamento. O E2E continua construindo o bundle de
**produção** — é isso que `playwright.config.ts` exige — e o `NODE_ENV=test` do
processo é que liga os sandboxes.

**A troca está analisada por escrito** no cabeçalho de `servidor/ambiente.ts`: a
trava deixa de ser impossível-por-construção e passa a depender de o processo ter
`NODE_ENV=production` — que o preset do Nitro e a Vercel definem sozinhos.
Ligar sandbox em produção passou a exigir duas coisas ao mesmo tempo, uma delas
desfazendo o que a plataforma faz.

Guardado por invariante: `testes/invariantes-arquiteturais.test.ts` reprova se
uma trava de sandbox voltar a ler `process.env.NODE_ENV` direto — e também se o
próprio helper voltar a usar a forma que o bundler casa.

**O mesmo padrão segue em nove outros lugares** (Dental Office, gateway de IA,
embeddings, `servidor/sessao.ts`, `servidor/instalacao.ts`). Para a maioria está
certo: cookie seguro e recusa de semente de exemplo devem valer no artefato, não
depender de variável. Os que são trava de sandbox têm o mesmo defeito latente, e
mudá-los é comportamento em caminho que já está em produção — **não foi feito
nesta entrega**, de propósito.

### 2.4 O que o E2E exercita que nada mais exercita

A cadeia HTTP real → rota TanStack → verificação de assinatura → normalização →
roteamento de tenant → inbox → aplicação → PostgREST → tela.

O E2E **assina os próprios webhooks** com o `appSecret` do ambiente de teste. A
verificação de assinatura — a fronteira de segurança da integração — é
exercitada de verdade, e não contornada.

### 2.5 O portão, e o que cada passo exige

```bash
npm run lint          # 0 erros (7 avisos de react-refresh, pré-existentes)
npm run typecheck     # 0 erros
npm test              # 135 arquivos / 2464 testes
npm run test:integracao   # 7 / 128 — EXIGE Postgres + PostgREST de teste
npm run e2e           # 13 do arquivo da Meta — EXIGE o mesmo banco
node scripts/injetar-defeitos-meta.mjs   # 7/7 mordem
```

Os três últimos exigem o banco de teste em pé. O `servidor-e2e.mjs` recusa
rodar contra um `SUPABASE_URL` que aponte para o Supabase — ele **instala**
organização e semeia dados, e nunca deve tocar produção.

---

## 3. Migrações

Uma só: **`supabase/45-crc-meta-omnichannel.sql`**.

| O que ela faz                                      | Por quê                                          |
| -------------------------------------------------- | ------------------------------------------------ |
| `crc_patient_identities.namespace` + backfill      | `EXTERNAL_ID/123` do prontuário ≠ IGSID `123`    |
| derruba a chave única antiga de 4 colunas          | ela permitia a colisão acima                     |
| `crc_canais_meta` (+2 índices únicos parciais)     | uma conta da Meta pertence a exatamente um canal |
| `crc_social_events`                                | auditoria e idempotência de comentário/menção    |
| `crc_regras_sociais`                               | as regras do §66                                 |
| `crc_private_replies`                              | a reserva que impede o segundo direct            |
| 15 colunas em `crc_leads`                          | atribuição de campanha e speed-to-lead           |
| `crc_conversations.apelido_externo`                | mostrar `@usuario` em vez do id de 17 dígitos    |
| `crc_messages.historico_importado` / `recebido_em` | backfill não acorda automação (§48)              |
| `crc_autonomia.canal`                              | teto por canal, que só aperta                    |
| bloco de `grant` para `service_role` e `anon`      | sem ele, `TRUNCATE` e leitura falham             |

**O bloco de grants foi descoberto por falha**, e não por revisão: sem ele, os
testes de integração quebravam 100 testes não relacionados com
`permission denied for table crc_canais_meta`, porque `limparTudo()` monta a
lista de truncate a partir do catálogo. Toda migração desde a `21` tem esse
bloco; a `45` nasceu sem.

**Aplicar do zero:** `node scripts/aplicar-schema.mjs` roda os 46 arquivos de
produção na ordem numérica (`--com-teste` inclui o `99-`, que é veneno em
produção e necessário para os testes de integração).

**O que foi exercitado nesta sessão foi a `45` sobre um banco que já tinha as
44 anteriores** — não a instalação do zero. A `45` foi aplicada, o schema
conferido coluna a coluna, e os 128 testes de integração passaram contra ele. A
instalação em banco vazio continua coberta por `aplicar-schema.mjs` no CI, e não
por esta sessão.

---

## 4. Permissões conferidas

Conferidas contra a documentação oficial em **15/09/2026**, versão da Graph
**v26.0**. A tabela viva está em `integracoes/meta/config.ts` (`EXIGENCIAS`), com
a URL da fonte por produto — uma lista de nomes sem fonte é algo que ninguém
consegue reconferir depois.

| Produto     | Permissões                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Instagram   | `instagram_business_basic`, `instagram_business_manage_messages`, `pages_messaging`, `pages_show_list`                          |
| Messenger   | `pages_messaging`, `pages_manage_metadata`, `pages_read_engagement`, `pages_show_list`                                          |
| Comentários | `instagram_business_basic`, `instagram_business_manage_comments`, `instagram_business_manage_messages`, `pages_manage_metadata` |
| Lead Ads    | `leads_retrieval`, `pages_manage_ads`, `pages_show_list`, `pages_read_engagement`                                               |

**Os campos de webhook são separados das permissões, e são a causa nº 1 de
silêncio.** Subscrever o app na Página sem o campo certo **não dá erro**: a Meta
aceita e nunca entrega. A lista por produto está em `CAMPOS_DE_WEBHOOK` e
aparece na tela de Integrações justamente para ser conferida campo a campo.

---

## 5. O que falta — e de quem é

### O falso positivo que quase virou tarefa — e a tarefa que ele escondia

**Fechado.** A suíte roda verde nas doze, e quatro execuções seguidas deram o
mesmo resultado. O que segue é como se chegou lá, porque o caminho tem três
lições e só a primeira era a esperada.

#### 1. O falso positivo

A varredura do axe começou reprovando com violações `serious` de contraste — em
Início e no modal novo — e a primeira leitura foi "bug pré-existente de
paleta". Era falso:

| Onde                           | fg medido | bg medido | razão    |
| ------------------------------ | --------- | --------- | -------- |
| Início, `.crc-etiqueta-perigo` | `#c7534a` | `#fef1ef` | **3.99** |
| Modal, `.crc-aviso-alerta`     | `#a36209` | `#fcf2e4` | **4.40** |

Nenhuma dessas cores existe no CSS. Os tokens são `--crc-perigo: #bb3126` sobre
`#fff0ee` (**5.29**) e `--crc-alerta: #a05c00` sobre `#fff5e6` (**4.83**) — os
dois passam. As cores medidas são versões CLARAS deles, que é o que acontece
quando se mede um elemento no meio de `@keyframes crc-premium-enter`, que anima
`opacity: 0 → 1`.

**`toBeVisible()` passa no layout, não no fim da transição.** A suíte inteira
estava exposta a isso e passava por sorte — a falha **mudava de tela a cada
execução** (Início numa, Gestão e Configurações na outra, Pacientes na
terceira). O modal, com animação mais longa, foi só o que tirou a sorte.

O relato de falha imprime `fgColor`/`bgColor`/`contrastRatio` do que o navegador
pintou, e é o que tornou tudo isto visível. Sem esses números a investigação é
um beco sem saída: o seletor manda você para um CSS que, medido à mão, passa.

#### 2. `assentar()` não bastou — e o motivo é interessante

Trocar o settle curto por `assentar()` nas nove telas era o plano, e ele
**resolveu menos da metade**. Uma sonda medindo a cadeia de opacidade depois do
`assentar()` encontrou, em Integrações, quatro `.crc-esqueleto` ainda pulsando e
três `crc-premium-enter` com `currentTime: 0`.

`currentTime: 0` é a resposta inteira: **não dá para esperar o fim de uma
animação que ainda não começou.** `crc-premium-enter` dispara quando o cartão
monta, e o cartão monta quando o dado chega — depois da espera. A tela não
estava "animando", estava **carregando**.

E a espera pela casca tinha o mesmo buraco de um jeito pior: com `.crc-lateral`
visível e o arquivo da tela ainda baixando, "zero esqueletos" é **verdade** —
porque a tela que os desenha ainda não montou. A varredura da Gestão media uma
tela sem tabela nenhuma, e o axe, um instante depois, encontrava
`.crc-tabela-caixa` e cinco `th` reprovando.

O conserto tem duas partes, as duas em `esperarATela`:

- **os três marcadores de "ocupado" num seletor só** — `.crc-tela-carregando`
  (o arquivo da tela), `.crc-esqueleto` (o dado) e `[aria-busy="true"]`.
  Esperados em sequência, cada um passa no vão do outro; juntos num locator só,
  a contagem nunca chega a zero no meio da troca;
- **`assentar()` em laço**, porque uma animação que nasce no último quadro da
  espera começa depois dela. Repete até uma rodada não achar mais nenhuma,
  dentro do mesmo teto de 2s.

As duas armadilhas de `getAnimations()` que já estavam resolvidas continuam
valendo: animação infinita do esqueleto (o `finished` nunca resolve) e o teto
para animação pausada.

#### 3. O que a espera correta achou de verdade

Metade do que a espera curta apontava era artefato, e sumiu sozinho:

| Onde, e o que reprovava                 | medido    | razão | com a espera correta |
| --------------------------------------- | --------- | ----- | -------------------- |
| Configurações, `.crc-etiqueta-positiva` | `#57a079` | 2.83  | artefato             |
| Configurações, `.crc-etiqueta-alerta`   | `#c09151` | 2.63  | artefato             |
| Integrações, `.crc-etiqueta-neutra`     | `#bac0b9` | 1.70  | artefato             |
| Integrações, `.crc-etiqueta-info`       | `#3c799c` | 4.38  | artefato             |
| Gestão, cinco `th`                      | —         | —     | artefato             |
| Pacientes (apareceu numa execução)      | —         | —     | artefato             |

A etiqueta `neutra` a **1.70** é o caso que mostra o tamanho do engano: o par
real é `--crc-texto-2` (#16281d) sobre `--crc-superficie-3` (#eef2eb), e a
cadeia estava em 26% de opacidade quando foi medida.

O que sobrou é real, e está corrigido:

| Tela                  | Violação                       | Causa                                              |
| --------------------- | ------------------------------ | -------------------------------------------------- |
| Gestão, Configurações | `nested-interactive` `serious` | o cabeçalho recolhível inteiro era `role="button"` |
| Gestão                | `scrollable-region-focusable`  | `.crc-tabela-caixa` rola e não recebia foco        |
| Configurações         | `label` **`critical`**         | catorze campos `type="time"` sem rótulo nenhum     |
| Configurações         | `color-contrast` `serious`     | `opacity: 0.65` derrubando **10.46** para **3.80** |

**`nested-interactive`** era o mais sério dos quatro em consequência.
`useSecoesRecolhiveis` (`routes/crc.tsx`) marcava todo `section > header` como
`role="button" tabindex="0"` — e metade dos cabeçalhos do CRC tem botão dentro
("Nova unidade", "Exportar"). Botão dentro de botão é território que o ARIA não
define: o mais comum é o leitor de tela anunciar só o de fora, e **quem navega
por áudio perdia o "Nova unidade"**. A seta virou um `<button>` de verdade, com
nome ("Recolher Unidades"); o cabeçalho continua clicável no mouse, que é
conforto e não promessa de ARIA. O `keydown` à mão saiu junto — um `<button>`
trata Enter e Espaço sozinho, e melhor.

**`scrollable-region-focusable`**: uma região que rola e não recebe foco é
conteúdo inalcançável por teclado — as colunas escondidas à direita não existem
para quem não usa a roda do mouse. Virou o componente `TabelaRolavel`
(`components/crc/base.tsx`), com `rotulo` obrigatório, aplicado nos cinco pontos
de uso (Gestão ×3, Radar, Tratamentos). Componente e não atributo solto porque a
sexta tabela nasceria sem ele, e o defeito volta calado.

**`label`**: sete dias na tela, catorze campos de hora idênticos, e o leitor de
tela anunciava "editar hora" catorze vezes. Agora cada um diz o dia junto da
ponta — "Segunda, abre às".

**`color-contrast`**: `opacity: 0.65` no `<article>` inteiro. O par é
`--crc-texto-3` (#2b3b31) sobre `--crc-superficie-3` (#eef2eb), **10.46:1** —
folgado; com a opacidade a cor efetiva vira `#757f78` sobre `#f3f6f1` e cai para
**3.80:1**. É o **mesmo erro** de `.crc-int-command-status-v2 small`
(5.76 → 3.45), corrigido antes nesta mesma sessão. Opacidade parcial sobre texto
é uma multiplicação escondida no contraste: não aparece em token nenhum, e quem
for conferir o CSS à mão vai medir o par certo e não entender a reprovação. O
"está aqui mas não faz nada" continua dito pela borda tracejada, pelo
interruptor desabilitado e pela frase escrita na etiqueta — a única das três que
funciona para quem lê por áudio.

### E uma violação real, na tela central da entrega

Com a espera correta, a varredura reprovou **Conversas** com quatro violações
— uma crítica — de uma causa só: a fila é `role="listbox"` com `<li>` no meio,
e ARIA exige `option` como filho **direto**.

```
aria-required-children  o `li` não é `option`
aria-required-parent    o `option` não alcança o listbox
listitem                o `li` está num `ul` que virou listbox
aria-input-field-name   o listbox estava sem nome
```

Para quem usa leitor de tela isso não é acadêmico: um listbox malformado é lido
como texto solto, e a fila de conversas deixa de ser navegável por seta.
Corrigido com `role="presentation"` no `<li>` e `aria-label` no `<ul>` — sem
mexer em HTML nem CSS, que continuam precisando do `li`.

**Nota de projeto, e não bug:** `--crc-alerta` sobre `--crc-alerta-suave` dá
4.83 contra os 4.5 exigidos. Passa com 0.33 de margem — qualquer opacidade
parcial ou um tom um passo mais claro derruba.

E "derruba" não é hipótese: é o que já aconteceu **duas vezes**, nas duas únicas
regras do CRC que puseram `opacity` sobre texto —
`.crc-int-command-status-v2 small` (5.76 → 3.45) e `.crc-settings-flag-inerte-v2`
(10.46 → 3.80). As duas foram escritas para dizer "isto é secundário", e as duas
disseram, em vez disso, "isto é ilegível". **Hierarquia visual nesta interface se
faz com `font-size` e `font-weight`**; se você precisar mesmo de opacidade sobre
texto, 0.9 é o teto que ainda passa no par do alerta (4.67).

---

### Externo (não é código)

| Bloqueador                                    | Quem resolve                                   |
| --------------------------------------------- | ---------------------------------------------- |
| App da Meta criado, com App ID e App Secret   | quem administra o Business Manager             |
| Página do Facebook conectada à conta do IG    | idem                                           |
| App Review para `HUMAN_AGENT` e private reply | idem, com screencast e política de privacidade |
| Conta profissional do Instagram (não pessoal) | a clínica                                      |

### Nosso, e não feito

| Item                      | Estado | Nota                                          |
| ------------------------- | ------ | --------------------------------------------- |
| Data Deletion Callback    | falta  | bloqueia App Review — §1.8                    |
| Analítica por canal (§40) | falta  | os dados estão gravados; a tela não foi feita |

**Só duas, e a lista já foi maior.** Duas linhas saíram porque eram erro de
escopo meu, e não trabalho pendente:

- **Reconciliação automática** estava marcada como bloqueada pelo plano da
  Vercel. O plano dá dois cron jobs diários e os dois têm dono — mas a **volta
  pesada** já roda uma vez ao dia e já percorre organização por organização.
  A reconciliação entrou nela (`automacao/volta-pesada.ts` →
  `reconciliarLeadsDaMeta`) e custa **zero** slot. Seis testes novos.
- **axe-core (§51)** estava marcada como "não rodado". A suíte existia
  (`e2e/acessibilidade.spec.ts`, oito telas) e nenhuma delas era Integrações.
  Agora são nove, mais uma varredura com o **modal de regra aberto** — porque
  o axe lê o DOM parado, e um formulário atrás de um clique não está nele.

A varredura do modal achou, de primeira, uma violação `serious` de contraste na
pastilha de status de Integrações (`opacity: 0.75` derrubava 5.76:1 para
3.45:1, e só no estado de alerta — exatamente quando a tela tinha algo
importante a dizer). Corrigida, com a medição no comentário do CSS.

---

## 6. Ligar e desligar

**Ligar** está descrito passo a passo em
[META-ATIVACAO-E-HOMOLOGACAO.md](META-ATIVACAO-E-HOMOLOGACAO.md): inventário →
o que funciona sem App Review → App Review → Lead Ads → comentários.

**Desligar** é um `UPDATE`: `crc_canais_meta.ativo = false`. O desligamento vale
na **porta de entrada** — `canalMetaPorId` filtra por `ativo`, então o canal
para de receber na hora. Não adianta parar de enviar e continuar aceitando
mensagem, criando conversa e cobrando classificação de IA.

A linha **não é apagada**: o histórico de "por qual conta isto entrou", a
auditoria do §63 e o religar sem refazer o OAuth dependem dela existir.

**O caminho do WhatsApp continua o mesmo — com UMA exceção declarada.**

`PortaMensageria`, os três adapters, a janela de 24 horas, o template aprovado e
`enviarMensagem` não foram tocados: a integração nova entra por um tipo acima
(`PortaCanal`) e por uma função ao lado (`enviarNoCanal`). Os 2042 testes que
existiam antes desta entrega continuam passando, e essa é a evidência.

A exceção: `criarProvedorMensageria` e `provedorParaWebhook` passaram a chamar
`ehProducao()` em vez de ler `process.env["NODE_ENV"]` direto. É a mesma trava,
pela mesma razão do §2.3 — o sandbox do WhatsApp também estava sendo removido do
artefato, e o E2E também nunca provou um envio dele. **Nenhuma mudança de
comportamento em produção:** lá `NODE_ENV=production` está definido pelo runtime,
e a trava fecha igual.

---

## 7. Quando algo quebrar

[META-RUNBOOK.md](META-RUNBOOK.md) — 14 incidentes, cada um com sintoma, como
confirmar, onde olhar, como recuperar e como não perder lead no meio.

O cartão da tela de Integrações mostra **nove sinais medidos**, e o estado
`CONECTADO` exige fato datado recente. Uma conta recém-conectada aparece como
`ATENCAO` com a frase "cadastrada e nenhum webhook chegou ainda" — não é
pessimismo: é a causa mais comum de silêncio, e ela não dá erro nenhum.

---

## 8. A arquitetura, em uma frase

Uma fila só (`crc_webhook_inbox`), discriminada por **forma do payload** e não
por nome de provedor; identidade com **namespace** para que dois sistemas
externos não colidam; política **por canal** decidida no domínio; reserva no
banco **antes** de decidir; e `incerta` como terceira classe de falha, porque um
POST que deu timeout pode ter entregue.

O detalhe está em [META-OMNICHANNEL.md](META-OMNICHANNEL.md), incluindo as
divergências assumidas em relação ao pedido original (§19) e por quê.
