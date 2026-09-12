# FINAL-ACCEPTANCE — JP CRC OS

> [!NOTE]
> **Este documento é um recorte datado.** Ele descreve o sistema como estava
> quando foi escrito, e vale como registro da decisão daquele momento.
>
> Para o que o CRC faz **hoje**, o mapa é
> [CRC-MAPA-DO-SISTEMA.md](./CRC-MAPA-DO-SISTEMA.md) — gerado do código por
> `node scripts/mapa-do-sistema.mjs`, então não desatualiza sozinho.

Auditoria honesta do que foi entregue, conforme os itens 280 e 283 do Contrato
de Execução.

O item 283 pede estados distintos, e eles são usados aqui com rigor:

| Estado                     | Significado                                                                       |
| -------------------------- | --------------------------------------------------------------------------------- |
| `IMPLEMENTADO`             | O código existe, compila, tem teste, e nunca foi executado contra o serviço real. |
| `TESTADO_COM_SANDBOX`      | Exercitado ponta a ponta contra o adapter local e o banco de teste.               |
| `TESTADO_COM_API_REAL`     | Rodou contra o serviço de verdade.                                                |
| `EM_PRODUCAO`              | Ligado e em uso.                                                                  |
| `BLOQUEADO_POR_CREDENCIAL` | Pronto; falta exclusivamente credencial de terceiro.                              |

**Nada neste documento está marcado como `TESTADO_COM_API_REAL` ou
`EM_PRODUCAO`.** As credenciais do Dental Office e do WhatsApp não foram
fornecidas, e o schema ainda não foi aplicado no Supabase.

> **Para colocar no ar:** o passo a passo completo — SQL, variáveis, credenciais,
> ordem de ativação e verificação de cada etapa — está em
> [ATIVACAO-EM-PRODUCAO](ATIVACAO-EM-PRODUCAO.md).

---

## Quadro geral

| Área                                                                                           | Código | Banco           | Testes             | Verificado na tela | Estado                     |
| ---------------------------------------------------------------------------------------------- | ------ | --------------- | ------------------ | ------------------ | -------------------------- |
| Domínio (regras, score, telefone, horário, RBAC)                                               | ✅     | —               | 91 testes          | —                  | `IMPLEMENTADO`             |
| Schema (36 tabelas + cobrança + visões, RLS, índices, RPCs)                                    | ✅     | ⚠️ não aplicado | —                  | —                  | `IMPLEMENTADO`             |
| Conector Dental Office                                                                         | ✅     | ✅              | 38 testes          | —                  | `BLOQUEADO_POR_CREDENCIAL` |
| Sincronização (paginação, falha parcial, transições)                                           | ✅     | ✅              | E2E                | —                  | `TESTADO_COM_SANDBOX`      |
| Motor de eventos                                                                               | ✅     | ✅              | E2E                | —                  | `TESTADO_COM_SANDBOX`      |
| Motor de automação (esperas duráveis, 3 modos)                                                 | ✅     | ✅              | 27 + E2E           | —                  | `TESTADO_COM_SANDBOX`      |
| Seis automações padrão                                                                         | ✅     | ✅              | 27 testes          | —                  | `IMPLEMENTADO`             |
| WhatsApp — porta + Twilio + Meta Cloud + sandbox                                               | ✅     | ✅              | 25 testes          | —                  | `BLOQUEADO_POR_CREDENCIAL` |
| IA (structured output, guardrails, fallback)                                                   | ✅     | ✅              | 23 testes          | —                  | `IMPLEMENTADO`             |
| Orçamentos: leitor CSV, preview, import, varredura                                             | ✅     | ✅              | 27 (leitor de CSV) | ⚠️ sem dados       | `IMPLEMENTADO`             |
| Cobrança de inadimplência (CDC art. 42)                                                        | ✅     | ✅              | 33 (regras)        | ⚠️ sem dados       | `IMPLEMENTADO`             |
| Leads: captura pública, atribuição, speed-to-lead                                              | ✅     | ✅              | 7 testes           | —                  | `IMPLEMENTADO`             |
| Analytics / dashboard do gestor                                                                | ✅     | ✅              | —                  | ⚠️ sem dados       | `IMPLEMENTADO`             |
| Exportação CSV com RBAC                                                                        | ✅     | ✅              | —                  | ⚠️ sem dados       | `IMPLEMENTADO`             |
| Visões salvas (item 147)                                                                       | ✅     | ✅              | 14 testes          | ⚠️ sem dados       | `IMPLEMENTADO`             |
| Cadastro de equipe (itens 37, 74)                                                              | ✅     | ✅              | —                  | ⚠️ sem dados       | `IMPLEMENTADO`             |
| Leitor de jornadas e da simulação (itens 95, 96, 179)                                          | ✅     | ✅              | —                  | ⚠️ sem dados       | `IMPLEMENTADO`             |
| Tarefa manual + atalho `c` (item 149)                                                          | ✅     | ✅              | —                  | ⚠️ sem dados       | `IMPLEMENTADO`             |
| Captura de lead pelo site (com atribuição)                                                     | ✅     | ✅              | 7 testes           | ✅ POST 200        | `IMPLEMENTADO`             |
| Command palette (itens 28, 149)                                                                | ✅     | ✅              | —                  | ⚠️ sem dados       | `IMPLEMENTADO`             |
| Sessão + RBAC                                                                                  | ✅     | ✅              | 9 (dentro dos 91)  | ✅ login           | `IMPLEMENTADO`             |
| Design system                                                                                  | ✅     | —               | —                  | ✅ 3 resoluções    | `IMPLEMENTADO`             |
| Home, Meu trabalho, Inbox, Funil, Pacientes, Gestão, Importar, Automações, Integrações, Equipe | ✅     | ✅              | —                  | ⚠️ sem dados       | `IMPLEMENTADO`             |
| Webhook + inbox pattern (Twilio e Meta)                                                        | ✅     | ✅              | 25 testes          | —                  | `BLOQUEADO_POR_CREDENCIAL` |
| Cron do motor                                                                                  | ✅     | ✅              | —                  | —                  | `IMPLEMENTADO`             |
| Health check / instalação                                                                      | ✅     | ✅              | —                  | —                  | `IMPLEMENTADO`             |
| Testes de fluxo ponta a ponta (item 82)                                                        | ✅     | banco de teste  | 25 testes          | —                  | `TESTADO_COM_SANDBOX`      |

"⚠️ sem dados" significa: a tela compila, entra no build, e não pôde ser aberta
com conteúdo real porque o schema ainda não está no banco.

**310 testes**, em 10 arquivos. `npm run test` roda em ~2 segundos.

---

## O que os testes E2E acharam

Isto é o argumento a favor do item 82, e vale registrar: os três defeitos
abaixo passaram pelos 285 testes unitários e só apareceram com as peças
rodando juntas.

### 1. Causalidade da recuperação (item 62)

`aoConcluirConsulta` fechava qualquer oportunidade aberta do paciente sem
olhar **quando** a consulta aconteceu. Na primeira sincronização de uma base
real — que emite uma conclusão para cada consulta do histórico — isso fecharia
como "recuperada" toda oportunidade recém-aberta e registraria receita que
ninguém recuperou, no primeiro dia de uso.

Corrigido: só fecha o que já existia quando a consulta aconteceu.
`aoCriarAgendamento` ganhou a guarda equivalente (só consulta futura encerra).
Coberto por dois testes de regressão.

### 2. Fora do horário não reagendava

O veredicto `FORA_DO_HORARIO` vinha sem data de retorno. O motor não conseguia
distinguir "espere até amanhã às 9h" de "o provedor falhou" e tratava as duas
como falha transitória — uma jornada bloqueada às 23h tentaria de quinze em
quinze minutos a noite inteira, enchendo o log de erro com algo que não é erro.

Corrigido: o veredicto devolve `proximoInstanteUtil`.

### 3. Relógio pela metade

O motor recebe um `agora` injetável para calcular as esperas, mas o envio
julgava o horário comercial pelo relógio de parede. Um relógio por execução.

---

## O que NÃO foi entregue, explicitamente

Estas são omissões reais, e não estão escondidas em nenhum lugar do código.

### 1. Teste de navegador (a outra metade do item 82)

Os 25 testes de fluxo rodam o sistema inteiro — sincronização, eventos,
handlers, jornadas, política de contato, envio, resposta, encerramento — com
**só o driver de banco** substituído por um Postgres em memória que reproduz os
índices únicos, o índice parcial e as três reservas atômicas.

**Falta** a camada HTTP e o navegador: Playwright contra um ambiente de
verdade. Ele não foi montado porque o schema não está aplicado e as credenciais
não chegaram — um teste que não roda não protege nada. A lacuna está declarada
no cabeçalho de `src/lib/crc/testes/fluxo.test.ts`.

### 2. Agendamento pelo CRC — feito

O fluxo inteiro existe: oferecer horários reais, revalidar antes de gravar,
criar a consulta e cancelar. Escrito contra a especificação OpenAPI publicada
deles e coberto por `contrato.test.ts`, que intercepta o `fetch` e confere URL,
método e corpo.

Falta a credencial. Três travas nascem desligadas — `dental_office_writeback`,
`auto_scheduling` e o kill switch `kill_escritas_do`; com qualquer uma delas
barrando, o aceite do paciente vira tarefa para a recepção, nunca silêncio.

### 3. Segment engine componível (item 146)

O funil filtra por tipo, etapa e responsável, e o filtro vira visão salva. O
item 146 pede filtros componíveis com `AND`/`OR` livres
(`last_appointment > 180 days AND future_appointment = false`). Isso não
existe; o que existe é um conjunto fechado de filtros.

### 4. Estado na URL (item 148)

O `/crc` navega por estado em React, não por rota. É uma decisão registrada em
`src/routes/crc.tsx` (o ciclo de chunk do `docs/INCIDENTE-BUILD-500.md`), e o
custo é este: não dá para mandar o link de uma visão filtrada para um colega.
A visão salva compartilhada cobre parte do caso; o link direto, não.

### 5. Multisseleção de tipo no funil

O filtro aceita **um** tipo por vez, embora o modelo de dados e o servidor já
aceitem vários. Multisseleção acessível exige um componente próprio, e feito
pela metade ele exclui quem navega por teclado.

### 6. Tela de configuração da clínica

`gravarConfiguracao` existe, com auditoria e invalidação de cache, e nenhuma
rota a expõe. Trocar o horário de atendimento ou incluir um feriado exige SQL —
o comando pronto está na Parte D da
[ATIVACAO-EM-PRODUCAO](ATIVACAO-EM-PRODUCAO.md).

### 7. As feature flags não gatilham nada

As cinco flags do item 42 existem como tabela, nascem desligadas e são lidas
para o DTO de Integrações — que não as exibe. Nenhuma altera comportamento.

Não há risco escondido: o que de fato controla o envio é o **modo da
automação** e os **interruptores de emergência**, e os dois funcionam e são
testados. Há uma promessa não cumprida — ou implementar, ou remover para não
sugerirem um controle que não existe.

---

## Pendências de terceiros (item 282)

Nenhuma delas depende de programação.

| O que falta                                                                    | Quem resolve                                         | O que destrava                                                                                                                                     |
| ------------------------------------------------------------------------------ | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rodar `02-crc-schema.sql`, `03-crc-cobranca.sql`, `04-crc-visoes.sql`          | Você, no SQL Editor                                  | **Tudo.** É o único passo manual.                                                                                                                  |
| `DENTAL_OFFICE_BASE_URL` / `CLIENT_ID` / `SECRET` / **`CLINIC_ID`**            | Dental Office (**exige plano Avançado ou Completo**) | Sincronização real, agenda, agendamento                                                                                                            |
| Twilio (`TWILIO_ACCOUNT_SID`, `AUTH_TOKEN`, `WHATSAPP_FROM`) **ou** Meta Cloud | Contratação                                          | Envio e recebimento reais                                                                                                                          |
| Aprovação de templates                                                         | Meta (mesmo via Twilio)                              | Mensagem fora da janela de 24h                                                                                                                     |
| Exportação de orçamentos e de parcelas em aberto                               | Você, no sistema da clínica                          | A tela **Importar** já existe e aceita o CSV                                                                                                       |
| Integração financeira                                                          | Dental Office                                        | Trocar "valor potencial" por receita conciliada. **A API v1.0 não expõe financeiro** — está fora do contrato público, não é questão de credencial. |

O provedor de WhatsApp é escolhido por `WHATSAPP_PROVEDOR=twilio|meta`. Os dois
adapters existem atrás da mesma porta; trocar de um para o outro é uma variável
de ambiente, não uma reescrita.

---

## Auditoria de código (itens 112, 113, 114)

| Verificação                        | Resultado                                                                                                                                |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `TODO` / `FIXME` / `HACK` críticos | **Zero**                                                                                                                                 |
| `catch {}` vazio em fluxo crítico  | **Zero**                                                                                                                                 |
| `any` explícito                    | **Zero**                                                                                                                                 |
| Mock alimentando tela de produção  | **Zero** — os sandboxes recusam subir em produção                                                                                        |
| Botão sem ação                     | **Zero** — todo botão chama server function real                                                                                         |
| Formulário do site → lead no CRC   | ✅ verificado no navegador: `POST /api/crc/lead` → 200, e o WhatsApp abre em seguida                                                     |
| Função sem porta                   | **Duas**, e as duas estão na lista de omissões: `gravarConfiguracao` (número 6) e `flagLigada` (número 7). As outras três ganharam tela. |
| Secret em log                      | **Zero** — `mascarar()` é aplicada antes de qualquer gravação                                                                            |
| `npm run lint`                     | ✅ (3 avisos de `react-refresh`, não bloqueantes)                                                                                        |
| `npm run typecheck`                | ✅ com `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`                                                                |
| `npm run test`                     | ✅ 310 testes                                                                                                                            |
| `npm run build`                    | ✅                                                                                                                                       |

Duas exceções conscientes ao item 113, ambas comentadas no código: `auditar()` e
`registrarIntegracao()` engolem a própria falha e a registram no log. A
alternativa — deixar o erro subir — faria uma indisponibilidade da tabela de
auditoria impedir o atendente de concluir uma tarefa.

---

## Verificação visual (itens 52, 68, 215–217)

Feita em `vite dev`, sem o schema aplicado.

| Verificação                 | Resultado                                               |
| --------------------------- | ------------------------------------------------------- |
| `/crc` renderiza            | ✅ tela de entrada, design system aplicado              |
| 1366×768                    | ✅ sem overflow                                         |
| 1920×1080                   | ✅ sem overflow                                         |
| 375×812 (mobile)            | ✅ `scrollWidth === innerWidth`, sem rolagem horizontal |
| Console em `/crc`           | ✅ zero erros                                           |
| **Regressão: site `/`**     | ✅ carrega, zero erros                                  |
| **Regressão: portal `/rh`** | ✅ carrega, zero erros                                  |

O item 206 (não quebrar o RH) está cumprido por construção: tabelas com prefixo
`crc_`, módulos em `src/lib/crc`, CSS inteiramente sob `.crc-app`, e zero
alteração em arquivo existente do site ou do RH.

**Não verificado:** as telas com dados. Elas compilam e entram no build, mas não
puderam ser abertas com conteúdo porque as tabelas `crc_*` não existem no
Supabase. Aplicar o schema destrava essa verificação.

---

## Critérios finais do contrato

| Item | Critério                                                                                           | Situação                                                     |
| ---- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 251  | Dental Office: autentica, pagina, persiste, mapeia status, cria agendamento, trata erro, faz retry | Código completo; `BLOQUEADO_POR_CREDENCIAL`                  |
| 252  | CRC: paciente pesquisável, ficha, oportunidade, tarefas, timeline, filtros, stages, histórico      | ✅ implementado                                              |
| 253  | WhatsApp: envio, recebimento, dedupe, status, opt-out, persistência, falha visível                 | Código completo, dois provedores; `BLOQUEADO_POR_CREDENCIAL` |
| 254  | IA: classifica, schema válido, confiança, fallback, logging, escalonamento, custo                  | ✅ implementado e testado                                    |
| 255  | Automação: trigger, condição, wait durável, ação, saída, retry, idempotência, log, pausa           | ✅ `TESTADO_COM_SANDBOX` ponta a ponta                       |
| 256  | UX: desktop, mobile, sem overflow, estados completos, contraste, teclado                           | ✅ nas telas verificáveis                                    |
| 257  | Produção: migrations aplicadas, env, build, testes, deploy, health, smoke, integrações             | ⚠️ falta aplicar o schema e as credenciais                   |

---

## A frase do item 290

> O projeto estará concluído quando um evento real do Dental Office entrar no
> JP CRC, gerar corretamente uma oportunidade ou automação, produzir a ação
> esperada, receber a resposta do paciente, atualizar os sistemas envolvidos,
> registrar todo o histórico e refletir o resultado nos indicadores.

**Ainda não aconteceu com um evento REAL**, e não pode acontecer sem as
credenciais.

Com um evento de sandbox, acontece a cada `npm run test`: o teste
`fluxo do faltante — item 49` faz a falta virar evento, o evento virar
oportunidade, a oportunidade virar jornada, a jornada esperar duas horas,
mandar a mensagem dentro do horário comercial, receber a resposta do paciente,
encerrar a jornada por conversão e registrar a recuperação — com a política de
contato, o opt-out e os interruptores de emergência exercitados no caminho.

No dia em que a credencial chegar, o que muda é uma variável de ambiente.
