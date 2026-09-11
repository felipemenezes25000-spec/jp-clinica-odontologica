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

**Decisão.** `vector` extension no Supabase, chunks em `crc_knowledge_chunks`,
filtro de tenant **dentro da query**.

**Como ficou, na Fatia 7.** A tabela chama `crc_knowledge_chunks` (o nome
`crc_ai_chunks` da Fase 0 ficou para trás), e o filtro de tenant vive dentro da
função SQL `crc_buscar_conhecimento` — não numa query montada no TypeScript. A
função também exige `status = 'PUBLICADA'`. As duas condições são parte do `where`
que o índice percorre, e não existe caminho de código capaz de omiti-las: é
justamente o que torna impossível o defeito clássico de RAG multi-tenant, em que
alguém pega os vizinhos mais próximos e filtra depois.

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

---

## ADR-13 — Memória guarda o que foi dito, nunca o que foi concluído

**Decisão.** Uma frase só vira memória se descrever algo que a pessoa **disse** e
que muda o próximo atendimento. Conclusão sobre a pessoa — situação financeira,
temperamento, estado emocional, dado clínico, atributo protegido — é recusada em
código, em `dominio/memoria.ts`, antes de existir linha no banco. A recusa vale
igual para extração de modelo e para frase digitada por uma pessoa da clínica.

**Por quê.** A assimetria de custo. Escrever memória é uma linha; desfazer o
efeito dela não é — a frase já influenciou respostas, já foi lida pela recepção,
e já virou a forma como a clínica enxerga aquela pessoa. Um rótulo como "não tem
dinheiro" não envelhece: fica.

**Alternativa descartada.** Pedir no prompt que o modelo não infira. Descartada
pelo mesmo motivo dos guardrails: prompt é sugestão, condição de código não é
negociável. E, ao contrário do guardrail de envio, aqui o dano não aparece na
hora — aparece meses depois, numa resposta que ninguém liga à memória.

**Consequência aceita.** Radical largo produz falso positivo, e memória legítima
vai ser recusada de vez em quando. É o lado certo do erro; há um grupo de teste
dedicado a frases legítimas justamente para o aperto de um radical não passar a
barrar o que deveria entrar.

---

## ADR-14 — Toda memória extraída tem prazo

**Decisão.** Memória de origem `conversa` nasce com `expira_em`. Só memória
escrita por uma pessoa pode ser permanente. Repetir a mesma frase **renova** o
prazo em vez de criar uma segunda linha.

**Por quê.** Memória sem validade é ficha. Uma preferência de horário de 2026 não
tem por que reger uma conversa de 2029, e quem a disse não foi avisado de que
estava preenchendo cadastro. O prazo é o que faz a memória ser memória.

---

## ADR-15 — Memória invalidada por uma pessoa não ressuscita

**Decisão.** `INVALIDADA` é terminal para a extração automática: a próxima
extração da mesma frase é recusada com código próprio, não regravada. A linha
não é apagada — sai do modelo e continua no registro.

**Por quê.** Sem isso, o botão de corrigir seria decorativo: apagaria a memória
até a próxima mensagem do paciente. E apagar a linha destruiria a resposta para
"por que o agente disse aquilo em março?", que é a pergunta que a memória mais
provoca.

---

## ADR-16 — O supervisor lê, e não pode agir

**Decisão.** O supervisor roda depois do desfecho do turno, produz leitura
estruturada, e escreve em exatamente duas tabelas: `crc_ai_supervisoes` e
`crc_ai_memories`. Não recebe porta de mensageria, não importa o executor de
ferramentas, não muda dono de conversa, não cria tarefa.

**Por quê.** A restrição é o que torna aceitável rodá-lo com modelo barato em
todo turno. Um supervisor que pudesse agir seria um segundo agente com metade da
supervisão do primeiro.

**Detalhe que não é detalhe.** Ele não roda sem `runId`. Quando o id vem nulo, é
porque o índice de dedupe recusou a run — isto é, o evento já foi processado. A
mesma condição que impede a supervisão duplicada impede pagar o modelo duas vezes
pelo mesmo evento.

---

## ADR-17 — Embeddings são uma porta separada de `PortaIa`

**Decisão.** `PortaEmbeddings` é um contrato próprio, com `nome`, `modelo`,
`dimensoes` e `gerar`. `PortaIa` continua com um método só.

**Por quê.** São capacidades diferentes, com modelo, preço e disponibilidade
diferentes. Enfiar embeddings em `PortaIa` obrigaria todo adapter de conversa a
implementar um método sem relação com conversa — o sandbox de conversa é regras
por palavra-chave e não teria o que devolver — e furaria a estreiteza que o
cabeçalho daquele arquivo defende.

**Consequência que vale nomear.** `dimensoes` é campo do contrato porque a coluna
`vector(1536)` é fixa no schema. A aplicação confere antes de ingerir: um modelo
de outra dimensão não "funciona pior", ele faz o Postgres recusar o insert no meio
da troca e deixa metade do documento indexado.

---

## ADR-18 — O conhecimento antigo só é apagado depois de o novo estar pronto

**Decisão.** A ingestão calcula TODOS os vetores em memória antes de tocar no
banco. Só então apaga os pedaços da fonte e grava os novos.

**Por quê.** O caminho ingênuo — apagar e ir gravando — falha calado: o provedor
cai no meio, a clínica fica com metade do documento indexado, e a busca continua
respondendo, só que errado e pela metade. Ninguém vê erro. Com a ordem invertida,
uma falha de provedor não muda nada.

---

## ADR-19 — A reordenação é lexical, e o nome não esconde isso

**Decisão.** Depois da busca vetorial, os candidatos são reordenados por uma nota
que combina a similaridade de cosseno (peso 0,7) com a cobertura de termos da
pergunta (0,3), casando radicais de cinco caracteres ou mais. Há teto de dois
trechos por fonte, e trecho com nota irrisória é descartado em vez de completar a
lista.

**O que isto NÃO é.** Um cross-encoder. Reranking de verdade é um segundo modelo,
com custo e latência por candidato. O que está aqui é desempate por palavra, e
existe para um caso concreto: a pergunta usa um termo exato — "parcelado",
"sábado", "estacionamento" — e o trecho que o contém está atrás de dois trechos
vagamente parecidos.

**Consequência aceita.** O casamento por radical de cinco caracteres liga
"aceitam" a "aceitamos" e "convênio" a "conveniado", e deixa "pagar" e
"pagamento" de fora. Um stemmer de português de verdade (RSLP) são duzentas regras
e uma dependência; a lacuna fica com o vetor, que é o papel dele.
