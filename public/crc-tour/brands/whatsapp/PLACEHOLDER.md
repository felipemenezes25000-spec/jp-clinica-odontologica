# WhatsApp — logo ausente

O repositório não tem o logo do WhatsApp, e reproduzir o glifo de memória
produziria justamente o que o briefing proíbe: um logo *parecido*. Enquanto o
oficial não entra, a peça usa um ícone de conversa genérico, desenhado no design
system, no verde da integração — ele identifica o canal sem se passar pela marca.

## Como colocar o arquivo real

1. Baixe o asset no **WhatsApp Brand Center**
   (<https://about.meta.com/brand/resources/whatsapp/whatsapp-brand/>) e respeite
   as diretrizes de uso de lá — elas exigem, entre outras coisas, não recolorir e
   não alterar as proporções do glifo.
2. Salve o arquivo **nesta pasta**, por exemplo `whatsapp.svg`.
3. Preencha a entrada `whatsapp` em `src/data/marcas.ts`:

   ```ts
   whatsapp: {
     nome: "WhatsApp",
     arquivo: "/brands/whatsapp/whatsapp.svg",
     proporcao: 1, // glifo quadrado
     acento: cor.whatsapp,
   }
   ```

Nenhum componente muda.

## O que a peça já respeita

- A tela de conversa da cena 13 é um mockup **do próprio design system**, não uma
  cópia pixel a pixel da interface do WhatsApp (item 41 do briefing).
- O verde `#25D366` aparece só como acento de canal: badge, ponto de status e
  linha de conexão.
