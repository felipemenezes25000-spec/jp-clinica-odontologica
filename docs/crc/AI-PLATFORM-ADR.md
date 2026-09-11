# Decisões de arquitetura — CRC AI OS

Cada decisão aqui é uma porta que se fecha. Estão registradas com a alternativa
que foi descartada, porque decisão sem alternativa registrada vira dogma e
ninguém sabe mais se ainda faz sentido.

Estado: **aceitas na Fase 0**, antes de qualquer código de runtime.

---

## ADR-01 — O runtime agentic vive dentro do CRC, não ao lado

**Decisão.** Novo módulo `src/lib/crc/ia-platform/`, seguindo a direção de
dependência existente. Infra server-only em `integracoes/ia/` e `servidor/ia/`.

**Alternativa descartada.** Subir o Deskcomm como serviço separado e integrar por
API. Descartada porque dobraria o custo operacional (segunda app, segundo banco,
segundo deploy), duplicaria paciente e conversa, e colocaria uma fronteira de
rede no meio de um chokepoint que hoje é uma chamada de função.

---

## ADR-02 — Nada de segundo motor de workflow

**Decisão.** O Workflow Studio compila para `automacao/motor.ts`, ou evolui esse
motor de forma compatível. `crc_automation_enrollments` e `resume_at` continuam
sendo a durabilidade.

**Alternativa descartada.** Portar `queue/` + `cron/` do Deskcomm como motor
paralelo. Descartada porque o CRC já reserva com `FOR UPDATE SKIP LOCKED`, já
tem `resume_at`, versões e modos de autonomia — dois motores significaria duas
verdades sobre "o que está rodando para este paciente".

---

## ADR-03 — Acesso a banco só por `servidor/banco.ts`

**Decisão.** O `db/` do Deskcomm é descartado. Todo acesso segue por PostgREST
através do helper existente, que já recusa UPDATE sem filtro.

**Alternativa descartada.** Cliente Postgres direto para o worker. Fica anotada
como reabrível: se o worker residente provar que PostgREST é gargalo, a decisão
volta à mesa com número na mão.

---

## ADR-04 — Envio é sempre Tool, e Tool sempre passa por `mensagens.ts`

**Decisão.** O agente não conhece Meta, Twilio, WAHA nem a porta. Ele chama
`communication.send_message`, o executor chama o caso de uso, e o caso de uso
aplica opt-out, cooldown, teto, janela, dedupe e auditoria.

**Por quê.** É a regra que impede o modelo de virar um caminho paralelo para
falar com paciente. Também é a regra que o `PORT-NOTES.md` do Deskcomm já tinha
fixado — eles aprenderam isso antes de nós.

---

## ADR-05 — AI SDK entra, mas server-only e por import dinâmico

**Decisão.** `ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `zod`
como dependências de servidor, carregadas por `await import()` dentro do handler.

**Por quê.** O CRC já teve regressão de chunk/ciclo SSR. O padrão de import
dinâmico dentro do `createServerFn` é o que evita reintroduzir o problema, e já
é como `api.ts` carrega tudo que é server-only.

---

## ADR-06 — MCP é camada de contrato, nunca bypass

**Decisão.** O MCP Gateway expõe namespaces (`patient.*`, `appointment.*`, …)
que chamam casos de uso do CRC com `ContextoCrc`, tenant, policy, auditoria,
idempotência e guarda de write-back.

**Alternativa descartada.** MCP falando com o banco. Descartada porque
transformaria o protocolo numa porta dos fundos que ignora RBAC.

---

## ADR-07 — RAG no Postgres com pgvector

**Decisão.** `vector` extension no Supabase, chunks em `crc_ai_chunks`, filtro de
tenant **dentro da query**.

**Alternativa descartada.** Pinecone/Weaviate. Descartada por ausência de
necessidade medida: a base de conhecimento de uma clínica é pequena, e um
serviço externo adicionaria custo, latência e mais um lugar onde dado de
paciente reside.

---

## ADR-08 — WAHA é o quarto adapter, não uma arquitetura nova

**Decisão.** WAHA implementa `PortaMensageria` ao lado de Meta Cloud, Twilio e
sandbox. Quem chama não muda.

**Por quê.** A porta abstrata existe justamente para isto. WAHA traz sessão de
número não-oficial, o que muda o risco operacional — mas não a forma do código.

---

## ADR-09 — Versão publicada é imutável

**Decisão.** Agente, instruções, workflow, fonte de conhecimento, policy e
binding de modelo são versionados. Publicado não se edita no lugar; edita-se um
rascunho e publica-se de novo. Jornada em andamento guarda a versão com que
começou.

**Por quê.** Sem isso, "por que o agente respondeu assim ontem?" não tem
resposta — e é a pergunta que mais vai aparecer.

---

## ADR-10 — Quem é dono da conversa é estado explícito, não inferência

**Decisão.** A conversa tem dono declarado: IA, humano nomeado, ou ninguém. A
Inbox mostra, e o before-send respeita. Um humano assumindo pausa a IA; devolver
é um ato explícito.

**Alternativa descartada.** Inferir por "quem respondeu por último". Descartada
porque produz exatamente o pior caso desta tela: duas respostas simultâneas para
o mesmo paciente.

---

## ADR-11 — Falha nunca vira silêncio

**Decisão.** Todo caminho de falha termina em um estado nomeado: retry seguro,
espera, fallback determinístico, caso humano, tarefa ou pausa controlada.

**Por quê.** É a regra que o CRC já aplica nas jornadas (automação que desiste
cria tarefa) estendida ao runtime. Paciente em limbo é o único desfecho
inaceitável.

---

## ADR-12 — Orçamento é checado ANTES da chamada

**Decisão.** O budget engine recusa a chamada de modelo antes de gastá-la.
Estourar o teto vira handoff humano, não erro.

**Por quê.** Checar depois só serve para descobrir o prejuízo. O Deskcomm chegou
à mesma conclusão — está escrito no `PORT-NOTES.md` deles.
