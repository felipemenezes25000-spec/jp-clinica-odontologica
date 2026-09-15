# Meta Omnichannel — a arquitetura

> Instagram Direct, Facebook Messenger, comentários, private reply e Meta Lead
> Ads **dentro do CRC que já existe**. Não há segunda Inbox, segundo paciente,
> segundo funil nem segunda fila.

Escrito em 15/09/2026. Fontes oficiais conferidas na mesma data — ver
[Permissões e formatos](#permissões-e-formatos-conferidos).

---

## 1. O que muda, em uma frase

O CRC nasceu falando WhatsApp, e WhatsApp é telefone. Isso deixou um pressuposto
vazando por toda a camada de aplicação:

```
mensagem = telefone
```

Instagram não tem telefone. Messenger não tem telefone. A pessoa que manda
direct é um identificador opaco emitido pela Meta, válido só dentro do par
(conta da clínica, pessoa).

**O maior trabalho desta entrega foi remover esse pressuposto sem quebrar o
WhatsApp.** O resto — webhook, adapters, regras, Lead Ads — é consequência.

---

## 2. O desenho

```
                        ┌───────────────────┐
                        │     GOOGLE ADS    │
                        └─────────┬─────────┘
                                  ▼
SITE ───────────────────────── WhatsApp ─────────┐
                                                 │
INSTAGRAM ─── direct ────────────────────────────┤
          ├── comentário ───────────────────────┤
          ├── private reply ────────────────────┤
          └── Lead Ads ─────────────────────────┤
                                                 │
FACEBOOK ─── Messenger ──────────────────────────┤
         └── Lead Ads ───────────────────────────┤
                                                 ▼
                                       ┌──────────────────┐
                                       │      JP CRC      │
                                       │  identidade · 1  │
                                       │  inbox      · 1  │
                                       │  funil      · 1  │
                                       │  agenda     · 1  │
                                       │  IA         · 1  │
                                       │  atribuição · 1  │
                                       └──────────────────┘
```

### Onde cada coisa mora

| Camada                      | Arquivo                                       | O que decide                                 |
| --------------------------- | --------------------------------------------- | -------------------------------------------- |
| Canal, sem telefone         | `src/lib/crc/dominio/canais.ts`               | `CanalConversa`, `DestinoCanal`, namespaces  |
| Política por canal          | `src/lib/crc/dominio/politica-de-canal.ts`    | janela de 24h, `HUMAN_AGENT`, private reply  |
| Regra de comentário         | `src/lib/crc/dominio/regras-sociais.ts`       | casamento, veto, cooldown                    |
| Campos do Instant Form      | `src/lib/crc/dominio/campos-do-formulario.ts` | mapeamento por `name`, interesse             |
| Identidade                  | `src/lib/crc/dominio/identidade.ts`           | `EXTERNAL_ID` **com namespace**              |
| Versão da Graph, permissões | `src/lib/crc/integracoes/meta/config.ts`      | `META_GRAPH_VERSION`, exigências             |
| Assinatura e handshake      | `src/lib/crc/integracoes/meta/assinatura.ts`  | HMAC-SHA256, tempo constante                 |
| Normalização do envelope    | `src/lib/crc/integracoes/meta/normalizar.ts`  | `messaging[]` **e** `changes[]`              |
| Erros da Graph              | `src/lib/crc/integracoes/meta/erros.ts`       | permanente / transitória / **incerta**       |
| Cliente HTTP                | `src/lib/crc/integracoes/meta/cliente.ts`     | paginação, timeout, log                      |
| Porta genérica              | `src/lib/crc/integracoes/canais/porta.ts`     | `PortaCanal` acima de `PortaMensageria`      |
| Adapters IG/Messenger       | `src/lib/crc/integracoes/meta/porta.ts`       | Send API, private reply, perfil              |
| Contas e tenant             | `src/lib/crc/integracoes/meta/canais.ts`      | `crc_canais_meta` → organização              |
| Sandbox                     | `src/lib/crc/integracoes/meta/provedores.ts`  | fake para CI e desenvolvimento               |
| Webhook → fila              | `src/lib/crc/aplicacao/meta.ts`               | inbox pattern, tenant, vínculo               |
| Comentário → lead           | `src/lib/crc/aplicacao/social.ts`             | regra, reserva, private reply                |
| Lead Ads                    | `src/lib/crc/aplicacao/lead-ads.ts`           | importação e reconciliação                   |
| Histórico                   | `src/lib/crc/aplicacao/meta-historico.ts`     | backfill que não acorda automação            |
| Resposta pela Inbox         | `src/lib/crc/aplicacao/mensagens.ts`          | `enviarNoCanal`, ao lado de `enviarMensagem` |
| Produção ou não             | `src/lib/crc/servidor/ambiente.ts`            | a trava de sandbox, perguntada ao runtime    |
| Reconciliação diária        | `src/lib/crc/automacao/volta-pesada.ts`       | `reconciliarLeadsDaMeta`, sem cron próprio   |
| Saúde                       | `src/lib/crc/aplicacao/meta-saude.ts`         | os sinais do §39                             |
| Configuração                | `src/lib/crc/aplicacao/meta-config.ts`        | conectar, testar, regras                     |
| Webhook (rota)              | `src/routes/api/crc/meta.$canal.tsx`          | verificar → rotear → gravar                  |
| Migração                    | `supabase/45-crc-meta-omnichannel.sql`        | tudo o que faltava no schema                 |

---

## 3. O fluxo de entrada

```
POST /api/crc/meta/<id do canal>
  │
  │  corpo CRU (sem parse)
  ▼
carrega crc_canais_meta pelo id da URL          ← o id é PÚBLICO, não é credencial
  │
  ▼
verifica HMAC-SHA256 com o appSecret DAQUELE canal   ← aqui nasce a confiança
  │
  ▼
normaliza: entry[].messaging[] E entry[].changes[]
  │
  ▼
confere que as contas do payload SÃO deste canal      ← fecha o buraco do tenant
  │
  ▼
grava crc_webhook_inbox (provedor = 'meta')          ← ANTES de qualquer efeito
  │
  ▼
aplica evento por evento
  │
  ├── mensagem   → crc_conversations + crc_messages
  ├── entrega    → crc_messages.status_entrega
  ├── comentário → crc_social_events → regra → lead → private reply
  └── leadgen    → crc_leads + crc_opportunities + crc_attribution_events
  │
  ▼
PROCESSADO   (ou FALHOU, e o pulso repesca)
```

### Por que a URL tem o canal dentro

Para verificar a assinatura é preciso saber o canal. Para saber o canal pelo
corpo, seria preciso confiar no corpo — que é justamente o que a assinatura
existe para decidir.

O `:canal` da URL quebra a circularidade. Ele é um **identificador público**: um
uuid que só diz **qual linha ler**. Quem o descobrir ainda precisa assinar o
corpo com o `appSecret` daquele canal.

É o mesmo desenho de `/api/crc/whatsapp/:canal`, e pelo mesmo motivo: com dois
Meta Apps, o segredo de A não valida a assinatura de B — e se só A estiver
cadastrado, **qualquer corpo assinado por A passa dizendo ser de quem quiser**.

### A conferência de conta é o que fecha o buraco

A assinatura prova que o corpo é autêntico — **não** que ele é desta Página. Um
tenant com acesso ao próprio app secret poderia assinar um corpo dizendo ser de
outra conta. `envelope.contas` é conferido contra `page_id` e
`instagram_account_id` do canal antes de qualquer gravação.

---

## 4. As duas formas do envelope

A Meta usa formatos diferentes **no mesmo POST**:

```
MENSAGEM      entry[].messaging[]     estilo Messenger Platform
COMENTÁRIO    entry[].changes[]       estilo Webhooks de campo
LEAD          entry[].changes[]       idem, field: "leadgen"
```

Um normalizador escrito só contra `changes[]` — que é o formato do WhatsApp, e o
primeiro que se aprende — recebe todo direct do Instagram e **não encontra nada
dentro**. Sem erro: `changes` não existe, o laço não roda, o envelope sai vazio,
e o CRC responde 200. A mensagem some e a Meta considera entregue.

`EnvelopeMeta.ignorados` conta o que nenhum dos dois laços reconheceu, e a tela
de saúde mostra o número. Um descarte silencioso é como a integração degrada sem
ninguém perceber.

---

## 5. Identidade: o namespace não é decoração

Antes do `supabase/45`, `crc_patient_identities` guardava `(tipo, valor)` — e
`EXTERNAL_ID` significava, por convenção **não escrita**, "id do paciente no
Dental Office". O Dental Office numera pacientes com inteiros pequenos.

O Instagram também emite identificadores numéricos:

```
EXTERNAL_ID / 123     ← o paciente 123 do prontuário
EXTERNAL_ID / 123     ← o IGSID de quem mandou um direct
```

**A mesma linha.** E a resolução devolveria `UNICO` com confiança total: do
ponto de vista da tabela não existe ambiguidade. O mecanismo de `compartilhada`
nem dispara. O direct de um estranho entra no prontuário comercial de um
paciente, e não há como descobrir depois.

A chave passou a ser `(organização, paciente, tipo, namespace, valor)`:

```
EXTERNAL_ID / dental-office / 123
EXTERNAL_ID / instagram     / 17841400000000001
EXTERNAL_ID / messenger     / 9876543210
```

Telefone, e-mail e CPF **não têm namespace**, e isso é deliberado:
`11999990000` é o mesmo número em qualquer sistema, e namespeá-los quebraria o
cruzamento que a tabela existe para fazer.

### Regras absolutas

- Nunca merge por nome.
- Nunca merge por username.
- Nunca merge por similaridade textual.
- Telefone compartilhado continua **ambíguo** e vai para revisão humana.
- `EXTERNAL_ID` sem namespace é **recusado** na gravação e devolve `NENHUM` na
  resolução.

### O vínculo é uma afirmação

Ele acontece em dois casos, e nos dois há algo forte sustentando:

1. a pessoa informou telefone/e-mail e ele resolveu para **exatamente um**
   paciente;
2. alguém da clínica confirmou na Inbox — e fica auditado (§63).

Desfazer também é auditado, e devolve a conversa para revisão.

---

## 6. Política por canal: o que sai, e quando

|                   | dentro de 24h | fora de 24h                                             |
| ----------------- | ------------- | ------------------------------------------------------- |
| **WhatsApp**      | texto livre   | template aprovado, ou recusa                            |
| **Instagram**     | texto livre   | `HUMAN_AGENT` (7 dias, só atendente, só com App Review) |
| **Messenger**     | texto livre   | idem                                                    |
| **Private reply** | —             | 7 dias do comentário, **uma** mensagem                  |

**Instagram e Messenger não têm template aprovado.** Traduzir a regra do
WhatsApp para eles erra nos dois sentidos:

- "manda template" recusaria toda resposta legítima de recepcionista no dia
  seguinte;
- "manda texto livre" faria a Meta recusar, e a IA tentaria de novo achando que
  o erro foi transitório.

**A etiqueta `HUMAN_AGENT` não pode ser usada pela IA.** Ela afirma à Meta que
um humano está respondendo. Uma automação que a usa está declarando falso à
plataforma, e a penalidade é a conta — não a mensagem. `avaliarPoliticaDoCanal`
devolve `EXIGE_HANDOFF` nesse caso, e a Inbox mostra que a recepção precisa
assumir.

### Quem executa a política na saída da Inbox

`aplicacao/mensagens.ts` tem **duas** funções de envio, e a separação é
deliberada:

| Função           | Canal                | Destino                     | Janela decidida por            |
| ---------------- | -------------------- | --------------------------- | ------------------------------ |
| `enviarMensagem` | WhatsApp             | `telefone: string`          | `dominio/janela-whatsapp.ts`   |
| `enviarNoCanal`  | Instagram, Messenger | `DestinoCanal` discriminado | `dominio/politica-de-canal.ts` |

`responderConversa` escolhe pelo `canal` da conversa. As duas gravam antes de
mandar, usam a mesma chave de dedupe e têm os mesmos três estados de falha — e
`enviarNoCanal` recusa WhatsApp explicitamente, porque dois caminhos aceitando o
mesmo canal criariam duas verdades sobre a janela de 24 horas.

**Por que não um `if` dentro de `enviarMensagem`:** o parâmetro dela é
`telefone: string`, e um IGSID tem dígitos suficientes para `normalizarTelefone`
tratá-lo como número com DDI. O canal errado não daria erro — daria um telefone
inventado.

**A janela é medida por `recebido_em`, não por `criado_em`,** e só sobre entrada
com `historico_importado = false`. O primeiro é o relógio da Meta; o segundo é o
nosso, e numa reentrega eles divergem em horas. O segundo filtro é o §48 na
prática: conversa trazida por backfill não abre janela.

---

## 7. Comentário → lead → private reply

```
comentário chega
  ↓  grava crc_social_events          ← dedupe no banco, SEMPRE
  ↓  casa uma regra?                  ← puro, em dominio/regras-sociais.ts
  ↓  cria lead?                       ← só se a regra pedir
  ↓  cria oportunidade?               ← só se a regra pedir
  ↓  RESERVA o private reply          ← o BANCO decide quem manda
  ↓  a política permite?              ← 7 dias, uma mensagem
  ↓  a autonomia permite?             ← min(teto, domínio, canal)
  ↓  manda
```

### A reserva vem antes da política, e é de propósito

Parece invertido — por que reservar algo que pode ser recusado? — e a razão é a
**corrida**: dois webhooks do mesmo comentário chegam juntos, os dois avaliam
política e autonomia, os dois passam, e os dois mandam.

Reservando primeiro, o segundo nem avalia. O custo é uma reserva ocupada por um
envio que não aconteceu — e ela fica com status `BLOQUEADO` e o motivo escrito,
que é informação útil na tela em vez de silêncio.

### A chave do cooldown não é o id do comentário

```
chave = regra : ator : mídia : janela
```

Dedupe por comentário deixaria a mesma pessoa receber **dez** directs
comentando dez vezes: cada comentário tem id próprio, e cada um passaria.

### Nem todo comentário é lead

Três travas, e as três precisam passar:

1. **a palavra** — `contem`, com `nao_contem` vetando;
2. **o conteúdo** — `exigir_captacao` limita a mídia marcada como captação;
3. **a janela** — o cooldown.

`"linda doutora ❤️"` não vira oportunidade de implante. `"implante capilar"` é
vetado numa clínica odontológica. `"adorei o resultado"` **não** casa a palavra
`dor` — a comparação é por fronteira de palavra, e não `includes`.

---

## 8. Lead Ads: aquisição, e não conversa

Um Instant Form não tem thread. Ninguém está esperando resposta naquele canal, e
não existe endereço para responder. Por isso `lead_ads` **não** está em
`CANAIS_DE_CONVERSA`: modelá-lo como canal criaria uma conversa na Inbox que
nunca recebe nem manda mensagem.

```
webhook leadgen
  ↓  persiste leadgen_id           ← ANTES de chamar a Graph
  ↓  busca o lead na Graph
  ↓  normaliza field_data POR NOME  ← nunca por posição
  ↓  crc_leads + hierarquia de anúncio
  ↓  crc_attribution_events (elo ACAO, confiança CONFIRMADO)
  ↓  crc_opportunities
  ↓  emite lead.created → speed-to-lead
```

### A ordem protege o lead

Se a Graph estiver fora, o token vencido, ou a cota estourada, o lead **precisa
continuar existindo** — com o id, para a reconciliação buscá-lo depois. Chamar a
Graph primeiro e gravar depois perderia o lead junto com a falha, e ele nunca
seria recuperado: o webhook não volta.

Na prática isso significa um lead que nasce com nome
`"Lead do Instagram (aguardando dados)"` e ganha o nome de verdade quando a
Graph responder. É feio na tela por alguns minutos, e é a diferença entre um
lead atrasado e um lead perdido.

### O webhook não é fonte única

```
webhook              = caminho rápido
job de reconciliação = caminho de GARANTIA
```

O webhook falha em silêncio de três formas: assinatura recusada por token
rotacionado, app temporariamente desassinado da Página, e o nosso próprio 500
durante um deploy. Nos três, a Meta considera entregue (ou desiste) e nunca
reenvia.

A reconciliação é idempotente por `crc_leads.meta_lead_id`, então rodar duas
vezes não cria nada. **`importados > 0` é alarme, e não vitória**: significa que
o webhook está falhando.

**Ela roda uma vez ao dia, dentro da volta pesada** — `reconciliarLeadsDaMeta`
em `automacao/volta-pesada.ts`, percorrendo clínica por clínica (a conta da Meta
é por unidade). O botão **Reconciliar leads** na tela continua existindo para
quem está investigando agora e não quer esperar até amanhã.

Isto já foi registrado como "bloqueado pelo plano da Vercel", que dá dois cron
jobs diários — e os dois têm dono. Era erro de escopo: a volta pesada **já**
roda diariamente e **já** percorre as organizações. A reconciliação custa zero
slot de cron.

E ela fica **fora** do laço de clínica de `umaOrganizacao`, de propósito: aquele
laço pula quando o Dental Office não está configurado, e a Meta não tem nada a
ver com o Dental Office. Preso ali, o lead da clínica sem prontuário integrado
nunca seria recuperado.

### Instant Forms mudam

`normalizarCampos` mapeia por `name`, nunca por posição. Alguém sobe a pergunta
"melhor horário para ligar?" para o segundo lugar e, com leitura posicional,
todo lead novo entra com "manhã" no campo de telefone. Ninguém descobre no dia —
descobre-se quando a recepção liga para "manhã".

Campo desconhecido vai para `crc_leads.campos` com a **pergunta original** como
chave. O importador nunca quebra, e nada do que a clínica pagou para coletar é
jogado fora.

---

## 9. A mesma fila, e não uma segunda

`crc_webhook_inbox` já tinha `provedor`, `external_id` único, `tentativas`,
`disponivel_em`, `travado_ate`, tenant e dead letter. O `provedor` passou a
aceitar `meta`, e `repescarWebhooks` — que já roda no pulso — passou a saber
aplicar os dois formatos de envelope.

A discriminação é pela **forma do payload** (`eventos` vs `mensagens`), e não
pelo nome do provedor: decidir pelo nome funcionaria hoje e quebraria no dia em
que alguém gravasse `meta_cloud` num envelope de Instagram — e o efeito seria um
envelope descartado como "sem conteúdo aplicável", que é o pior desfecho
possível: silencioso e terminal.

Uma segunda fila precisaria de um segundo repescador, um segundo teto de
tentativas, uma segunda dead letter e um segundo lugar na tela de saúde. Quatro
coisas que envelhecem em paralelo, e a que envelhece primeiro é a que ninguém
olha.

---

## 10. Idempotência

| Evento          | Chave                     | Onde                                |
| --------------- | ------------------------- | ----------------------------------- |
| mensagem        | `provider_message_id`     | `crc_messages`, índice único        |
| entrega/leitura | `mid:STATUS`              | idem — o status entra na chave      |
| comentário      | `external_event_id`       | `crc_social_events`, índice único   |
| private reply   | `regra:ator:mídia:janela` | `crc_private_replies`, índice único |
| lead            | `meta_lead_id`            | `crc_leads`, índice único parcial   |
| envelope        | `tipo:id:total`           | `crc_webhook_inbox`, índice único   |

**A chave do envelope não é a garantia — ela é a economia.** A Meta pode
reagrupar os eventos entre duas entregas do mesmo conteúdo, e aí a chave do
envelope difere enquanto os eventos são os mesmos. A garantia está por evento.

Nenhuma dedupe é feita em memória. O §34 é explícito, e o banco é quem decide.

---

## 11. A falha incerta

Três classes, herdadas de `integracoes/whatsapp/porta.ts`:

```
permanente    não insista.        Número inválido, permissão faltando, (#190).
transitoria   o pedido NÃO saiu.  Repetir é seguro e necessário.
incerta       o pedido SAIU e a resposta não voltou. Repetir DUPLICA.
```

`incerta` é o estado que manda mensagem repetida para paciente. No private
reply, ele deixa a reserva como `INCERTO` e **não** a libera: entre "a pessoa
talvez não receba" e "a pessoa recebe duas vezes", o segundo é pior — é visível,
parece descuido, e não há como desfazer.

A classificação por **faixa de HTTP** está errada para a Graph API, porque a
Meta devolve 400 para coisas que se resolvem sozinhas:

| Código             | Classe                 | Por quê                                                                                                |
| ------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------ |
| (#4), (#17), (#32) | transitória            | é cota, não defeito. Tratar como permanente desligaria a integração num pico — e ela ficaria desligada |
| (#190), (#102)     | permanente + reconexão | martelar um token morto cinco vezes por mensagem, para sempre                                          |
| (#10)              | permanente             | falta App Review — e a ação é pedir a permissão                                                        |
| (#368)             | permanente             | bloqueio por política: cada tentativa piora                                                            |
| (#10900)           | permanente             | já existe private reply para este comentário                                                           |

---

## 12. Autonomia por canal

```
autonomia_efetiva = min(teto_global, domínio, canal)
```

`crc_autonomia` ganhou a coluna `canal`, com `''` significando "todos". O canal
**só abaixa** — nunca sobe acima do teto. Se pudesse subir, o Centro de
Autonomia teria um segundo caminho para ligar envio automático, e o kill switch
de madrugada deixaria de ser confiável.

O nível do domínio e o do canal viajam **separados** até `podeAgir()`, para a
frase de recusa dizer qual dos dois apertou. Com só o efetivo, uma clínica com
domínio em 4 e canal em 2 leria "este domínio está no nível 2" — e alguém
aumentaria o domínio, sem efeito.

Private reply é classificado como **risco MÉDIO** (contato não solicitado), o
que exige nível 4. A pessoa comentou em público — o que é convite, e é por isso
que a Meta permite — mas ela não pediu direct.

---

## 13. O backfill não acorda a automação

`receberMensagemDoCanal` faz três coisas além de gravar: incrementa
`nao_lidas`, reabre conversa resolvida, e emite `message.received` — que é o
gatilho da IA e do motor.

Importar seis meses de histórico por esse caminho produziria centenas de eventos
com data antiga, e o motor responderia a **todos**. Trezentas pessoas receberiam
"vi sua mensagem" sobre uma conversa que elas esqueceram.

`crc_messages.historico_importado` é o que impede. A mensagem entra no histórico
e na linha do tempo; o que ela não faz é disparar nada.

O eco (`is_echo` — a mensagem que a recepção mandou pelo app do celular) segue a
mesma regra, e entra como `SAIDA` de `atendente`: marcar como `ia` faria a
auditoria atribuir à máquina o que uma pessoa escreveu.

---

## 14. Os dois relógios

| Coluna                          | O que é                                           |
| ------------------------------- | ------------------------------------------------- |
| `crc_messages.criado_em`        | quando a **mensagem** aconteceu (carimbo da Meta) |
| `crc_messages.recebido_em`      | quando a **linha nasceu aqui**                    |
| `crc_social_events.ocorrido_em` | quando a pessoa comentou                          |
| `crc_social_events.recebido_em` | quando o webhook chegou                           |
| `crc_leads.externo_criado_em`   | quando a pessoa enviou o formulário               |
| `crc_leads.criado_em`           | quando a linha nasceu aqui                        |

A janela de 7 dias do private reply mede `ocorrido_em`. Medir por `recebido_em`
faria um webhook atrasado parecer fresco, e a Meta recusaria o envio com um erro
que ninguém saberia explicar.

O speed-to-lead mede `externo_criado_em`. Medir por `criado_em` mostraria
"respondido em 12 segundos" para um lead que a reconciliação importou 14 horas
depois.

O carimbo da Meta vem em **segundos** em alguns campos e em **milissegundos** em
outros. `instanteDaMeta` separa os dois pelo tamanho: confundi-los erra por um
fator de 1000, e o efeito é uma mensagem de 1970 no topo da Inbox para sempre.

---

## 15. Multi-tenant

O tenant é resolvido por identificador externo confiável:

```
page_id                → Messenger e Lead Ads
instagram_account_id   → direct e comentários
```

`crc_canais_meta` tem as duas colunas e **dois índices únicos parciais**: duas
linhas com o mesmo `page_id` significaria um webhook com dois donos possíveis.

**Não existe "primeira clínica ativa" no caminho da Meta.** `resolverEscopo` em
`aplicacao/webhooks.ts` tem esse degrau de transição — ele existe porque a JP já
tinha WhatsApp funcionando antes de a tabela de canais existir. A Meta não tem
instalação para não quebrar, então o degrau seria uma bomba-relógio com um
comentário pedindo desculpas.

Um envelope com contas de **dois tenants diferentes** é recusado inteiro. A Meta
agrupa, e processar tudo com o tenant da primeira conta é dado de paciente
atravessando a fronteira de uma organização.

---

## 16. Segurança e LGPD

- **O token entra e nunca sai.** É cifrado com AES-256-GCM
  (`servidor/segredo.ts`) e o que volta para a tela é a `dica`: começo e fim,
  nunca o meio. `CanalMeta` (com token) e `CanalMetaParaTela` (sem) são tipos
  diferentes — passar um pelo outro não compila.
- **O token vai no cabeçalho**, nunca em `?access_token=`. Querystring aparece
  em log de proxy, de CDN, e no `Referer` de qualquer redirecionamento. Um Page
  Access Token de System User **não expira**.
- **Nada de token em log.** `registrarIntegracao` recebe `caminhoParaLog`, que
  mascara querystring.
- **O payload da fila é zerado em estado terminal.** `PROCESSADO`, `DESCARTADO`
  e `FALHOU` no teto apagam o conteúdo e mantêm o `external_id` — que é o que
  impede o provedor de reentregar o mesmo webhook como novo.
- **O texto do comentário é truncado na entrada** (2000 caracteres).
- **A mídia não é baixada.** As URLs da Meta são assinadas e temporárias, e
  `AnexoDoEvento` guarda a URL como o que ela é. Guardá-la como permanente
  produz um anexo que abre hoje e dá 403 na semana que vem.
- **Opt-out vale.** `receberMensagemDoCanal` avalia `pedeDescadastro` no mesmo
  caminho do WhatsApp, e o private reply passa pelo teto de autonomia que
  responde ao kill switch de envios.

---

## 17. O sandbox

`META_SANDBOX=1` (e nunca em produção — a trava é `NODE_ENV`) substitui os
adapters por um fake em memória que:

- registra os envios, para o teste conferir que a resposta saiu;
- simula 429, 500, timeout e token expirado — com a **mesma classificação** da
  Meta real, inclusive `incerta` no timeout;
- devolve perfis definidos pelo teste.

Um sandbox que devolvesse `transitoria` no timeout faria o teste provar o
comportamento **errado**: a chave de dedupe seria liberada e a segunda tentativa
mandaria a segunda mensagem.

### A trava pergunta ao runtime, e antes ela não perguntava a ninguém

`sandboxLigado()` chama `ehProducao()`, de `servidor/ambiente.ts`. A indireção
existe por uma razão medida no artefato: `process.env["NODE_ENV"]` é substituído
por um LITERAL no bundle do servidor — e **não é o `--mode` que decide**. A
função inteira era compilada para `return false`, e `META_SANDBOX` desaparecia:

```
grep -c META_SANDBOX .output/server/_ssr/ssr.mjs   →  0
```

A variável não era ignorada; não era nem lida. O efeito era um E2E incapaz de
provar qualquer envio — e o sintoma ficava a três camadas da causa: _"a conta da
Meta está cadastrada para receber, mas não tem token de envio"_.

Duas formas de ler a variável não bastaram, e a terceira parece rebuscada sem
esse contexto:

```
process.env["NODE_ENV"]                →  "production"
const v = process.env; v["NODE_ENV"]   →  "production"   (propagou pela variável)
globalThis.process?.env?.["NODE_ENV"]  →  sobreviveu
```

Hoje o E2E constrói o bundle de **produção** (é isso que `playwright.config.ts`
exige) e liga o sandbox pelo `NODE_ENV` do processo. A análise da troca de
garantia está no cabeçalho de `servidor/ambiente.ts`, e um invariante em
`testes/invariantes-arquiteturais.test.ts` reprova quem voltar a usar o
identificador `process` ali — ou `process.env.NODE_ENV` numa trava de sandbox.

---

## 18. Permissões e formatos conferidos

Conferidos em **15/09/2026** na documentação oficial. O catálogo executável está
em `EXIGENCIAS`, em `src/lib/crc/integracoes/meta/config.ts` — ele é **dado**,
lido pela tela de Integrações, pelo runbook e por este documento.

| Produto                     | Permissões                                                                                                                      | Campos de webhook                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Instagram Direct            | `instagram_business_basic`, `instagram_business_manage_messages`, `pages_messaging`, `pages_show_list`                          | `messages`, `messaging_postbacks`, `messaging_seen`, `messaging_referral` |
| Messenger                   | `pages_messaging`, `pages_manage_metadata`, `pages_read_engagement`, `pages_show_list`                                          | `messages`, `messaging_postbacks`, `message_deliveries`, `message_reads`  |
| Comentários / private reply | `instagram_business_basic`, `instagram_business_manage_comments`, `instagram_business_manage_messages`, `pages_manage_metadata` | `comments`, `mentions`                                                    |
| Lead Ads                    | `leads_retrieval`, `pages_manage_ads`, `pages_show_list`, `pages_read_engagement`                                               | `leadgen`                                                                 |

**Versão da Graph API:** `v26.0`, publicada em 29/07/2026. `META_GRAPH_VERSION`
sobrescreve; um valor que não tenha a forma `vNN.N` é ignorado com aviso na tela.

Fontes:

- Versões: <https://developers.facebook.com/docs/graph-api/changelog/versions/>
- Login do Instagram: <https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login>
- Messenger: <https://developers.facebook.com/documentation/business-messaging/messenger-platform/overview>
- Private replies: <https://developers.facebook.com/docs/instagram-platform/private-replies/>
- Human Agent: <https://developers.facebook.com/docs/features-reference/human-agent>
- Webhooks de leadgen: <https://developers.facebook.com/docs/graph-api/webhooks/getting-started/webhooks-for-leadgen/>
- Erros da Graph: <https://developers.facebook.com/docs/graph-api/guides/error-handling/>

> **Os nomes das permissões mudam.** A Meta renomeou os escopos do Instagram
> Login em 2024/2025 — `business_manage_messages` virou
> `instagram_business_manage_messages`, e os antigos foram descontinuados em
> 27/01/2025. Um sistema com o nome antigo pede uma permissão que não existe, e
> o App Review é recusado sem explicação útil. **Confira antes de submeter.**

---

## 19. Divergências deste prompt

Onde a implementação difere do mega prompt, e por quê.

### `opportunity.type` não é o tratamento (§20)

O §20 sugere `opportunity.type = implante`. `TipoOportunidade` em
`dominio/tipos.ts` é uma união **fechada** de nove valores, e ela governa muito
mais que um rótulo: `calcularPrioridadeDe` pesa por tipo, o funil agrupa por
tipo, e `ROTULO_TIPO_OPORTUNIDADE` traduz cada um.

Acrescentar um tipo por tratamento faria a união crescer com o catálogo
comercial da clínica, e cada tratamento novo exigiria mexer na priorização.

O tipo é `NEW_LEAD`; o interesse vive em `crc_opportunities.motivo` e em
`crc_leads.campos.interesse`, que é onde ele pertence — é informação sobre o
**lead**, não uma categoria de oportunidade.

### O canal na tela é ícone + texto, e não emoji colorido (§22)

O §22 sugere `🟢 WhatsApp 🟣 Instagram 🔵 Messenger` e, na linha seguinte,
proíbe depender de cor. A segunda frase venceu:

- `crc.css` declara **cinco** semânticas e diz "nenhuma a mais"; roxo e azul de
  canal seriam a sexta e a sétima, e `--crc-info` (azul) já significa
  "informativo";
- emoji é lido por leitor de tela como "círculo roxo grande", o que não informa
  nada, e renderiza diferente em cada sistema.

Ficou: ícone da plataforma + nome escrito + `aria-label` com a frase inteira.
No celular, dentro da lista, o texto do selo vira texto só para leitor — o
`aria-label` permanece completo.

### A tabela de canais chama-se `crc_canais_meta` (§9.1)

O §9.1 sugere `crc_external_channels`. O repositório já tem
`crc_canais_whatsapp`, e o nome segue a convenção dele. As colunas mínimas do
§9.1 estão todas lá, com duas chaves de roteamento em vez de uma — porque uma
conta da Meta tem `page_id` **e** `instagram_account_id`, e as duas apontam para
a mesma credencial.

### "Conteúdo de captação" depende da regra listar a mídia (§43)

O §43 exige que só conteúdo marcado como captação dispare regra, e a marca é
decisão de quem publicou — não inferência nossa. Não existe tela de marcar
mídia: o caminho é a regra listar os ids das mídias da campanha, e o formulário
de regra tem o campo para isso.

`exigirCaptacao: true` com `midias` vazio **não casa nada** — e isso é o
correto, não um defeito: uma regra que exige captação sem dizer qual conteúdo é
captação não tem como agir. O motivo aparece no evento social.

### A rota sem canal não existe (§11)

O WhatsApp tem `/api/crc/whatsapp` e `/api/crc/whatsapp/:canal` porque a
primeira já estava em produção. A Meta só tem a versão por canal: uma rota de
transição sem instalação para não quebrar é só uma porta a mais para manter — e
é exatamente a porta que não sabe qual `appSecret` usar quando aparece o segundo
app.

---

## 20. Estados honestos (§74)

Nada nesta entrega diz "conectado" porque existe variável de ambiente.

| Estado            | O que significa                                         | Onde                |
| ----------------- | ------------------------------------------------------- | ------------------- |
| `NAO_CONFIGURADO` | nenhuma conta cadastrada                                | tela de Integrações |
| `ATENCAO`         | cadastrada, e algo está velho, vencendo ou nunca chegou | idem                |
| `ERRO`            | a última tentativa falhou, ou o token venceu            | idem                |
| `CONECTADO`       | há **fato datado recente**                              | idem                |

Uma conta recém-conectada aparece como `ATENCAO`, com a frase "cadastrada e
nenhum webhook chegou ainda". Não é pessimismo: a causa mais comum de silêncio é
a subscrição do webhook ter ficado sem o campo certo — o que não dá erro nenhum.

O estado do projeto por produto está em
[`META-FINAL-ACCEPTANCE.md`](META-FINAL-ACCEPTANCE.md).
