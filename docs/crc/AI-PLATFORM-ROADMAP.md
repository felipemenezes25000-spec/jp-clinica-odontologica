# Roadmap — CRC AI OS

> [!NOTE]
> **Este documento é um recorte datado.** Ele descreve o sistema como estava
> quando foi escrito, e vale como registro da decisão daquele momento.
>
> Para o que o CRC faz **hoje**, o mapa é
> [CRC-MAPA-DO-SISTEMA.md](./CRC-MAPA-DO-SISTEMA.md) — gerado do código por
> `node scripts/mapa-do-sistema.mjs`, então não desatualiza sozinho.

Ordenado por **dependência**, não por empolgação. Cada fatia é vertical: deixa
algo verificável funcionando ponta a ponta, atrás de flag, em `SHADOW` por
padrão.

A regra que governa a ordem: **nada que envia mensagem real entra antes de a
fundação provar que funciona sem enviar nada.**

---

## Fase 0 — auditoria _(concluída)_

Os quatro documentos: [AUDIT](AI-PLATFORM-AUDIT.md),
[PORT-MATRIX](AI-PLATFORM-PORT-MATRIX.md), [ADR](AI-PLATFORM-ADR.md), este.

Nenhuma mudança de comportamento de produção.

---

## Fatia 1 — Inbound Agent Shadow Turn _(concluída)_

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

## Fatia 2 — Guardrails e envio real protegido _(concluída)_

Cadeia de Gates portada do Deskcomm para `dominio/`, mais o envio real atrás de
flag e de `EXECUTAR`.

**Bloqueador conhecido:** `enviarMensagem` só manda texto livre. Fora da janela
de 24h a Meta recusa. Resolver o roteamento texto↔template antes de ligar envio
proativo do agente — ver [CUSTO-DAS-MENSAGENS](CUSTO-DAS-MENSAGENS.md).

---

## Fatia 3 — Tools de leitura sobre casos de uso existentes _(concluída)_

`patient.*`, `appointment.search_available`, `knowledge.search`. Nenhuma escrita.
Executor aplica policy **depois** da escolha do modelo e **antes** do efeito.

---

## Fatia 4 — Tools de escrita e agendamento pelo agente _(concluída)_

`appointment.offer_slots` → `accept_offer` → `create`, chamando
`aplicacao/agendamento.ts`. As três travas continuam valendo. Revalidação
imediatamente antes de gravar.

---

## Fatia 5 — Human cases e Inbox 2.0 _(concluída)_

`crc_human_cases`, estado de dono da conversa, botões de assumir/devolver/pausar,
resumo automático no handoff.

---

## Fatia 6 — Memória e supervisor _(concluída)_

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

## Fatia 7 — Conhecimento / RAG _(concluída)_

pgvector, ingestão, chunk com metadata, filtro de tenant na query, rerank.

Entregue:

- `supabase/12-crc-conhecimento.sql` — `crc_knowledge_sources`,
  `crc_knowledge_chunks`, índice HNSW e a função `crc_buscar_conhecimento`, que é
  onde o filtro de tenant e a exigência de `PUBLICADA` moram (ADR-07);
- `integracoes/ia/embeddings.ts` — a porta nova, com sandbox determinístico
  (ADR-17);
- `dominio/conhecimento.ts` — corte em parágrafo/frase com sobreposição, e a
  reordenação lexical sobre os candidatos vetoriais (ADR-19);
- `aplicacao/conhecimento.ts` — ingestão que só apaga o antigo depois de o novo
  estar pronto (ADR-18), e busca;
- ferramenta `conhecimento.buscar` no catálogo de LEITURA;
- tela **Conhecimento**: escrever, indexar, publicar, e a caixa que mostra o que
  o agente acharia com uma pergunta de teste.

**O bloqueador que existia e foi resolvido.** `PortaIa` tinha um método só,
`gerarEstruturado`, e nenhuma capacidade de embeddings. A Fase 0 previa isso para
a Fatia 8, junto do model gateway; a solução foi uma porta separada — ver ADR-17,
que também explica por que ela não entrou na `PortaIa`.

**O que esta fatia NÃO é.** O rerank é lexical, não cross-encoder. Ver ADR-19.

---

## Fatia 8 — Model gateway, BYOK e orçamento _(concluída)_

Multi-provider com roteamento por finalidade, credencial cifrada por
organização, teto de gasto checado antes da chamada.

Entregue:

- `supabase/13-crc-modelos-orcamento.sql` — credenciais, rotas, tetos, baldes
  diários de gasto e a função `crc_somar_gasto`, que é atômica de propósito;
- `dominio/orcamento.ts` — a decisão em micro-reais inteiros, com o estado
  `alerta` que avisa antes de a máquina parar;
- `servidor/segredo.ts` — AES-256-GCM, e a honestidade sobre o que ela não
  protege (ADR-22);
- `integracoes/ia/anthropic.ts` — o segundo provedor de verdade, com structured
  output via tool forçada;
- `integracoes/ia/gateway.ts` — rota por finalidade, chave da clínica, e o
  orçamento como DECORADOR da porta (ADR-20, ADR-21);
- `aplicacao/modelos.ts` e `aplicacao/orcamento.ts`;
- tela **Modelos e custo**: gasto de hoje e do mês, limites, rota por tarefa e
  cadastro de chave.

**Quatro finalidades, não uma.** `conversa`, `classificacao`, `supervisor`,
`embeddings`. Um modelo único para as quatro significa pagar o preço da conversa
em toda classificação — que é a chamada de maior volume do CRC.

**O que a troca trouxe de graça.** `turno.ts`, `supervisor.ts` e a classificação
não mudaram uma linha e passaram a respeitar teto de gasto, porque o teto é um
decorador e não uma checagem de chamador.

---

## Fatia 9 — Avaliação, replay e publicação com gate _(concluída)_

Suíte de casos, replay sem efeito externo, e o gate que impede publicar versão
que falhe em segurança, autorização de tool, isolamento de tenant ou handoff
obrigatório.

Entregue:

- `supabase/14-crc-avaliacao.sql` — casos, rodadas e execuções;
- `dominio/avaliacao.ts` — a conferência de expectativa e o gate, com as quatro
  categorias bloqueantes do contrato (ADR-24);
- `ia-platform/replay.ts` — roda um caso sem tocar no mundo (ADR-23);
- `ia-platform/instrucoes.ts` — as instruções do agente saíram de `turno.ts` para
  a avaliação rodar o MESMO prompt;
- `aplicacao/avaliacao.ts` — nove casos que já vêm escritos, as rodadas, e o
  estado do gate;
- o gate ligado em `definirFeatureFlag`: `ai_agente_envio` não LIGA sem rodada
  aprovada e recente (ADR-25);
- tela **Avaliação**: veredicto primeiro, o que impede publicar, o que só avisa.

**O gate tem dente.** É a diferença entre esta fatia e um relatório: com a suíte
reprovada ou vencida, o botão que faz o agente responder pacientes recusa, com o
motivo.

**A categoria `tenant` não tem caso padrão, e a tela diz isso.** O isolamento entre
clínicas hoje é garantido pelo filtro DENTRO de `crc_buscar_conhecimento` e pelos
testes de `conhecimento.test.ts`. Um caso de replay sobre isso mediria um contexto
que o próprio caso montou — não provaria nada. O veredicto reporta a categoria
vazia em vez de fingir cobertura.

---

## Fatia 10 — AI Studio e Workflow Studio _(concluída, com um recorte declarado)_

As telas. Vêm por último de propósito: interface para uma plataforma que ainda
não existe é a forma mais cara de descobrir que o desenho estava errado.

Entregue — **AI Studio**, e ele não é só tela:

- `supabase/15-crc-estudio.sql` — `crc_agent_versions`, com índice parcial de uma
  publicada e um rascunho por clínica, e a coluna `agent_version_id` na rodada de
  avaliação;
- `aplicacao/estudio.ts` — rascunho, publicação e histórico (ADR-26);
- o ciclo fechado: editar cria rascunho → a avaliação roda SOBRE o rascunho →
  publicar exige a aprovação daquele texto → editar de novo apaga a aprovação
  (ADR-27);
- `turno.ts` passa a ler a versão publicada, com fallback para a constante do
  código;
- tela **Estúdio**: o texto do agente, o histórico de versões, e o catálogo de
  ferramentas dizendo qual chave bloqueia cada uma.

**O recorte do Workflow Studio, declarado em vez de disfarçado.** As jornadas já
têm tela (Automações), motor durável e versões — ADR-02 é explícito: o Studio
compila para `automacao/motor.ts`, não traz motor novo. O que esta fatia NÃO
entrega é um editor gráfico de passos. Editar a composição de uma jornada por UI
sem a validação do motor seria a forma mais cara de quebrar o envio de mensagem, e
o valor marginal sobre a tela que já existe é baixo: as dez jornadas do CRC foram
desenhadas com a clínica, e o que muda no dia a dia é o MODO (sombra, recomendar,
executar) — que já é um clique em Automações.

Fica anotado como reabrível, com o critério: quando alguém precisar de uma jornada
que o catálogo não tem, e não antes.

---

## O que fica explicitamente fora, por ora

| Item                        | Por quê                                      |
| --------------------------- | -------------------------------------------- |
| Multi-tenant de plataforma  | A clínica é uma organização                  |
| `CODE_SAFE` no workflow     | Precisa de sandbox antes                     |
| Machine learning nos scores | Falta rótulo e volume; começa determinístico |
| Pinecone/Weaviate           | Sem necessidade medida                       |
| A/B testing                 | Depende de volume que ainda não existe       |
