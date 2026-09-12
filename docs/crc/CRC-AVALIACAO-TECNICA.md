# CRC — avaliação técnica

Avaliação do sistema como ele está no repositório, feita lendo o código e
medindo, e não lendo a documentação dele.

```
Commit avaliado     054e88f   (28 commits à frente de origin/main)
Data                2026-09-12
Escopo              src/lib/crc, src/components/crc, supabase/, e2e/
Método              inventário automático + inspeção manual do que foi acusado
```

> **Uma avaliação que só conta arquivo não vale nada.** Onde há número aqui,
> ele foi conferido — e a seção 0 registra o erro que quase entrou neste
> documento por eu ter confiado num `grep`.

---

## 0. Como esta avaliação foi feita, e um erro que quase passou

O inventário é automático: contar módulos, medir linhas, cruzar cada arquivo
com o teste correspondente, procurar leitura de banco sem filtro de organização.

Na verificação de isolamento entre clínicas, o script acusou **72 leituras sem
filtro de tenant** — um número que, escrito aqui sem conferência, seria um
alarme grave e falso.

Fui olhar caso a caso. Todas usavam filtro montado antes (`const filtros = …`)
ou um helper (`daOrganizacao(organizationId)`), que o padrão de busca não
enxerga. **Nenhuma das 72 era real.**

Isso muda o que esta seção conclui sobre o resto do documento: onde aparece um
número, ele passou por inspeção. Onde não deu para inspecionar, está escrito
que não deu.

**E a regra apanhou o próprio autor.** Ao gerar o mapa do sistema (que é
derivado do código, e por isso não erra), três números desta avaliação não
bateram e foram corrigidos:

| Estava escrito           | É de verdade              | Por que errei                                  |
| ------------------------ | ------------------------- | ---------------------------------------------- |
| 23.296 linhas de domínio | **14.346**                | o comando somou os arquivos de teste junto     |
| 91 tabelas               | **88**                    | contei linhas com `crc_`, incluindo comentário |
| 44 telas                 | **44 arquivos, 42 telas** | dois são componentes compartilhados            |

Os três vieram de `grep` sem conferência — exatamente o erro que a seção
acima descreve. Ficam registrados porque um documento que só conta o erro dos
outros não vale nada.

---

## 1. O tamanho

| Camada                 | Quantidade                       |
| ---------------------- | -------------------------------- |
| Domínio (regras puras) | **49 módulos · 14.346 linhas**   |
| Serviços (aplicação)   | 54 módulos                       |
| Automação              | 7 módulos                        |
| Plataforma de IA       | 11 módulos · ~3.650 linhas       |
| Integrações            | 18 arquivos · 5 provedores       |
| Telas                  | 44 arquivos · 42 telas · 28 abas |
| Banco                  | 88 tabelas · 40 migrations       |
| Testes                 | **107 arquivos · 1.754 testes**  |
| E2E (navegador real)   | 7 suítes                         |

Para calibrar: catorze mil linhas de **regra de negócio pura** — sem banco, sem
rede, sem relógio — é mais do que muito produto comercial tem de lógica própria,
fora framework e biblioteca.

---

## 2. O que está sólido

### 2.1. A separação de camadas é real, e não aspiracional

As 14.346 linhas de domínio não tocam banco, rede nem relógio. A regra de
encaixe, de risco de falta e de aceitação são testáveis sem subir nada.

É o que explica 1.754 testes rodarem em ~30 segundos. Um sistema com a regra
embolada no acesso a dados não consegue essa relação entre cobertura e tempo, e
o time acaba não rodando teste.

### 2.2. O isolamento entre clínicas está no banco, não na disciplina

Esta é a parte mais forte do sistema.

`testes/integracao/tenant.test.ts` prova, contra um Postgres de verdade, que o
**banco recusa fisicamente**:

- paciente de uma organização numa clínica de outra;
- conversa pendurada em clínica de outro tenant;
- mensagem numa conversa de outra organização;
- job do agente apontando para conversa alheia;
- dois canais de WhatsApp com o mesmo identificador.

São chaves estrangeiras compostas, não `where` bem escrito. A diferença é entre
_"nós tomamos cuidado"_ e _"não é possível"_ — e só a segunda sobrevive a um
programador com pressa.

O mesmo arquivo verifica que a RLS está ligada em toda tabela com dado de
paciente ou segredo, e que o filtro de tenant está **dentro** das funções do
banco, e não só em quem as chama.

### 2.3. Idempotência é constraint, não cuidado

Não duplicar mensagem, oportunidade e sincronização está em índice único no
Postgres. Código com bug não consegue duplicar — ele recebe erro.

Inclui índice **parcial** (`unique(chave_dedupe) where fechada_em is null`), que
é o que permite uma oportunidade fechada reabrir no mês seguinte sem quebrar a
chave.

### 2.4. Os E2E cobrem o que dói

Não são teste de vitrine. As sete suítes verificam, em navegador real:

- o kill switch ligando e desligando;
- usuário restrito à unidade A **não enxergando** paciente da unidade B — e o
  admin enxergando as duas;
- sessão sobrevivendo a reload, e senha errada não revelando se o e-mail existe;
- o Radar mostrando valor esperado **separado** do potencial;
- a tela ensinando o próximo passo com a base vazia, em vez de mostrar zero.

São exatamente os pontos onde uma falha seria cara ou constrangedora.

### 2.5. A plataforma de IA tem peça que produto comercial costuma não ter

| Módulo       | Linhas | O que faz                                              |
| ------------ | -----: | ------------------------------------------------------ |
| `executor`   |    893 | roda as ferramentas que a IA pediu                     |
| `turno`      |    747 | um turno de conversa, do contexto à decisão            |
| `supervisor` |    367 | avalia a decisão antes de ela sair                     |
| `replay`     |    367 | **reprocessa uma decisão antiga com o código de hoje** |
| `tracing`    |    362 | o rastro de cada chamada                               |
| `contexto`   |    327 | o que a IA vê — e o que ela não vê                     |
| `laco`       |    294 | decidir → executar ferramenta → decidir de novo        |
| `mcp`        |    250 | o protocolo de ferramentas                             |

`replay` é o incomum: permite responder _"por que ela fez isso em março?"_
rodando de novo a mesma entrada. Quase ninguém constrói isso antes de precisar.

### 2.6. O banco-fake valida o schema

Os testes rodam contra um Postgres de mentira que **confere nome de coluna
contra os arquivos SQL** — na escrita e, desde esta semana, também na leitura
(projeção, filtro e ordenação).

Isso pega uma classe inteira de erro que nem TypeScript nem lint alcançam:
`selecionar<T>()` é genérico e devolve o que o chamador prometer. A conferência
encontrou **três colunas inexistentes** nas primeiras horas de uso, uma delas
num arquivo já commitado.

### 2.7. Os comentários explicam o porquê

Incomum o bastante para constar: o código registra a _decisão_, não a mecânica.
"O crédito por confirmação é graduado pelo histórico porque a confirmação de
quem falta cronicamente é evidência fraca" é o tipo de frase que impede alguém
de "simplificar" a regra seis meses depois.

---

## 3. O que é frágil

### 3.1. `cobrancas.ts` — a maior lacuna do sistema

```
862 linhas · 7 escritas no banco · importação de CSV · ZERO teste
```

Nem direto, nem indireto — o nome não aparece em nenhum dos 107 arquivos de
teste.

É o **único módulo que mexe com dinheiro de paciente sem nenhuma rede**. Importa
planilha, classifica status, gera prévia, grava cobrança e roda varredura. Um
erro de parsing aqui não quebra: ele cobra a pessoa errada, ou o valor errado.

Se fosse para consertar uma coisa só neste sistema, seria esta.

### 3.2. Cinco domínios com regra de verdade e sem teste próprio

| Módulo              | Linhas | Funções |
| ------------------- | -----: | ------: |
| `regras.ts`         |    390 |       9 |
| `validar.ts`        |    232 |      13 |
| `churn.ts`          |    233 |       1 |
| `proxima-acao.ts`   |    210 |       2 |
| `melhor-horario.ts` |    207 |       2 |

Os outros doze módulos "sem teste" são tipo, rótulo e formatação — não
preocupam. Estes cinco decidem coisa.

### 3.3. Os dois maiores serviços não têm teste próprio

`mensagens.ts` (1.114 linhas) e `sincronizacao.ts` (943) são cobertos de lado
pelos testes de integração e pelos E2E, o que atenua. Ainda assim, são os dois
maiores arquivos de serviço do sistema e nenhum tem suíte dedicada.

### 3.4. As escritas confiam na leitura de cima — `check-then-act`

A seção 2.2 elogia o isolamento entre clínicas, e ele é mesmo forte. Mas ela
mede as **leituras**. Medindo as escritas, o quadro é outro:

```
100 UPDATE/DELETE analisados
 42 sem organization_id no próprio filtro
```

**Nenhum é explorável hoje.** Inspecionei sete — escolhendo os que mais
poderiam receber um id vindo de fora — e todos fazem leitura escopada antes.
O mais exposto (`publicarDefinicao`, que recebe `automationId` do chamador)
retorna _"Esta automação não existe nesta organização"_ antes de escrever.

O problema não é o hoje, é a forma. **A segurança mora na leitura de cima, e
não na escrita.** Um refactor que mova o `UPDATE` para um helper, ou que
reordene o fluxo, remove a garantia — e nada falha: nenhum teste quebra, o
typecheck passa, e a escrita cruzada só aparece quando alguém reclamar.

A correção é barata e é defesa em profundidade: acrescentar
`organization_id` ao filtro de cada escrita. O custo é uma linha por lugar; o
ganho é a escrita passar a se defender sozinha, em vez de depender de quem a
chama.

> Este achado não estava na primeira versão deste documento porque eu havia
> auditado só as leituras. Vale como nota de método: "as leituras estão
> escopadas" não é o mesmo que "o sistema está escopado".

---

## 4. O risco real, em ordem

### 1º — O sistema não roda

Produção está **28 commits atrás**, com **0 pacientes**, e o CI **nunca rodou**
nesta sequência.

Este é o risco que domina todos os outros, e ele não é técnico. Um sistema com
1.754 testes e isolamento provado no banco, que nunca atendeu um paciente, vale
exatamente o que vale um sistema que não existe.

### 2º — Cobrança sem teste, tocando dinheiro

Ver 3.1. É a única dívida técnica que eu trataria como urgente.

### 3º — `dental_office_writeback` nasce desligado

A flag está `false` por padrão, com o comentário "fica off no primeiro rollout".
Qualquer promessa de "o sistema marca sozinho na agenda" precisa ser corrigida
antes de ser feita — no começo ele **oferece** e uma pessoa marca.

### 4º — Voz e pagamento são arquitetura sem provedor

Os contratos estão completos e corretos (`BLOCKED_EXTERNAL` explícito, o
provedor vazio recusa tudo, `conferirAssinatura` devolve `false` em vez de
lançar). São inúteis até alguém contratar — o que é a decisão certa, mas precisa
ser dita.

---

## 5. O veredito

O que salta nesta avaliação é uma **assimetria**: a qualidade do que está
construído é muito maior do que a maturidade operacional.

Um sistema com isolamento provado por chave estrangeira, replay de decisão de
IA, idempotência em constraint e 1.754 testes — que nunca falou com um paciente.

Isso não é crítica ao trabalho. É a constatação de onde está o gargalo: **não
falta código**. Faltam duas credenciais e um push.

---

## 6. O que eu faria, em ordem

1. **Empurrar os 28 commits e observar o CI.** Nada aqui afirma que ele passa.
2. **Escrever a suíte de `cobrancas.ts`.** Importação de CSV com planilha
   torta, valor com vírgula, linha duplicada, status desconhecido.
3. **Deploy e sincronização do Dental Office.** Enquanto a base tiver 0
   pacientes, nenhum número do sistema significa nada.
4. **Testes para os cinco domínios da seção 3.2**, começando por `regras.ts`,
   que tem nove funções e é o mais chamado dos cinco.
5. Só então: contratar provedor de voz e de pagamento, se e quando fizer
   sentido comercial.
