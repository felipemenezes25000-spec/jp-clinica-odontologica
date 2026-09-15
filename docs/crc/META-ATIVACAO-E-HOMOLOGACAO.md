# Meta — ativação e homologação

> Do zero até o primeiro direct entrando na Inbox, e daí até produção.
>
> **Confira os requisitos atuais nas fontes oficiais antes de submeter.** Tudo
> aqui foi verificado em 15/09/2026, e a Meta muda nomes de permissão e
> exigências de App Review sem aviso. Este documento diz o que conferir e onde —
> não substitui a conferência.

---

## Antes de começar: o que é bloqueio externo

O CRC está pronto para receber. O que **não** está nas nossas mãos:

| Item                           | Depende de                             | Prazo típico   |
| ------------------------------ | -------------------------------------- | -------------- |
| Business Verification          | documento da empresa + revisão da Meta | dias a semanas |
| Advanced Access das permissões | App Review com screencast              | 1 a 4 semanas  |
| Feature **Human Agent**        | App Review próprio                     | idem           |
| `leads_retrieval`              | App Review + `pages_manage_ads`        | idem           |

Nada disso pode ser acelerado por código. O que dá para fazer **hoje**, sem App
Review, está na [Fase 1](#fase-1--o-que-funciona-hoje-sem-app-review).

---

## Fase 0 — o inventário

Antes de abrir o painel da Meta, junte:

- [ ] **A Página do Facebook da JP.** O id aparece em _Configurações da Página →
      Sobre_, e também em `https://www.facebook.com/<pagina>/about`.
- [ ] **A conta profissional do Instagram**, vinculada à Página.
      O id NÃO é o `@usuario` — ele aparece no Graph API Explorer com
      `GET /<page_id>?fields=instagram_business_account`.
- [ ] **Quem é o administrador** da Página e do Business Manager. Sem acesso
      administrativo não há o que conectar.
- [ ] **A URL pública do CRC em HTTPS.** A Meta recusa `http` e recusa
      `localhost`. Ela vai em `CRC_URL_PUBLICA`.
- [ ] **`CRC_SEGREDO_CHAVE` configurada** no servidor (32 bytes em base64 ou
      hexa). Sem ela o token não é gravado — por construção, e não por descuido.

---

## Fase 1 — o que funciona hoje, sem App Review

**Development Mode atende a própria Página e o próprio Instagram.** Isso é o
suficiente para ativar o degrau 1 do rollout (§79): receber e responder com
gente.

### 1.1 Crie o Meta App

1. <https://developers.facebook.com/apps> → **Criar app**.
2. Tipo: **Business**.
3. Vincule ao **Business Manager** da JP.
4. Anote `App ID` e `App Secret` (_Configurações → Básico_).

### 1.2 Adicione os produtos

Adicione no app:

- **Messenger** — atende Messenger **e** Instagram Direct.
- **Instagram** (Instagram Graph API) — comentários e direct.
- **Webhooks**.
- **Marketing API** — só se for usar Lead Ads.

### 1.3 Configure o webhook

1. No app: **Webhooks → Página** (`object: page`).
2. **Callback URL:**
   `https://<CRC_URL_PUBLICA>/api/crc/meta/<id do canal>`

   > O `<id do canal>` só existe **depois** de conectar a conta no CRC. Faça a
   > [1.5](#15-conecte-a-conta-no-crc) primeiro, copie o id que aparece no
   > cartão, e volte aqui.

3. **Verify Token:** invente uma cadeia longa e aleatória. Ela vai no campo
   _Verify Token do webhook_ do CRC.
4. **Verify and Save.** A Meta faz um `GET` com `hub.challenge`, e o CRC
   responde o desafio como texto puro.
5. **Assine os campos**, por produto:

   | Objeto      | Campos                                                                                            |
   | ----------- | ------------------------------------------------------------------------------------------------- |
   | `page`      | `messages`, `messaging_postbacks`, `message_deliveries`, `message_reads`, `leadgen`               |
   | `instagram` | `messages`, `messaging_postbacks`, `messaging_seen`, `messaging_referral`, `comments`, `mentions` |

   > **Assinar o campo errado é o defeito mais comum desta integração, e o
   > sintoma é péssimo: não há erro nenhum — o webhook simplesmente nunca
   > chega.** A tela de Integrações lista os campos exigidos por produto, e a
   > saúde diz "cadastrada e nenhum webhook chegou ainda" nesse caso.

6. **Assine a Página no app.** No Graph API Explorer:

   ```
   POST /<page_id>/subscribed_apps
        ?subscribed_fields=messages,messaging_postbacks,message_deliveries,message_reads,leadgen
   ```

   Sem este passo, o webhook está configurado e a Página não manda nada.

### 1.4 Gere o Page Access Token

No Graph API Explorer, com a Página selecionada:

```
GET /me/accounts
```

O `access_token` da Página é o que o CRC usa.

> **Token de usuário vence em ~60 dias. Token de System User não vence.**
>
> Para produção, crie um System User no Business Manager, dê a ele acesso à
> Página, e gere o token lá. É a diferença entre a integração parar sozinha em
> dois meses e não parar.

### 1.5 Conecte a conta no CRC

`CRC → Integrações → Meta → Conectar conta da Meta`:

| Campo                    | De onde vem                                                        |
| ------------------------ | ------------------------------------------------------------------ |
| Unidade                  | qual clínica é dona desta conta (só aparece se houver mais de uma) |
| ID da Página             | _Configurações da Página → Sobre_                                  |
| ID da conta do Instagram | `GET /<page_id>?fields=instagram_business_account`                 |
| Nome da conta            | livre, só para a tela                                              |
| `@usuário`               | o do Instagram                                                     |
| Produtos                 | marque os que esta conta atende                                    |
| Page Access Token        | o da 1.4 — gravado **cifrado**                                     |
| App Secret               | _Configurações → Básico_ do app                                    |
| Verify Token             | o que você inventou na 1.3                                         |
| Human Agent aprovada     | **deixe desmarcado** até o App Review aprovar                      |

O cartão passa a mostrar o id do canal. Copie-o para a Callback URL da 1.3.

### 1.6 Confira

- [ ] **Testar** no cartão da conta → "Conectado a …". Não envia mensagem para
      ninguém: é um `GET` no próprio objeto da conta.
- [ ] Mande um direct de um perfil pessoal para o Instagram da clínica.
- [ ] A conversa aparece na Inbox, com o selo **Instagram**.
- [ ] Responda pela Inbox. A resposta chega no aplicativo.
- [ ] O cartão da Meta mostra **Último webhook: há poucos minutos**.

Se a conversa não aparecer, vá ao [runbook](META-RUNBOOK.md#o-webhook-parou).

---

## Fase 2 — App Review

Necessário para atender contas que **não** são as suas — e, no caso da feature
Human Agent, para responder fora das 24 horas mesmo na sua própria conta.

### 2.1 Business Verification

_Business Manager → Configurações → Informações do negócio → Verificação._

Exige CNPJ, comprovante de endereço e um meio de contato verificável. Sem ela, a
maioria das permissões não sai de Standard Access.

### 2.2 O que pedir, por produto

O catálogo executável está em `EXIGENCIAS`, em
`src/lib/crc/integracoes/meta/config.ts` — e a tela de Integrações o mostra com
a fonte oficial de cada linha.

| Produto                     | Permissões / features                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Instagram Direct            | `instagram_business_basic`, `instagram_business_manage_messages`, `pages_messaging`, `pages_show_list`                          |
| Messenger                   | `pages_messaging`, `pages_manage_metadata`, `pages_read_engagement`, `pages_show_list`                                          |
| Comentários / private reply | `instagram_business_basic`, `instagram_business_manage_comments`, `instagram_business_manage_messages`, `pages_manage_metadata` |
| Lead Ads                    | `leads_retrieval`, `pages_manage_ads`, `pages_show_list`, `pages_read_engagement`                                               |
| Responder fora de 24h       | **feature Human Agent**                                                                                                         |

> **Os nomes mudam.** A Meta renomeou os escopos do Instagram Login em
> 2024/2025 — `business_manage_messages` virou
> `instagram_business_manage_messages`, e os antigos foram descontinuados em
> 27/01/2025. Pedir o nome antigo é pedir uma permissão que não existe, e a
> recusa vem sem explicação útil.
>
> Confira em <https://developers.facebook.com/docs/permissions/reference/>
> antes de submeter.

### 2.3 O screencast

A Meta exige vídeo mostrando **o uso real de cada permissão**, do login do
usuário até o efeito. Grave um por permissão, ou um contínuo que passe por
todas:

1. login no CRC;
2. `Integrações → Meta → Conectar conta`, com o fluxo de credencial;
3. um direct chegando na Inbox (mande de outro celular);
4. a recepção respondendo pela Inbox, e a resposta aparecendo no aplicativo;
5. um comentário no Instagram virando lead no funil;
6. a resposta privada chegando no direct de quem comentou;
7. um lead de Instant Form aparecendo no funil com a campanha.

**Mostre a tela de dados do paciente.** A Meta recusa quando não consegue ver
para que serve o dado pedido.

### 2.4 Política de privacidade e exclusão de dados

O app exige as duas URLs. O CRC já tem a primeira:

- Privacidade: `https://<dominio>/politica-de-privacidade`
- Exclusão de dados: a Meta aceita **instruções em página** quando não há
  callback automático. Descreva: a quem escrever, o que é apagado
  (`crc_patient_identities` do namespace social, `crc_social_events`,
  `crc_private_replies`, `crc_conversations` e `crc_messages` do canal), e em
  quanto tempo.

> **Estado honesto:** o _Data Deletion Callback_ automático **não está
> implementado**. Quando a Meta o exigir para o produto em questão, ele é uma
> rota nova que recebe o `signed_request`, valida a assinatura com o app secret,
> e enfileira a exclusão. É trabalho conhecido e não feito.

---

## Fase 3 — Lead Ads

1. **App Review** de `leads_retrieval` e `pages_manage_ads` aprovado.
2. Webhook do objeto **Página** com o campo **`leadgen`** assinado.
3. `POST /<page_id>/subscribed_apps?subscribed_fields=leadgen`.
4. No CRC, o canal precisa ter o produto **Lead Ads** marcado e a **Página**
   vinculada — Lead Ads é da Página, não do Instagram.
5. Crie um anúncio com Instant Form e **preencha você mesmo**, pelo
   _Lead Ads Testing Tool_:
   <https://developers.facebook.com/tools/lead-ads-testing>
6. O lead aparece no funil em segundos, com campanha, conjunto, anúncio e
   formulário.
7. Clique **Reconciliar leads** no cartão. O resultado deve ser
   **"Nenhum lead faltando"** — se ele recuperar algo, o webhook está falhando.

---

## Fase 4 — comentários e private reply

O §79 põe isto no **degrau 4**, e a ordem importa: private reply é a única
mensagem que o CRC manda para quem **não** escreveu para a clínica.

1. Webhook do objeto **`instagram`** com `comments` assinado.
2. Crie a regra em `Integrações → Meta → Regras de comentário`. Uma regra de
   exemplo desligada já vem semeada, com o veto `capilar` — que é o falso
   positivo real de uma clínica odontológica.
3. **Liste o id da mídia da campanha** em `midias`. Com `exigirCaptacao: true` e
   a lista vazia, a regra não casa nada — de propósito: uma regra que exige
   captação sem dizer qual conteúdo é captação não tem como agir.
4. Deixe `enviar_private_reply` **desligado** na primeira semana. Confira na
   tela quantos comentários casariam a regra antes de ligar o envio.
5. Para o envio automático funcionar, a autonomia do domínio **Conversas**
   precisa estar em **nível 4** e a flag `ai_agente_envio` ligada — private reply
   é classificado como risco **médio** (contato não solicitado).
6. Ligue com `cooldown_horas = 168` (7 dias). Cooldown zero manda um direct por
   comentário; a tela avisa ao salvar.

---

## Checklist de go-live (§78)

### Infra

- [ ] `supabase/45-crc-meta-omnichannel.sql` aplicado
      (`npm run schema:status` confirma).
- [ ] `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` no ambiente
      **ou** no `config` de cada canal. As três, e não duas: o sinal
      **"Variáveis do aplicativo"** no cartão da Meta lista pelo nome o que
      falta, e sem `META_APP_SECRET` **todo** webhook é recusado.
- [ ] `CRC_SEGREDO_CHAVE` configurada — sem ela nenhum token é gravado.
- [ ] `CRC_URL_PUBLICA` configurada, em HTTPS.
- [ ] `META_SANDBOX` **ausente** em produção. A trava é `NODE_ENV=production`,
      que a plataforma define sozinha — mas ela passou a ser verificada em
      runtime (ver `servidor/ambiente.ts`), então a variável não deve ficar lá.
- [ ] Conta cadastrada e ativa em `Integrações → Meta`.
- [ ] Saúde: **Último webhook** com minutos, não dias.
- [ ] Dead letter vazia.

### Meta

- [ ] App vinculado ao Business correto.
- [ ] Business Verification concluída.
- [ ] Página e Instagram corretos (confira os ids no cartão).
- [ ] Permissões em **Advanced Access** para o que sai da própria conta.
- [ ] App Review aprovado no que precisa.
- [ ] `subscribed_apps` da Página com os campos certos.
- [ ] Token de **System User** (que não vence), e não de usuário.

### Produto

- [ ] IA em **OBSERVAR** no Instagram e no Messenger
      (`Autonomia → Conversas`, teto do canal em 1).
- [ ] Private reply **desligado** até o degrau 4.
- [ ] Recepção treinada: o selo de canal na Inbox, e o que `EXIGE_HANDOFF`
      significa.
- [ ] O CTA do site para WhatsApp **funcionando** — ele não depende de nada
      disto, e não pode passar a depender.

### Segurança

- [ ] Tenant testado: uma conta de outra clínica não aparece na sua.
      `npx vitest run src/lib/crc/aplicacao/meta.test.ts -t "NUNCA aparece"`.
- [ ] Assinatura testada:
      `npx vitest run src/lib/crc/integracoes/meta/assinatura.test.ts`.
- [ ] Nenhum token no bundle:
      `node scripts/conferir-bundle.mjs`.
- [ ] Os testes mordem:
      `node scripts/injetar-defeitos-meta.mjs` — devolve `5/5`.
- [ ] Acesso administrativo: recepcionista **não** vê nem edita credencial
      (`gerenciar_integracoes`).

---

## Rollout progressivo (§79)

Cada degrau desliga sem deploy: os dois primeiros pelo `ativo` do canal, os
demais pela autonomia e pelas regras.

| Degrau | O que liga                                         | Como ligar                           |
| ------ | -------------------------------------------------- | ------------------------------------ |
| 1      | receber Instagram/Messenger, humano responde       | conectar a conta                     |
| 2      | Lead Ads automático                                | marcar o produto + App Review        |
| 3      | IA classifica e sugere                             | autonomia do canal em 2              |
| 4      | private reply em regra restrita                    | `enviar_private_reply` + autonomia 4 |
| 5      | IA responde pergunta administrativa de baixo risco | autonomia do canal em 3              |
| 6      | IA auxilia agendamento                             | autonomia de `agenda`                |
| 7      | autonomia maior                                    | só depois de medir (§80)             |

**Não suba degrau sem evidência.** As métricas do §80 — taxa de handoff, taxa de
correção humana, intenção errada, bloqueio por política, envio duplicado, tempo
de resposta, conversão em agendamento, opt-out, reclamação — estão em
`Analytics` e em `Saúde`. Sem evidência, não sobe.

---

## Como desligar

| Escopo             | Como                                           | Efeito                                             |
| ------------------ | ---------------------------------------------- | -------------------------------------------------- |
| Uma conta          | `Integrações → Meta → Desativar`               | para de receber **e** de enviar na hora            |
| Só o envio         | kill switch **Pausar envios de WhatsApp**      | vale para todos os canais, inclusive private reply |
| A IA               | kill switch **Pausar ações automáticas da IA** | a recepção continua respondendo                    |
| Tudo               | kill switch **Pausar todas as automações**     |                                                    |
| Só o private reply | desligar `enviar_private_reply` na regra       |                                                    |

Desativar a conta **não apaga** a linha: o token continua cifrado, a auditoria
continua respondendo "quem desconectou e quando", e religar é um clique.
