# Meta — runbook operacional

> O que fazer quando quebra. Cada incidente diz: **sintoma**, **como
> confirmar**, **onde olhar**, **como recuperar**, e **como não perder lead**.
>
> A última pergunta é a que importa: quase todo incidente aqui tem o mesmo
> risco — alguém escreveu para a clínica e ninguém respondeu.

---

## Antes de qualquer coisa: a tela que responde

`CRC → Integrações → Meta`

Ela não diz "conectado" porque existe credencial. Tudo sai de fato datado:

| Sinal                                     | O que ele responde                                 |
| ----------------------------------------- | -------------------------------------------------- |
| Último webhook                            | a Meta está falando com a gente?                   |
| Última mensagem recebida                  | o direct/Messenger está chegando?                  |
| Último lead de anúncio                    | o Lead Ads está chegando?                          |
| Validade do token                         | quanto tempo até parar sozinho                     |
| Webhooks na fila                          | quantos pendentes e quantos com falha              |
| Dead letter                               | quantos esgotaram as tentativas                    |
| Falhas de chamada nas últimas 24h         | a Graph está recusando?                            |
| Eventos sociais sem regra nas últimas 24h | as regras estão casando?                           |
| Variáveis do aplicativo                   | o servidor tem `META_APP_SECRET` e as outras duas? |

**Comece sempre por aqui.** Os três primeiros separam "a Meta parou" de "um
produto parou" — e a reação é diferente.

**E se o último estiver em alerta, pare aí.** Sem `META_APP_SECRET` nenhum
webhook é aceito, e todos os outros sinais ficam verdes mentindo. Ver
[Nada entra, e o cartão aponta uma variável de ambiente](#nada-entra-e-o-cartão-aponta-uma-variável-de-ambiente).

---

## Nada entra, e o cartão aponta uma variável de ambiente

**Sintoma.** Nenhum direct, nenhum lead, nenhum comentário. O cartão da Meta
está **ERRO** com a frase "o aplicativo da Meta está sem `META_APP_SECRET` no
servidor".

**Por que isto merece seção própria.** Sem o segredo, a assinatura não pode ser
conferida e o webhook é recusado com **503** — a Meta reentrega, o CRC recusa de
novo, e nada disso vira erro de token, de fila ou de chamada. Os outros sinais
ficam todos verdes enquanto nenhuma mensagem entra.

**Como confirmar.** O sinal **Variáveis do aplicativo** no cartão lista, pelo
nome, o que falta. No log da aplicação:

```
"Webhook da Meta com assinatura inválida foi recusado", motivo: "sem_segredo"
```

**Como recuperar.** Defina a variável no ambiente do servidor e reimplante. Não
é reconexão: nenhum clique na tela resolve, porque o valor não mora no banco.

| Variável                    | Para que serve                               |
| --------------------------- | -------------------------------------------- |
| `META_APP_SECRET`           | confere a assinatura de TODO webhook         |
| `META_WEBHOOK_VERIFY_TOKEN` | o handshake de verificação (`hub.challenge`) |
| `META_APP_ID`               | identificação do app; não participa do HMAC  |

**`META_APP_ID` ausente NÃO recusa mais webhook.** Ele já fez isso: enquanto o
segredo era lido por um caminho tudo-ou-nada, faltar o app id recusava tudo com
`motivo: "sem_segredo"` — e o sintoma mandava conferir o segredo, que estava
certo. Hoje o segredo é lido sozinho, e o app id ausente aparece no sinal com o
próprio nome.

**Como não perder lead.** O mesmo de _O webhook parou_: **Reconciliar leads**
recupera Lead Ads, **Sincronizar conversas** recupera direct e Messenger.
Comentário perdido não volta.

---

## O webhook parou

**Sintoma.** Ninguém recebe direct. A Inbox não tem conversa nova. Nenhum erro
em lugar nenhum.

**Como confirmar.**

1. `Integrações → Meta`: **Último webhook** com horas ou dias.
2. Mande um direct de um celular pessoal. Se não aparecer em um minuto, é isto.

**Onde olhar.**

```sql
select provedor, status, count(*), max(criado_em)
  from crc_webhook_inbox
 where provedor = 'meta'
 group by 1, 2;
```

- Nenhuma linha recente → **a Meta não está chamando**. Siga para _Causas_.
- Linhas `PENDENTE` acumulando → chegou e não foi aplicado; veja
  [A fila não anda](#a-fila-não-anda).
- Linhas `FALHOU` → veja `ultimo_erro`.

**Causas, na ordem de probabilidade.**

1. **A subscrição perdeu o campo.** É a causa mais comum, e não dá erro nenhum.

   ```
   GET /<page_id>/subscribed_apps
   ```

   Confira contra a tabela de campos na tela de Integrações. Reassine:

   ```
   POST /<page_id>/subscribed_apps?subscribed_fields=messages,messaging_postbacks,message_deliveries,message_reads,leadgen
   ```

2. **O app foi removido da Página.** _Configurações da Página → Apps de
   negócios_. Se o app não estiver lá, reinstale — e a subscrição precisa ser
   refeita.

3. **A Callback URL mudou.** Deploy em domínio novo, ou `CRC_URL_PUBLICA`
   errada. A URL é por canal: `/api/crc/meta/<id do canal>`.

4. **A assinatura está sendo recusada.** Aí a Meta chama e o CRC devolve 401 —
   e depois de algumas falhas ela **desassina o webhook sozinha**.
   ```sql
   -- não há linha no inbox, porque a recusa acontece antes de gravar.
   -- o rastro está no log da aplicação:
   --   "Webhook da Meta com assinatura inválida foi recusado"
   ```
   Confira o **App Secret** no cartão da conta (a `dica` mostra começo e fim) e
   em _Configurações → Básico_ do app. Se o app secret foi **rotacionado**, ele
   precisa ser atualizado no CRC.

**Como recuperar.** Depois de corrigir, os eventos que a Meta **já** entregou e
que falharam são repescados pelo pulso automaticamente. Os que ela nunca
entregou **não voltam**.

**Como não perder lead.**

- Lead Ads: clique **Reconciliar leads**. Ela busca na Graph o que o webhook não
  trouxe, e é idempotente.
- Direct/Messenger: clique **Sincronizar conversas**. Ela importa o histórico
  com `historico_importado = true`, então **não** dispara automação sobre
  conversa antiga.
- Não há como recuperar comentário perdido pela API. O que houve fica no post.

---

## O token expirou

**Sintoma.** A Inbox recebe e não consegue responder. A tela mostra **ERRO** com
"O token de uma das contas venceu".

**Como confirmar.**

```sql
select display_name, token_expira_em, ultimo_erro, ultimo_erro_em
  from crc_canais_meta
 where organization_id = '<org>' and ativo;
```

E em `crc_integration_logs`, erros com `#190`.

**Onde olhar.** O cartão mostra **Validade do token**. `"a Meta não informou"`
é o caso do token de System User — que não vence.

**Como recuperar.**

1. Gere um Page Access Token novo (Graph API Explorer → `GET /me/accounts`).
2. `Integrações → Meta → Editar` → cole em **Page Access Token** → **Salvar**.
   Os outros campos podem ficar como estão; **token vazio significa "não mexi"**.
3. **Testar** → deve dizer "Conectado a …".

**Como não perder lead.** Enquanto o token estava morto, o **recebimento**
continuou: o webhook não usa o Page Access Token, só o app secret. As mensagens
estão na Inbox esperando resposta. O que não aconteceu foi o envio.

**Como evitar.** Use **System User**: _Business Manager → Usuários do sistema →
criar → dar acesso à Página → gerar token_. Ele não vence, e é a diferença entre
a integração parar sozinha em dois meses e não parar.

---

## Lead Ads não chega

**Sintoma.** O Gerenciador de Anúncios mostra leads; o funil do CRC não.

**Como confirmar.**

```sql
select count(*), max(criado_em)
  from crc_leads
 where organization_id = '<org>' and meta_lead_id is not null;
```

**Onde olhar, na ordem.**

1. **O canal tem o produto e a Página?** Lead Ads é da **Página**, não do
   Instagram. Sem `page_id`, não há como rotear.
2. **`leadgen` está assinado?** `GET /<page_id>/subscribed_apps`.
3. **`leads_retrieval` foi aprovada?** Sem ela, o webhook chega e a busca dos
   detalhes falha com `(#10)`. O lead **entra de qualquer forma**, com nome
   `"Lead do Instagram (aguardando dados)"` — foi desenhado assim para o lead
   não ser perdido.
4. **O formulário é de um anúncio do Business correto?** Formulário criado em
   outro Business Manager não notifica este app.

**Como recuperar.** **Reconciliar leads** no cartão. Ela lê os formulários da
Página e importa o que falta, com cursor — várias voltas cobrem uma conta
antiga.

> **`importados > 0` numa reconciliação é ALARME, não vitória.** Significa que o
> webhook está falhando. O número deveria ser zero.

**Como não perder lead.** A reconciliação é o caminho de garantia. Rode-a depois
de qualquer incidente de webhook, e considere agendá-la — mas veja a nota sobre
cron no fim deste documento.

---

## Instagram não recebe (e o Messenger sim)

**Sintoma.** Messenger chega, direct não.

**Como confirmar.** `Integrações → Meta`: **Última mensagem recebida** recente,
e as conversas da Inbox todas com selo Messenger.

**Onde olhar.**

1. **A subscrição do objeto `instagram` existe?** São **dois** objetos
   diferentes no painel de Webhooks: `page` e `instagram`. Assinar só `page`
   traz Messenger e Lead Ads, e não traz direct.
2. **`instagram_account_id` está cadastrado no canal?** Sem ele,
   `resolverTenantDaMeta` não acha a conta e o evento vai para `FALHOU` com
   "Nenhuma conta da Meta cadastrada".
   ```sql
   select display_name, page_id, instagram_account_id, produtos
     from crc_canais_meta where ativo;
   ```
3. **O Instagram é profissional e está vinculado à Página?**
   ```
   GET /<page_id>?fields=instagram_business_account
   ```
   Conta pessoal não tem API de mensagens.
4. **"Permitir acesso a mensagens" está ligado no Instagram?**
   _Instagram → Configurações → Privacidade → Mensagens → Permitir acesso a
   mensagens_. Desligado, a Meta não entrega nada — e não avisa.

**Como não perder lead.** **Sincronizar conversas** importa o que houve, sem
acordar automação.

---

## Messenger não envia

**Sintoma.** A resposta fica `FAILED` ou `DESCONHECIDO` na Inbox.

**Como confirmar.**

```sql
select status_entrega, erro, count(*)
  from crc_messages m
  join crc_conversations c on c.id = m.conversation_id
 where c.canal = 'messenger' and m.direcao = 'SAIDA'
 group by 1, 2;
```

**O que o erro diz.**

| Erro                       | Significa                                  | Ação                                   |
| -------------------------- | ------------------------------------------ | -------------------------------------- |
| `#190`                     | token morto                                | [O token expirou](#o-token-expirou)    |
| `#10`                      | falta permissão                            | App Review de `pages_messaging`        |
| `#200`                     | o app não tem acesso àquela Página         | reinstale o app na Página              |
| `#551`                     | a pessoa bloqueou, ou a janela fechou      | **não insista**                        |
| `#368`                     | conta bloqueada por política               | **não insista** — cada tentativa piora |
| `FORA_DA_JANELA`           | passou de 24h e não há como reabrir        | só a pessoa escrevendo de novo         |
| `META_EXIGE_HUMANO`        | passou de 24h e quem tentou foi a IA       | uma pessoa precisa assumir             |
| `HUMAN_AGENT_NAO_APROVADO` | passou de 24h e a feature não foi aprovada | App Review da feature Human Agent      |
| `SEM_MESSAGE_ID`           | 200 sem `message_id` — envio **incerto**   | **não reenvie**; confira no aplicativo |

> **`DESCONHECIDO` não é `FAILED`.** Ele significa "o pedido saiu e a resposta
> não voltou": a Meta **pode** ter entregue. Reenviar manda a mensagem duas
> vezes. Abra a conversa no aplicativo e confira antes.

---

## 429 / cota estourada

**Sintoma.** Erros `#4`, `#17` ou `#32`. A integração "pisca": funciona e para.

**Como confirmar.**

```sql
select integracao, count(*)
  from crc_integration_logs
 where organization_id = '<org>'
   and sucesso = false
   and criado_em > now() - interval '1 hour'
 group by 1;
```

**Onde olhar.** A cota da Meta é **por hora** e por conta. Os limites que
importam:

| Chamada                              | Limite    |
| ------------------------------------ | --------- |
| Graph API por usuário                | ~200/hora |
| Private reply por conta do Instagram | 750/hora  |

**Como recuperar.** **Espere.** A classificação já é `transitoria` com espera de
60 segundos (ou o `Retry-After` quando a Meta o manda), e a fila repesca. **Não
aumente a frequência**: reintentar em dois segundos não restaura cota — consome
mais uma chamada do balde que acabou de estourar, e a Meta conta a recusa como
uso.

**Como evitar.**

- Não rode a reconciliação com frequência alta. Os tetos de página e de
  formulário por volta existem para isso.
- Se o **direct** estourar cota, o suspeito é a busca de perfil (`@usuario`):
  ela acontece uma vez por conversa nova. Ela já está fora do caminho crítico —
  se falhar, a tela mostra "Direct do Instagram" e a mensagem entra do mesmo
  jeito.

---

## 403 / permissão

**Sintoma.** `#10` ou `#200` em toda chamada de um produto.

**Como confirmar.** A tela de Integrações lista as permissões que cada produto
exige, com a fonte oficial. Compare com _App Review → Permissões e features_ no
painel da Meta.

**Onde olhar.** `crc_canais_meta.permissoes` guarda o que foi **declarado** ao
conectar, com a data. Ele não é prova — a prova é o painel da Meta.

**Como recuperar.** App Review. Não há atalho, e não há código que resolva.

> **Confira o NOME da permissão.** A Meta renomeou os escopos do Instagram
> Login em 2024/2025. Pedir `instagram_manage_messages` (o nome antigo,
> descontinuado em 27/01/2025) é pedir algo que não existe, e a recusa vem sem
> explicação útil.

---

## A fila não anda

**Sintoma.** `crc_webhook_inbox` com `PENDENTE` acumulando.

**Como confirmar.**

```sql
select status, count(*), min(criado_em), max(disponivel_em)
  from crc_webhook_inbox
 where provedor = 'meta'
 group by 1;
```

**Onde olhar.**

1. **O pulso está rodando?** `Saúde → Heartbeat`. Sem pulso, nada é repescado.
2. **Há linhas presas?** `PROCESSANDO` com `travado_ate` no passado.
   `crc_liberar_webhooks_presos` roda no começo de cada repescagem, mas se o
   pulso não roda, ela também não.
3. **Kill switch ligado?** `Pausar todas as automações` para o pulso.

**Como recuperar.** Toque o pulso: `POST /api/crc/pulso`. Ou espere o cron.

---

## A dead letter está crescendo

**Sintoma.** A tela mostra "N eventos que esgotaram as tentativas".

**Como confirmar.**

```sql
select payload->>'provedor' as provedor,
       payload->>'externalId' as chave,
       erro, count(*)
  from crc_dead_letters
 where origem = 'webhook' and status = 'PENDENTE'
 group by 1, 2, 3
 order by 4 desc;
```

**Onde olhar.** A dead letter guarda **só metadado** — provedor, id externo,
tentativas, tenant. O conteúdo está (ou estava) em `crc_webhook_inbox`, pela
`referencia`.

**Os erros que aparecem, e o que significam.**

| `erro` contém                      | Significa                                   | Ação                                                       |
| ---------------------------------- | ------------------------------------------- | ---------------------------------------------------------- |
| "Nenhuma conta da Meta cadastrada" | conta nova, ou id errado no canal           | cadastre a conta e **repesque à mão**                      |
| "contas de tenants diferentes"     | um app atendendo duas clínicas na mesma URL | aponte o webhook de cada app para a rota **do canal dele** |
| "#190"                             | token morto na hora em que o evento chegou  | renove e repesque                                          |

**Como recuperar à mão**, depois de corrigir a causa:

```sql
update crc_webhook_inbox
   set status = 'PENDENTE', tentativas = 0, disponivel_em = now()
 where id in (
   select referencia::uuid from crc_dead_letters
    where origem = 'webhook' and status = 'PENDENTE'
 );
```

> **O payload de linha terminal foi ZERADO** (política de retenção: PII não fica
> numa tabela de fila). Se o payload está `{}`, repescar não recupera o
> conteúdo — recupera só o registro. Nesse caso, use **Sincronizar conversas**
> ou **Reconciliar leads**.

---

## Evento duplicando

**Sintoma.** A mesma mensagem duas vezes na Inbox, ou dois leads do mesmo
formulário.

**Isto não deveria acontecer.** A dedupe é do banco:

| Evento        | Índice                                                             |
| ------------- | ------------------------------------------------------------------ |
| mensagem      | `crc_messages (organization_id, provider_message_id)`              |
| comentário    | `crc_social_events (organization_id, provider, external_event_id)` |
| lead          | `crc_leads (organization_id, meta_lead_id)`                        |
| private reply | `crc_private_replies (organization_id, chave_reserva)`             |

**Como confirmar que o índice existe:**

```sql
select indexname from pg_indexes
 where tablename in ('crc_messages','crc_social_events','crc_leads','crc_private_replies')
   and indexdef ilike '%unique%';
```

**Se o índice não existe**, a migração não foi aplicada:
`npm run schema:status`, depois `npm run schema:aplicar`.

**Se o índice existe e ainda duplica**, o id do provedor está vindo diferente
nas duas entregas. Compare:

```sql
select provider_message_id, conteudo, criado_em
  from crc_messages
 where conversation_id = '<conversa>'
 order by criado_em;
```

Dois `provider_message_id` diferentes com o mesmo texto é **a pessoa mandando
duas vezes**, e não duplicação nossa.

---

## Private reply duplicado

**Sintoma.** A mesma pessoa recebeu dois directs da mesma regra.

**Como confirmar.**

```sql
select chave_reserva, status, criado_em, enviado_em, erro
  from crc_private_replies
 where organization_id = '<org>' and external_actor_id = '<igsid>'
 order by criado_em desc;
```

**O que procurar.**

- **Duas linhas com chaves diferentes** → o cooldown virou de balde entre os
  dois comentários. Com `cooldown_horas = 168`, isso é uma segunda mensagem em
  até 7 dias, não em exatamente 7 — é a borda conhecida do balde absoluto, e o
  preço de não ter corrida.
- **`cooldown_horas = 0`** → a configuração manda um direct por comentário. A
  tela avisa ao salvar; suba para 168.
- **Uma linha `INCERTO` e outra `ENVIADO`** → alguém reenviou à mão depois de um
  timeout. A reserva `INCERTO` existe justamente para isso não ser automático.

**Como recuperar.** Não há como apagar direct enviado. Suba o cooldown e, se a
pessoa reclamar, registre opt-out.

---

## Conta desconectada / trocada / Page ID mudou

**Sintoma.** Tudo parou de uma vez, para uma conta só.

**Como confirmar.**

```
GET /<page_id>?fields=id,name,instagram_business_account
```

- `#803` / "não existe" → **o id mudou ou a Página foi apagada**.
- Nome diferente do cadastrado → **a conta foi trocada**.

**Como recuperar.**

- **Page ID mudou** (raro; acontece em migração de Página):
  `Integrações → Meta → Editar` → corrija o id → **Salvar**.
  As conversas antigas continuam: elas apontam para a **clínica**, não para o
  canal.

- **A conta foi trocada por outra empresa/pessoa**: **Desative** o canal e
  cadastre o novo. Não edite — o histórico de "por qual conta isto entrou"
  importa para a auditoria.

- **O cliente removeu o app**: reinstale e **reassine** a Página
  (`subscribed_apps`). A reinstalação não restaura a subscrição.

**Como não perder lead.** Enquanto o canal está desativado, o webhook devolve
404 e a Meta desiste. **Reconcilie os leads** depois de religar.

---

## Mensagem não vinculou paciente

**Sintoma.** A conversa aparece sem nome, ou com "Direct do Instagram".

**Isto é o caso NORMAL.** Quem chega por direct quase nunca tem ficha — é
prospect. A Inbox mostra um painel com busca de paciente na própria conversa,
justamente para o vínculo acontecer no instante em que quem atende descobre
quem é.

**Quando é problema:**

1. **A conversa está em revisão** ("Este contato está cadastrado para mais de um
   paciente"). Dois pacientes com o mesmo perfil vinculado significa que um dos
   vínculos está errado. Use o painel para escolher, ou desvincule o errado na
   ficha.

2. **Você vinculou e não apareceu.** Confira:

   ```sql
   select tipo, namespace, valor, compartilhada
     from crc_patient_identities
    where organization_id = '<org>' and patient_id = '<paciente>';
   ```

   O namespace tem que ser `instagram` ou `messenger` — **nunca**
   `dental-office`. Um IGSID gravado como `dental-office` é exatamente a colisão
   que o `supabase/45` existe para impedir.

3. **O vínculo está no paciente errado.** `Ficha → Canais conhecidos` → e o
   desvínculo devolve a conversa para revisão, com auditoria.

**O que NUNCA fazer.** Vincular por nome parecido, por username parecido, ou
porque "só tem uma Maria". Uma fusão errada junta prontuários e apaga a
fronteira entre eles — e não há desfazer.

---

## Comentário não vira lead

**Sintoma.** Os comentários aparecem no post e nada acontece no CRC.

**Como confirmar.**

```sql
select processing_status, resultado, count(*)
  from crc_social_events
 where organization_id = '<org>'
   and recebido_em > now() - interval '24 hours'
 group by 1, 2
 order by 3 desc;
```

**O `resultado` diz exatamente por quê:**

| `resultado`                                 | Ação                                           |
| ------------------------------------------- | ---------------------------------------------- |
| "Nenhuma regra social ativa"                | crie ou ative a regra                          |
| "não tem nenhuma palavra cadastrada"        | a regra está ativa e vazia — preencha `contem` |
| "só vale em conteúdo marcado como captação" | **liste o id da mídia** em `midias`            |
| "vale só para mídias específicas"           | a mídia não está na lista                      |
| "foi vetada pela palavra X"                 | o veto funcionou (pode estar certo)            |
| "não encontrou nenhuma das palavras dela"   | a palavra não bate — confira acento e plural   |
| "O comentário foi apagado pela pessoa"      | correto: não respondemos a comentário retirado |

**Se `crc_social_events` está VAZIA**, o webhook de `comments` não está
assinado — veja [O webhook parou](#o-webhook-parou).

> **Eventos sociais sem regra nas últimas 24h** sobe na tela de saúde justamente
> para este caso: comentário sem regra é normal, mas um número alto no dia em
> que a clínica publicou campanha significa que a regra não está casando.

---

## Comandos úteis

```bash
# o schema está aplicado?
npm run schema:status

# os testes da integração
npx vitest run src/lib/crc/aplicacao/meta.test.ts
npx vitest run src/lib/crc/aplicacao/social.test.ts
npx vitest run src/lib/crc/aplicacao/lead-ads.test.ts

# os testes MORDEM? (devolve 5/5)
node scripts/injetar-defeitos-meta.mjs

# nenhum segredo no bundle do navegador
node scripts/conferir-bundle.mjs
```

---

## Uma nota sobre agendamento

| O que                         | Quando roda                                                                                                                             |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Reconciliação de Lead Ads** | **automática, uma vez ao dia**, dentro da volta pesada (`/api/crc/motor`, 9h UTC) — e pelo botão **Reconciliar leads**, a qualquer hora |
| **Backfill de conversas**     | só pela tela: **Sincronizar conversas**                                                                                                 |

A reconciliação entrou na volta pesada como uma varredura
(`reconciliarLeadsDaMeta`), percorrendo clínica por clínica. **Não precisou de
cron novo** — e o registro anterior aqui, de que o plano da Vercel bloqueava,
estava errado: o plano dá dois cron jobs diários e os dois já têm dono, mas a
volta pesada já roda uma vez ao dia e já percorre as organizações.

O backfill continua só pela tela de propósito: ele importa histórico e é caro,
e quem o dispara sabe por quê. Ele grava com `historico_importado = true`, então
não acorda automação sobre conversa antiga.

**O hábito operacional não muda:** depois de qualquer incidente de webhook,
clique **Reconciliar leads** em vez de esperar amanhã. Ela é idempotente, e o
número que ela devolve é o alarme.

E o número da volta diária aparece no relatório do motor como
`leadsDaMetaRecuperados`. **Diferente de zero significa que o webhook está
falhando** — não que a reconciliação está funcionando bem.
