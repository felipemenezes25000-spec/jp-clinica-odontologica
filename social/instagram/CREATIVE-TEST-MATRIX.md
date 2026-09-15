# Matriz de testes de criativo

> Como descobrir o que funciona sem gastar verba descobrindo nada.

---

## A regra que organiza tudo

> **Uma variável por rodada.**

Trocar hook e CTA no mesmo teste produz um resultado e nenhuma conclusão: você fica sabendo que a versão B ganhou, e não fica sabendo por quê — então não consegue repetir.

É por isso que os 18 vídeos de anúncio deste kit são 6 conceitos × 3 hooks, com **corpo e CTA idênticos** dentro de cada conceito. A única coisa que muda entre `ad01_hooka` e `ad01_hookb` são os primeiros 2,8 segundos.

---

## As quatro variáveis

### 1. Hook — a de maior impacto

| Tipo         | Exemplo                                           |
| ------------ | ------------------------------------------------- |
| pergunta     | "Implante dói?"                                   |
| afirmação    | "Nem todo caso precisa de enxerto."               |
| explicação   | "O implante é a raiz. A prótese é o dente."       |
| local        | "Procurando implante na Zona Norte de São Paulo?" |
| prova social | "4,6 no Google, com 192 avaliações."              |

**O que medir:** retenção de 3 segundos. Abaixo de 25%, o hook está errado — e nenhuma melhoria no resto do vídeo compensa.

### 2. Visual

| Tipo                     | Exemplo no kit                              |
| ------------------------ | ------------------------------------------- |
| profissional falando     | (depende do [`SHOT-LIST.md`](SHOT-LIST.md)) |
| clínica / ambiente       | AD04                                        |
| tratamento / consultório | AD01, AD03                                  |
| tipográfico              | capas `reel-cover-tipografica`              |

**O que medir:** retenção de 50% e custo por conversa.

### 3. CTA

| Tipo            | Formulação                                         |
| --------------- | -------------------------------------------------- |
| avaliação       | "Agende sua avaliação"                             |
| entender o caso | "Quer entender as possibilidades para o seu caso?" |
| WhatsApp direto | "Fale com nossa equipe pelo WhatsApp"              |

**O que medir:** conversas iniciadas e `generate_lead`.

### 4. Duração

| Duração | Quando                                               |
| ------- | ---------------------------------------------------- |
| 15 s    | hook + resposta + CTA — público frio, alcance        |
| 25 s    | o padrão do kit — hook, resposta, itens, nuance, CTA |
| 35 s    | conceitos que precisam de método (AD04, AD05)        |

**O que medir:** conclusão (% que assistiu até o fim).

---

## O plano de quatro rodadas

### Rodada 1 — hook (semanas 1 e 2)

| Item    | Valor                                                   |
| ------- | ------------------------------------------------------- |
| Fixo    | corpo, CTA, duração, público, orçamento                 |
| Varia   | hook A × B × C, dentro de AD01 e AD05                   |
| Métrica | retenção 3 s → custo por conversa                       |
| Decisão | mantém o vencedor de cada conceito; os outros dois saem |

### Rodada 2 — conceito (semanas 3 e 4)

| Item    | Valor                                          |
| ------- | ---------------------------------------------- |
| Fixo    | o hook vencedor de cada                        |
| Varia   | AD01 × AD03 × AD05 (objeção × objeção × local) |
| Métrica | custo por `generate_lead`                      |
| Decisão | o conceito perdedor sai; entra AD04 ou AD06    |

### Rodada 3 — CTA (semanas 5 e 6)

| Item    | Valor                                                              |
| ------- | ------------------------------------------------------------------ |
| Fixo    | hook e conceito vencedores                                         |
| Varia   | "agende avaliação" × "entenda as possibilidades" × WhatsApp direto |
| Métrica | conversas → **comparecimento**                                     |
| Decisão | o que gera comparecimento, não o que gera clique                   |

### Rodada 4 — formato (semanas 7 e 8)

| Item    | Valor                                                            |
| ------- | ---------------------------------------------------------------- |
| Fixo    | tudo o mais                                                      |
| Varia   | vídeo 9:16 × estático 4:5 × carrossel                            |
| Métrica | custo por `generate_lead` e frequência                           |
| Decisão | o estático costuma ganhar em frequência alta; entra como reforço |

---

## Planilha de acompanhamento

Copie esta tabela e preencha semanalmente.

| Rodada | Criativo    | `utm_content` | Impr. | Ret. 3 s | Ret. 50% | Cliques | Conversas | `generate_lead` | Compareceu | CPL | Decisão |
| ------ | ----------- | ------------- | ----- | -------- | -------- | ------- | --------- | --------------- | ---------- | --- | ------- |
| 1      | AD01 hook A | `ad01_hooka`  |       |          |          |         |           |                 |            |     |         |
| 1      | AD01 hook B | `ad01_hookb`  |       |          |          |         |           |                 |            |     |         |
| 1      | AD01 hook C | `ad01_hookc`  |       |          |          |         |           |                 |            |     |         |
| 1      | AD05 hook A | `ad05_hooka`  |       |          |          |         |           |                 |            |     |         |
| 1      | AD05 hook B | `ad05_hookb`  |       |          |          |         |           |                 |            |     |         |
| 1      | AD05 hook C | `ad05_hookc`  |       |          |          |         |           |                 |            |     |         |

**A coluna que decide é "Compareceu".** Ela não vem do Meta: vem da recepção da clínica. Sem ela, o teste otimiza para lead barato que não aparece.

---

## Critérios de corte

| Sinal                                       | Ação                                              |
| ------------------------------------------- | ------------------------------------------------- |
| retenção 3 s < 20% após 2.000 impressões    | pausar — o hook não sustenta                      |
| retenção 50% < 12%                          | cortar 4 s do corpo e reenviar                    |
| custo por conversa 2× acima do melhor irmão | pausar                                            |
| frequência > 2,5 no mesmo público           | trocar o criativo, não o público                  |
| 0 conversas após 5.000 impressões           | pausar o conceito inteiro                         |
| conversas altas e comparecimento zero       | o problema é a qualificação — revisar copy e raio |

---

## Quanto tempo deixar rodar

Nada se decide antes de:

- **2.000 impressões** para julgar retenção de 3 s;
- **5.000 impressões** ou **7 dias** para julgar custo por conversa;
- **30 dias** para julgar comparecimento (o paciente agenda para a semana seguinte).

Pausar no terceiro dia porque "está caro" é o erro mais caro da lista: o algoritmo ainda está aprendendo, e o que se mede é ruído.

---

## O que NÃO testar

| Não teste                                       | Por quê                                        |
| ----------------------------------------------- | ---------------------------------------------- |
| duas variáveis ao mesmo tempo                   | nenhuma conclusão                              |
| cor da marca                                    | a identidade não é variável de teste           |
| promessa × não-promessa                         | a versão com promessa não pode ir ao ar, ponto |
| "com preço" × "sem preço"                       | preço como chamariz não entra nesta fase       |
| público de remarketing por página de tratamento | vedado — `docs/ANUNCIAR.md` §12                |
