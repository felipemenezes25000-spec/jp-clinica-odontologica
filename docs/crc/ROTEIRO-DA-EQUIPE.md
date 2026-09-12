# O CRC no dia a dia

> [!NOTE]
> **Este documento é um recorte datado.** Ele descreve o sistema como estava
> quando foi escrito, e vale como registro da decisão daquele momento.
>
> Para o que o CRC faz **hoje**, o mapa é
> [CRC-MAPA-DO-SISTEMA.md](./CRC-MAPA-DO-SISTEMA.md) — gerado do código por
> `node scripts/mapa-do-sistema.mjs`, então não desatualiza sozinho.

Para quem vai usar o sistema todo dia. Cinco minutos de leitura.

Se você quiser entender o sistema por dentro, o
[MANUAL-COMPLETO](MANUAL-COMPLETO.md) explica tudo. Este aqui é outra coisa:
é a sua rotina.

---

## O que o sistema faz por você

Todo dia a clínica gera sinais: gente que faltou, que desmarcou, que sumiu, que
deveria ter voltado, que pediu informação pelo WhatsApp. Antes, achar essas
pessoas dependia de alguém lembrar e ter tempo.

Agora o sistema procura sozinho, conversa com quem dá para conversar por
mensagem, e **traz para você só quem precisa de gente**.

Você não precisa procurar ninguém. A lista chega pronta.

---

## Sua rotina

### De manhã, ao abrir

Abra o **Início**. A primeira frase responde o dia:

> _"16 pacientes precisam da sua atenção agora. Outros 82 estão sendo
> trabalhados automaticamente."_

Logo abaixo está a fila, **já na ordem certa**. Quem está no topo é quem tem
mais chance de fechar hoje — não é ordem por data.

O primeiro da lista vem com o **porquê aberto**: uma barrinha mostrando de onde
veio a nota. _Faltou +26, disse que quer marcar +25, respondeu há pouco +18._
Nos outros, o botão **Por quê?** abre a mesma explicação.

> **Comece do topo e desça.** Se sobrar tempo no fim do dia, ótimo. Se não
> sobrar, você trabalhou o que mais importava — que é o ponto.

### Durante o dia

**Conversas** é o seu WhatsApp. Três colunas:

- **Esquerda:** as conversas. O botão **Só não lidas** esconde o resto.
- **Meio:** a conversa e a caixa de resposta.
- **Direita:** o contexto do paciente.

Antes de abrir qualquer conversa, olhe o **Resumo automático** na coluna da
direita. Ele diz em uma linha o que a pessoa quer — _"Quer remarcar, prefere
quinta de manhã"_ — e economiza a leitura de quinze mensagens.

**Meu trabalho** é a sua lista de tarefas. Cada uma nasceu de alguma coisa: uma
automação que desistiu, um caso que precisa de gente, um paciente que a
máquina não devia atender sozinha.

- **Assumir** põe a tarefa no seu nome, para ninguém fazer em dobro.
- **Concluir** tira da lista.
- **Abrir** leva à ficha do paciente.

Quando aparecer **"Você está em dia."**, é verdade. Pode fechar a tela.

### Antes de sair

Volte ao **Início**. Se "Precisam de você" estiver em zero, o dia fechou.

Se sobrou alguém, tudo bem — ele continua lá amanhã, e as automações seguem
trabalhando à noite dentro do horário que a clínica configurou.

---

## Como responder no WhatsApp

Escreva na caixa e clique em **Enviar**. É isso.

**Dois cuidados que valem o dia inteiro:**

### A chavinha "Nota interna"

Acima da caixa há um botão que alterna entre **Resposta ao paciente** e **Nota
interna**.

Com **Nota interna** ligada, o que você escreve **fica só no sistema** — o
paciente não recebe. É onde anotar _"ligou nervosa, tratar com cuidado"_ ou
_"combinei desconto de 10%, confirmar com a Dra."_

> Confira sempre qual dos dois está ligado antes de enviar. É o único erro
> desta tela que o paciente enxerga.

### Quando aparecer "outro atendente está respondendo"

Não responda junto. Duas pessoas respondendo o mesmo paciente ao mesmo tempo é
o pior que pode acontecer nesta tela. Fale com quem abriu.

---

## O que você NUNCA precisa fazer

- **Procurar quem faltou.** O sistema acha e já mandou a primeira mensagem.
- **Lembrar de confirmar consulta.** A automação confirma na véspera.
- **Controlar quem já foi contatado.** Ninguém é procurado duas vezes no mesmo
  dia — o sistema não deixa.
- **Se preocupar com horário.** Mensagem automática não sai fora do horário de
  atendimento. Ela **espera** e sai na abertura.
- **Lembrar de parar de mandar mensagem para quem pediu.** Quem diz "não quero
  mais receber" sai na hora, para sempre, sem ninguém precisar fazer nada.

---

## O que o sistema nunca vai fazer sozinho

Isto é regra do sistema, não escolha de quem configurou. Sempre vira tarefa
para uma pessoa:

- Qualquer coisa sobre **dor, remédio ou sangramento**
- **Reclamação**
- **Desconto e negociação de preço**
- Quando a leitura automática **fica em dúvida**
- Quando o telefone **casa com dois pacientes**

Se cair na sua mão um desses, é porque o sistema **decidiu** que precisa de
gente. Não é falha dele.

---

## Quando alguma coisa parecer errada

### "O paciente diz que recebeu mensagem estranha"

Abra a conversa. Todo o histórico está lá, incluindo o que o sistema mandou
sozinho e a que horas. Avise o responsável — o texto das mensagens é editável.

### "Apareceu alguém que não deveria estar na lista"

Clique em **Por quê?**. A explicação mostra de onde veio a nota. Se a razão
estiver errada, avise: é assim que a regra melhora.

### "A lista está vazia e não parece certo"

Olhe a linha no topo do **Início**. Se disser que os dados são de muitas horas
atrás, a sincronização com o Dental Office pode ter parado. Avise o
responsável técnico.

### "Preciso parar tudo agora"

Existe um botão para isso em **Integrações** — ele para as mensagens na hora.
Só quem administra o sistema tem acesso. Se for urgente, ligue.

---

## As três telas que você usa

Tem treze no menu. Você vai viver em três:

| Tela             | Para quê                                       |
| ---------------- | ---------------------------------------------- |
| **Início**       | quem precisa de você hoje, em ordem            |
| **Conversas**    | o WhatsApp, com o contexto do paciente ao lado |
| **Meu trabalho** | suas tarefas                                   |

As outras são para gestão, configuração e relatório. Não precisa entrar nelas
para trabalhar.

---

## Uma coisa que vale saber

O sistema não é uma caixa fechada. Toda decisão dele é explicada — a nota tem
razões, a fila tem ordem, a automação tem motivo.

Se você discordar de alguma coisa, **fale**. A regra é ajustável, e quem senta
na recepção sabe de coisas que nenhum sistema adivinha.
