# Documentação do projeto

> **Fonte de navegação da documentação — revisada em 15/09/2026.**
>
> Regra: código e testes são a fonte de verdade do comportamento executável. Documentos marcados como **histórico**, **auditoria**, **aceite** ou **snapshot** preservam o estado da época e não devem ser lidos como descrição do HEAD atual.

Este diretório organiza a documentação dos quatro produtos/artefatos que vivem no repositório: site público, aquisição/analytics, Portal de RH e JP CRC OS. O subprojeto `apresentacao/` tem documentação própria.

## Comece por aqui

| Assunto | Documento atual | Status |
| --- | --- | --- |
| Visão geral do repositório | [`../README.md`](../README.md) | vivo |
| Design do site público | [`../DESIGN.md`](../DESIGN.md) | vivo |
| Tráfego pago e analytics | [`ANUNCIAR.md`](ANUNCIAR.md) | vivo |
| Portal de RH | [`PORTAL-RH.md`](PORTAL-RH.md) | vivo |
| CRC — índice e fontes | [`crc/README.md`](crc/README.md) | vivo |
| CRC — ativação | [`crc/ATIVACAO-EM-PRODUCAO.md`](crc/ATIVACAO-EM-PRODUCAO.md) | vivo |
| CRC — incidentes | [`crc/RUNBOOK.md`](crc/RUNBOOK.md) | vivo |
| CRC — mapa do código | [`crc/CRC-MAPA-DO-SISTEMA.md`](crc/CRC-MAPA-DO-SISTEMA.md) | gerado |
| Marca | [`marca/LEIA-ME.md`](marca/LEIA-ME.md) | vivo |
| Tour/vídeo do CRC | [`../apresentacao/README.md`](../apresentacao/README.md) | vivo |

## Site público

O site usa `src/lib/jp.ts` como fonte central para dados públicos da clínica. Rotas públicas, SEO, componentes e WhatsApp não devem ganhar cópias manuais de telefone, endereço, avaliação ou dados de equipe.

Dados publicados atualmente:

- JP Clínica Integrada Odontológica;
- R. Rio Verde, 1029, Vila Bruna, São Paulo-SP, região da Freguesia do Ó;
- telefone `(11) 3975-9902`;
- WhatsApp `(11) 97616-5117`;
- segunda a sexta, 08:00–18:00;
- responsável técnica: Dra. Juliana Pelisser Barbosa — CROSP 75.159;
- avaliação exibida: 4,6 no Google, 192 avaliações;
- fundação em 17/08/2002 — 24 anos em 2026.

A equipe pública é filtrada no ponto de exibição. Registros históricos, placeholders e membros marcados como inativos não devem voltar ao site por acidente.

## Aquisição e analytics

A documentação operacional é [`ANUNCIAR.md`](ANUNCIAR.md). O estado de código em 15/09/2026 já inclui:

- 8 rotas curtas de mídia paga;
- `modo="anuncio"` com menos distrações em desktop **e mobile**;
- `generate_lead` como conversão comercial primária;
- atribuição por UTM, `gclid`, `fbclid`, `gbraid` e `wbraid`;
- referência curta no WhatsApp;
- Consent Mode v2;
- GTM e Meta Pixel opcionais por variável de ambiente;
- E2E público no workflow `quality.yml`.

A presença do código **não prova** que IDs de GTM, GA4, Google Ads ou Meta estejam configurados no ambiente de produção. Isso continua sendo configuração externa e deve ser validado antes de investir mídia.

`PROMPT_DEFINITIVO_TRAFEGO_PAGO_IMPLANTES_JP.md` é registro histórico do prompt que originou a implementação. Não é manual operacional.

## Portal de RH

[`PORTAL-RH.md`](PORTAL-RH.md) documenta `/rh`, `/carreiras`, `/carreiras/<slug>` e `/trabalhe-conosco`. O RH é isolado do CRC por rotas, domínio de código e prefixos de dados.

## JP CRC OS

Use [`crc/README.md`](crc/README.md) como índice. O CRC tem muita documentação acumulada porque o projeto preserva auditorias e decisões. Nem todo arquivo em `docs/crc/` é uma instrução para o estado atual.

Hierarquia de confiança para o CRC:

1. código + testes + migrations;
2. `CRC-MAPA-DO-SISTEMA.md`, gerado do código;
3. `ATIVACAO-EM-PRODUCAO.md` e `RUNBOOK.md` para operação;
4. especificação oficial do Dental Office em `dental-office-api/` para o contrato externo;
5. demais ADRs, auditorias, roadmaps e aceites como registro histórico.

## Documentos históricos que não devem ser “atualizados” para fingir presente

- [`INCIDENTE-BUILD-500.md`](INCIDENTE-BUILD-500.md): post-mortem resolvido;
- [`README-REDESIGN.md`](../README-REDESIGN.md): registro do redesign;
- `docs/crc/*AUDITORIA*`, `*ACCEPTANCE*`, `*ROADMAP*`, `CURRENT-SYSTEM-MAP.md`, `RELEASE-GATE.md`: fotografia do momento indicado no próprio arquivo;
- PDFs e apresentações exportadas: artefatos de uma versão específica.

Quando a realidade atual mudar, atualize o documento **vivo** ou regenere o documento **gerado**. Não apague evidência histórica para fazê-la parecer atual.

## Regras de manutenção

- Não hardcode quantidade de testes, arquivos, tabelas, módulos ou migrations em documento vivo quando um comando pode responder isso.
- Não declare integração externa como ativa só porque o adapter existe.
- Não coloque segredos, tokens ou chaves em Markdown.
- Não descreva uma pessoa como especialista/profissional de um tratamento sem dado verificável.
- Para números de negócio, preços de terceiros ou políticas externas, registre data e fonte ou aponte para a configuração/código que os resolve.
- Mudanças de comportamento em `/`, `/rh`, `/crc` ou analytics devem atualizar o documento vivo correspondente no mesmo PR/commit.

## Validação antes de publicar documentação técnica

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run e2e:site
```

Para mudanças de CRC com banco/integração, use também os gates específicos documentados em `docs/crc/README.md` e nos workflows de integração.