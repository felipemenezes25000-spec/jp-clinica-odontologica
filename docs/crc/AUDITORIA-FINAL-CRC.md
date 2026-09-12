# Auditoria do CRC — 12/09/2026

## 1. O HEAD auditado

| | |
|---|---|
| Ponto de partida | `7c0c6925f304a7d8f1dda374f91960413ad89396` |
| Entregue em | `910c6294fef52f94bdbb78d2f871e8dc0b48ce0f` |
| Migrations no início | até `24-crc-cursor-por-clinica.sql` |
| Migrations no fim | até `28-crc-configuracao-por-clinica.sql` |

Sete commits:

```
fb13a70  crc: o agendamento vai para a clinica da conversa, e a credencial e do tenant
39179eb  crc: o retry perde a janela, e o inbox de webhook ganha dono
f9cffb3  crc: as varreduras percorrem a base, e 100 por dia significa 100 por dia
6f58cb0  crc: o painel para de mandar olhar o lugar errado
5c314ac  crc: as tres coisas que impediam um segundo cliente de existir
45df544  crc: dez E2E de navegador, e o prefixo que impedia o adaptador de producao de ser testado
910c629  crc: a passagem 3 — o que as proprias correcoes quebraram
```

---

## 2. Problemas confirmados

### P0-1 · O agendamento ia para a clínica errada

**Severidade:** P0 — dado de paciente atravessando fronteira de unidade.

**Cenário.** Organização com Clínica A e Clínica B. O paciente escreve no
WhatsApp da B. O webhook roteia certo: organização certa, clínica B, conversa B.
O agente decide oferecer horário → o contexto devolve a **A**. O horário
oferecido é o da A, e o agendamento é gravado na A.

**Causa.** `contextoDeAgendamentoParaJob` recebia `conversationId` e o ignorava.
A clínica saía de `selecionarUm("crc_clinics", { ativa: true })` — a primeira que
o banco devolvesse. O comentário dizia, com todas as letras: *"hoje não usa, e é
honesto dizer isso aqui em vez de fingir que usa"*. Honesto e errado: o parâmetro
não estava sobrando, estava faltando ser usado.

O `supabase/23` consertou o roteamento de **entrada**. O de **saída** ficou. Meia
fronteira não é fronteira.

**Arquivos.** `automacao/handlers.ts`, `aplicacao/conversas.ts`.

**Correção.** `clinicaDaConversa(organizationId, conversationId)` lê
`crc_conversations.clinic_id` — coluna `not null`, escrita por quem recebeu a
mensagem — confere que a clínica está ativa e pertence à organização, e **falha
fechado**: sem conversa, conversa de outro tenant ou unidade desativada, não há
segundo melhor palpite.

---

### P0-2 · Credenciais externas eram da instalação, e não do tenant

**Severidade:** P0 — a Clínica B escrevendo na conta do Dental Office da A.

**Cenário.** Duas organizações. Ambas usam `process.env["DENTAL_OFFICE_SECRET"]`.
A B marca consulta, e ela aparece na agenda da A. Nada falha: funciona, no lugar
errado.

**Causa.** `crc_canais_whatsapp` e `crc_integracoes_clinica` foram criadas no
`supabase/23` para guardar credencial por tenant. **Nenhuma linha de runtime as
lia.**

E o cache de token do Dental Office era um singleton — `let cache` — servindo o
token da primeira credencial para qualquer chamada seguinte.

**Arquivos.** `integracoes/credenciais.ts` (novo),
`integracoes/dental-office/auth.ts`, `.../cliente.ts`,
`integracoes/whatsapp/provedores.ts`.

**Correção.** Resolução **clínica → organização → ambiente**, com graus
diferentes por conta (uma conta do Dental Office atende várias unidades; um
número de WhatsApp é de uma). O degrau do ambiente **se desliga sozinho** assim
que a instalação deixa de ser única. O cache virou `Map` com chave que carrega
base, client id e uma impressão do segredo — nunca o segredo —, e o 401 invalida
só aquela chave.

---

### P1-3 · O retry cercado tinha uma janela

**Severidade:** P1 — backoff virando o contrário do que promete.

**Cenário.** `falharJob` gravava em duas instruções: a RPC mudava o status para
`REPETIR`, e um `update` separado escrevia o `disponivel_em`. Entre as duas, a
linha está `REPETIR` com o `disponivel_em` **antigo** — que é passado. É
exatamente o que a reserva procura.

**Por que importa.** O backoff existe porque a maior parte das falhas é provedor
fora do ar. Retry imediato bate no mesmo provedor caído, queima uma das cinco
tentativas, e o job chega ao teto em segundos em vez de em minutos — a dead
letter abre antes de o provedor ter tido chance de voltar.

**Arquivos.** `supabase/25`, `aplicacao/agent-jobs.ts`.

**Correção.** `crc_encerrar_agent_job` ganhou `p_disponivel_em`; status e backoff
saem na mesma instrução. O `drop function` veio antes do `create`, porque
acrescentar parâmetro com default cria **sobrecarga**, e o PostgREST recusaria a
chamada por ambiguidade.

---

### P1-4 · A dead letter de webhook não sabia o tenant

**Severidade:** P1 — fila de falhas sem dono num SaaS.

**Causa.** `mandarParaDeadLetter` chamava `resolverEscopo(provedor, null)` —
`null` no lugar do destinatário. E `resolverEscopo` sem destinatário cai no
caminho da clínica única, que com duas clínicas devolve `null` de propósito.
Resultado: `organization_id = null`. A função SQL do `supabase/24` fazia pior:
`null` escrito à mão, porque a coluna nem existia.

**Correção.** O escopo passou a ser resolvido **antes** do insert no inbox e
gravado como coluna (`supabase/25`). Linha antiga sem a coluna ainda acha o dono
pelo `destinatario` que viaja dentro do envelope normalizado.

---

### P1-5 · PII sobrevivia ao fim da fila de webhook

**Severidade:** P1 — telefone e texto do paciente retidos indefinidamente.

**Causa.** `marcar()` zerava o payload só em `PROCESSADO`. O envelope que esgota
as tentativas ficava `FALHOU` com o conteúdo dentro, para sempre — numa tabela de
fila, com política de acesso diferente da de `crc_messages`. E o caso de falha é
justamente o que ninguém revisita.

**Correção.** A regra virou uma pergunta: **este envelope ainda pode ser
reprocessado?** Pode → guarda. Não pode (`PROCESSADO`, `DESCARTADO`, `FALHOU` no
teto) → zera. A linha continua, porque é o `external_id` dela que impede o
provedor de reentregar o mesmo webhook como novo.
`crc_limpar_webhooks_antigos` virou rede, e não política.

---

### P1-6 · O recall relia o começo da base, todo dia, para sempre

**Severidade:** P1 — 97,5% da base fora do recall com 8.000 pacientes.

**Causa.** `order by ultima_consulta_em asc limit 200`, **sem cursor**. As 200
mais antigas continuam sendo as 200 mais antigas na execução seguinte, porque
quem não respondeu não mudou `ultima_consulta_em`. O dedupe por ciclo impede o
efeito duplicado — e é por isso que o defeito é invisível: nada acontece duas
vezes, nada dá erro, e o relatório diz "avaliados: 200" todo dia.

O comentário afirmava: *"ela processa um lote por dia e converge"*. Não
convergia: processava **o mesmo lote** por dia.

**Correção.** Keyset persistido em `crc_scan_state`, com cursor de **duas**
colunas — `ultima_consulta_em` sozinho não é único, e base importada traz a data
truncada no dia. Página incompleta fecha a volta: cursor zera e `ciclo`
incrementa.

---

### P1-7 · O aniversário lia 2.000 linhas e chamava de base

**Severidade:** P1 — três em cada quatro aniversariantes invisíveis.

**Causa.** `limit 2000` sem `order by`, comparando mês/dia em memória. A
justificativa no comentário — *"com 20 mil pacientes são ~55 aniversariantes por
dia"* — estava certa na conta e errada na conclusão: os 55 estão entre os 20 mil,
e a consulta lia 2.000. Quais 2.000 é decisão do planejador, e ela muda.

**Correção.** RPC `crc_aniversariantes` com índice de expressão
`mês * 100 + dia`. Não `to_char`, que é `STABLE` e o Postgres recusa em índice.
O 29 de fevereiro continua sendo regra de domínio: o SQL recebe a lista de datas
que contam como hoje.

---

### P1-8 · "100 por dia" significava 25 por dia

**Severidade:** P1 — campanha de 964 pessoas levando 38 dias em vez de 10.

**Causa.** `limite: Math.min(restaHoje, ctx.limitePorVolta ?? 25)`, com **um**
chamador: a volta pesada, que roda uma vez por dia.

**Correção, em três partes.**

1. O pulso passou a chamar as campanhas — muitas voltas pequenas, que é o que a
   campanha precisava.
2. A cota virou **acumulada** (`dominio/cadencia.ts`): quantas já deveriam ter
   saído a esta hora. Com teto por volta, um pulso atrasado perde o que não saiu;
   com cota acumulada, a volta seguinte recupera.
3. O dia passou a ser o **da clínica**. `setHours(0,0,0,0)` usa o fuso do
   processo — na Vercel, UTC. O contador diário virava às 21h de São Paulo: a
   campanha esquecia tudo e liberava a cota inteira de novo.

**E uma folga de 10% na janela**, que nasceu de o teste falhar em 96 de 100: com
proporção pura, a meta só é alcançada no minuto do fechamento, quando a política
de contato já recusa. As últimas mensagens do dia não saíam. Todo dia.

---

### P1-9 · Não dava para saber se o pulso estava vivo

**Severidade:** P1 — o painel mandava olhar o worker errado.

**Cenário.** `CRON_SECRET` removido do repositório, ou `CRC_URL_PUBLICA` não
configurada. Os dois param **em silêncio**, e o painel dizia: *"Há pacientes
esperando há 40 minutos. Confira se o cron do motor está rodando."* O motor é o
worker diário; não tem relação nenhuma com turno parado.

**Correção.** `crc_runtime_heartbeats` (`supabase/27`) e batimento no pulso e na
volta pesada. O painel ganhou `pulso_nunca_bateu` (configuração que nunca foi
feita) separado de `pulso_parado` (algo quebrou) — são conversas diferentes —,
mais `webhook_preso`, `dead_letters_pendentes`, `credencial_ausente` e
`schema_atrasado`.

---

### P2-10 · O nome da clínica estava escrito no runtime

Seis pontos com `clinica: "JP Clínica Integrada Odontológica"` — templates,
resposta de agendamento, resposta de lead, passo de jornada, campanha, e a
primeira linha do prompt do agente. Com dois clientes, é uma clínica se
apresentando com o nome de outra. E o modelo obedece.

**Correção.** `aplicacao/marca.ts`, com a unidade vencendo a organização, e a
resolução dentro de `renderizarTemplate` — onde todo mundo passa, e não em cada
chamador.

---

### P2-11 · Instalar o cliente B devolvia o cliente A

`instalar()` tinha `slugOrg = "jp"` e `slug: "matriz"` escritos dentro. A segunda
instalação caía no `select` por slug, encontrava a primeira, e devolvia o id dela
— sem erro. O admin do B seria criado dentro do A.

**Correção.** `criarOrganizacao({ slug, nome, admin })` genérico;
`criarClinica()` para a segunda unidade, que antes era impossível pela API;
`instalar()` virou o caso particular da JP, escrito como caso particular.

---

### P2-12 · Configuração era da empresa, e não da unidade

`crc_settings` tem chave `(organization_id, chave)`. Numa rede, a unidade do
shopping fecha às 22h e a do centro às 18h — e a rede escolhe entre mandar
mensagem para quem está dormindo ou calar quem ainda está atendendo.

**Correção.** `crc_settings_clinica` (`supabase/28`), **tabela nova e não coluna
em `crc_settings`**: mudar chave é mudar contrato, e foi exatamente isso que o
`supabase/23` fez com `crc_sync_state`. O override é aplicado no chokepoint
(`enviarMensagem`) **sobre** a configuração recebida, e não relendo tudo — um
parâmetro que às vezes é obedecido e às vezes não é pior do que um que não
existe.

---

### Regressões que as próprias correções introduziram (passagem 3)

| | |
|---|---|
| Uma varredura quebrada abortava as seis seguintes | risco concreto na janela entre deploy e SQL do `supabase/26`. Cada uma passou a ser isolada por `comCaptura` |
| `crc_scan_state` nasceu com `on_conflict` sem quem conferisse | a mesma forma do P0 do `supabase/23`. Teste de integração que LÊ a string do `handlers.ts` |
| `contrato.test.ts` dependia do shell | com `SUPABASE_URL` exportada, a gravação em `crc_integration_logs` virava "a última chamada" capturada pela espiã de fetch |

---

## 3. Problemas refutados

| Achado do prompt | Veredito |
|---|---|
| **Workflow do GitHub** — falhar sem `CRON_SECRET`, URL configurável, timeout, `workflow_dispatch`, concurrency, resumo | **Já existia tudo.** O que faltava era o **status HTTP** no erro: `--fail-with-body` devolve exit 22 para qualquer 4xx/5xx, e isso não distingue 401 de 404 de 500. Acrescentado |
| **"Preserve o mecanismo de `INCERTO` + `conciliarAgendamento`"** | Intacto. Nada foi tocado em `servidor/http.ts` nem no fluxo de reconciliação |
| **Eventos e agent jobs seriam mono-tenant** | Já eram globais: as RPCs de reserva não filtram organização, e cada linha carrega o `organization_id`. O caminho quente sempre atendeu todas as organizações numa chamada |
| **`crc_limpar_webhooks_antigos` / `limparConcluidos` / `fecharRunsAbandonadas` sem chamador** | Corrigido antes desta rodada, no `7c0c692` (`faxina()`) |
| **Cron da Vercel mais frequente** | Impossível no plano Hobby — teto do plano, e agendar mais denso faz o deploy falhar. É por isso que o pulso mora no GitHub Actions |

---

## 4. Migrations novas

| Arquivo | O que faz |
|---|---|
| `25-crc-retry-atomico-e-tenant-no-inbox.sql` | `p_disponivel_em` no encerramento cercado; `organization_id`/`clinic_id` no inbox de webhook; retenção de PII cobrindo o estado terminal; reconciliador de webhook preso com tenant |
| `26-crc-varreduras-convergentes.sql` | `crc_scan_state`; `crc_pagina_de_recall` (keyset); índice e `crc_aniversariantes` |
| `27-crc-observabilidade.sql` | `crc_runtime_heartbeats` + `crc_bater_heartbeat`; `crc_schema_migrations` com backfill marcado `presumido` |
| `28-crc-configuracao-por-clinica.sql` | `crc_settings_clinica` |

**Todas pendentes de execução em produção.** Depois de cada uma:
`notify pgrst, 'reload schema';`

---

## 5. Testes novos

| Arquivo | Casos | O que prende |
|---|---|---|
| `automacao/clinica-da-conversa.test.ts` | 7 | a clínica vem da conversa; falha fechado |
| `integracoes/credenciais.test.ts` | 10 | isolamento de credencial; o ambiente se auto-desliga; cache de token por chave |
| `aplicacao/retry-atomico.test.ts` | 4 | status e backoff numa instrução — contando **escritas**, não o estado final |
| `aplicacao/webhook-tenant-e-pii.test.ts` | 6 | tenant no inbox e na DLQ; PII sai no terminal e fica enquanto há replay |
| `automacao/varreduras-convergentes.test.ts` | 7 | três ciclos avaliam 500; aniversariante depois da linha 2.000 |
| `dominio/cadencia.test.ts` | 10 | a conta da cadência, pura |
| `aplicacao/cadencia-de-campanha.test.ts` | 5 | 100/dia converge, sem duplicar, sem esvaziar de manhã; pausa e retomada |
| `aplicacao/heartbeat.test.ts` | 14 | batimento, limiares do painel, ação apontando para o pulso |
| `aplicacao/saas.test.ts` | 13 | branding, onboarding e configuração por clínica |
| `testes/integracao/adaptador.test.ts` | 6 | o **adaptador de produção** contra Postgres real |
| `testes/integracao/concorrencia.test.ts` | +3 | o job encerrado com backoff não é reservável no instante seguinte |
| `e2e/*.spec.ts` | 10 | navegador: sessão, inbox, configurações, kill switch, estúdio, multi-clínica |

---

## 6. Provas

```
npm run lint            0 erros (5 avisos de fast-refresh, pré-existentes)
npm run typecheck       limpo
npm test                1157 passando
npm run test:integracao   74 passando  (Postgres 16 + PostgREST, schema do zero)
npm run e2e               10 passando  (17s, idempotentes)
npm run build           ok
npm run schema:status   29 arquivos · 13 sondados · 0 falhas
```

Schema aplicado **do zero** num banco limpo, com os 29 arquivos.

### Injeção de defeito

Cada correção importante foi revertida, e o teste certo quebrou:

| Defeito injetado | O que quebrou |
|---|---|
| voltar a ignorar `conversationId` | `expected 'aaaa…' to be 'bbbb…'` — a clínica A no lugar da B |
| cache de token com chave fixa | `expected 'tok-cli-A' to be 'tok-cli-B'` — B recebe o token de A |
| tirar a checagem de ambiguidade | o ambiente volta a atender duas organizações |
| backoff de volta a um `update` separado | `p_disponivel_em` ausente; a segunda escrita reaparece |
| `terminal = status === "PROCESSADO"` | o envelope inteiro continua na linha |
| `resolverEscopo(provedor, null)` | `expected null to be 'bbbb…'` na dead letter |
| cursor de recall fixo em `null` | `expected 200 to be 500` |
| aniversário de volta ao `limit 2000` | `expected +0 to be 1` |
| cota de campanha removida | `expected 50 to be less than or equal to 30` — front-loading |
| `clinica:` de volta ao literal | a mensagem de um tenant sai assinada com o nome do outro |
| slug de clínica fixo em `"matriz"` | a segunda unidade não nasce |
| override de clínica ignorado | `expected '19:00' to be '22:00'` |
| `on_conflict` de `crc_scan_state` errado | **42P10** — o mesmo erro do `supabase/23`, agora no CI |

Duas observações honestas sobre essas injeções:

- No retry, o caso **"o job não fica elegível"** continuou **verde** com o
  defeito. É esperado: o estado final é idêntico nas duas versões. Por isso o
  teste conta escritas — e o integration test mostra a janela existindo.
- Na campanha, o total do dia também continuou 100 com o defeito. A asserção que
  discrimina é sobre a **forma** do dia, não sobre o total.

---

## 7. Estado dos provedores externos

| Provedor | Estado |
|---|---|
| **WhatsApp** | `BLOCKED_EXTERNAL`. Nenhum contrato. Adapters de Meta Cloud, Twilio e WAHA prontos e testados contra fixtures; roteamento de entrada e saída por clínica implementado |
| **Dental Office** | `BLOCKED_EXTERNAL`. Credenciais não cadastradas. Adapter completo, com contrato testado a partir do OpenAPI, `INCERTO` + reconciliação preservados |
| **IA** | Configurável por organização (`crc_ai_credentials`). Gateway, orçamento, disjuntor e supervisor prontos. Sem chave cadastrada em produção |

---

## 8. Pendências BLOCKED_EXTERNAL

Comandos exatos para quando as credenciais chegarem:

```bash
# 1. WhatsApp — só RECEBIMENTO primeiro (degrau 3 do roteiro)
#    Cadastre no painel da Vercel, aponte o webhook do provedor para
#    POST /api/crc/whatsapp, e confira em Integrações que o adapter subiu.
#    Mande uma mensagem de um número seu e veja-a na Inbox.

# 2. Dental Office — leitura primeiro
#    Integrações → Testar conexão  (autentica e faz um GET; nunca altera dado)
#    Integrações → Sincronizar agora
curl -X POST https://SEU-DOMINIO/api/crc/motor -H "Authorization: Bearer $CRON_SECRET"

# 3. Shadow mode
#    Configurações → ligar SOMENTE ai_agente_sombra.
#    Deixe rodar alguns dias e leia a tela Inteligência.

# 4. Antes de qualquer envio: a suíte de avaliação
#    Avaliação → instalar os 22 casos → rodar → publicar a versão no Estúdio
```

---

## 9. O que pode ser ligado hoje

| | Pode? | Condição |
|---|---|---|
| UI | **SIM** | 10 E2E cobrindo sessão, inbox, configurações, kill switch, estúdio e multi-clínica |
| Sincronização | **SIM**, depois do SQL | precisa das migrations 25–28 e das credenciais do Dental Office |
| Campanhas | **SIM**, depois do SQL | a cadência converge; precisa de canal de WhatsApp |
| Shadow AI | **SIM** | `ai_agente_sombra` não fala com ninguém. Precisa de chave de IA |
| Envio da IA | **NÃO** | a suíte de avaliação nunca rodou contra o modelo real. É o gate |
| Agendamento autônomo | **NÃO** | depende do envio, e do Dental Office em escrita |
| Multi-clínica | **SIM** | roteamento de entrada e saída, credencial, configuração e isolamento na UI — com teste |
| Multi-tenant SaaS | **QUASE** | ver as duas lacunas abaixo |

### As duas lacunas de SaaS que restam

1. **Não há tela para abrir uma segunda unidade.** `criarClinica()` existe e é
   testada; nenhuma interface a chama. O E2E cria a segunda clínica por insert
   direto, e isso está dito lá.
2. **Não há tela para escolher as clínicas de quem se cadastra.** O convite herda
   as clínicas de quem convida, e o admin alcança todas — então todo convidado
   nasce com acesso total. A regra de RBAC está certa e testada; falta a
   interface que a exercita.

Nenhuma das duas é motor faltando: são telas faltando para um motor que existe.

---

## 10. GO / NO-GO

### GO — com condições, e nesta ordem

**1. Rodar as migrations 25, 26, 27 e 28**, cada uma seguida de
`notify pgrst, 'reload schema';`, e depois `npm run schema:status` sem falhas.

Até lá o código degrada em vez de parar — o retry volta a ser em dois passos, o
override por clínica é ignorado —, mas **o recall e o aniversário param**: eles
chamam RPCs que só existem no `26`. A varredura vai falhar e reportar
`{ falhou: true }` sem derrubar as outras.

**2. `gh secret set CRON_SECRET`** e `CRC_URL_PUBLICA` na Vercel. Sem os dois, a
fila não anda — e agora o painel diz isso, em vez de mandar olhar o motor.

**3. Instalar e rodar a suíte de avaliação.** Os 22 casos discriminam — reprovam
tanto o agente que só cala quanto o que responde tudo —, e **nunca rodaram contra
o modelo real**. É o único gate que ainda não tem evidência.

### NO-GO para envio automático da IA

Não por defeito conhecido: por ausência de evidência. A suíte existe, o gate
existe, e a rodada não aconteceu. Ligar `ai_agente_envio` antes disso é decidir
sem o dado que foi construído para a decisão.

### Riscos remanescentes

| Risco | Mitigação |
|---|---|
| As migrations não rodarem antes do próximo deploy | `schema:status` no deploy; sinal `schema_atrasado` no painel |
| Assinatura de webhook do Twilio é por conta, e vem do ambiente | Para a Meta está arquiteturalmente certo (app secret é do aplicativo). Para o Twilio multi-tenant, é limitação conhecida |
| Rate limit de login é em memória, por instância | Documentado no próprio módulo: **não é defesa distribuída**. A defesa real é na borda (WAF) |
| A base de 8.000 ainda não foi exercitada com dados reais | As varreduras convergem por construção e têm teste com 500 e 2.500 linhas; o comportamento com 8.000 é extrapolação |
| A base de 8.000 nunca foi varrida de ponta a ponta em produção | O painel ganhou `varredura_parada`: `crc_scan_state.ciclo` sem avançar há dez dias vira sinal. É o número que responde "a varredura está andando?" |
