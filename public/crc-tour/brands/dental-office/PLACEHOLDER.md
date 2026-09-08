# Dental Office — logo ausente

Não há arquivo de marca do Dental Office neste repositório, e a peça **não
inventa um parecido**. Enquanto o oficial não chega, a apresentação desenha um
wordmark tipográfico com o nome do sistema, em azul, feito no próprio design
system (`src/components/Marca.tsx`).

## Como colocar o arquivo real

1. Coloque o SVG (preferência) ou PNG com fundo transparente **nesta pasta**.
   Sugestão de nome: `dental-office.svg`.
2. Abra `src/data/marcas.ts` e preencha a entrada `dentalOffice`:

   ```ts
   dentalOffice: {
     nome: "Dental Office",
     arquivo: "/brands/dental-office/dental-office.svg",
     proporcao: 240 / 64, // largura ÷ altura do viewBox do arquivo
     acento: cor.dentalOffice,
   }
   ```

3. Só isso. Nenhum componente muda: quem lê `arquivo` é o `<Marca>`, e ele
   troca o wordmark pela imagem sozinho — no tour e no render do vídeo.

## Regras que continuam valendo

- Não distorcer: a `proporcao` precisa bater com o viewBox do arquivo.
- Não recolorir a marca de terceiro. O azul da peça é o acento da **conexão**,
  não do logo.
- Não referenciar arquivo hospedado fora (hotlink): o render do vídeo roda sem
  rede garantida e a imagem sairia em branco.
