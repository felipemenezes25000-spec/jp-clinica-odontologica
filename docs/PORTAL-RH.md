# Portal de RH — JP Clínica

> **Documento vivo, revisado em 15/09/2026.**
>
> Fonte executável: `src/lib/rh/`, `src/components/rh/` e rotas de RH/carreiras. Evite congelar aqui quantidades de currículos, custo total de um lote ou contagem de testes.

O Portal de RH cuida da publicação de vagas, candidaturas, triagem assistida por IA e entrevista.

## Rotas

| Rota | Papel |
| --- | --- |
| `/carreiras` | vitrine pública de vagas |
| `/carreiras/<slug>` | página da vaga com dados estruturados |
| `/trabalhe-conosco?vaga=<slug>` | candidatura |
| `/rh` | painel interno |

O painel interno é `noindex` e não deve compartilhar estado/autorização com o site público ou com o CRC.

## Princípio da IA

**A IA lê e interpreta; o código calcula.**

Cálculos objetivos — permanência, datas, lacunas, sobreposições, pesos, nota final e regras de veredito — devem permanecer determinísticos em TypeScript. O modelo é usado onde leitura semiestruturada e julgamento textual realmente ajudam.

A IA é suporte à decisão humana. Não deve contratar, rejeitar ou classificar alguém com base em atributo sensível.

## Dados sensíveis

Não usar como critério de nota ou decisão:

- idade, salvo exigência legal objetiva e explicitamente validada;
- aparência/foto;
- estado civil;
- filhos/maternidade;
- religião;
- raça/etnia;
- orientação sexual;
- condição de saúde que não seja requisito ocupacional legítimo e validado.

Se o currículo trouxer dado sensível, o sistema pode registrar que ele foi detectado para auditoria, mas esse sinal não entra na nota.

## Entrevista

O guia de entrevista da clínica vive em `src/lib/rh/guia.ts`. Critérios que só podem ser avaliados presencialmente/na conversa não devem receber nota inventada pela IA a partir do currículo.

A tela deve deixar claro o que veio de regra determinística, o que veio de leitura de IA e o que depende da avaliação humana.

## Armazenamento

`src/lib/rh/armazenamento.ts` seleciona o backend configurado. Em desenvolvimento pode existir opção de filesystem; em ambiente serverless, persistência deve usar banco/storage apropriado.

Nunca trate disco temporário de função como banco de currículos.

No Supabase, as credenciais privilegiadas são server-side. `SUPABASE_SERVICE_ROLE` não pode entrar no cliente e nunca recebe prefixo `VITE_`.

## Upload e arquivos

- validar tipo e tamanho no servidor;
- gerar nome seguro em função compartilhada;
- deduplicar por conteúdo quando o fluxo exigir;
- não expor bucket privado como público por conveniência;
- não colocar texto integral de currículo em logs/analytics.

## Custos de IA

A fonte de preço e estimativa deve ser o código/configuração atual do RH (por exemplo, `src/lib/rh/ia/precos.ts`), não um valor fixo neste documento. Preços de modelo mudam e um número escrito aqui vira dívida documental.

O fluxo deve continuar mostrando estimativa antes de análise em lote e exigir ação humana para operações que possam gerar custo relevante.

## Visual e acessibilidade

O painel `/rh` usa tema administrativo próprio, isolado do marketing. Regras essenciais:

- texto legível em superfícies claras;
- texto branco apenas quando o contraste da superfície escura suporta;
- estado não depende só de cor;
- foco e teclado preservados;
- tabelas, Kanban, gavetas e modais não podem esconder ações essenciais em mobile;
- `rh-admin` não deve contaminar o site ou o CRC.

## Segurança

- autenticação/sessão exclusivamente server-side;
- segredos fora do bundle do navegador;
- RLS/escopo de dados coerentes com o modelo de armazenamento;
- currículos e avaliações não entram em analytics público;
- mensagens ao candidato não revelam score interno ou “opinião da IA”.

## Operação

Antes de publicar mudança relevante:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Para fluxos que dependam do banco/Storage, execute também os testes de integração apropriados.

## Fontes do código

- `src/lib/rh/ia/metricas.ts` — métricas determinísticas;
- `src/lib/rh/ia/rubricas.ts` / `veredito.ts` — regra de nota/veredito;
- `src/lib/rh/ia/sinais.ts` — sinais;
- `src/lib/rh/duvidas.ts` — dúvidas de entrevista;
- `src/lib/rh/guia.ts` — guia da clínica;
- `src/lib/rh/armazenamento.ts` — seleção de storage.

Se esses caminhos mudarem, atualize este documento no mesmo commit.