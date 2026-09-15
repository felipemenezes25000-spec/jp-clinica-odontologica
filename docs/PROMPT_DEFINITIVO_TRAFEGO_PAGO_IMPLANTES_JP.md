# Prompt definitivo de tráfego pago — registro histórico

> **Status em 15/09/2026: implementação concluída no código.**
>
> Este arquivo deixou de ser instrução de implementação. Ele é mantido para registrar o escopo que originou o trabalho. Para operação atual use [`ANUNCIAR.md`](ANUNCIAR.md); para comportamento técnico use `src/lib/analytics/`, `PaginaDeTratamento` e os E2E públicos.

## O que o prompt pediu

O trabalho original tinha como objetivo preparar o site da JP para aquisição de implantes sem depender do CRC:

```text
Google Search → /implante-dentario → WhatsApp → recepção humana
```

Escopo principal:

- rotas curtas de mídia para tratamentos;
- LP com foco em implantes;
- uma única conversão comercial por clique;
- GTM/GA4/Google Ads/Meta preparados sem credenciais hardcoded;
- Consent Mode;
- atribuição por UTM/IDs de clique;
- referência curta no WhatsApp;
- preservação de contexto do tratamento;
- testes contra dupla contagem;
- documentação operacional.

## Estado atual entregue

Em 15/09/2026 o repositório já possui:

- 8 rotas pagas mapeadas para o tratamento correspondente;
- `generate_lead` como conversão comercial primária;
- prevenção automatizada contra dupla/tripla contagem;
- `event_id` para futura deduplicação browser/server;
- UTMs, `gclid`, `fbclid`, `gbraid` e `wbraid` por sessão;
- referência curta de campanha no WhatsApp, sem expor click ID bruto;
- GTM opcional por `VITE_GTM_ID`;
- Meta Pixel opcional por `VITE_META_PIXEL_ID`;
- Consent Mode v2;
- LP de implante com H1/localização/CTA específicos;
- ausência de cross-sell e de “Todos os tratamentos” na LP;
- cabeçalho enxuto em desktop e mobile;
- FAQ de implantes com linguagem prudente;
- E2E público no CI cobrindo SSR, atribuição, CTA, consentimento e dupla contagem.

## O que continua externo ao código

O repositório não deve inventar:

- GTM ID;
- GA4 Measurement ID;
- Google Ads Conversion ID/Label;
- Meta Pixel ID;
- token CAPI;
- profissional responsável por implantes, caso não exista dado verificável.

A configuração real das plataformas e do ambiente precisa ser validada antes de investir mídia.

## Decisões que permanecem válidas

- CRC não é pré-requisito para começar Google Ads/Meta Ads;
- preço/“quanto custa” não é negativa automática;
- saúde exige cautela com personalização/remarketing;
- não usar promessa de resultado, “sem dor”, urgência artificial ou credencial inventada;
- não duplicar a LP: orgânico e anúncio reutilizam o mesmo componente em modos diferentes.

## Fontes atuais

- operação: [`ANUNCIAR.md`](ANUNCIAR.md);
- eventos: `src/lib/analytics/eventos.ts`;
- atribuição: `src/lib/analytics/atribuicao.ts`;
- rotas: `src/lib/analytics/rotas.ts`;
- consentimento: `src/lib/analytics/consentimento.ts`;
- tags: `src/lib/analytics/scripts.ts`;
- E2E: `e2e/publico/`.

Não volte a executar este prompt inteiro contra o repositório atual: isso tenderia a refazer arquitetura que já existe e poderia reintroduzir regressões.