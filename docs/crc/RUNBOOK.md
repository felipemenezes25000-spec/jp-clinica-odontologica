# RUNBOOK — JP CRC

Para quem opera o sistema no dia a dia: o que fazer quando algo dá errado.

> **Ainda não está no ar?** O caminho de ida — SQL, variáveis, credenciais,
> acesso da equipe, ordem de ativação e verificação de cada etapa — está em
> [ATIVACAO-EM-PRODUCAO](ATIVACAO-EM-PRODUCAO.md). O resumo abaixo cobre só a
> instalação técnica.

---

## Instalação (uma vez)

### 1. Aplicar o schema

Abra o SQL Editor do Supabase e rode, **nesta ordem**:

| Arquivo | O que traz |
| --- | --- |
| `supabase/02-crc-schema.sql` | As 36 tabelas, os índices, o RLS e as funções de reserva atômica. |
| `supabase/03-crc-cobranca.sql` | Cobrança de inadimplência: `crc_charges` e `crc_payment_agreements`. |
| `supabase/04-crc-visoes.sql` | O índice único das visões salvas. |

Os três são **aditivos e idempotentes** — rodar de novo não apaga nada, e o
03 e o 04 podem ser aplicados com o sistema no ar. Este é o **único passo
manual** do processo, e ele existe porque a API REST do Supabase não executa
DDL.

### 2. Cadastrar as variáveis

Na Vercel, em Settings → Environment Variables. A lista completa e comentada
está em `.env.example`. O mínimo para o CRC subir:

```
CRC_SESSION_SECRET     32+ caracteres aleatórios
CRC_ADMIN_EMAIL        o primeiro usuário
CRC_ADMIN_SENHA        10+ caracteres
CRON_SECRET            a Vercel gera sozinha
SUPABASE_URL           já existe (portal de RH)
SUPABASE_SERVICE_ROLE  já existe (portal de RH)
```

### 3. Rodar a instalação

```bash
curl -X POST https://SEU-DOMINIO/api/crc/instalar \
  -H "Authorization: Bearer $CRON_SECRET"
```

Cria a organização, a clínica, as etapas do funil, os templates e as oito
automações — todas em **rascunho + simulação**. Nada é enviado a ninguém.

A resposta lista os próximos passos e avisa se algo faltou.

### 4. Entrar

`https://SEU-DOMINIO/crc` com o e-mail e a senha do passo 2.

---

## Ligar as automações (ordem recomendada)

O item 259 do contrato define a sequência, e ela existe por um motivo: começar
pelo que tem menor volume e maior janela de recuperação.

```
1. Recuperação de faltas   (poucos por dia, alta conversão)
2. Confirmação de consulta (volume previsível, resposta imediata)
3. Retorno de rotina       (volume alto — só depois de os dois acima estarem calibrados)
4. Reagendamento de cancelados
5. Reativação de inativos
6. Aniversário
7. Orçamento parado        (depois de importar a planilha de orçamentos)
8. Cobrança de parcelas    (POR ÚLTIMO — leia o parágrafo abaixo)
```

**A cobrança fica por último de propósito.** É a única automação que fala de
dinheiro que o paciente deve, e o art. 42 do Código de Defesa do Consumidor
proíbe expor a ridículo e constranger. O código já impõe o limite de três
contatos, o intervalo de 72 horas entre eles e a recusa de texto com ameaça ou
constrangimento — mas a primeira semana dela merece alguém lendo cada mensagem
que sai, e uma parcela em negociação sai da automação e vira assunto de
humano.

Para cada uma, o caminho é: **Simulação → Só recomenda → Executa**, com pelo
menos alguns dias em cada estágio.

Em **Automações → Ver o que ela fez**, clique numa jornada: o passo a passo abre
com o TEXTO INTEGRAL da mensagem que saiu — ou que teria saído, quando a
automação está em simulação. É esse texto que você lê antes de ligar o envio:
procure primeiro nome errado, `{{variavel}}` cru e tom inadequado.

### Checklist antes de ligar o primeiro envio (item 258)

- [ ] Sincronização do Dental Office rodando sem falha
- [ ] Telefones normalizados (confira alguns em Pacientes)
- [ ] Textos das mensagens revisados em Automações → Ver o que ela fez
- [ ] Horário comercial conferido
- [ ] Kill switch testado (aciona e libera em Integrações)
- [ ] Inbox testada com uma mensagem real
- [ ] Alguém de plantão para o primeiro dia

---

## Quando algo dá errado

### "A automação não está enviando nada"

Verifique nesta ordem — a maioria dos casos para no primeiro item:

1. **Integrações → Interruptores.** Algum está acionado? Um "Pausar envios"
   esquecido explica o sintoma inteiro.
2. **Automações → a automação.** Está `Ativa`? Está em modo `Executa`? Toda
   automação nasce em Simulação de propósito.
3. **Integrações → WhatsApp.** Está "Não configurada"? A tela nomeia a variável
   que falta.
4. **Horário comercial.** Fora da janela, a mensagem é **adiada**, não perdida.
   Confira o horário do relógio, não o seu.
5. **O debugger da jornada.** Abra o paciente → a jornada mostra passo a passo
   o que aconteceu e por quê. Ele nunca é caixa preta.

### "O Dental Office parou de sincronizar"

1. Integrações → **Testar conexão**. Ela autentica e faz uma leitura pequena.
2. Se falhar com "credenciais recusadas": o secret mudou do lado deles.
3. Se falhar com timeout: é indisponibilidade. O sync tenta de novo sozinho no
   próximo ciclo, e o cursor **não avança** — nada é pulado.
4. A tabela `crc_sync_falhas` tem o `external_id` de cada registro que falhou
   individualmente. Um paciente com data malformada não derruba os outros.

### "Um paciente recebeu mensagem depois de pedir para parar"

Isso é um incidente sério. Investigue assim:

```sql
select opt_out_em, opt_out_motivo from crc_patients where id = '...';
select criado_em, conteudo, remetente from crc_messages
 where patient_id = '...' order by criado_em desc limit 20;
```

Compare os horários. Se a mensagem saiu **depois** do `opt_out_em`, é bug e
precisa de correção — `registrarOptOut` encerra as jornadas na mesma operação
em que marca. Se saiu **antes**, era uma mensagem já em voo, e o comportamento
está correto.

### "Jobs estão presos"

```sql
select id, status, tentativas, travado_ate, ultimo_erro
  from crc_automation_enrollments
 where status in ('ACTIVE','WAITING') and resume_at < now() - interval '1 hour';
```

`travado_ate` no futuro significa que um worker morreu no meio. Ele libera
sozinho quando o tempo passa — o lock é cooperativo, de propósito. Se estiver
travado há muito tempo, `update ... set travado_ate = null`.

### "A automação duplicou"

Não deveria ser possível: a deduplicação é constraint, não código. Se
aconteceu, procure a chave:

```sql
select chave_dedupe, count(*) from crc_opportunities
 where fechada_em is null group by 1 having count(*) > 1;
```

Resultado vazio confirma que a proteção está funcionando e o problema é outro
(por exemplo, duas oportunidades de tipos diferentes para o mesmo paciente, que
é comportamento correto).

### "A IA está dando erro"

Não é urgente. O sistema opera sem ela: cada conversa vira tarefa humana, e a
Inbox continua funcionando. Verifique em Integrações; o custo e as falhas ficam
em `crc_ai_calls`.

---

## Onde olhar

| Pergunta | Onde |
|---|---|
| O que falhou de vez? | `crc_dead_letters` (status PENDENTE) |
| Quem mudou o quê? | `crc_audit_logs` |
| O que a integração respondeu? | `crc_integration_logs` |
| O que a jornada fez? | Debugger da jornada, na ficha do paciente |
| Quanto a IA custou? | `crc_ai_calls` |
| A sincronização está em dia? | Integrações → Sincronização |
| O sistema está de pé? | `GET /api/crc/saude` |

Todo log da aplicação sai em JSON no stdout da Vercel, com `requestId` para
correlacionar as linhas de um mesmo pedido.

---

## Interruptores de emergência

Integrações → Interruptores. Nada é perdido: o que estava em andamento continua
de onde parou quando você liberar.

| Interruptor | Quando usar |
|---|---|
| Pausar todas as automações | Algo sistêmico está errado e você não sabe o quê |
| Pausar envios de WhatsApp | Suspeita de mensagem indevida; as jornadas seguem registrando |
| Pausar escritas no Dental Office | O CRC pode estar criando agendamento errado |
| Pausar ações automáticas da IA | Classificação claramente ruim |

Todo acionamento é auditado com nome e horário.

---

## Rollback

- **Código:** a Vercel promove o deploy anterior. Nenhuma migration deste
  módulo é destrutiva; o schema anterior continua compatível.
- **Automação:** volte o modo para Simulação. Efeito imediato, inclusive nas
  jornadas em voo.
- **Jornada individual:** encerre pela ficha do paciente.
- **Tudo de uma vez:** o interruptor "Pausar todas as automações".
