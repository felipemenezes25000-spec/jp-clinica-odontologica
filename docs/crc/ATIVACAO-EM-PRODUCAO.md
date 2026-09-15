# Ativação em produção — JP CRC

> **Documento vivo, revisado em 15/09/2026.**
>
> Esta versão evita números voláteis de migrations/tabelas. O estado real é obtido por comando e pelo painel de Saúde.

## 1. Fontes antes de ativar

Leia nesta ordem:

1. [`README.md`](README.md) — índice e status dos documentos;
2. este arquivo — configuração;
3. [`RUNBOOK.md`](RUNBOOK.md) — incidentes;
4. `CRC-MAPA-DO-SISTEMA.md` — mapa gerado;
5. `dental-office-api/LEIA-ME.md` — contrato versionado do Dental Office.

## 2. Schema

Nunca conclua “está aplicado” por um número escrito em documentação.

```bash
npm run schema:status
```

Para instalação/aplicação automatizada conforme o script do repositório:

```bash
DATABASE_URL=postgres://... npm run schema:aplicar
```

Regras:

- migrations são aplicadas em ordem;
- migration já aplicada não é editada — mudança vira arquivo novo;
- arquivos explicitamente destinados a teste não entram em produção;
- depois de alteração de schema no Supabase/PostgREST, recarregue o schema quando o fluxo exigir;
- em divergência entre “registro de migration” e sonda real do objeto, investigue a sonda.

## 3. Segredos e variáveis

### Núcleo

- `SUPABASE_URL`;
- `SUPABASE_SERVICE_ROLE`;
- `CRC_SESSION_SECRET`;
- `CRON_SECRET`;
- `CRC_URL_PUBLICA` quando o fluxo de pulso/webhook depender da URL pública.

`SUPABASE_SERVICE_ROLE`, `CRC_SESSION_SECRET`, `CRON_SECRET` e demais credenciais são **server-side**. Nunca prefixe com `VITE_`.

### Administração

Quando usados pelo fluxo de instalação/admin:

- `CRC_ADMIN_EMAIL`;
- `CRC_ADMIN_SENHA`;
- `CRC_ADMIN_NOME`;
- `CRC_SEGREDO_CHAVE` para material cifrado por clínica conforme a implementação atual.

### Dental Office

Pode haver configuração por clínica e/ou fallback de ambiente conforme o código atual. Variáveis conhecidas incluem a base/credenciais do Dental Office. Não declare integração ativa sem teste de conexão real.

A URL base e autenticação devem seguir a especificação versionada em `dental-office-api/`. Não concatene `/v1` por suposição.

### WhatsApp

A ativação depende do provedor/canal e suas credenciais. Sandbox é apenas teste. Para produção, valide:

- provedor selecionado;
- credencial correta por clínica/canal;
- identidade/número de envio;
- webhook;
- assinatura;
- envio e recebimento reais;
- regras de janela/template do provedor.

Se WAHA estiver disponível no código, trate-o conforme os avisos de risco existentes: automação de WhatsApp Web não equivale à API oficial.

## 4. Workflows atuais

Em `.github/workflows/` existem:

| Workflow | Papel |
| --- | --- |
| `quality.yml` | lint, typecheck, testes, build, verificação de bundle e E2E público |
| `crc-integracao.yml` | schema/tenant/concorrência/recovery e navegador do CRC |
| `crc-pulso.yml` | pulso agendado/manual |
| `crc-smoke.yml` | smoke do CRC |
| `supply-chain.yml` | dependências/segurança |

O nome exato de um job pode mudar. Branch protection deve ser comparada ao YAML atual; não copie nomes de uma auditoria antiga.

## 5. Quality gate local

Para código geral/site:

```bash
npm ci
npm run lint
npm run typecheck
npm run test
npm run build
npm run e2e:site
```

Para CRC com infraestrutura:

```bash
npm run test:integracao
npm run e2e
```

Use banco de teste apropriado. Não aponte suíte destrutiva para produção.

## 6. Ordem segura de ativação

1. **Banco** — schema/migrations verificados.
2. **Sessão/admin** — login e escopo de organização/clínica.
3. **Saúde** — painel abre sem esconder falha de infraestrutura.
4. **Dental Office leitura** — teste de conexão e sincronização controlada.
5. **WhatsApp entrada/saída** — canal validado.
6. **IA em modo seguro/observação** — orçamento e limites configurados.
7. **Automação** — habilitação gradual por domínio.
8. **Writeback** — somente após validar contrato e interruptor específico.

Não ligue tudo ao mesmo tempo. Um sistema com automação, IA e escrita externa deve ganhar autonomia por degraus.

## 7. Interruptores

Antes de qualquer operação com pacientes reais, confirme que os interruptores de segurança existem e que a equipe sabe usá-los. O runbook documenta as ações de emergência.

Em incidente de mensagem indevida, escrita indevida ou escopo cruzado, pare primeiro e investigue depois.

## 8. Saúde operacional

A tela **Saúde** deve ser consultada para distinguir:

- pulso ausente/parado;
- fila parada;
- webhook preso;
- dead letters;
- provedor/disjuntor;
- orçamento de IA;
- credencial ausente;
- varredura sem avanço;
- schema atrasado;
- interruptores acionados.

Os rótulos exatos podem evoluir; a implementação em `src/lib/crc/aplicacao/saude.ts` é a fonte.

## 9. Pulso e motor

O projeto separa trabalho frequente de trabalho periódico. A cadência real depende dos workflows/cron configurados e do ambiente. Não documente “a cada N minutos” como garantia de SLA: agendadores externos são best-effort.

Para execução manual, use somente rotas e autenticação documentadas no código/Runbook atual e nunca publique `CRON_SECRET` em comando compartilhado/log.

## 10. Dental Office

Antes de produção:

- obtenha credenciais oficiais e o identificador necessário da clínica;
- compare chamadas com `docs/crc/dental-office-api/`;
- rode “Testar conexão”;
- sincronize lote pequeno;
- valide paginação/rate limit com o fornecedor quando o contrato local não responder;
- habilite escrita apenas depois de leitura estável e contrato confirmado.

Questões externas ainda sem resposta devem continuar em `EMAIL-DENTAL-OFFICE.md`, não ser resolvidas por adivinhação.

## 11. WhatsApp

Antes de abrir automações:

- confirmar número/canal por clínica;
- validar mensagem de entrada;
- validar resposta de saída;
- confirmar deduplicação/idempotência;
- confirmar opt-out;
- confirmar política de horário/janela/template;
- testar handoff humano;
- testar kill switch.

## 12. IA

- configurar chave/modelos apenas no servidor;
- definir orçamento/tetos;
- testar ferramentas no Playground/Studio antes de autonomia;
- validar guardrails;
- iniciar em observação/sandbox quando possível;
- acompanhar runs, custo, handoff e dead letters.

## 13. Verificação pós-deploy

Checklist:

- [ ] site público responde;
- [ ] `/rh` preservado;
- [ ] `/crc` autentica e respeita escopo;
- [ ] Saúde sem crítico desconhecido;
- [ ] schema status coerente;
- [ ] sync Dental Office controlado;
- [ ] canal WhatsApp correto;
- [ ] pulso/motor executáveis;
- [ ] IA respeita orçamento/guardrails;
- [ ] interruptores testados;
- [ ] logs não contêm segredos/PII desnecessária;
- [ ] CI do commit verde.

## 14. O que esta documentação não afirma

Ela **não** afirma que as credenciais externas estejam configuradas no ambiente atual. Adapter implementado, teste sandbox e variável listada não equivalem a integração produtiva.

Para o estado concreto de um ambiente, use o painel de Saúde, teste de conexão, `schema:status`, logs e os checks do commit implantado.