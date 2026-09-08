# ATIVAÇÃO EM PRODUÇÃO — JP CRC OS

Tudo o que falta para o CRC sair do repositório e entrar na operação da
clínica: o que fazer, em que ordem, com que comando, e como saber que
funcionou.

Este documento é o **caminho de ida**. Depois que o sistema estiver no ar,
quem opera usa o [RUNBOOK](RUNBOOK.md). O que existe e o que não existe está
auditado em [FINAL-ACCEPTANCE](FINAL-ACCEPTANCE.md).

---

## O resumo em uma tela

| Bloco | Depende de quem | Tempo | Sem isso, o que acontece |
|---|---|---|---|
| **A.** Banco, variáveis e instalação | Você | ~40 min | O `/crc` não abre. Nada funciona. |
| **B.** Acesso da equipe | Você, pela tela | ~2 min por pessoa | Só existe o login do administrador. |
| **C.** Credenciais de terceiros | Dental Office e Twilio/Meta | Fora do nosso controle | O CRC abre e fica vazio: sem paciente e sem mensagem. |
| **D.** Horário e política da clínica | Você, via SQL | ~10 min | Vale o padrão: seg–sex 8h–19h, sáb 8h–13h, 1 contato/dia. |
| **E.** Três lacunas de código | Nós | Ver a lista | Nenhuma impede operar. |

**O caminho crítico é o C, e só ele.** A e B se resolvem hoje, pela tela. D é
opcional. E não bloqueia nada. Sem as credenciais do Dental Office e de um
provedor de WhatsApp, o sistema sobe, autentica, mostra as telas — e não tem o
que mostrar.

---

## Parte A — As 40 minutos que só dependem de você

### A.1 Aplicar os três SQL

SQL Editor do Supabase, **nesta ordem**, um de cada vez:

| Arquivo | O que cria |
|---|---|
| `supabase/02-crc-schema.sql` | As 36 tabelas, os índices, o RLS e as três funções de reserva atômica. |
| `supabase/03-crc-cobranca.sql` | `crc_charges` e `crc_payment_agreements` (cobrança de inadimplência). |
| `supabase/04-crc-visoes.sql` | O índice único das visões salvas. |

Os três são **aditivos e idempotentes**: rodar de novo não apaga nada. É o único
passo manual da instalação, e ele existe porque a API REST do Supabase não
executa DDL.

**Como saber que deu certo:** rode no SQL Editor

```sql
select count(*) from information_schema.tables
where table_schema = 'public' and table_name like 'crc_%';
```

Tem que responder **38** — 36 do 02 mais as duas de cobrança do 03. Se
responder menos, algum arquivo não terminou: role a saída do editor procurando
o erro.

### A.2 Cadastrar as variáveis mínimas

Vercel → o projeto → Settings → Environment Variables, ambiente **Production**.
São seis para o CRC subir:

```
CRC_SESSION_SECRET     32+ caracteres aleatórios
CRC_ADMIN_EMAIL        seu e-mail
CRC_ADMIN_SENHA        10+ caracteres
CRON_SECRET            a Vercel gera sozinha
SUPABASE_URL           já existe (o portal de RH usa)
SUPABASE_SERVICE_ROLE  já existe (o portal de RH usa)
```

Gere o segredo de sessão assim:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Se você **já sabe** o id da clínica no Dental Office, cadastre junto agora — a
instalação o usa e você economiza uma volta:

```
DENTAL_OFFICE_CLINIC_ID=
```

Se ainda não sabe, tudo bem: rode a instalação de novo depois de cadastrá-lo. A
rota é idempotente e atualiza o campo.

> **Nenhuma variável do CRC pode ganhar o prefixo `VITE_`.** Esse prefixo faz o
> Vite embutir o valor no JavaScript que o navegador baixa — qualquer visitante
> do site leria a chave.

Faça um **redeploy** depois de cadastrar: variável nova só entra em vigor no
próximo build.

### A.3 Rodar a instalação

```bash
curl -X POST https://SEU-DOMINIO/api/crc/instalar \
  -H "Authorization: Bearer SEU_CRON_SECRET"
```

Ela cria a organização, a clínica, as etapas do funil, os templates e as **oito
automações — todas em rascunho e modo simulação**. Nada é enviado a ninguém.

A resposta traz `proximosPassos` e um campo `avisos`. **Leia os avisos.** É lá
que aparece "nenhum usuário administrador foi criado" se `CRC_ADMIN_EMAIL` ou
`CRC_ADMIN_SENHA` faltaram.

### A.4 Conferir a saúde

```bash
curl https://SEU-DOMINIO/api/crc/saude
```

`{"status":"ok","app":"ok","banco":"ok"}` é o que você quer ver.

`banco: "nao_configurado"` → falta `SUPABASE_URL` ou `SUPABASE_SERVICE_ROLE`.
`banco: "indisponivel"` → as variáveis existem mas a consulta falhou; quase
sempre é o schema não aplicado (Parte A.1) ou a service_role errada.

A rota é pública e **não conta nada além disso** de propósito: um health check
aberto que descreve a infraestrutura é reconhecimento de graça para quem
estiver sondando.

### A.5 Entrar

`https://SEU-DOMINIO/crc`, com o e-mail e a senha do passo A.2.

Você vai ver o sistema inteiro **vazio**. Isso é o esperado: sem as credenciais
da Parte C não existe paciente para sincronizar.

---

## Parte B — Dar acesso à equipe

`/crc` → **Equipe** → **Cadastrar pessoa**. Aba visível só para quem tem o papel
de administração.

Você escolhe nome, e-mail, senha e papel. **Não há e-mail de convite** — não há
remetente configurado, e um convite que não chega é pior do que não existir:
entregue a senha pessoalmente e peça para a pessoa trocá-la com você depois.

**Por que dar um login por pessoa, e não um da clínica:** o item 74 exige saber
QUEM alterou o quê. Com um login compartilhado, cada tarefa concluída, cada
mensagem enviada e cada oportunidade movida fica assinada por "alguém" — e o
histórico, que é metade do valor do sistema, para de responder a única pergunta
que importa quando algo dá errado.

### Os seis papéis

| Papel | O que alcança |
|---|---|
| **Administração** | Tudo, incluindo cadastrar e desativar gente. |
| **Gestão** | A operação inteira, os números e as automações. Não mexe em usuários. |
| **CRC** | A fila, as conversas e as oportunidades. Vê valor de orçamento. |
| **Recepção** | A fila e as conversas do dia. Não vê valor de orçamento. |
| **Dentista** | Pacientes e tarefas clínicas. Não vê a operação comercial. |
| **Marketing** | Campanhas, funil e números. Não abre conversa de paciente. |

A tela mostra a explicação de cada papel embaixo do campo, porque a pergunta
real de quem cadastra é "esta pessoa vai poder ver orçamento?".

### Duas coisas que a tela recusa, e por quê

**Você não desativa a própria conta**, e **o último administrador ativo não pode
ser rebaixado nem desativado**. As duas fecham a porta com a chave do lado de
dentro: não sobraria ninguém para reabrir. A recusa é do servidor, e não da
tela — esconder o botão não impede uma requisição direta.

### Tirar acesso vs. trocar senha

**Tirar acesso** vale na requisição seguinte: o cookie guarda só o id, e o
usuário é relido do banco a cada chamada. Mudar o papel funciona igual — um
rebaixamento não espera o próximo login.

**Trocar a senha NÃO derruba quem já está dentro**, porque o cookie não depende
do hash. A troca serve para quem PERDEU o acesso. Para cortar o acesso de
alguém que saiu da clínica, o botão certo é **Tirar acesso**.

Desativar não apaga: o histórico da pessoa continua assinado com o nome dela.
Apagar o usuário deixaria meses de tarefas e mensagens órfãs.

---

## Parte C — As credenciais de terceiros

Nenhuma delas depende de programação nossa. Enquanto não chegam, a tela de
Integrações mostra "não configurada" e **diz o nome exato da variável que
falta** — em vez de fingir que está funcionando.

### C.1 Dental Office

**O que pedir a eles, exatamente:**

> "Preciso de acesso à API para uma integração de CRM: a URL base do ambiente,
> um `client_id` e um `client_secret` com permissão de **leitura** de pacientes
> e agenda, e o identificador da nossa clínica no sistema. Se houver ambiente de
> homologação, quero as credenciais dele também."

**O que cadastrar na Vercel:**

```
DENTAL_OFFICE_BASE_URL=
DENTAL_OFFICE_CLIENT_ID=
DENTAL_OFFICE_SECRET=
DENTAL_OFFICE_CLINIC_ID=
```

**Verificação, em três passos:**

1. `/crc` → Integrações → o cartão do Dental Office deve dizer "Credenciais
   configuradas".
2. Botão **Testar conexão**. Ele autentica e faz um GET pequeno; nunca altera
   dado.
3. Botão **Sincronizar agora**. Ele traz pacientes **antes** da agenda, sempre —
   um agendamento precisa do paciente para ter dono. A resposta diz quantos
   foram criados, atualizados e falharam.

**O que esperar da primeira sincronização de uma base real:** ela emite um
evento `appointment.completed` para *cada* consulta do histórico. Isso é
intencional — é o que constrói o histórico do paciente. O que **não** acontece
é uma avalanche de mensagem: eventos de falta e de cancelamento antigos são
suprimidos na primeira carga, e a guarda de causalidade impede que uma consulta
antiga feche como "recuperada" uma oportunidade aberta hoje.

Ainda assim: **rode a primeira sincronização com as automações em simulação.**
Elas nascem assim; não mude antes.

### C.2 WhatsApp

Escolha um provedor. Os dois adapters estão prontos atrás da mesma porta;
trocar depois é mudar uma linha.

```
WHATSAPP_PROVEDOR=twilio    # ou meta
```

| | Twilio | Meta Cloud API |
|---|---|---|
| Começa a enviar | Hoje, no sandbox | Depois da verificação do Business Manager (semanas) |
| Exige BM verificado | Não, para testar | Sim |
| Custo | Preço da Meta + taxa da Twilio | Só o preço da Meta |
| Suporte | Humano | Documentação |

**A recomendação é começar pela Twilio** e migrar para a Meta se e quando o
volume justificar. Sair de um mês parado esperando verificação para começar a
recuperar faltante não vale a economia por mensagem.

#### Twilio

```
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=      # no sandbox, +1 415 523 8886
WHATSAPP_WEBHOOK_URL=https://SEU-DOMINIO/api/crc/whatsapp
```

No console da Twilio, em Messaging, aponte o webhook de mensagem recebida para
`https://SEU-DOMINIO/api/crc/whatsapp` (método POST).

> **`WHATSAPP_WEBHOOK_URL` não é opcional, e é a causa nº 1 de webhook
> recusado.** A Twilio assina a URL, não só o corpo. Atrás de um proxy — e a
> Vercel é um — a URL pode chegar ao código como `http` mesmo a chamada tendo
> sido `https`, e aí **todo** webhook é recusado sem pista melhor. Esta variável
> fixa o valor. Ela precisa bater **caractere por caractere** com o que você
> cadastrou no console.

#### Meta Cloud API

```
WHATSAPP_TOKEN=
WHATSAPP_PHONE_ID=
WHATSAPP_APP_SECRET=
WHATSAPP_VERIFY_TOKEN=      # você inventa e repete no painel da Meta
WHATSAPP_API_VERSAO=v21.0
```

Sem `WHATSAPP_APP_SECRET` nenhum webhook é aceito, e isso é proposital: webhook
anônimo permitiria qualquer pessoa inventar "o paciente quer cancelar" — e a
automação obedeceria.

**Verificação (qualquer provedor):**

1. Integrações → o cartão do WhatsApp deve dizer "Twilio configurado" ou "Meta
   Cloud API configurada".
2. Mande uma mensagem **do seu celular** para o número da clínica.
3. Ela tem que aparecer em **Conversas** em segundos. Se não aparecer, veja o
   log da função na Vercel: "assinatura inválida" é a `WHATSAPP_WEBHOOK_URL` ou
   o `APP_SECRET`; "não configurado" é variável faltando.

#### Aprovação de templates

Fora da janela de 24 horas desde a última mensagem do paciente, o WhatsApp só
aceita **template aprovado**. Vale para os dois provedores — a Twilio
intermedia, mas quem aprova é a Meta.

Os textos que precisam ser submetidos estão em
`src/lib/crc/automacao/templates.ts`. São treze:

```
falta_primeiro_contato   falta_segundo_contato    cancelamento_reagendar
confirmacao_consulta     recall_seis_meses        reativacao_inativo
abandono_tratamento      aniversario              orcamento_parado
cobranca_lembrete        cobranca_recente         cobranca_atrasada
cobranca_ja_pago
```

Submeta na categoria **Utility** (não Marketing): a categoria muda o preço e a
tolerância da revisão, e todos estes são utilitários — confirmação, lembrete,
retorno.

**Enquanto os templates não estiverem aprovados**, a automação ainda funciona
para quem escreveu para a clínica nas últimas 24 horas. Para os outros, o envio
falha no provedor e a jornada registra a falha — nada se perde em silêncio.

### C.3 IA (opcional)

Reaproveita a `OPENAI_API_KEY` que o portal de RH já usa. Sem ela o CRC funciona
inteiro — só não pré-lê as conversas, e cada uma vira tarefa humana. A IA é
acelerador, nunca ponto único de falha.

```
OPENAI_MODEL_CRC=gpt-5.6-luna
CRC_USD_BRL=5.5
```

---

## Parte D — Ajustar a clínica

**Hoje isto só se faz por SQL.** A função que grava configuração existe
(`gravarConfiguracao`, com auditoria e invalidação de cache), mas nenhuma tela a
chama. É a lacuna E.1 lá embaixo.

Se o padrão serve, pule esta parte. O padrão é:

| Configuração | Padrão |
|---|---|
| Horário | seg–sex 08:00–19:00, sáb 08:00–13:00, dom fechado |
| Fuso | America/Sao_Paulo |
| Contatos proativos por paciente por dia | 1 |
| Intervalo mínimo entre contatos | 24h |
| Tentativas por jornada | 3 |
| Retorno de rotina | 180 dias |
| Paciente inativo | 240 dias |
| Espera antes de falar com quem faltou | 2h |
| Antecedência da confirmação | 24h |

### Mudar o horário comercial

O índice do vetor `dias` é o dia da semana começando no **domingo**. `null`
fecha o dia. O horário malformado é recusado **inteiro** e o padrão continua
valendo — aceitar pela metade produziria uma clínica com três dias configurados
e quatro fechados sem ninguém ter pedido, e o sintoma seria "a automação parou
de mandar mensagem às quintas".

```sql
insert into public.crc_settings (organization_id, chave, valor)
select id, 'horarioComercial', '{
  "dias": [
    null,
    {"inicio":"09:00","fim":"18:00"},
    {"inicio":"09:00","fim":"18:00"},
    {"inicio":"09:00","fim":"18:00"},
    {"inicio":"09:00","fim":"18:00"},
    {"inicio":"09:00","fim":"18:00"},
    {"inicio":"09:00","fim":"12:00"}
  ],
  "feriados": ["2026-12-25", "2027-01-01"],
  "fuso": "America/Sao_Paulo"
}'::jsonb
from public.crc_organizations where slug = 'jp'
on conflict (organization_id, chave) do update set valor = excluded.valor;
```

Feriado é `AAAA-MM-DD` na data local da clínica. Nenhuma mensagem proativa sai
num dia listado.

### Mudar um número qualquer

```sql
insert into public.crc_settings (organization_id, chave, valor)
select id, 'cooldownHoras', '48'::jsonb
from public.crc_organizations where slug = 'jp'
on conflict (organization_id, chave) do update set valor = excluded.valor;
```

Chaves aceitas: `recallDias`, `recallLongoDias`, `inatividadeDias`,
`orcamentoParadoDias`, `faltaEsperaHoras`, `confirmacaoAntecedenciaHoras`,
`contatosPorDia`, `cooldownHoras`, `tentativasPorJornada`, `envioPorHora`,
`iaConfiancaAutomatica` e `iaConfiancaSugestao` (estas duas de 0 a 1).

Chave desconhecida é **ignorada**, e não é erro: ela pode ser de uma versão
futura. Mas confira a grafia — errar `cooldownHoras` para `cooldownhoras` faz o
ajuste não ter efeito nenhum, em silêncio.

A configuração é cacheada por alguns minutos no servidor. Depois do SQL,
espere a próxima volta do motor ou force um redeploy se precisar do efeito
imediato.

---

## Parte E — O que ainda depende de código nosso

Três lacunas. **Nenhuma impede a operação de começar.**

### E.1 Tela de configuração da clínica — atrapalha a autonomia

Descrito na Parte D. Trocar o horário de atendimento ou incluir um feriado
exige SQL, o que na prática significa exigir a gente. A escrita e a auditoria já
existem (`gravarConfiguracao`); o trabalho é o formulário de horário semanal,
que tem mais detalhe de interface do que parece. **Esforço: médio.**

### E.2 As feature flags não fazem nada

As cinco flags do item 42 (`ai_autopilot`, `auto_scheduling`,
`budget_integration`, `automatic_whatsapp`, `dental_office_writeback`) existem
como tabela, nascem desligadas e são lidas para a tela de Integrações — que não
as exibe. **Nenhuma delas gatilha comportamento.**

O que de fato controla o envio hoje são duas coisas, e as duas funcionam: o
**modo da automação** (Simulação → Só recomenda → Executa) e os **interruptores
de emergência**. Não há risco escondido aqui; há uma promessa não cumprida.
Vale ou implementar as flags, ou removê-las. **Esforço: pequeno nos dois
caminhos.**

### E.3 Agendar pelo CRC

O conector do Dental Office tem `criarAgendamento` e ele é exercitado pelo
sandbox. Falta a tela que escolhe horário e confirma. Hoje a jornada encaminha
para um humano remarcar no sistema da clínica — o que funciona, mas é o passo
manual do fluxo. **Esforço: médio-grande**, e depende de credencial de escrita
no Dental Office, que é diferente da de leitura.

*Também não existem, e estão detalhadas no FINAL-ACCEPTANCE: teste de navegador
(Playwright), segment engine componível do item 146, estado na URL do item 148 e
multisseleção de tipo no funil.*

---

## Parte F — A ordem de ativação

Nada aqui é opinião: cada passo depende do anterior ter dado certo.

### Dia 1 — o sistema no ar

Parte A inteira. Ao final, você entra em `/crc` e vê as telas vazias.
**Verificação:** `/api/crc/saude` responde `ok`, e o login funciona.

### Dia 2 — a base real entra

Assim que as credenciais do Dental Office chegarem: Parte C.1, e
**Sincronizar agora**.

Depois disso, confira à mão, na tela de Pacientes:
- os nomes vieram completos e sem caractere estranho;
- os telefones estão em formato brasileiro e com DDD (quem não tem DDD é
  recusado de propósito — o sistema não adivinha);
- quem tem consulta futura aparece com ela.

**As automações continuam em simulação.** Não mude ainda.

### Dias 3 a 7 — o WhatsApp conectado, e a simulação observada

Parte C.2, incluindo a submissão dos templates (a aprovação leva dias — comece
por ela).

Com o WhatsApp conectado e as automações **ainda em simulação**, o motor roda a
cada dez minutos e registra o que teria enviado.

**Leia esse registro:** `/crc` → Automações → **Ver o que ela fez** → clique numa
jornada. O passo a passo abre com o TEXTO INTEGRAL da mensagem que teria saído,
com as variáveis já substituídas.

O que você está procurando: nome errado, saudação estranha, mensagem indo para
quem não devia, horário fora do expediente. É mais barato descobrir aqui.

### Semana 2 — a primeira automação de verdade

Só a **Recuperação de faltas**, e só ela. É a de menor volume e maior conversão:
poucos pacientes por dia, cada um com motivo claro para responder.

Antes de virar a chave, o checklist do item 258:

- [ ] Sincronização rodando sem falha há pelo menos 3 dias
- [ ] Telefones conferidos por amostragem em Pacientes
- [ ] Textos das mensagens revisados em Automações → Ver o que ela fez
- [ ] Horário comercial conferido (Parte D)
- [ ] Interruptores testados: acione e libere em Integrações
- [ ] Uma mensagem real recebida apareceu em Conversas
- [ ] Alguém de plantão no primeiro dia

Caminho da automação: **Simulação → Só recomenda → Executa**, com pelo menos
alguns dias em cada estágio.

### Semanas 3 em diante — uma automação por vez

```
2. Confirmação de consulta   (volume previsível, resposta imediata)
3. Retorno de rotina         (volume alto — só com as duas acima calibradas)
4. Reagendamento de cancelados
5. Reativação de inativos
6. Aniversário
7. Orçamento parado          (depois de importar a planilha, aba Importar)
8. Cobrança de parcelas      (por último — leia abaixo)
```

**Uma por semana, no máximo.** Duas automações novas ao mesmo tempo tornam
impossível saber qual delas causou o que você está vendo.

### A cobrança fica por último, e não é detalhe

É a única automação que fala de dinheiro que o paciente deve. O **art. 42 do
Código de Defesa do Consumidor** proíbe expor a ridículo e constranger na
cobrança de dívida.

O código já impõe o limite de três contatos, o intervalo de 72 horas entre eles
e a recusa de texto com ameaça ou constrangimento — e uma parcela em negociação
sai da automação e vira assunto de humano. Mas a primeira semana dela merece
alguém lendo cada mensagem que sai.

---

## Parte G — Como saber que está funcionando

| O que | Onde olhar | O que é normal |
|---|---|---|
| O app está de pé | `GET /api/crc/saude` | `{"status":"ok"}` |
| O motor está batendo | Vercel → Logs, filtrando `/api/crc/motor` | Uma execução a cada 10 min, sem 5xx |
| A sincronização está viva | `/crc` → Integrações | "Última sincronização" recente, sem erro |
| As jornadas estão andando | `/crc` → Automações | "Em jornada" > 0 quando há faltantes |
| As mensagens estão saindo | `/crc` → Conversas | Mensagens de saída com status de entrega |
| A recuperação está acontecendo | `/crc` → Gestão | "Saídas por conversão" > 0 |

O cron está declarado em `vercel.json` e chama `/api/crc/motor` a cada 10
minutos. As varreduras diárias (retorno, confirmação, aniversário, orçamento,
cobrança) rodam só na volta das 9h UTC — ≈6h em São Paulo, para as jornadas
nascerem antes do expediente e esperarem a abertura para falar com alguém.

Para forçar uma varredura fora de hora, em teste:

```bash
curl "https://SEU-DOMINIO/api/crc/motor?varrer=1" \
  -H "Authorization: Bearer SEU_CRON_SECRET"
```

---

## Parte H — Como desligar em dez segundos

`/crc` → **Integrações** → Interruptores. São quatro, e o efeito é imediato — a
próxima volta do motor já respeita:

| Interruptor | Quando usar |
|---|---|
| **Pausar envios de WhatsApp** | Mensagem errada saindo. As jornadas continuam avançando e registram o que teriam enviado. |
| **Pausar todas as automações** | Algo sistêmico está errado e você não sabe o quê. Nenhuma jornada avança. |
| **Pausar escritas no Dental Office** | Suspeita de que estamos gravando coisa errada lá. |
| **Pausar ações automáticas da IA** | A IA está classificando mal. As conversas viram tarefa humana. |

Nenhum deles perde trabalho: jornada pausada retoma de onde parou quando você
liberar.

Se precisar parar **tudo, inclusive o cron**, remova a entrada
`/api/crc/motor` de `vercel.json` e faça deploy. Mas os interruptores são mais
rápidos e mais cirúrgicos — prefira-os.

---

## Anexo — todas as variáveis

| Variável | Obrigatória? | Sem ela |
|---|---|---|
| `SUPABASE_URL` | **Sim** | O CRC não abre |
| `SUPABASE_SERVICE_ROLE` | **Sim** | O CRC não abre |
| `CRC_SESSION_SECRET` | **Sim** ¹ | Login indisponível |
| `CRC_ADMIN_EMAIL` | **Sim** | Nenhum usuário é criado |
| `CRC_ADMIN_SENHA` | **Sim** | Nenhum usuário é criado (mín. 10 caracteres) |
| `CRON_SECRET` | **Sim** | O motor responde 503 e a instalação é bloqueada |
| `CRC_ADMIN_NOME` | Não | Vale "Administração" |
| `DENTAL_OFFICE_BASE_URL` | Para sincronizar | Integrações mostra "não configurada" |
| `DENTAL_OFFICE_CLIENT_ID` | Para sincronizar | idem |
| `DENTAL_OFFICE_SECRET` | Para sincronizar | idem |
| `DENTAL_OFFICE_CLINIC_ID` | Para a agenda | A sincronização de agenda não sabe qual unidade consultar |
| `WHATSAPP_PROVEDOR` | Não | Vale `twilio` |
| `TWILIO_ACCOUNT_SID` | Se Twilio | Nada é enviado nem recebido |
| `TWILIO_AUTH_TOKEN` | Se Twilio | idem |
| `TWILIO_WHATSAPP_FROM` | Se Twilio | idem |
| `WHATSAPP_WEBHOOK_URL` | **Se Twilio** | Todo webhook recusado por assinatura |
| `WHATSAPP_TOKEN` | Se Meta | Nada é enviado |
| `WHATSAPP_PHONE_ID` | Se Meta | idem |
| `WHATSAPP_APP_SECRET` | **Se Meta** | Nenhum webhook é aceito |
| `WHATSAPP_VERIFY_TOKEN` | Se Meta | O handshake de verificação falha |
| `WHATSAPP_API_VERSAO` | Não | Vale `v21.0` |
| `OPENAI_API_KEY` | Não | Conversas não são pré-lidas; viram tarefa humana |
| `OPENAI_MODEL_CRC` | Não | Vale `gpt-5.6-luna` |
| `CRC_USD_BRL` | Não | Vale 5.5 (só afeta o custo exibido) |
| `DENTAL_OFFICE_SANDBOX` | Não | **Ignorada em produção**, por trava de código |
| `WHATSAPP_SANDBOX` | Não | **Ignorada em produção**, por trava de código |
| `CRC_IA_SANDBOX` | Não | **Ignorada em produção**, por trava de código |

¹ Se ausente, o CRC cai na `RH_SESSION_SECRET`. Isso é conveniência de
instalação, não recomendação: com chaves separadas, trocar a do RH não desloga o
CRC, e vazar uma não compromete a outra.

**As três variáveis de sandbox são ignoradas em produção por decisão de
código, não por disciplina de apagá-las.** Um Dental Office de mentira em
produção seria pior do que nenhum, porque a operação acharia que os dados são
reais; um WhatsApp de mentira seria pior ainda, porque ela acharia que as
mensagens saíram.
