# Ativação em produção — JP CRC

> **Reescrito em 12/09/2026, a partir do HEAD.**
>
> A versão anterior deste arquivo dizia que as migrations **05** e **06** eram "a
> próxima ação", que o banco tinha **41 tabelas**, e listava os arquivos de
> schema até o **08**. Nada disso era verdade há meses: o repositório está no
> **28**, e o 05 e o 06 rodaram em produção em setembro de 2025.
>
> Um runbook errado é pior do que runbook nenhum. Quem o seguisse durante um
> incidente perderia tempo rodando SQL que já estava aplicado, e desconfiaria do
> documento inteiro na primeira linha que não batesse.
>
> **Por isso este arquivo quase não tem números.** Onde antes havia "41 tabelas",
> agora há o comando que conta as tabelas. Um número envelhece sozinho; um
> comando não.

---

## 1. Em que estado o sistema está agora

Não confie neste parágrafo: rode.

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE=... npm run schema:status
```

Ele imprime uma linha por arquivo de `supabase/`, com duas colunas que **não
valem o mesmo**:

| Coluna | O que ela responde | Confiança |
|---|---|---|
| `registro` | o que alguém ANOTOU em `crc_schema_migrations` | baixa — é bookkeeping |
| `sonda` | o objeto que a migração cria EXISTE no banco? | alta — é evidência |

Quando as duas discordam, **a sonda vence** — e a discordância em si é o alarme.
O script sai com código 1 se qualquer sonda falhar, então ele serve em CI e em
script de deploy.

Para o estado operacional (fila, pulso, integrações), a tela **Saúde** dentro do
CRC responde melhor que qualquer documento — ver a seção 9.

---

## 2. As migrations

Todas em `supabase/`, **aplicadas em ordem numérica**, à mão, pelo SQL Editor do
Supabase. Cada uma é idempotente: rodar de novo não quebra nada.

```bash
ls supabase/*.sql            # a lista, sempre atual
npm run schema:status        # quais já estão no banco
```

**Depois de qualquer migration**, recarregue o cache do PostgREST:

```sql
notify pgrst, 'reload schema';
```

Sem isso, o Supabase continua servindo o schema antigo e a aplicação recebe 404
em colunas que existem — um sintoma que já custou uma hora de investigação
neste projeto.

### Instalação do zero

```bash
DATABASE_URL=postgres://... node scripts/aplicar-schema.mjs
```

O script aplica tudo na ordem certa e **exclui os arquivos `9x-`**, que são de
teste (`99-teste-apenas.sql` cria uma função que executa SQL arbitrário — ela é
necessária nos testes de integração e é veneno em produção). Para incluí-los,
`--com-teste`, e só num banco descartável.

### O histórico append-only

Migration aplicada **não se edita**. Mudança incremental vira arquivo novo, com
o número seguinte. O motivo está no `supabase/24`: o `23` trocou a chave primária
de `crc_sync_state` e o código continuou com o `on_conflict` antigo — toda
sincronização passou a falhar, e só não quebrou em produção porque a integração
que usaria aquele caminho estava desligada.

---

## 3. Variáveis obrigatórias

Sem estas, o sistema não sobe ou não faz nada.

| Variável | Onde | Para quê |
|---|---|---|
| `SUPABASE_URL` | Vercel | o banco |
| `SUPABASE_SERVICE_ROLE` | Vercel | a chave de serviço — **nunca** com prefixo `VITE_` |
| `CRC_SESSION_SECRET` | Vercel | assina o cookie de sessão. Em produção é exigida; sem ela o login recusa |
| `CRON_SECRET` | Vercel **e** GitHub | autentica `/api/crc/pulso`, `/api/crc/motor` e `/api/crc/instalar` |
| `CRC_URL_PUBLICA` | Vercel | o endereço que o webhook usa para tocar o pulso. **Sem ela, `tocarPulso()` volta sem fazer nada, de propósito e sem log** |

O `CRON_SECRET` precisa estar **nos dois lugares, com o mesmo valor**:

```bash
gh secret set CRON_SECRET          # no repositório, para o workflow
# e o mesmo valor no painel da Vercel
```

---

## 4. Variáveis opcionais

| Variável | Efeito quando ausente |
|---|---|
| `CRC_ADMIN_EMAIL` / `CRC_ADMIN_SENHA` / `CRC_ADMIN_NOME` | a instalação não cria usuário; o resto funciona e o aviso aparece na resposta |
| `CRC_SEGREDO_CHAVE` | credenciais por clínica não podem ser cifradas — o sistema cai para as variáveis de ambiente |
| `DENTAL_OFFICE_BASE_URL` / `_CLIENT_ID` / `_SECRET` | sem sincronização e sem agendamento; o painel de Integrações diz exatamente qual falta |
| `WHATSAPP_PROVEDOR` + credenciais do provedor | sem envio; a automação continua calculando e nada sai |
| `SUPABASE_REST_PREFIXO` | assume `/rest/v1` (Supabase). Use `/` só para PostgREST puro, em teste |
| `DENTAL_OFFICE_SANDBOX` / `WHATSAPP_SANDBOX` | ignoradas em produção, por construção |

### Credenciais por clínica

Desde o `supabase/23` + `28`, WhatsApp e Dental Office podem ser cadastrados
**por unidade**, em `crc_canais_whatsapp` e `crc_integracoes_clinica`. A
resolução é:

```
CLÍNICA  →  ORGANIZAÇÃO  →  AMBIENTE
```

O último degrau **se desliga sozinho** assim que a instalação deixa de ser única:
Dental Office cai fora com mais de uma organização; WhatsApp, com mais de uma
clínica. É compatibilidade com a instalação legada, e não um modo de operação.

---

## 5. GitHub Actions

Três workflows:

| Workflow | Quando | O que prova |
|---|---|---|
| `quality.yml` | todo push | lint, typecheck, testes e build |
| `crc-integracao.yml` | push/PR na main | schema do zero, tenant, concorrência, recovery e os E2E de navegador |
| `crc-pulso.yml` | a cada 5 min (`schedule`) + manual | bate o pulso |

**O `schedule` do GitHub é best-effort.** Sob carga, cinco minutos viram quinze.
Isso é aceitável para o papel dele — rede de recuperação —, e não seria para o
caminho principal. Quem dá a resposta rápida de verdade é o toque que o próprio
webhook do WhatsApp dá no pulso assim que a mensagem chega.

Se o workflow falhar, o log agora diz o **HTTP**: 401 é segredo errado, 404 é
rota fora do ar, 500 é o pulso quebrando por dentro. São três investigações
diferentes.

---

## 6. Vercel

`vercel.json` declara um cron diário para `/api/crc/motor`.

**O plano Hobby aceita no máximo UM cron por dia.** Não é configuração: é o teto
do plano, e agendar mais denso faz o deploy inteiro falhar. É por isso que o
pulso mora no GitHub Actions.

Divisão de trabalho:

| | Quem chama | Frequência | O que faz |
|---|---|---|---|
| **Pulso** | webhook + GitHub Actions | minutos | webhooks, eventos, turnos do agente, jornadas, campanhas |
| **Motor** | cron da Vercel | diário | sincronização do Dental Office, varreduras, prioridades, faxina |

---

## 7. WhatsApp

Ordem de ativação:

1. escolher o provedor (`WHATSAPP_PROVEDOR`: `meta`, `twilio` ou `sandbox`);
2. cadastrar as credenciais — no ambiente, ou em `crc_canais_whatsapp` por
   clínica;
3. apontar o webhook do provedor para **`POST /api/crc/whatsapp/<id do canal>`**
   — o `id` é o uuid da linha em `crc_canais_whatsapp`, e é público: ele só diz
   qual credencial verifica a assinatura;
4. conferir em **Integrações** que o adapter subiu.

O `identificador` do canal é a chave de roteamento **e** a identidade de envio:
`phone_number_id` na Meta, o número que recebeu no Twilio, a sessão no WAHA.
Entrada e saída pelo mesmo número — senão o paciente recebe resposta de uma
clínica que não é a que ele procurou.

**A rota sem canal (`/api/crc/whatsapp`) continua valendo**, e só sob condição:
uma organização — ou várias dentro do MESMO Meta App / conta Twilio — e nenhum
canal com credencial própria cadastrada. Fora disso ela verifica a assinatura com
a credencial errada. A condição está escrita no cabeçalho do arquivo da rota.

**O WAHA exige duas variáveis** (`WHATSAPP_PROVEDOR=waha` **e**
`WAHA_EU_ACEITO_O_RISCO=1`). Ele automatiza o WhatsApp Web e viola os termos de
uso: o número pode ser banido, e com ele some o histórico inteiro de conversas.
A duplicação é atrito de propósito.

---

## 8. Dental Office

1. `DENTAL_OFFICE_BASE_URL`, `_CLIENT_ID`, `_SECRET` (ou a linha em
   `crc_integracoes_clinica`);
2. **Integrações → Testar conexão** — autentica e faz um GET pequeno, nunca
   altera dado;
3. **Sincronizar agora**, ou esperar o motor diário.

O que a sincronização faz, e em que grão:

| | Grão | Por quê |
|---|---|---|
| Pacientes | **organização** | `listarPacientes` devolve a conta inteira; a unidade de cada paciente vem do que ele próprio declara |
| Dentistas e agenda | **clínica** | cada unidade tem os seus, com `external_id` e cursor próprios |

---

## 9. Como confirmar saúde

A tela **Saúde**, dentro do CRC. Ela distingue causas que produzem o mesmo
sintoma — silêncio:

| Sinal | O que significa |
|---|---|
| `pulso_nunca_bateu` | configuração que nunca foi feita: falta `CRON_SECRET` ou `CRC_URL_PUBLICA` |
| `pulso_parado` | rodava e parou. Atenção acima de 12 min sem sucesso, crítico acima de 30 |
| `fila_parada` | há paciente esperando. **Quem consome esta fila é o pulso** |
| `webhook_preso` | mensagem recebida que não foi aplicada |
| `dead_letters_pendentes` | o que já foi perdido e espera alguém à mão |
| `provedor_cortado` | disjuntor aberto: o provedor está fora |
| `teto_estourado` | orçamento de IA atingido |
| `credencial_ausente` | sem canal de saída — tudo termina em nada |
| `varredura_parada` | o cursor da varredura não avança há mais de três dias — **crítico** |
| `ciclo_lento` | ela avança, e a volta pela base não fecha há mais de catorze dias |
| `schema_atrasado` | o banco não registra a migration que este código espera |
| `interruptor_*` | alguém desligou de propósito |

Para destravar a fila agora, sem esperar o agendador:

```bash
curl -X POST https://SEU-DOMINIO/api/crc/pulso -H "Authorization: Bearer $CRON_SECRET"
```

---

## 10. Shadow mode e habilitação progressiva

As flags nascem **todas desligadas**. Cada uma dá um poder a mais para a máquina,
e a ordem importa — ligue de cima para baixo, e só desça um degrau depois de ver
o resultado do anterior na tela **Inteligência**.

| # | Flag | O que passa a acontecer |
|---|---|---|
| 1 | `ai_agente_sombra` | o agente lê, pensa e registra uma resposta candidata. **Nada sai.** |
| 2 | `ai_supervisor` | uma segunda leitura de cada turno, depois do fato. Também não fala com ninguém |
| 3 | `ai_agente_envio` | a resposta do agente chega ao paciente |
| 4 | `ai_autopilot` | ele age sozinho dentro dos guardrails |
| 5 | `ai_agente_escrita` + `dental_office_writeback` | ele passa a MUDAR estado: registrar oferta, escrever no Dental Office |
| 6 | `auto_scheduling` | ele marca consulta sem humano no meio |

**O paciente só recebe da IA no degrau 3.** Até lá, tudo que ela escreve fica em
Inteligência para leitura.

A separação entre `ai_agente_envio` e `ai_agente_escrita` é deliberada: um agente
que só lê e responde é um risco completamente diferente de um que grava na agenda
da clínica.

Antes do degrau 3, a suíte de avaliação precisa ter rodado contra a versão
publicada do agente — é o que o Estúdio exige para publicar.

---

## 11. Kill switches

Em **Integrações**, quatro interruptores:

| Interruptor | Efeito imediato |
|---|---|
| `kill_automacoes` | nenhuma jornada avança; as que começaram ficam onde estão |
| `kill_envios` | nada sai — nem automático, nem manual |
| `kill_escritas_do` | para de criar e alterar agendamento no Dental Office |
| `kill_ia_auto` | o que a IA sugerir passa a exigir um atendente |

Eles são lidos **sem cache**: um interruptor de emergência que demora meio minuto
para valer não é interruptor de emergência.

Ligar pede confirmação; **desligar é imediato**. Quem apertou por engano às 9h
não pode esperar um diálogo para voltar.

---

## 12. Rollback

| Situação | O que fazer |
|---|---|
| A IA está respondendo errado | desligue `ai_autopilot`. A leitura continua; o envio para |
| Uma campanha saiu errada | **Pausar agora** em Integrações (`kill_envios`), depois pause a campanha |
| O deploy quebrou | `vercel rollback` — o schema é append-only e o código anterior continua compatível |
| Uma migration quebrou algo | **não reverta o SQL.** Escreva a próxima migration que corrige. Reverter deixa código novo contra schema velho, que é o pior dos dois mundos |

O código sobe **antes** do SQL, por decisão deste projeto. Por isso os caminhos
novos degradam em vez de parar: o retry cercado volta a ser em dois passos sem o
`supabase/25`, o override por clínica é ignorado sem o `28`. O sinal
`schema_atrasado` torna a janela visível.

---

## 13. Checklist de ativação

- [ ] `npm run schema:status` sem falhas
- [ ] `CRC_SESSION_SECRET`, `CRON_SECRET`, `CRC_URL_PUBLICA` na Vercel
- [ ] `gh secret set CRON_SECRET` com o mesmo valor
- [ ] `POST /api/crc/instalar` com o Bearer — cria organização, funil, templates e automações
- [ ] Login funciona, e a tela Saúde não tem sinal crítico
- [ ] Integrações: Dental Office e WhatsApp conectados
- [ ] **Sincronizar agora** traz pacientes e agenda
- [ ] Suíte de avaliação instalada e uma rodada verde
- [ ] Versão do agente publicada no Estúdio
- [ ] Degrau 1 ligado; degraus 2 a 5 desligados

---

## 14. O que este documento não cobre

- **Contrato das APIs externas** — `docs/crc/dental-office-api/` e
  `docs/crc/openapi-dentaloffice.yml`.
- **Arquitetura** — `docs/crc/ARCHITECTURE.md`.
- **Incidentes** — `docs/crc/RUNBOOK.md`.
- **A auditoria mais recente e o GO/NO-GO** — `docs/crc/AUDITORIA-FINAL-CRC.md`.
