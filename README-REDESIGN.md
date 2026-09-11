# JP Clínica Integrada Odontológica — redesign aplicado

> **📌 DOCUMENTO HISTÓRICO.** Registra a proposta aprovada em conversa, do
> redesign original. **Não descreve mais o site de hoje** — o verde `#2F6B35`
> saiu, a clínica tem 24 anos (não 23) e a ordem da home mudou: tratamentos
> subiram para a terceira posição e a história desceu para a quinta.
>
> **O sistema visual vigente está em [DESIGN.md](DESIGN.md)**, com razões de
> contraste medidas e tokens conferidos contra o CSS compilado. Este arquivo
> fica como registro do ponto de partida.


Este pacote é a versão consolidada do redesign aprovado na conversa.

## Sistema visual
- 60% branco/off-white, 30% verde profundo, 10% verde vivo.
- Verde profundo: `#052D0B`
- Verde institucional: `#2F6B35`
- Verde de destaque: `#7BD51C`
- Off-white: `#F7F8F2`
- Grafite: `#172018`
- Cinza de texto: `#667168`
- Títulos: Manrope 700/800
- Texto, menu e botões: Inter 400/500/600/700

## Estrutura da home
1. Capa clara com foto grande do consultório e CTAs.
2. Metodologia em verde profundo, com imagem humana e 4 pilares.
3. História em verde médio/profundo, 23 anos, maçã e área de fundadores.
4. Especialidades em fundo claro, 8 cards com imagem.
5. Para toda a família em fundo escuro.
6. Avaliações em fundo claro.
7. Equipe em fundo claro, com 5 cards preparados para retratos.
8. Estrutura em carrossel de foto grande.
9. FAQ escuro com imagem de pessoa sorrindo ao fundo.
10. Contato/agendamento claro com formulário + Google Maps.
11. Rodapé verde profundo.

A antiga seção verde “Seu sorriso pede check-up” foi removida.

## CTA persistente
Depois que o usuário sai da capa, uma barra de agendamento aparece fixa na tela em desktop.
No mobile, permanece a barra inferior de telefone/WhatsApp. O botão flutuante do WhatsApp continua disponível.

## Imagens e dados pendentes
O projeto não inventa nomes, CROs ou fotografias profissionais.
- `src/lib/jp.ts`: contém a responsável técnica confirmada e 4 espaços para profissionais ainda não informados.
- A seção de fundadores está pronta visualmente, mas usa placeholders neutros até as fotos oficiais serem fornecidas.
- A imagem humana da metodologia é ilustrativa e foi derivada do conceito visual aprovado; não é apresentada como paciente ou profissional identificado da clínica.
- Para inserir retratos de equipe, use imagens recortadas com fundo transparente e preencha o campo `foto` em `EQUIPE`.

## Observação de build neste ambiente
O código foi validado por transpile de TypeScript/TSX. O `npm ci` deste ambiente não conclui porque o registry interno não possui um tarball de `zod` referenciado pelo lockfile. Em um registry npm normal, mantenha `package.json` e `package-lock.json` e rode `npm ci && npm run build`.
