# Redesign do site — registro histórico

> **Status: concluído / histórico. Revisão de classificação: 15/09/2026.**
>
> Este arquivo não é mais a especificação visual do site. Ele existiu para orientar a etapa de redesign e é mantido apenas como registro da intenção daquele trabalho.

A fonte atual do sistema visual é:

- [`DESIGN.md`](DESIGN.md) — regras vivas de design, acessibilidade e `modo="anuncio"`;
- `src/styles.css` — tokens e estilos executáveis;
- `src/components/site/` — componentes atuais;
- [`docs/marca/LEIA-ME.md`](docs/marca/LEIA-ME.md) — origem dos ativos e cores da marca.

## O que permanece válido do redesign

- identidade baseada nos materiais reais da JP;
- uso de fotografia/estrutura real da clínica;
- hierarquia visual forte e responsiva;
- CTA de WhatsApp como ação principal;
- contraste medido em vez de escolha “no olho”;
- componentes reutilizáveis em vez de páginas duplicadas;
- preservação de CRO, endereço, horário, políticas e confiança.

## O que mudou depois

O site evoluiu após o redesign original. Em especial:

- a equipe pública passou a ser filtrada por estado real/placeholder;
- existem oito páginas orgânicas de tratamento e oito rotas curtas de mídia;
- `PaginaDeTratamento` ganhou `modo="anuncio"`;
- a LP paga remove cross-sell e navegação de fuga em desktop e mobile;
- analytics, Consent Mode, GTM opcional, Meta Pixel opcional e atribuição de campanha foram adicionados;
- RH e CRC cresceram como produtos separados dentro do repositório.

Não use números antigos de cards, ordem de seções ou screenshots deste documento para tomar decisão atual. Consulte o código e `DESIGN.md`.