# JP CRC OS — índice de documentação

> **Índice vivo, revisado em 15/09/2026.**
>
> O diretório `docs/crc/` contém tanto documentação operacional atual quanto decisões e auditorias históricas. Esta página existe para impedir que um snapshot antigo seja confundido com o HEAD.

## Ordem de confiança

1. **Código, testes e migrations** — comportamento executável.
2. **`CRC-MAPA-DO-SISTEMA.md`** — mapa gerado a partir do código; regenere com `node scripts/mapa-do-sistema.mjs` quando necessário.
3. **`ATIVACAO-EM-PRODUCAO.md`** — configuração/ativação atual.
4. **`RUNBOOK.md`** — resposta operacional a incidentes.
5. **Especificação Dental Office versionada** — contrato do fornecedor na data indicada.
6. Demais documentos — contexto histórico, decisões, avaliações e material de apresentação.

## Documentos vivos

| Arquivo | Uso |
| --- | --- |
| `README.md` | este índice |
| `ATIVACAO-EM-PRODUCAO.md` | colocar/validar o CRC no ambiente |
| `RUNBOOK.md` | incidentes e operação |
| `EMAIL-DENTAL-OFFICE.md` | checklist/modelo para pedir o que a especificação não entrega |
| `openapi-dentaloffice.yml` + `dental-office-api/*` | cópia versionada do contrato do Dental Office; vale para a data declarada nesses arquivos |

`EMAIL-DENTAL-OFFICE.md` continua dependendo de respostas do fornecedor; não transforme ausência de resposta em comportamento presumido.

## Documento gerado

### `CRC-MAPA-DO-SISTEMA.md`

É gerado por:

```bash
node scripts/mapa-do-sistema.mjs
```

Não edite contagens/módulos manualmente. Se o arquivo estiver antigo, regenere. O mapa de uma data anterior pode continuar estruturalmente correto, mas a data de geração deve ser interpretada literalmente.

## Snapshots e decisões históricas

Estes arquivos preservam o estado/decisão da época. Use-os para entender **por que** algo foi feito, não para contar quantos módulos/tabelas existem hoje:

- `AI-PLATFORM-ADR.md`;
- `AI-PLATFORM-AUDIT.md`;
- `AI-PLATFORM-FINAL-ACCEPTANCE.md`;
- `AI-PLATFORM-PORT-MATRIX.md`;
- `AI-PLATFORM-ROADMAP.md`;
- `ARCHITECTURE.md`;
- `AUDITORIA-360-EXECUCAO.md`;
- `AUDITORIA-FINAL-CRC.md`;
- `CAPACIDADES-DENTAL-OFFICE.md`;
- `CRC-AUTOPILOT-MASTER-IMPLEMENTATION.md`;
- `CRC-AVALIACAO-TECNICA.md`;
- `CURRENT-SYSTEM-MAP.md`;
- `CUSTO-DAS-MENSAGENS.md`;
- `FINAL-ACCEPTANCE.md`;
- `MANUAL-COMPLETO.md`;
- `RADAR-DE-RECEITA.md`;
- `RELEASE-GATE.md`;
- `ROTEIRO-DA-EQUIPE.md`;
- `TOUR-INSTITUCIONAL.md`.

Muitos desses arquivos já trazem aviso explícito de “recorte datado”. Preserve esse aviso.

### Por que não atualizar números históricos

Se uma auditoria de 13/09 diz que havia N tabelas ou que um check estava vermelho, trocar por um número de 15/09 destruiria a evidência do que aquela auditoria constatou. O correto é apontar o leitor para a fonte atual — este índice faz isso.

## Materiais comerciais/exportados

- `APRESENTACAO-JP-CRC.md`;
- `APRESENTACAO-COMERCIAL.html`;
- `CRC-APRESENTACAO.pdf`;
- `CRC-AVALIACAO-TECNICA.pdf`;
- `CRC-TUDO-O-QUE-O-SISTEMA-FAZ.pdf`;
- `Perguntas-Dental-Office.pdf`.

São artefatos de uma versão. Antes de usar externamente, compare afirmações com o produto atual e regenere/exporte quando necessário.

O tour web/vídeo atual é mantido no subprojeto [`../../apresentacao/`](../../apresentacao/).

## Arquitetura atual — referência curta

O CRC está organizado em `src/lib/crc/`:

```text
dominio/       regras puras
aplicacao/     casos de uso/orquestração
automacao/     motor, handlers e workers
integracoes/   Dental Office, WhatsApp, IA e demais portas
ia-platform/   runtime/supervisão/ferramentas da plataforma de IA
servidor/      banco, sessão, configuração e infraestrutura server-side
```

UI em `src/components/crc/` e rotas/endpoints em `src/routes/crc*` e `src/routes/api/crc/`.

Não use quantidade escrita à mão para módulos/tabelas. O mapa gerado e o código respondem isso.

## Integrações externas

A existência de adapter **não prova credencial ativa**.

Antes de afirmar que uma integração está funcionando em produção, valide:

- credenciais/escopo;
- teste de conexão;
- saúde no painel;
- leitura/escrita realmente permitidas pelo contrato;
- webhooks/assinaturas quando aplicável.

### Dental Office

A especificação versionada em `dental-office-api/` é a fonte contratual local. Não invente endpoint porque ele existe no produto visual do fornecedor.

### WhatsApp

O CRC possui portas/provedores, mas ativação depende de credenciais e configuração de canal. Modo sandbox não é prova de produção.

### IA

Rotas/modelos/orçamentos são configuração operacional. Não coloque segredo ou chave no cliente.

## Banco

- migrations ficam em `supabase/`;
- migration aplicada é append-only; correção vira migration nova;
- use `npm run schema:status` em vez de confiar em um número descrito em Markdown;
- `npm run schema:aplicar` é o caminho automatizado documentado para aplicação conforme o script do repositório;
- arquivos de teste nunca devem ser aplicados por acidente em produção.

## CI atual

Os workflows relevantes ficam em `.github/workflows/`:

- `quality.yml`;
- `crc-integracao.yml`;
- `crc-pulso.yml`;
- `crc-smoke.yml`;
- `supply-chain.yml`.

O `quality.yml` também executa o E2E público do funil pago. O gate de integração do CRC é separado porque precisa de infraestrutura específica.

Não copie nomes de checks de `RELEASE-GATE.md` sem conferir o YAML atual; aquele documento é uma auditoria histórica.

## Para colocar no ar

1. leia `ATIVACAO-EM-PRODUCAO.md`;
2. confira migrations com `npm run schema:status`;
3. configure segredos server-side;
4. valide integrações sem assumir que adapter = credencial;
5. execute CI/testes de integração;
6. confira Saúde/interruptores;
7. habilite automação progressivamente, não tudo de uma vez.

## Para incidente

Abra `RUNBOOK.md`. Se houver risco de mensagem/escrita indevida para paciente, priorize os interruptores de segurança antes da investigação.

## Regra de manutenção

Mudou arquitetura/rota/configuração operacional? Atualize documento vivo no mesmo commit. Mudou o código estrutural do CRC? Regenere o mapa. Um documento histórico só deve receber correção factual sobre o próprio evento, nunca ser convertido silenciosamente em descrição do presente.