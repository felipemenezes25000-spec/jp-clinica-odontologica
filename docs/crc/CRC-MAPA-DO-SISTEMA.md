# CRC — mapa do sistema

**Este arquivo é gerado.** Não edite à mão: rode `node scripts/mapa-do-sistema.mjs`.

Cada linha vem do próprio código — a descrição é a primeira frase do comentário
de cabeçalho do módulo, escrita por quem o construiu. Módulo que some, some
daqui; módulo que nasce, aparece sozinho.

```
Gerado em          2026-09-12
Domínio            49 módulos
Serviços           54 módulos
Automação          7 módulos
Plataforma de IA   11 módulos
Telas              42 componentes
Tabelas            88
Migrations         40
```

> A coluna **Teste** diz se existe um arquivo `.test.ts` ao lado do módulo.
> "não" não significa sem cobertura — vários são exercitados pelos testes de
> integração e pelos E2E. Significa que não há suíte dedicada, e é onde se olha
> primeiro quando algo quebra.

---

## 1. Domínio — as regras, sem banco nem rede

São funções puras: recebem o que já foi lido e devolvem decisão. É o que
permite testar a regra de encaixe ou de risco de falta sem subir nada.

| Módulo            | O que faz                                                                       | Linhas |  Teste  |
| ----------------- | ------------------------------------------------------------------------------- | -----: | :-----: |
| `aceitacao`       | Aceitação de tratamento — o orçamento que ainda pode virar tratamento           |    507 |   sim   |
| `atendimento`     | Qualidade do atendimento — o que a ligação deixou de fazer                      |    338 |   sim   |
| `atribuicao`      | Atribuição de receita — Fase H                                                  |    197 | **não** |
| `autonomia`       | O Centro de Autonomia — quanto o sistema pode fazer sozinho, por domínio        |    343 |   sim   |
| `avaliacao`       | Avaliação e o gate de publicação — Fatia 9                                      |    303 |   sim   |
| `benchmark`       | Benchmarking                                                                    |    186 |   sim   |
| `cadencia`        | A cadência de uma campanha — quantas mensagens já deveriam ter saído            |    137 |   sim   |
| `churn`           | Risco de perder o paciente — Fase H                                             |    234 | **não** |
| `clinicas`        | Clínicas e escopo de acesso — as regras puras                                   |    326 |   sim   |
| `cobranca`        | As regras de cobrança                                                           |    369 |   sim   |
| `configuracao`    | As regras de negócio que a clínica muda sem chamar programador                  |    292 | **não** |
| `conhecimento`    | Conhecimento — como um texto se parte, e como os pedaços se reordenam           |    452 |   sim   |
| `csv`             | Leitor de CSV — a base do importador de orçamentos e de cobranças               |    308 |   sim   |
| `custo`           | O que cada mensagem custa — e por que isso precisa aparecer na tela             |    320 |   sim   |
| `dia-local`       | Que dia é hoje para a clínica — Fase D                                          |    109 |   sim   |
| `direcao`         | A direção de uma mensagem, normalizada num lugar só                             |     85 |   sim   |
| `disjuntor`       | O disjuntor — Fase F, item 26                                                   |    259 |   sim   |
| `encaixe`         | O encaixe — quem chamar para a cadeira que vagou, e quantos por vez             |    366 |   sim   |
| `escolha`         | Entender qual horário o paciente escolheu                                       |    186 |   sim   |
| `experimento`     | A/B — Fase H                                                                    |    216 | **não** |
| `forca-bruta`     | O freio de tentativa de login                                                   |    145 |   sim   |
| `formatar`        | Números, datas e dinheiro do jeito que o Brasil lê — itens 219 a 221            |    192 | **não** |
| `gestao`          | Gestão — o que mudou, o que está apertado, e o que dizer de manhã               |    400 |   sim   |
| `growth-autonomo` | Growth autônomo                                                                 |    238 |   sim   |
| `growth`          | Growth — reputação, indicação, experimento e aprendizado                        |    425 |   sim   |
| `guardrails`      | Os portões que uma mensagem da IA atravessa antes de existir no mundo           |    363 |   sim   |
| `identidade`      | Resolução de identidade — este telefone é de quem?                              |    355 |   sim   |
| `janela-whatsapp` | A janela de 24 horas do WhatsApp — a regra que o CRC estava ignorando           |    103 | **não** |
| `melhor-acao`     | Next Best Action — a decisão, por oportunidade                                  |    515 |   sim   |
| `melhor-horario`  | Best Send Time — Fase H                                                         |    208 | **não** |
| `memoria`         | A memória do agente — e, principalmente, o que ela recusa a guardar             |    377 |   sim   |
| `metas`           | Metas — o objetivo do dono virando plano                                        |    524 |   sim   |
| `no-show`         | Risco de falta — quem provavelmente não vem, e POR QUÊ                          |    267 |   sim   |
| `objecoes`        | As objeções — Fase H                                                            |    222 | **não** |
| `orcamento`       | O orçamento de IA — decidido antes da chamada, nunca depois                     |    149 |   sim   |
| `paciente-360`    | Patient 360 preditivo                                                           |    316 |   sim   |
| `pagamento`       | Política de pagamento — o que a automação pode dizer sobre dinheiro             |    329 |   sim   |
| `prioridade`      | O score que decide a ordem da fila do dia                                       |    156 | **não** |
| `proxima-acao`    | Next Best Action — Fase H                                                       |    211 | **não** |
| `radar`           | O Radar de Receita — quanto dinheiro está parado, e qual a chance de ele voltar |    493 |   sim   |
| `rbac`            | Quem pode o quê                                                                 |    146 | **não** |
| `regras`          | As regras que decidem quem entra em jornada, quem sai, e quem não pode ser      |    391 | **não** |
| `rotulos`         | O dicionário: código interno → palavra que a pessoa lê                          |    225 | **não** |
| `status`          | A ÚNICA porta por onde os códigos numéricos do Dental Office entram             |    165 | **não** |
| `telefone`        | Telefone brasileiro: forma canônica, forma de tela, e a variação do nono        |    136 | **não** |
| `tipos`           | O vocabulário do JP CRC                                                         |    654 | **não** |
| `validar`         | Validação de payload que veio de fora                                           |    233 | **não** |
| `workflow`        | O Workflow Studio — a parte que pensa                                           |    590 |   sim   |
| `xlsx`            | Ler .xlsx sem dependência — o suficiente para uma planilha de exportação        |    334 |   sim   |

---

## 2. Serviços — o que lê o banco e executa

| Módulo               | O que faz                                                                  | Linhas |  Teste  |
| -------------------- | -------------------------------------------------------------------------- | -----: | :-----: |
| `aceitacao`          | Aceitação de tratamento — o serviço                                        |    588 |   sim   |
| `agenda-inteligente` | Agenda Inteligente — a cadeira que vagou, e quem pode ocupá-la             |    830 |   sim   |
| `agendamento`        | Marcar consulta de verdade — a ponte que faltava                           |    814 |   sim   |
| `agent-jobs`         | A fila do agente — Fase B                                                  |    608 | **não** |
| `analytics-ia`       | Analytics de IA — Fase I                                                   |    323 |   sim   |
| `analytics`          | Analytics do gestor — Milestone 9, itens 32 a 35 e 59 a 63                 |    527 | **não** |
| `atividade`          | "O que a IA está fazendo agora" — a narrativa da operação                  |    250 |   sim   |
| `autonomia`          | O Centro de Autonomia — a leitura e a decisão, com o banco no meio         |    356 |   sim   |
| `avaliacao`          | A suíte de avaliação, as rodadas e o gate — Fatia 9                        |    964 | **não** |
| `benchmark`          | Benchmarking interno                                                       |    201 |   sim   |
| `busca`              | Busca global — uma caixa, quatro lugares                                   |    330 |   sim   |
| `campanhas`          | Campanhas — falar com um grupo inteiro sem perder o jeito de falar com um  |    834 |   sim   |
| `casos`              | Casos humanos e dono da conversa — Fatia 5                                 |    287 |   sim   |
| `cerebros`           | Patient Brain e Opportunity Brain — Fase H                                 |    403 |   sim   |
| `clinicas`           | Clínicas e escopo de acesso — o serviço                                    |    465 |   sim   |
| `cobrancas`          | Cobrança de pacientes inadimplentes                                        |    863 | **não** |
| `conhecimento`       | Conhecimento — ingestão e busca. Fatia 7                                   |    385 |   sim   |
| `conversas`          | Para onde uma resposta vai — resolvido num lugar só                        |    156 | **não** |
| `equipe`             | Cadastro de equipe — o item 37 ("cada um deve enxergar somente o           |    291 | **não** |
| `estudio`            | O Estúdio — as versões do texto do agente. Fatia 10                        |    354 |   sim   |
| `estudios`           | Tool Studio, Agent Studio e editor de Workflow — Fase G, itens 27 a 29     |    583 |   sim   |
| `eventos`            | O barramento de eventos do CRC — Milestone 3                               |    270 | **não** |
| `exportacao`         | Exportação em CSV — item 129                                               |    263 | **não** |
| `fila-do-dia`        | A fila do dia — a ponte entre a Fase H e a tela                            |    220 | **não** |
| `financeiro`         | Financeiro e pré-consulta — o serviço                                      |    420 |   sim   |
| `gestao`             | Gestão — o serviço                                                         |    418 |   sim   |
| `growth`             | Growth — o serviço                                                         |    634 |   sim   |
| `handoff`            | O handoff que não pode falhar em silêncio — Fase C                         |    192 |   sim   |
| `heartbeat`          | O batimento dos workers — a prova de que alguém está rodando               |    144 |   sim   |
| `hub-integracoes`    | Integration Hub                                                            |    286 |   sim   |
| `ia`                 | A camada de inteligência — Milestone 6, itens 41 a 48 e 172 a 177          |    664 |   sim   |
| `investimento`       | Quanto custou cada paciente que sentou na cadeira                          |    323 | **não** |
| `leads`              | Leads — itens 33 (atribuição), 157/158 (speed to lead), 170 (distribuição) |    392 |   sim   |
| `marca`              | De quem é a voz — o nome que aparece para o paciente                       |     99 | **não** |
| `melhor-acao`        | Próxima Melhor Ação — o serviço                                            |    426 |   sim   |
| `memoria`            | A memória, persistida — Fatia 6                                            |    300 |   sim   |
| `mensagens`          | MessagingService — itens 36 a 41, 120, 163, 167                            |   1115 | **não** |
| `metas`              | Metas — o serviço                                                          |    851 |   sim   |
| `modelos`            | Chaves da clínica e rotas de modelo — Fatia 8                              |    321 | **não** |
| `omnichannel`        | Omnichannel — a linha do tempo única, a ligação e a identidade             |    632 |   sim   |
| `oportunidades`      | OpportunityService — itens 22, 23, 121, 159, 185                           |    608 | **não** |
| `orcamento`          | O orçamento de IA, persistido — Fatia 8                                    |    412 | **não** |
| `orcamentos`         | Orçamentos — Milestone 8, itens 54 a 58 e 189 a 190                        |    682 | **não** |
| `paciente-360`       | Patient 360 preditivo — a montagem                                         |    350 |   sim   |
| `playground`         | O Playground — Fase G, item 30                                             |    309 |   sim   |
| `primeiros-passos`   | Primeiros passos — o item 58, medido                                       |    112 |   sim   |
| `radar`              | O Radar de Receita — o serviço                                             |    879 |   sim   |
| `repositorios`       | A tradução entre linha do Postgres e modelo do domínio                     |    545 | **não** |
| `saude`              | A saúde dos provedores — Fase F                                            |    645 |   sim   |
| `sincronizacao`      | A sincronização com o Dental Office — Milestone 1, itens 14 a 18           |    944 | **não** |
| `tarefas`            | TaskService — itens 25, 30 do Mega Prompt, 183 do contrato                 |    291 | **não** |
| `visoes`             | Visões salvas — item 147                                                   |    264 |   sim   |
| `webhooks`           | Processamento de webhook — o inbox pattern do item 126 em código           |    626 |   sim   |
| `workflows`          | O Workflow Studio — a parte que fala com o banco                           |    294 |   sim   |

---

## 3. Automação — o que roda sozinho

| Módulo          | O que faz                                                | Linhas |  Teste  |
| --------------- | -------------------------------------------------------- | -----: | :-----: |
| `agente-worker` | O worker do agente — Fase B                              |    329 |   sim   |
| `catalogo`      | As automações iniciais — Milestone 7                     |    441 | **não** |
| `handlers`      | Os handlers de evento — item 27                          |   1336 | **não** |
| `motor`         | O motor de jornadas — Milestone 4                        |    949 | **não** |
| `pulso`         | O pulso — o trabalho que não pode esperar o dia seguinte |    458 |   sim   |
| `templates`     | Templates de mensagem — itens 103, 104, 105              |    318 | **não** |
| `volta-pesada`  | A volta pesada — o trabalho de base, uma vez por dia     |    496 | **não** |

---

## 4. Plataforma de IA

| Módulo        | O que faz                                                                 | Linhas |  Teste  |
| ------------- | ------------------------------------------------------------------------- | -----: | :-----: |
| `contexto`    | O Context Builder — o que o agente sabe, e nada além                      |    328 | **não** |
| `executor`    | O executor de ferramentas                                                 |    894 | **não** |
| `ferramentas` | O registro de ferramentas — as mãos do agente, e as algemas delas         |    608 |   sim   |
| `instrucoes`  | As instruções do agente, num lugar só                                     |     46 | **não** |
| `laco`        | O laço do agente — modelo decide, ferramenta roda, modelo decide de novo  |    295 | **não** |
| `mcp`         | O gateway MCP — Fase F, item 24. Implementa o ADR-06                      |    251 |   sim   |
| `replay`      | Replay — roda um caso de avaliação SEM nenhum efeito no mundo             |    368 |   sim   |
| `supervisor`  | O supervisor — lê o turno DEPOIS que ele aconteceu, e não decide nada     |    368 |   sim   |
| `tipos`       | Os contratos do runtime agentic. Puro: nenhum I/O, nenhum import de infra |    215 | **não** |
| `tracing`     | O trace de um turno — quanto cada etapa demorou e quanto custou           |    363 | **não** |
| `turno`       | O turno do agente — Fatias 1 e 2 do CRC AI OS                             |    748 |   sim   |

---

## 5. Telas

| Módulo                | O que faz                                                                   | Linhas |
| --------------------- | --------------------------------------------------------------------------- | -----: |
| `Agenda`              | —                                                                           |    266 |
| `AtividadeDaIA`       | "O que a IA está fazendo agora"                                             |    144 |
| `Automacoes`          | —                                                                           |    392 |
| `Autonomia`           | Centro de Autonomia — quanto o sistema pode fazer sozinho                   |    196 |
| `Avaliacao`           | Avaliação — o teste que o agente tem que passar antes de falar com paciente |    296 |
| `Benchmark`           | Benchmarking interno                                                        |    170 |
| `Briefing`            | Briefing — a manhã do dono da clínica, dentro da tela de Gestão             |    390 |
| `Campanhas`           | —                                                                           |    645 |
| `Configuracoes`       | As demais chaves. Não são sequência — cada uma é independente das outras, e |    587 |
| `Conhecimento`        | Conhecimento — o que a clínica ensina ao agente                             |    496 |
| `EditorDeJornada`     | O Workflow Studio — o canvas                                                |    913 |
| `Encaixes`            | Encaixes — a cadeira que vagou, e a que provavelmente vai vagar             |    324 |
| `Equipe`              | —                                                                           |    495 |
| `EscopoDoMembro`      | Escopo — em quais unidades esta pessoa trabalha                             |    199 |
| `Estudio`             | Estúdio — onde se escreve o que o agente é, e onde se vê o que ele pode     |    278 |
| `Ferramentas`         | Ferramentas — o que o agente pode fazer, e com quanta autonomia             |    351 |
| `Ficha360`            | Patient 360 preditivo — o bloco da ficha                                    |    223 |
| `Funil`               | —                                                                           |    442 |
| `Gestao`              | —                                                                           |    464 |
| `Home`                | —                                                                           |    404 |
| `HubDeIntegracoes`    | Hub de integrações                                                          |    124 |
| `Importar`            | —                                                                           |    367 |
| `Inbox`               | Quem manda nesta conversa, e o botão para mudar isso                        |    701 |
| `Integracoes`         | —                                                                           |    417 |
| `Inteligencia`        | Inteligência — o que o agente pensou, e o que não chegou a ninguém          |    559 |
| `Investimento`        | Quanto custou cada paciente que sentou na cadeira                           |    329 |
| `JornadasDaAutomacao` | O que a automação fez — e, em simulação, o que ela TERIA feito              |    215 |
| `Metas`               | Metas — o objetivo do dono, com a régua à vista                             |    666 |
| `MeuTrabalho`         | —                                                                           |    388 |
| `ModelosECusto`       | Modelos e custo — a tela do dinheiro da IA                                  |    599 |
| `NovaTarefa`          | Criar tarefa à mão — item 149 (o atalho `c`) sobre uma função que já        |    278 |
| `Pacientes`           | —                                                                           |    649 |
| `Paleta`              | Command palette — item 28, e o item 149 (atalhos de teclado)                |    349 |
| `Playground`          | Playground — testar o agente sem soltá-lo em cima de gente                  |    267 |
| `PrimeirosPassos`     | Primeiros passos — item 58                                                  |    105 |
| `ProximasAcoes`       | Próximas ações — com quem falar primeiro hoje                               |    237 |
| `Radar`               | Radar de Receita — quanto dinheiro está parado, e qual a chance de voltar   |    288 |
| `Recepcao`            | Recepção — o que o atendimento deixou de fazer                              |    133 |
| `Saude`               | Saúde — a tela de sexta às 19h                                              |    216 |
| `Tratamentos`         | Tratamentos — o orçamento que ainda pode virar tratamento                   |    230 |
| `Unidades`            | Unidades — criar, renomear e fechar clínica                                 |    329 |
| `Visoes`              | A barra de visões salvas — item 147                                         |    255 |

---

## 6. Banco

88 tabelas, declaradas no union `Tabela` de
`servidor/banco.ts` — que é a fonte de verdade do código e é verificada
contra o SQL real pelo teste de schema.

`crc_ad_spend` · `crc_agent_jobs` · `crc_agent_versions` · `crc_ai_activity` · `crc_ai_bindings` · `crc_ai_calls` · `crc_ai_credentials` · `crc_ai_gastos` · `crc_ai_memories` · `crc_ai_orcamentos` · `crc_ai_runs` · `crc_ai_spans` · `crc_ai_supervisoes` · `crc_appointments` · `crc_attribution_events` · `crc_audit_logs` · `crc_automation_enrollments` · `crc_automation_logs` · `crc_automation_versions` · `crc_automations` · `crc_autonomia` · `crc_budget_items` · `crc_budgets` · `crc_calls` · `crc_campaign_targets` · `crc_campaigns` · `crc_canais_whatsapp` · `crc_charges` · `crc_clinics` · `crc_contact_log` · `crc_conversations` · `crc_dead_letters` · `crc_dentists` · `crc_eval_casos` · `crc_eval_execucoes` · `crc_eval_rodadas` · `crc_events` · `crc_experiment_assignments` · `crc_experiment_variants` · `crc_experiments` · `crc_feature_flags` · `crc_feedback` · `crc_funnel_events` · `crc_gap_offers` · `crc_goal_actions` · `crc_goal_metrics` · `crc_goals` · `crc_human_cases` · `crc_integracoes_clinica` · `crc_integration_logs` · `crc_jobs` · `crc_knowledge_chunks` · `crc_knowledge_sources` · `crc_leads` · `crc_learnings` · `crc_mcp_tokens` · `crc_messages` · `crc_objections` · `crc_opportunities` · `crc_opportunity_history` · `crc_opportunity_stages` · `crc_organizations` · `crc_patient_identities` · `crc_patient_tags` · `crc_patients` · `crc_payment_agreements` · `crc_payment_intents` · `crc_payment_policies` · `crc_previsit_checks` · `crc_referrals` · `crc_revenue_events` · `crc_runtime_heartbeats` · `crc_saved_views` · `crc_scan_state` · `crc_schedule_gaps` · `crc_scheduling_offers` · `crc_schema_migrations` · `crc_settings` · `crc_settings_clinica` · `crc_sync_falhas` · `crc_sync_jobs` · `crc_sync_state` · `crc_tasks` · `crc_templates` · `crc_user_clinics` · `crc_users` · `crc_waitlist_preferences` · `crc_webhook_inbox`

### Migrations

`00-papeis.sql` · `01-schema.sql` · `02-crc-schema.sql` · `03-crc-cobranca.sql` · `04-crc-visoes.sql` · `05-crc-investimento.sql` · `06-crc-campanhas.sql` · `07-crc-convenio.sql` · `08-crc-agendamento.sql` · `09-crc-ia-platform.sql` · `10-crc-casos-humanos.sql` · `11-crc-memoria-supervisor.sql` · `12-crc-conhecimento.sql` · `13-crc-modelos-orcamento.sql` · `14-crc-avaliacao.sql` · `15-crc-estudio.sql` · `16-crc-foto-de-perfil.sql` · `17-crc-agent-jobs.sql` · `18-crc-atomicidade.sql` · `19-crc-integridade-tenant.sql` · `20-crc-reclaim-da-run.sql` · `21-crc-webhook-inbox.sql` · `22-crc-heartbeat.sql` · `23-crc-canais-whatsapp.sql` · `24-crc-cursor-por-clinica.sql` · `25-crc-retry-atomico-e-tenant-no-inbox.sql` · `26-crc-varreduras-convergentes.sql` · `27-crc-observabilidade.sql` · `28-crc-configuracao-por-clinica.sql` · `29-crc-publico-e-ciclo.sql` · `30-crc-radar-de-receita.sql` · `31-crc-radar-valor-esperado.sql` · `32-crc-agenda-inteligente.sql` · `33-crc-aceitacao-de-tratamento.sql` · `34-crc-metas.sql` · `35-crc-search-path-das-funcoes.sql` · `36-crc-omnichannel-e-voz.sql` · `37-crc-financeiro-e-pre-consulta.sql` · `38-crc-growth.sql` · `99-teste-apenas.sql`

---

## 7. Onde não há suíte dedicada

36 módulos de domínio e serviço não têm arquivo de teste
ao lado. A lista abaixo é o mapa da dívida — ordenada por tamanho, que é a
melhor aproximação de risco quando não se sabe mais nada.

| Módulo            | O que faz                                                                  | Linhas |
| ----------------- | -------------------------------------------------------------------------- | -----: |
| `mensagens`       | MessagingService — itens 36 a 41, 120, 163, 167                            |   1115 |
| `avaliacao`       | A suíte de avaliação, as rodadas e o gate — Fatia 9                        |    964 |
| `sincronizacao`   | A sincronização com o Dental Office — Milestone 1, itens 14 a 18           |    944 |
| `cobrancas`       | Cobrança de pacientes inadimplentes                                        |    863 |
| `orcamentos`      | Orçamentos — Milestone 8, itens 54 a 58 e 189 a 190                        |    682 |
| `tipos`           | O vocabulário do JP CRC                                                    |    654 |
| `agent-jobs`      | A fila do agente — Fase B                                                  |    608 |
| `oportunidades`   | OpportunityService — itens 22, 23, 121, 159, 185                           |    608 |
| `repositorios`    | A tradução entre linha do Postgres e modelo do domínio                     |    545 |
| `analytics`       | Analytics do gestor — Milestone 9, itens 32 a 35 e 59 a 63                 |    527 |
| `orcamento`       | O orçamento de IA, persistido — Fatia 8                                    |    412 |
| `regras`          | As regras que decidem quem entra em jornada, quem sai, e quem não pode ser |    391 |
| `investimento`    | Quanto custou cada paciente que sentou na cadeira                          |    323 |
| `modelos`         | Chaves da clínica e rotas de modelo — Fatia 8                              |    321 |
| `configuracao`    | As regras de negócio que a clínica muda sem chamar programador             |    292 |
| `equipe`          | Cadastro de equipe — o item 37 ("cada um deve enxergar somente o           |    291 |
| `tarefas`         | TaskService — itens 25, 30 do Mega Prompt, 183 do contrato                 |    291 |
| `eventos`         | O barramento de eventos do CRC — Milestone 3                               |    270 |
| `exportacao`      | Exportação em CSV — item 129                                               |    263 |
| `churn`           | Risco de perder o paciente — Fase H                                        |    234 |
| `validar`         | Validação de payload que veio de fora                                      |    233 |
| `rotulos`         | O dicionário: código interno → palavra que a pessoa lê                     |    225 |
| `objecoes`        | As objeções — Fase H                                                       |    222 |
| `fila-do-dia`     | A fila do dia — a ponte entre a Fase H e a tela                            |    220 |
| `experimento`     | A/B — Fase H                                                               |    216 |
| `proxima-acao`    | Next Best Action — Fase H                                                  |    211 |
| `melhor-horario`  | Best Send Time — Fase H                                                    |    208 |
| `atribuicao`      | Atribuição de receita — Fase H                                             |    197 |
| `formatar`        | Números, datas e dinheiro do jeito que o Brasil lê — itens 219 a 221       |    192 |
| `status`          | A ÚNICA porta por onde os códigos numéricos do Dental Office entram        |    165 |
| `prioridade`      | O score que decide a ordem da fila do dia                                  |    156 |
| `conversas`       | Para onde uma resposta vai — resolvido num lugar só                        |    156 |
| `rbac`            | Quem pode o quê                                                            |    146 |
| `telefone`        | Telefone brasileiro: forma canônica, forma de tela, e a variação do nono   |    136 |
| `janela-whatsapp` | A janela de 24 horas do WhatsApp — a regra que o CRC estava ignorando      |    103 |
| `marca`           | De quem é a voz — o nome que aparece para o paciente                       |     99 |
