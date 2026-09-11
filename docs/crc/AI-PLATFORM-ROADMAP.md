# Roadmap — CRC AI OS

Ordenado por **dependência**, não por empolgação. Cada fatia é vertical: deixa
algo verificável funcionando ponta a ponta, atrás de flag, em `SHADOW` por
padrão.

A regra que governa a ordem: **nada que envia mensagem real entra antes de a
fundação provar que funciona sem enviar nada.**

---

## Fase 0 — auditoria *(concluída)*

Os quatro documentos: [AUDIT](AI-PLATFORM-AUDIT.md),
[PORT-MATRIX](AI-PLATFORM-PORT-MATRIX.md), [ADR](AI-PLATFORM-ADR.md), este.

Nenhuma mudança de comportamento de produção.

---

## Fatia 1 — Inbound Agent Shadow Turn *(concluída)*

**O que prova:** que existe um runtime agentic durável, com contexto, chamada de
modelo, trace e custo — **sem mandar nada para ninguém**.

```
message.received → job durável → contexto → modelo → resposta candidata
                                                   → trace → supervisor básico
```

Critérios de pronto:

- zero outbound real, zero write no Dental Office;
- sobrevive a restart (job durável, não `setTimeout`);
- dedupe de job por constraint;
- `organization_id` vem do job, nunca do payload;
- custo registrado por turno;
- falha vira estado nomeado, nunca silêncio;
- a Inbox mostra a resposta candidata ao admin.

Depende de: nada além do que já existe.

---

## Fatia 2 — Guardrails e envio real protegido *(concluída)*

Cadeia de Gates portada do Deskcomm para `dominio/`, mais o envio real atrás de
flag e de `EXECUTAR`.

**Bloqueador conhecido:** `enviarMensagem` só manda texto livre. Fora da janela
de 24h a Meta recusa. Resolver o roteamento texto↔template antes de ligar envio
proativo do agente — ver [CUSTO-DAS-MENSAGENS](CUSTO-DAS-MENSAGENS.md).

---

## Fatia 3 — Tools de leitura sobre casos de uso existentes *(concluída)*

`patient.*`, `appointment.search_available`, `knowledge.search`. Nenhuma escrita.
Executor aplica policy **depois** da escolha do modelo e **antes** do efeito.

---

## Fatia 4 — Tools de escrita e agendamento pelo agente *(concluída)*

`appointment.offer_slots` → `accept_offer` → `create`, chamando
`aplicacao/agendamento.ts`. As três travas continuam valendo. Revalidação
imediatamente antes de gravar.

---

## Fatia 5 — Human cases e Inbox 2.0 *(concluída)*

`crc_human_cases`, estado de dono da conversa, botões de assumir/devolver/pausar,
resumo automático no handoff.

---

## Fatia 6 — Memória e supervisor *(concluída)*

Memória com origem, confiança, validade e direito de correção. Supervisor
estruturado pós-turno, atrás da flag `ai_supervisor`.

Entregue:

- `dominio/memoria.ts` — a validação que recusa rótulo sobre pessoa, pura e
  testada sem banco (ADR-13, ADR-14);
- `aplicacao/memoria.ts` — repetir renova em vez de duplicar; invalidada não
  ressuscita (ADR-15);
- `ia-platform/supervisor.ts` — uma chamada por turno, produz a leitura
  estruturada **e** as candidatas a memória, e não pode agir (ADR-16);
- memória injetada em `ContextoTurno`, rotulada como "dito antes" e com proibição
  explícita de ser recitada ao paciente;
- Inteligência mostra os três estados da memória, com apagar e confirmar;
- `supabase/11-crc-memoria-supervisor.sql`.

**Dois níveis, e não quatro.** O contrato falava de turno, conversa, paciente e
organização. Turno e conversa saíram: o que vale só dentro de uma conversa já
está na conversa, e duplicá-lo criaria um segundo lugar para a mesma coisa
envelhecer de forma diferente.

---

## Fatia 7 — Conhecimento / RAG

pgvector, ingestão, chunk com metadata, filtro de tenant na query, rerank.

---

## Fatia 8 — Model gateway, BYOK e orçamento

Multi-provider com roteamento por finalidade, credencial cifrada por
organização, teto de gasto checado antes da chamada.

---

## Fatia 9 — Avaliação, replay e publicação com gate

Suíte de casos, replay sem efeito externo, e o gate que impede publicar versão
que falhe em segurança, autorização de tool, isolamento de tenant ou handoff
obrigatório.

---

## Fatia 10 — AI Studio e Workflow Studio

As telas. Vêm por último de propósito: interface para uma plataforma que ainda
não existe é a forma mais cara de descobrir que o desenho estava errado.

---

## O que fica explicitamente fora, por ora

| Item | Por quê |
| --- | --- |
| Multi-tenant de plataforma | A clínica é uma organização |
| `CODE_SAFE` no workflow | Precisa de sandbox antes |
| Machine learning nos scores | Falta rótulo e volume; começa determinístico |
| Pinecone/Weaviate | Sem necessidade medida |
| A/B testing | Depende de volume que ainda não existe |
