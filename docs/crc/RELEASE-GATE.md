# O portão de release da `main`

> Estado medido em **13/09/2026**, a partir da API do GitHub e dos check-runs do
> commit `1362da1`. Não é opinião: os comandos que produziram cada número estão
> ao lado de cada afirmação, e podem ser repetidos.

## O que aconteceu

O commit `1362da1` entrou na `main` com o workflow **Quality vermelho**:

```
18:14  error  Delete `⏎···`  prettier/prettier
✖ 6 problems (1 error, 5 warnings)
```

O erro em si é trivial — uma quebra de linha a mais em `TeamSection.tsx`, fora do
CRC, corrigida em `32e13c4`. O que **não** é trivial é o fato de um HEAD vermelho
ter chegado na `main` sem nada no caminho dizer não.

## Por que a proteção não segurou

Três causas independentes, e qualquer uma delas sozinha já bastaria.

### 1. O check exigido tem um nome que ninguém mais reporta

```bash
gh api repos/felipemenezes25000-spec/jp-clinica-odontologica/branches/main/protection/required_status_checks --jq '.contexts[]'
```

```
lint, typecheck, tests and build
schema do zero, tenant, concorrência e recovery      <-- ninguém reporta isso
```

```bash
gh api repos/felipemenezes25000-spec/jp-clinica-odontologica/commits/1362da1/check-runs --jq '.check_runs[] | "\(.conclusion)\t\(.name)"'
```

```
success   bate o pulso do CRC
success   typecheck, tests and build
failure   lint, typecheck, tests and build
success   schema do zero, tenant, concorrência, recovery e navegador
```

O GitHub casa check exigido com check reportado **por string exata**. Quando o
job de integração ganhou o passo de Playwright, o nome dele passou de
`…concorrência e recovery` para `…concorrência, recovery e navegador` — e a
proteção continuou apontando para o nome antigo.

O efeito é duplo e silencioso:

- o check de integração que **é exigido** nunca chega, e fica eternamente
  pendente;
- o check de integração que **chega** não é exigido, então o resultado dele não
  bloqueia nada.

Renomear um job é, hoje, uma forma de desligar um portão sem que nenhuma tela
mude de cor.

### 2. `CRC Smoke` não é exigido

O job `typecheck, tests and build` roda, passa, e não consta da lista de
contextos obrigatórios. Ele é hoje decorativo do ponto de vista do portão.

### 3. Administrador não é barrado

```bash
gh api repos/felipemenezes25000-spec/jp-clinica-odontologica/branches/main/protection --jq '.enforce_admins.enabled'
```

```
false
```

Como quem publica neste repositório é o dono, as regras acima não se aplicam a
ele de qualquer forma. As outras duas causas ficaram invisíveis justamente por
isso: nunca chegaram a ser testadas.

## O que está correto hoje

Vale registrar, porque não é pouco:

| Regra                                     | Estado        |
| ----------------------------------------- | ------------- |
| `strict` (branch tem de estar atualizada) | ativo         |
| `required_linear_history`                 | ativo         |
| `allow_force_pushes`                      | desligado     |
| `allow_deletions`                         | desligado     |
| `required_conversation_resolution`        | ativo         |
| `required_signatures`                     | **desligado** |

## A correção exata

**Não apliquei nada disto.** Mexer em proteção de branch é decisão de quem
administra o repositório, e o pedido foi explicitamente para gerar a
recomendação, não para executá-la.

### Passo 1 — alinhar os nomes e incluir o smoke

```bash
gh api -X PATCH repos/felipemenezes25000-spec/jp-clinica-odontologica/branches/main/protection/required_status_checks \
  -f strict=true \
  -f 'checks[][context]=lint, typecheck, tests and build' \
  -f 'checks[][context]=typecheck, tests and build' \
  -f 'checks[][context]=schema do zero, tenant, concorrência, recovery e navegador'
```

### Passo 2 — fazer a regra valer também para o administrador

```bash
gh api -X POST repos/felipemenezes25000-spec/jp-clinica-odontologica/branches/main/protection/enforce_admins
```

Para desfazer, se algum dia for preciso destravar às pressas:

```bash
gh api -X DELETE repos/felipemenezes25000-spec/jp-clinica-odontologica/branches/main/protection/enforce_admins
```

### Passo 3 — conferir que o portão passou a morder

```bash
gh api repos/felipemenezes25000-spec/jp-clinica-odontologica/branches/main/protection \
  --jq '{admins: .enforce_admins.enabled, checks: .required_status_checks.contexts}'
```

O resultado esperado é `admins: true` e os **três** nomes acima, escritos
exatamente como os jobs os reportam.

## A trava que falta ainda depois disso

Casar nome de check por string continua sendo frágil: o próximo `name:` editado
num workflow reabre exatamente o mesmo buraco, e de novo sem alarme. Enquanto o
GitHub não oferecer casamento por id de job, a defesa possível é um teste que
compare as duas listas — `src/lib/crc/testes/portao-de-release.test.ts` faz isso
e quebra o CI quando um `name:` de job obrigatório deixa de existir no workflow.

## Assinatura de commit

`required_signatures` está desligado e os commits atuais não são assinados.
Ligar isso exige uma chave GPG ou SSH configurada na máquina de quem commita;
sem isso, ativar a regra trava **todo** push, inclusive o legítimo. Fica
registrado como pendência consciente, não como esquecimento — e é o único item
desta página que depende de configuração fora do repositório.
