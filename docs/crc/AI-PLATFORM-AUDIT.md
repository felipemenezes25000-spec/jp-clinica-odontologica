# Auditoria — estado real antes do CRC AI OS

> [!NOTE]
> **Este documento é um recorte datado.** Ele descreve o sistema como estava
> quando foi escrito, e vale como registro da decisão daquele momento.
>
> Para o que o CRC faz **hoje**, o mapa é
> [CRC-MAPA-DO-SISTEMA.md](./CRC-MAPA-DO-SISTEMA.md) — gerado do código por
> `node scripts/mapa-do-sistema.mjs`, então não desatualiza sozinho.

Fase 0 do plano `CRC AI OS`. Este documento descreve o que **existe**, não o que
se pretende construir. Onde o código diverge da documentação, o código venceu e
a divergência está anotada.

Levantado em **10/09/2026**, `main` em `454a24d`, árvore de trabalho limpa.

---

## 1. O que o JP CRC é hoje

| Camada                                | Arquivos | Linhas |
| ------------------------------------- | -------: | -----: |
| `dominio/` — puro, sem I/O            |       21 |  6.018 |
| `aplicacao/` — casos de uso           |       25 | 10.857 |
| `automacao/` — jornadas               |        6 |  3.208 |
| `integracoes/` — adapters             |       13 |  4.570 |
| `servidor/` — infra server-only       |        7 |  1.974 |
| `api.ts` — fronteira React ↔ servidor |        1 |  2.686 |
| `components/crc/` — as 13 telas       |       20 |  8.092 |

**413 testes em 18 arquivos, todos passando.** 8 arquivos SQL em `supabase/`.

### Baseline de qualidade registrado

|                      |                                       |
| -------------------- | ------------------------------------- |
| `tsc --noEmit`       | limpo                                 |
| `vitest run`         | 18 arquivos, **413 testes**, 0 falhas |
| `eslint` sobre o CRC | 0 erros, 3 avisos                     |
| `vite build`         | passa                                 |

`npm run check` roda lint sobre o repositório inteiro e leva mais de dez
minutos; as partes foram medidas separadamente. Fora do CRC existem erros de
formatação preexistentes em `components/site/`, `components/rh/` e
`components/crc/Agenda.tsx`, todos anteriores a este trabalho. **Nenhum erro
preexistente justifica introduzir outro.**

A direção de dependência aponta para dentro e está preservada: `dominio` não
importa nada de `aplicacao`, `aplicacao` não importa de `integracoes`.

---

## 2. Os cinco pontos de estrangulamento que já existem

Esta é a parte que mais importa para o porte: **o CRC já tem os chokepoints que
uma plataforma agentic precisa ter.** O agente vai usá-los, não contorná-los.

### `aplicacao/mensagens.ts` — toda mensagem passa aqui

Aplica opt-out, cooldown, teto diário, janela comercial, dedupe, auditoria e
persistência antes do envio. Nenhum caminho de código fala com Meta, Twilio ou
sandbox sem passar por ele.

> **Invariante para o agente:** a Tool `communication.send_message` chama este
> caso de uso. Nunca a porta de mensageria direto.

### `aplicacao/agendamento.ts` — oferta, revalidação, gravação

Horários vêm do Dental Office, no máximo três opções, cadeira vinculada ao slot,
uma oferta aberta por conversa, expiração, revalidação imediatamente antes de
gravar. Três travas em série: `dental_office_writeback`, `auto_scheduling`,
`kill_escritas_do`.

> **Invariante:** as Tools de agenda chamam este caso de uso. O agente não
> conhece a API do Dental Office.

### `automacao/motor.ts` — motor durável de jornadas

`resume_at`, condições de saída antes de cada passo, reserva atômica por RPC com
`FOR UPDATE SKIP LOCKED`, logs, retry, e os três modos de autonomia
(`SHADOW`, `RECOMENDAR`, `EXECUTAR`).

> **Invariante:** não haverá um segundo workflow engine. O Workflow Studio
> compila para este motor ou o evolui.

### `dominio/` — decisão pura, testável sem banco

Priorização explicável, régua de cobrança do art. 42 do CDC, horário comercial,
status, telefone, escolha. É onde as regras de guardrail e policy devem morar.

### `integracoes/whatsapp/porta.ts` — porta abstrata

Três adapters atrás dela: Meta Cloud, Twilio, sandbox. WAHA entra como o quarto,
sem tocar em quem chama.

---

## 3. A IA que já existe

`aplicacao/ia.ts` **não é um agente**. É um classificador estruturado que
responde intenção, temperatura, confiança, exige-humano, motivo, ação sugerida e
resumo.

Isso não é pouco e não deve ser jogado fora: é exatamente o "modelo barato para
classificação" que o roteador por finalidade vai precisar. Ele vira
`purpose: classification` dentro do runtime novo, não concorrente dele.

O que **não existe** hoje: loop de agente, tool calling, memória, RAG,
checkpoint de turno, roteador de modelo, orçamento, trace, replay, avaliação.

---

## 4. Divergências entre documentação e código

Encontradas nesta auditoria, todas verificadas no código:

| Doc diz                                      | Código faz                                                                                                           |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `ai_autopilot` governa a resposta automática | A flag é lida em `automacao/handlers.ts`; o caminho existe e está correto                                            |
| Campanhas enviam template                    | `enviarMensagem` sempre chama `enviarTexto`; `enviarTemplate` existe na porta e nos três adapters e **nada o chama** |

A segunda é um defeito real e bloqueia produção: fora da janela de 24h a Meta
recusa texto livre, o que atinge campanhas e todas as automações proativas. A
coluna `crc_templates.provider_nome` já existe para guardar o nome aprovado.
Está registrado em `docs/crc/CUSTO-DAS-MENSAGENS.md`.

**Consequência para o CRC AI OS:** a fatia que liga envio real do agente
(segunda fatia em diante) depende de resolver isto antes, ou o agente vai
produzir mensagens que a Meta recusa.

---

## 5. O que o Dental Office não dá — e a arquitetura tem de aceitar

Da especificação OpenAPI em `docs/crc/dental-office-api/`, 59 operações em 14
recursos. Funciona inteiro para paciente, dentista, agenda, cadeira, falta,
cancelamento, confirmação, disponibilidade e criação/alteração de agendamento.

**Não existe:** financeiro, orçamento, parcela, receita conciliada, webhooks,
sincronização incremental por `updated_since`.

Isso não é uma lacuna a preencher com criatividade. É um limite:

- nada de integração financeira inventada;
- CSV segue sendo a fonte de orçamento e cobrança;
- "valor potencial" nunca vira "receita";
- paciente em varredura completa periódica, agenda com frequência maior;
- **a frequência do motor É o tempo de resposta do sistema** — não há evento
  empurrado para reagir.

---

## 6. Riscos identificados

| Risco                           | Por quê                                      | Mitigação                                               |
| ------------------------------- | -------------------------------------------- | ------------------------------------------------------- |
| Duplicar motor de automação     | O Deskcomm traz fila, cron e worker próprios | Tool/Workflow compilam para `automacao/motor.ts`        |
| Agente contornar `mensagens.ts` | É o caminho mais curto ao copiar do Deskcomm | Envio só como Tool; before-send obrigatório             |
| Bundle cliente inchar           | O AI SDK é server-only                       | `await import()` dentro do handler, como o resto do CRC |
| Segredo em log                  | BYOK entra nesta fase                        | Envelope encryption; chave nunca logada, nem truncada   |
| Custo de modelo sem teto        | Turnos agentic gastam mais que classificação | Budget checado ANTES da chamada, não depois             |
| Tenant vazado no RAG            | Filtro de tenant aplicado depois da busca    | `organization_id` entra na query, não no filtro         |

---

## 7. Credenciais externas

Presentes em `.env`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE`, `SUPABASE_ANON`,
`SUPABASE_BUCKET`, `CRC_SESSION_SECRET`, `CRON_SECRET`, `OPENAI_API_KEY`,
`CRC_ADMIN_*`.

**Ausentes e necessárias para o CRC AI OS:** chave Anthropic, chave Google, e a
chave-mestra de criptografia do BYOK. Nenhuma delas bloqueia a Fase 0 nem a
primeira fatia — o sandbox de IA cobre o caminho inteiro sem provider real.

---

## 8. O que esta auditoria conclui

O JP CRC **não é um MVP vazio**. Ele já tem domínio puro, casos de uso,
chokepoints, motor durável, idempotência em constraint, RBAC, auditoria, flags e
kill switches.

O que falta para virar CRC AI OS não é fundação — é **o runtime agentic por
cima da fundação que já existe**. O porte do Deskcomm deve entrar por dentro
desses chokepoints, e qualquer módulo que tente contorná-los está sendo portado
errado.
