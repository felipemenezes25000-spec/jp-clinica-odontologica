# Incidente: 500 em todas as rotas no build de produção

**Estado:** RESOLVIDO.
**Correção:** `environments.ssr.build.rollupOptions.output.inlineDynamicImports` em `vite.config.ts`.

---

## O sintoma

O build passa. `tsc` passa. `eslint` passa. E o servidor responde **HTTP 500 em
todas as rotas**, inclusive a home:

```
TypeError: createCsrfMiddleware is not a function     (ou: createMiddleware, __exportAll)
    at _ssr/server-XXXX.mjs:1418
```

## A causa

Ciclo de importação **entre pedaços gerados pelo bundler**:

```
pedaço A  →  importa server_exports          de  pedaço B
pedaço B  →  importa createCsrfMiddleware    de  pedaço A
```

O símbolo é definido em A e usado em B, e B é avaliado antes de A terminar. Em
ESM isso não dá erro de módulo: dá `undefined`, e só quebra na chamada. Qual
símbolo aparece no erro (`createCsrfMiddleware`, `createMiddleware`,
`__exportAll`) muda conforme o fatiamento — é sempre o mesmo ciclo.

## A reprodução mínima — e a prova de que não é o nosso código

Em uma árvore **sem nenhuma rota do portal de RH**, basta isto para quebrar:

```tsx
// src/routes/teste-fn.tsx
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

const oi = createServerFn({ method: "GET" }).handler(async () => ({ ok: true }));

export const Route = createFileRoute("/teste-fn")({
  loader: () => oi(),
  component: () => <p>ok</p>,
});
```

```bash
npm run build && npx vite preview --port 4173
curl -o /dev/null -w "%{http_code}\n" http://localhost:4173/     # 500
```

Removendo `src/start.ts` — mesmo um `start.ts` mínimo, só com
`createStart(() => ({}))`, sem middleware nenhum — o mesmo teste responde **200**.

**O projeto original não tinha nenhuma server function.** Por isso nunca deu
problema antes: `src/start.ts` conviveu bem com um site 100% estático.

## Matriz de testes

| `src/start.ts` | server functions | resultado |
| --- | --- | --- |
| presente | nenhuma | **200** |
| presente | uma trivial | 500 |
| presente | portal completo | 500 |
| ausente | uma trivial | **200** |
| ausente | portal completo | 500 |

Duas conclusões:

1. `start.ts` + qualquer server function quebra. Bug do framework.
2. Mesmo sem `start.ts`, o grafo completo do portal volta a quebrar. Existe um
   **limiar de tamanho**: o fatiador muda de decisão quando o grafo cresce.

## O que já foi descartado (testado, não resolveu)

| Tentativa | Resultado |
| --- | --- |
| `@tanstack/react-start` 1.168.40 → 1.168.50 | 500 igual, e quebra tipagem em `__root.tsx` |
| Remover só o `createCsrfMiddleware` do `start.ts` | erro migra para `createMiddleware` |
| Remover a entrada customizada (`server: { entry: "server" }`) | 500 igual |
| Acrescentar os pacotes do Start ao `resolve.dedupe` | 500 igual |
| `manualChunks` agrupando `@tanstack/*` | erro migra para `__exportAll` |
| `ssr.noExternal` para empacotar o runtime | 500 igual |
| Tirar `supabase.ts` do grafo do despachante | 500 igual |
| Trocar o único `export … from` por funções delegadoras | 500 igual |
| `React.lazy` nas seis abas do painel | 500 igual |
| Separar as server functions públicas em `api-portal.ts` | 500 igual |
| Remover `src/start.ts` **e** a entrada customizada | 500 igual (grafo completo) |

## Duas correções que ficaram, e são certas de qualquer jeito

**`src/server.ts` não importa mais o domínio.** Ele puxava
`TAMANHO_MAX_CURRICULO` de `lib/rh/tipos`. Entrada de servidor não pode importar
domínio: tudo que ela importa entra no pedaço de entrada. O número virou literal.

**`src/lib/rh/api-portal.ts`.** As duas server functions do portal público
saíram de `api.ts` (que tem ~25). Rota pública não deve carregar o código de
importação em massa nem o de ficha de entrevista. Não resolveu o incidente, mas
é a arquitetura certa.

## A CORREÇÃO

Um pedaço único no bundle de SSR:

```ts
environments: {
  ssr: {
    build: { rollupOptions: { output: { inlineDynamicImports: true } } },
  },
},
```

O bug era ciclo ENTRE pedaços. Sem fatiamento, não há ciclo possível — a correção
ataca a categoria do problema, não o sintoma do dia.

No servidor não custa nada: o arquivo é carregado inteiro na primeira requisição
de qualquer jeito, não existe download incremental.

**Precisa ficar dentro de `environments.ssr`.** Posto em `build` (global), ele
também junta o CLIENTE: o site virou um único JS de 993 KB e quem abrisse a home
baixaria o painel de RH inteiro junto. Restrito ao SSR, o cliente segue com seus
77 pedaços.

### Descartado no caminho

`React.lazy` nas abas do painel foi tentado como hipótese e **não** resolveu — e
ainda travou a tela em "Carregando…" no build. Foi revertido.

Upgrade também não era caminho: `@tanstack/react-start@1.168.50` já é a versão
mais recente publicada. Os números 1.170/1.171 que aparecem em `npm view` são de
subpacotes, não do pacote principal.

## O que era o próximo passo, antes de a correção aparecer

**Subir o TanStack Start para a linha 1.170/1.171.** A 1.168.50 (mesma minor) não
resolve. O salto de minor exige acertar pelo menos uma mudança de API já vista:

```
src/routes/__root.tsx: errorComponent agora recebe ErrorComponentProps,
não { error, reset }
```

Se depois disso o problema persistir, abrir issue no TanStack Start com a
reprodução mínima acima — o ciclo é entre pedaços que o bundler **deles** gera.

## Situação da produção

| | |
| --- | --- |
| `/` e `/tratamentos/*` | **200** — site institucional no ar |
| `/carreiras` e `/rh` | 404 — portal fora |
| 54 candidaturas + currículos | **seguros no Supabase**, independem de deploy |
| Variáveis de ambiente na Vercel | todas cadastradas |

O portal está **fora, não quebrado**, e os dados não correm risco: eles vivem no
Supabase, não no deploy.

## A lição de processo

`npm run build` passar não é o app funcionar. Toda a verificação anterior a este
incidente compilou o projeto e nunca **executou** o resultado — por isso o erro
chegou à produção.

**Antes de qualquer deploy:**

```bash
npm run build && npx vite preview --port 4173
curl -o /dev/null -w "%{http_code}\n" http://localhost:4173/
```
