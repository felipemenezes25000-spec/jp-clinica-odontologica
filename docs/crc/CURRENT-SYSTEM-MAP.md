# CURRENT-SYSTEM-MAP — o que existia antes do JP CRC

Auditoria feita antes da primeira linha do módulo CRC, como manda o item 6 do
Contrato de Execução. Serve para duas coisas: decidir o que reaproveitar e
delimitar o raio de explosão (item 242 — nada de refatorar o que não pediram).

## Stack real

| Camada          | O que é                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------- |
| Framework       | TanStack Start 1.168 (React 19.2, file-based routing)                                     |
| Build           | Vite 8 + Nitro (preset `vercel`)                                                          |
| Linguagem       | TypeScript 5.8 em `strict`, com `noUncheckedIndexedAccess` e `exactOptionalPropertyTypes` |
| Estilo          | Tailwind CSS 4 via `@tailwindcss/vite`, tokens em `src/styles.css`                        |
| Dados           | Supabase (Postgres + Storage) acessado por **REST puro**, sem SDK                         |
| Auth            | Cookie de sessão selado (`@tanstack/react-start/server`), senha única de admin            |
| IA              | OpenAI via `fetch` direto (`src/lib/rh/servidor/openai.ts`)                               |
| Deploy          | Vercel; cron declarado em `vercel.json`                                                   |
| Package manager | npm (há `package-lock.json`; `bunfig.toml` é resquício)                                   |

## Módulos existentes

### 1. Site público (`src/routes/index.tsx`, `src/components/site/`)

Landing da clínica, páginas de tratamento e de carreiras. Estático, sem banco.

### 2. Portal de RH (`src/routes/rh.tsx`, `src/components/rh/`, `src/lib/rh/`)

Recebe candidaturas, guarda currículo, roda triagem por IA, kanban, ficha de
entrevista. ~46 kLOC no total do `src/`, a maior parte aqui.

Padrões que ele estabeleceu e que o CRC **herda**:

- **Server functions** (`createServerFn`) em um arquivo importável pelo cliente;
  todo módulo de servidor entra por `await import()` _dentro_ do handler.
- **Driver de armazenamento plugável**: `RH_STORAGE=fs|supabase` escolhe entre
  disco e Postgres. Mesma interface nos dois.
- **Tabela `(id, dados jsonb)` + colunas geradas** para filtro/índice.
- Rotas de cron protegidas por `CRON_SECRET` com comparação em tempo constante.
- Nomes de domínio em português; comentário explica _por quê_, não _o quê_.

## Banco atual

`supabase/01-schema.sql`: `rh_candidaturas`, `rh_vagas`, `rh_guias`,
`rh_config`, `rh_rankings`. Todas com RLS ligado e **zero policies** — só a
`service_role` (servidor) enxerga. Bucket privado `curriculos`.

## Variáveis de ambiente já em uso

`ADMIN_RH_PASSWORD`, `RH_SESSION_SECRET`, `RH_SENHA_RESET`, `RH_STORAGE`,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE`, `SUPABASE_BUCKET`, `RH_DATA_DIR`,
`OPENAI_API_KEY`, `OPENAI_MODEL_RH`, `CRON_SECRET`.

## Riscos de regressão identificados

1. **Fatiamento do bundle SSR** — `vite.config.ts` força
   `inlineDynamicImports` no ambiente `ssr` por causa de um ciclo entre chunks
   que derrubou _todas_ as rotas com o build passando limpo
   (`docs/INCIDENTE-BUILD-500.md`). O CRC não pode reintroduzir imports de
   servidor no topo de `src/server.ts` nem em módulos que a entrada arrasta.
2. **CSS global** — `src/styles.css` tem `@layer base { * { border-color } }` e
   tokens no `:root`. O CRC **acrescenta** tokens, nunca redefine os do site
   (item 206/207 do contrato: não quebrar RH nem site).
3. **Teto de corpo em `src/server.ts`** — 12 MB. Upload de CSV de orçamento
   passa por ele.
4. **`exactOptionalPropertyTypes`** — objeto com campo opcional não aceita
   `undefined` explícito. Todo DTO do CRC nasce com isso em mente.

## Classificação por área

| Área                           | Decisão                  | Por quê                                                                                                                                     |
| ------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Site público                   | **KEEP**                 | Fora de escopo. Nada é tocado.                                                                                                              |
| Portal RH                      | **KEEP**                 | Fora de escopo. Isolado por prefixo de tabela e de rota.                                                                                    |
| `styles.css` (tokens)          | **KEEP + EXTEND**        | Paleta da marca já resolvida com contraste medido. CRC adiciona tokens `--crc-*`.                                                           |
| Driver Supabase REST           | **REFACTOR (extrair)**   | A mecânica (retry, headers, upsert) é boa e genérica; hoje está amarrada às tabelas do RH. CRC ganha seu próprio cliente no mesmo espírito. |
| Sessão/cookie                  | **REUSE (padrão)**       | CRC precisa de RBAC por usuário, que o RH não tem. Mesma tecnologia, sessão própria.                                                        |
| Cliente OpenAI                 | **REPLACE (para o CRC)** | O do RH devolve texto. CRC exige structured output com schema e retry (itens 43/114).                                                       |
| Banco                          | **NEW**                  | Tabelas `crc_*` novas, nenhuma alteração nas `rh_*`.                                                                                        |
| Dental Office                  | **NEW**                  | Não existe nada hoje.                                                                                                                       |
| WhatsApp / automação / eventos | **NEW**                  | Não existe nada hoje.                                                                                                                       |

## Pendências externas encontradas na auditoria

- `DENTAL_OFFICE_BASE_URL` / `CLIENT_ID` / `SECRET` **não estão configurados**.
  Toda a camada é construída e testada contra um adapter de sandbox; a marcação
  é `BLOCKED_BY_EXTERNAL_CREDENTIAL` (item 248) até as credenciais chegarem.
- Provedor de WhatsApp não contratado. Mesmo tratamento.
