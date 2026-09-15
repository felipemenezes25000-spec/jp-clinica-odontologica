# Meta Omnichannel — fechamento pós-aceite

Atualização de 15/09/2026, posterior a `META-FINAL-ACCEPTANCE.md`.

Este arquivo registra o que mudou depois da primeira matriz de aceite. Ele não
transforma sandbox em produção: Instagram/Messenger/Lead Ads continuam exigindo
a ativação do Meta App real descrita em `META-ATIVACAO-E-HOMOLOGACAO.md`.

## O que foi fechado

### Data Deletion Callback — IMPLEMENTADO

Endpoint público:

```text
POST /api/crc/meta/data-deletion
GET  /api/crc/meta/data-deletion?code=<confirmation_code>
```

O POST:

1. recebe `signed_request` da Meta;
2. verifica HMAC-SHA256 com `META_APP_SECRET` antes de interpretar o payload;
3. gera `confirmation_code` imprevisível;
4. registra o pedido;
5. processa a exclusão de forma conservadora;
6. devolve `url` + `confirmation_code`, no contrato esperado pela Meta.

A exclusão automática só acontece quando o identificador social resolve para
**exatamente uma** pessoa. Se o mesmo valor apontar para mais de um paciente,
o pedido vira `REVISAO` e nada é apagado. Não existe resolução por nome,
username, telefone parecido ou qualquer heurística.

Quando há correspondência inequívoca, são removidos os dados sociais vinculados
aquele identificador: identidade Instagram/Messenger, conversa e mensagens do
canal, eventos sociais, reservas de private reply, log social e Meta Lead já
vinculado à mesma pessoa. Telefone, e-mail, CPF e Dental Office não são tocados.

### Analítica por canal — IMPLEMENTADA

`Integrações → Meta` passa a mostrar o painel **Desempenho por canal** com
janelas de 7, 30 e 90 dias.

Ele usa somente fatos já persistidos no CRC:

- conversas e mensagens por canal;
- leads por canal de aquisição;
- tempo médio até primeira resposta;
- oportunidades ganhas/abertas;
- gasto lançado em `crc_ad_spend`;
- CAC quando há gasto e lead no mesmo canal;
- receita `CONFIRMADA` atribuída à oportunidade;
- campanhas que trouxeram leads.

Potencial e receita confirmada continuam separados. O painel não inventa
impressões, cliques ou ROAS quando o CRC não observou esses dados.

A API do painel é:

```text
GET /api/crc/meta/analytics?dias=30
```

Ela exige sessão do CRC + `ver_analytics_gerencial`. Quem não tem essa permissão
não vê o painel e não recebe os dados.

### Segredos da Meta — ENDURECIDO

`Page Access Token` continua cifrado em `crc_canais_meta.segredo_cifrado`.

A partir de `supabase/46-crc-meta-finalizacao.sql`, `appSecret` e `verifyToken`
**não podem permanecer em `config` JSONB**. A migração remove valores legados e
um trigger remove novas tentativas antes de persistir.

Na instalação da JP, os valores do aplicativo ficam somente no ambiente:

```text
META_APP_SECRET
META_WEBHOOK_VERIFY_TOKEN
```

Isso é deliberado: a JP usa um Meta App da própria operação. Quando o produto
precisar aceitar um Meta App diferente por organização, a evolução correta é um
cofre de segredo por tenant — não voltar a gravar segredo em JSONB.

## Estado que NÃO mudou

Ainda não existe evidência `TESTADO_COM_API_REAL`. O código foi provado com o
sandbox/fake do projeto; para produção é necessário criar/configurar o Meta App,
ligar Página + Instagram profissional, configurar webhook/permissões e exercitar
Direct, Messenger, comentários/private reply e Lead Ads contra a Graph real.

`HUMAN_AGENT` e permissões que exigirem Advanced Access/App Review continuam
bloqueios externos até aprovação da Meta.

## OAuth

O onboarding automático (`Conectar com Meta` → OAuth → escolher Business/Página/
Instagram → token server-side) **continua não implementado**. Para a JP, que é
uma única operação, o fluxo manual documentado continua suficiente para
homologação inicial. Para transformar o CRC em produto multi-clínica self-service,
OAuth é a próxima evolução de produto.

Não marque OAuth como `BLOCKED_EXTERNAL`: é trabalho nosso. Só não é requisito
para provar a integração da própria JP com a conta que ela administra.

## Provas adicionadas

- teste unitário do `signed_request`: assinatura válida, adulteração, segredo
  errado, algoritmo inválido e ausência de `user_id`;
- teste de integração do trigger que impede segredos em JSONB;
- teste de exclusão inequívoca;
- teste de ambiguidade que exige revisão e não apaga nada;
- teste de integração do painel de canal com lead, conversa, oportunidade,
  gasto e receita confirmada.

## Estado resumido

| Item | Estado |
| --- | --- |
| Instagram Direct | `TESTADO_COM_SANDBOX` |
| Messenger | `TESTADO_COM_SANDBOX` |
| Comentários → lead | `TESTADO_COM_SANDBOX` |
| Private reply | `TESTADO_COM_SANDBOX` + permissões externas |
| Lead Ads | `TESTADO_COM_SANDBOX` |
| Identidade cross-channel | `TESTADO_COM_SANDBOX` |
| Data Deletion Callback | `IMPLEMENTADO` |
| Analítica por canal | `IMPLEMENTADO` |
| Segredo em JSONB | `FECHADO` |
| OAuth self-service | `NÃO IMPLEMENTADO` |
| Graph API real | `BLOCKED_EXTERNAL` até configurar a conta da JP |
