# PROMPT DEFINITIVO — PREPARAR A JP CLÍNICA PARA TRÁFEGO PAGO DE IMPLANTES

## CONTEXTO

Você vai trabalhar no repositório real:

- **GitHub:** `felipemenezes25000-spec/jp-clinica-odontologica`
- **Branch principal:** `main`
- **Site em produção:** `https://www.jpclinicaodontologica.com.br/`
- **Landing principal de mídia paga para implantes:** `/implante-dentario`
- **Página orgânica correspondente:** `/tratamentos/implantes-dentarios`

O objetivo desta tarefa é preparar tecnicamente o site da **JP Clínica Integrada Odontológica** para iniciar tráfego pago de **implantes dentários**, com foco inicial em:

1. **Google Ads Search**
2. **Meta Ads / Instagram**
3. Conversão principal via **WhatsApp**
4. Atendimento feito por **recepção humana**
5. **SEM usar o CRC como dependência operacional nesta primeira fase**
6. **SEM chatbot/IA conversando com paciente nesta primeira fase**

A IA pode continuar sendo usada nos bastidores para análise, otimização, criativos e relatórios, mas o fluxo do paciente deve permanecer simples:

```text
Google Ads / Meta Ads
        ↓
Landing Page / WhatsApp
        ↓
Recepção humana
        ↓
Agendamento
        ↓
Comparecimento
        ↓
Tratamento fechado
```

---

# 1. REGRA MAIS IMPORTANTE

## NÃO REFAÇA A ARQUITETURA.

Antes de escrever qualquer código:

1. Leia o repositório.
2. Leia o `README.md`.
3. Leia o `DESIGN.md`.
4. Leia `docs/ANUNCIAR.md`.
5. Leia os arquivos atuais de tracking, WhatsApp, SEO, LPs, tratamento, root, privacy e testes.
6. Preserve a stack, padrões, design system, arquitetura e convenções existentes.

A stack existente é intencional e NÃO deve ser substituída.

Hoje o projeto usa, entre outros:

- React 19
- TanStack Start
- TanStack Router
- SSR
- Vite 8
- Tailwind CSS v4
- Vitest
- Playwright
- Nitro/Vercel

Não migrar para Next.js.
Não adicionar framework novo.
Não duplicar páginas.
Não introduzir biblioteca de componentes desnecessária.
Não alterar identidade visual da clínica sem necessidade.

---

# 2. OBJETIVO DE NEGÓCIO

Implantes serão o principal produto de aquisição.

A campanha deve ser construída para responder à seguinte pergunta:

> **Qual campanha, anúncio, termo e criativo gerou uma conversa de WhatsApp que posteriormente virou paciente?**

Nesta primeira fase ainda não teremos o fechamento automático de receita via CRC.

Portanto precisamos garantir com excelência:

```text
clique
→ landing
→ CTA
→ WhatsApp
→ origem da campanha preservada
```

E deixar o sistema preparado para posteriormente receber:

```text
agendou
compareceu
fechou
valor vendido
```

sem precisar refazer o tracking.

---

# 3. ESCOPO DESTA IMPLEMENTAÇÃO

A implementação deve fechar completamente a camada:

- Google Tag Manager
- Google Analytics 4
- Google Ads
- Meta Pixel
- Consentimento
- Google Consent Mode
- UTMs
- `gclid`
- `fbclid`
- tracking de conversões
- atribuição de campanha
- LP de implante
- WhatsApp
- testes E2E
- documentação
- segurança contra dupla contagem

---

# 4. PROBLEMA CRÍTICO Nº 1 — DUPLA/TRIPLA CONTAGEM DE CONVERSÕES

Hoje o código pode disparar múltiplos eventos para **um único clique**.

Exemplo possível:

```text
whatsapp_click
+
schedule_click
+
treatment_cta_click
```

Isso é inadequado se os três forem tratados como conversões.

Um único usuário não pode virar 2 ou 3 leads apenas porque clicou uma vez.

## NOVA SEMÂNTICA OBRIGATÓRIA

Criar uma semântica de eventos clara.

### Evento principal de lead

```text
generate_lead
```

Dispara **uma única vez por ação do usuário** quando o CTA representa intenção real de contato/agendamento.

Exemplo:

```text
generate_lead
channel = whatsapp
treatment = implantes-dentarios
origin = hero
```

### Evento secundário de contato genérico

```text
contact_click
```

Usar para contato de baixa especificidade, quando não for lead/agendamento propriamente dito.

### Eventos analíticos

Podem continuar existindo eventos como:

```text
treatment_view
form_start
form_submit
map_click
review_click
phone_click
```

MAS:

- não transformar tudo em conversão primária;
- não duplicar o mesmo comportamento comercial;
- não enviar dois `Lead` da Meta para o mesmo clique;
- não enviar duas conversões primárias ao Google Ads para a mesma ação.

## REGRA

Um clique de "Agendar avaliação" via WhatsApp deve produzir:

```text
1 lead
```

e não:

```text
1 Contact
+
2 Leads
```

---

# 5. PROBLEMA CRÍTICO Nº 2 — `/implante-dentario` NÃO PODE FICAR FORA DO TRACKING

Hoje parte da lógica identifica tratamento apenas quando:

```text
pathname.startsWith("/tratamentos/")
```

Isso deixa a rota paga:

```text
/implante-dentario
```

fora de parte da instrumentação.

Isso precisa ser corrigido.

## CRIAR UM MAPA CENTRAL DE ROTAS PAGAS

Algo equivalente a:

```ts
const ROTAS_PAGAS = {
  "/implante-dentario": "implantes-dentarios",
  "/protese-dentaria": "proteses-dentarias",
  "/ortodontia": "ortodontia",
  "/clareamento-dental": "clareamento-dental",
  "/odontopediatria": "odontopediatria",
  "/restauracao-dentaria": "restauracoes",
  "/limpeza-dental": "limpeza-profilaxia",
  "/harmonizacao-facial": "harmonizacao-orofacial",
};
```

Não precisa ser literalmente nesse arquivo/formato se houver solução melhor dentro da arquitetura atual.

O importante é ter **uma única fonte de verdade**.

O sistema deve reconhecer corretamente como tratamento:

```text
/tratamentos/implantes-dentarios
```

e:

```text
/implante-dentario
```

ambos como:

```text
implantes-dentarios
```

---

# 6. GOOGLE TAG MANAGER

Adicionar suporte de produção para GTM.

Não hardcodar ID.

Usar variável de ambiente compatível com a arquitetura existente, por exemplo:

```text
VITE_GTM_ID
```

ou outro padrão melhor para TanStack Start/Vite, desde que seguro e documentado.

## REQUISITOS

- carregar somente quando configurado;
- não quebrar SSR;
- não causar hydration mismatch;
- não bloquear CTA;
- não lançar erro se ausente;
- adicionar `noscript` se apropriado;
- funcionar em produção na Vercel.

Atualizar `.env.example`.

---

# 7. GOOGLE ANALYTICS 4

Preparar o site para GA4 através do GTM.

Não espalhar `gtag()` em componentes.

Os componentes devem continuar emitindo eventos por uma camada central.

## EVENTOS RELEVANTES

No mínimo:

```text
page_view
treatment_view
generate_lead
contact_click
phone_click
form_start
form_submit
map_click
review_click
```

Para `generate_lead`, enviar contexto:

```text
treatment
channel
origin
landing_page
utm_source
utm_medium
utm_campaign
utm_content
utm_term
```

quando existirem.

Nunca enviar:

- conteúdo clínico sensível;
- diagnóstico;
- texto livre do paciente;
- informação de saúde desnecessária;
- telefone;
- nome;
- e-mail em parâmetro analítico comum.

---

# 8. GOOGLE ADS

O Google Ads deve otimizar para **uma conversão primária de lead**.

## CONVERSÃO PRIMÁRIA

```text
generate_lead
```

### Para Google Search de implantes

O evento precisa carregar:

```text
treatment = implantes-dentarios
channel = whatsapp
```

## NÃO USAR COMO CONVERSÃO PRIMÁRIA

```text
page_view
treatment_view
map_click
review_click
whatsapp_click genérico
```

se isso criar dupla contagem.

## GCLID

Preservar `gclid` quando presente.

Ele deve sobreviver à navegação dentro do site pelo período necessário para atribuição da sessão/visita.

Preparar estrutura para futuramente usar:

- Enhanced Conversions for Leads
- importação de conversões offline
- Google Ads Data Manager/API

Não precisa implementar envio offline agora, mas a arquitetura não pode bloquear essa evolução.

---

# 9. META PIXEL

Adicionar suporte ao Meta Pixel por variável de ambiente.

Exemplo:

```text
VITE_META_PIXEL_ID
```

ou solução equivalente dentro da arquitetura.

## EVENTOS

### Página de tratamento

```text
ViewContent
```

### Lead real

```text
Lead
```

### Contato genérico

```text
Contact
```

## REGRA ABSOLUTA

O mesmo clique de CTA de agendamento não pode disparar:

```text
Contact
+
Lead
+
Lead
```

Escolher uma semântica consistente.

Para CTA de agendamento de implante:

```text
Lead
```

é suficiente.

---

# 10. CONSENTIMENTO / LGPD / GOOGLE CONSENT MODE

Implementar uma camada simples e correta de consentimento.

Não criar um popup invasivo gigante.

Criar componente coerente com o `DESIGN.md`.

Exemplo conceitual:

```text
Usamos cookies e tecnologias semelhantes para medição e melhoria das campanhas.

[Rejeitar] [Aceitar]
```

## GOOGLE CONSENT MODE

Preparar/usar os estados:

```text
analytics_storage
ad_storage
ad_user_data
ad_personalization
```

## COMPORTAMENTO

Antes do consentimento:

- respeitar o padrão configurado;
- não sair armazenando identificadores de publicidade de forma indevida;
- não bloquear funcionalidade essencial do site.

Após consentimento:

- ativar medição permitida.

Após recusa:

- respeitar a escolha.

Salvar a escolha de forma apropriada.

Criar mecanismo para o usuário revisar/alterar a decisão, preferencialmente via rodapé/política.

Atualizar `politica-de-privacidade` quando necessário.

---

# 11. CAMADA DE ATRIBUIÇÃO SEM DEPENDER DO CRC

O CRC NÃO deve ser necessário para a primeira fase de tráfego.

Criar uma pequena camada própria do site público para atribuição.

Sugestão de organização:

```text
src/lib/analytics/
  attribution.ts
  events.ts
  consent.ts
```

Não é obrigatório usar exatamente esses nomes.

## PARÂMETROS A CAPTURAR

```text
utm_source
utm_medium
utm_campaign
utm_content
utm_term
gclid
fbclid
landing_page
```

Se aplicável, considerar também:

```text
gbraid
wbraid
```

desde que isso seja tecnicamente correto e não complique sem necessidade.

## REGRAS

- capturar na primeira entrada;
- manter durante a sessão;
- não sobrescrever atribuição original de forma errada a cada navegação interna;
- separar first-touch e current-touch apenas se fizer sentido;
- não guardar query string completa se puder conter dados pessoais;
- limitar tamanho dos valores;
- sanitizar;
- não armazenar telefone/nome/e-mail;
- respeitar consentimento quando exigido.

---

# 12. WHATSAPP — PRESERVAR O CONTEXTO DO IMPLANTE

Hoje o hero da página usa assunto do tratamento, mas o CTA flutuante pode ficar genérico.

Corrigir isso.

## NA PÁGINA DE IMPLANTE

Todos os CTAs de WhatsApp devem abrir uma mensagem coerente com implante.

Exemplo:

```text
Olá! Vi a página sobre implantes dentários no site da JP Clínica Integrada Odontológica e gostaria de agendar uma avaliação.
```

## FLOATING CTA

Permitir que o componente receba contexto:

```tsx
<FloatingCTA assunto={treatment.titulo} />
```

ou solução arquitetural equivalente.

Na home continua genérico.

Na página de implante fica específico.

---

# 13. REFERÊNCIA CURTA DE CAMPANHA NO WHATSAPP

Como não teremos CRC operacional nesta primeira fase, criar uma forma discreta de identificar a campanha no WhatsApp.

NÃO enviar:

```text
gclid=EAIaIQob...
fbclid=IwZXh...
utm_campaign=...
utm_content=...
```

Isso ficaria horrível para paciente e recepção.

Criar uma referência curta legível.

Exemplos:

```text
Ref.: IMP-G-A01
```

ou:

```text
Ref.: IMP-M-V03
```

O código pode derivar isso a partir de campanha/criativo.

Exemplo:

```text
IMP = implante
G = Google
M = Meta
A01 = anúncio/criativo
```

A referência:

- deve ser curta;
- não deve expor dado pessoal;
- deve ser opcional;
- não pode quebrar a mensagem se a campanha não tiver parâmetros;
- deve ser fácil de registrar pela recepção.

Se não houver campanha:

não mostrar referência.

---

# 14. LANDING PAGE DE IMPLANTE — NÃO DUPLICAR

Já existe:

```text
/implante-dentario
```

e ela reutiliza `PaginaDeTratamento`.

Isso deve ser preservado.

NÃO criar uma cópia gigante da página.

## CRIAR MODO DE AQUISIÇÃO

Permitir algo equivalente a:

```tsx
<PaginaDeTratamento slug="implantes-dentarios" modo="anuncio" />
```

e na orgânica:

```tsx
<PaginaDeTratamento slug="implantes-dentarios" modo="organico" />
```

A implementação pode seguir outro padrão se for mais idiomático ao projeto.

---

# 15. COMO DEVE SER O MODO ANÚNCIO

O modo anúncio deve reduzir distração.

## HERO

Prioridade:

```text
Implante dentário na Freguesia do Ó
```

ou mensagem semanticamente equivalente, respeitando SEO, ética e design.

Subtexto:

```text
Planejamento individual para reabilitação de dentes ausentes.
```

Prova social real:

```text
4,6★ no Google
192 avaliações
```

Localização:

```text
Vila Bruna • região da Freguesia do Ó
```

CTA:

```text
Falar sobre implante no WhatsApp
```

ou:

```text
Agendar avaliação
```

Não inventar números.

Os valores devem continuar vindo da fonte única existente (`jp.ts`).

---

# 16. REDUZIR DISTRAÇÕES DA LP PAGA

Na versão `modo="anuncio"`:

avaliar reduzir ou remover:

- navegação que leva para tratamentos irrelevantes;
- cross-sell excessivo;
- "todos os tratamentos" em posição de destaque;
- saídas que desviem intenção.

NÃO remover:

- marca;
- endereço;
- CRO;
- prova social;
- informações importantes;
- política;
- conteúdo necessário para confiança;
- acessibilidade.

O objetivo é:

```text
pessoa pesquisou implante
↓
continua entendendo implante
↓
confia na JP
↓
fala com a JP
```

---

# 17. NÃO FAZER LANDING "AGRESSIVA"

Não transformar a clínica em infoproduto.

Evitar:

```text
OFERTA IMPERDÍVEL
ÚLTIMAS VAGAS
50% OFF
IMPLANTE HOJE
RESULTADO GARANTIDO
SEM DOR
MELHOR CLÍNICA DE SP
```

A landing deve continuar com linguagem de saúde séria.

---

# 18. PROFISSIONAL RESPONSÁVEL POR IMPLANTES

Criar a estrutura/componentização para destacar o profissional responsável pelo tratamento, MAS:

## NÃO INVENTE O PROFISSIONAL.

Antes de publicar:

- identificar no repositório se há informação verificável;
- se não houver, criar componente/slot preparado;
- deixar claramente documentado que depende da confirmação da clínica.

Quando houver confirmação:

mostrar:

```text
Foto real
Nome
CRO
qualificação verdadeira pertinente
```

Nada de título inventado.

---

# 19. FAQ DE IMPLANTES

A página já possui FAQ.

Revisar para incluir perguntas de alta intenção, se ainda não estiverem adequadamente cobertas:

```text
Quem pode fazer implante?
Preciso fazer exames antes?
É possível colocar implante quando falta apenas um dente?
Quem usa prótese pode avaliar implantes?
É necessário ter osso suficiente?
Quanto tempo pode levar o tratamento?
Como funciona a avaliação?
Onde fica a JP?
```

Respostas:

- claras;
- prudentes;
- sem diagnóstico individual;
- sem promessa;
- enfatizando avaliação profissional quando necessário.

Manter schema estruturado correto.

---

# 20. FORMULÁRIO DA HOME E CRC

Hoje o `ContactForm` tenta registrar lead em:

```text
/api/crc/lead
```

antes de abrir WhatsApp.

Isso NÃO pode se tornar dependência crítica do funil pago.

## REGRA

Mesmo que o CRC esteja:

- desligado;
- sem banco;
- com endpoint indisponível;

o usuário precisa continuar conseguindo abrir o WhatsApp normalmente.

Não transformar falha de CRC em bloqueio de aquisição.

Para a campanha de implante, o principal fluxo inicial será:

```text
Google Ads
→ LP
→ WhatsApp
```

e:

```text
Meta Ads
→ WhatsApp
```

O formulário da home pode continuar existindo, desde que não prejudique o fluxo principal.

---

# 21. PRIVACIDADE DOS EVENTOS

Nunca enviar para:

- GA4
- Google Ads
- Meta

dados como:

```text
nome
telefone
e-mail
texto livre
diagnóstico
doença
medicação
tratamento clínico sensível individual
```

O evento pode dizer:

```text
treatment = implantes-dentarios
```

porque isso descreve a página/campanha.

Mas não deve dizer:

```text
usuario_perdeu_3_dentes = true
```

ou informação médica individual.

---

# 22. META / GOOGLE — NÃO USAR SEGMENTAÇÃO SENSÍVEL

Não implementar nenhum mecanismo que crie ou use audiência com inferência médica individual indevida.

Não tentar classificar visitante como:

```text
pessoa sem dentes
pessoa com doença periodontal
pessoa que precisa de implante
```

A segmentação deve respeitar políticas de publicidade e privacidade.

---

# 23. PUBLICIDADE ODONTOLÓGICA

Preservar conformidade ética.

Não introduzir:

- promessa de resultado;
- "resultado garantido";
- "indolor";
- "sem dor";
- superlativos não comprováveis;
- promoções agressivas;
- descontos como chamariz;
- material clínico incompatível com regras do CFO;
- antes/depois institucional indevido.

Utilizar:

- localização;
- estrutura;
- equipe;
- CRO;
- nota real;
- avaliações;
- anos reais de história;
- convite para avaliação;
- informação educativa.

Antes de alterar qualquer copy regulatória, conferir regra vigente.

---

# 24. GOOGLE BUSINESS PROFILE

Não é implementação de código, mas atualizar documentação/checklist para lembrar:

- site correto no Perfil da Empresa;
- descrição coerente;
- idade correta da clínica;
- quantidade de especialistas coerente com o site;
- horário;
- endereço;
- telefone;
- link para agendamento/site.

Não alterar dados sem fonte.

---

# 25. TESTES UNITÁRIOS

Criar testes para a camada de atribuição.

## COBRIR

```text
utm_source
utm_medium
utm_campaign
utm_content
utm_term
gclid
fbclid
landing_page
```

Testar:

### Google

```text
/implante-dentario
?utm_source=google
&utm_medium=cpc
&utm_campaign=implante_search
&utm_content=a01
&gclid=ABC123
```

Resultado esperado:

```text
source = google
medium = cpc
campaign = implante_search
content = a01
gclid = ABC123
treatment = implantes-dentarios
```

### Meta

```text
/implante-dentario
?utm_source=instagram
&utm_medium=paid_social
&utm_campaign=implante_meta
&utm_content=video03
&fbclid=XYZ
```

Resultado esperado:

```text
source = instagram
campaign = implante_meta
content = video03
fbclid = XYZ
treatment = implantes-dentarios
```

---

# 26. TESTES E2E OBRIGATÓRIOS

Usar Playwright.

Criar cenário real para:

```text
/implante-dentario
?utm_source=google
&utm_medium=cpc
&utm_campaign=implante_search
&utm_content=a01
&gclid=TEST123
```

## PROVAR

- [ ] a página responde;
- [ ] SSR não quebra;
- [ ] H1 correto;
- [ ] CTA principal existe;
- [ ] CTA principal abre WhatsApp;
- [ ] mensagem fala de implantes;
- [ ] atribuição está disponível;
- [ ] `generate_lead` dispara;
- [ ] `generate_lead` dispara UMA vez;
- [ ] nenhum `Lead` duplicado é enviado à Meta;
- [ ] nenhuma conversão primária duplicada é enviada ao Google;
- [ ] `treatment = implantes-dentarios`;
- [ ] `utm_campaign = implante_search`;
- [ ] `utm_content = a01`;
- [ ] `gclid = TEST123` é preservado internamente;
- [ ] CTA sticky mantém contexto de implante;
- [ ] mobile funciona;
- [ ] desktop funciona;
- [ ] analytics ausente não impede CTA;
- [ ] Pixel ausente não impede CTA;
- [ ] GTM ausente não impede CTA;
- [ ] consentimento rejeitado não impede CTA.

---

# 27. TESTE CONTRA DUPLA CONTAGEM

Criar teste de regressão explícito.

Exemplo:

```text
usuário clica uma vez em "Agendar avaliação"
```

Esperado:

```text
generate_lead = 1
Meta Lead = 1
Google primary conversion signal = 1
```

Nunca:

```text
generate_lead = 2
Lead = 2
Contact = 1
```

Esse teste é obrigatório.

---

# 28. TESTAR TODAS AS ROTAS PAGAS

No mínimo validar reconhecimento de tratamento para:

```text
/implante-dentario
/protese-dentaria
/ortodontia
/clareamento-dental
/odontopediatria
/restauracao-dentaria
/limpeza-dental
/harmonizacao-facial
```

Não precisa otimizar todas visualmente agora, mas a infraestrutura de tracking deve reconhecê-las corretamente.

---

# 29. PERFORMANCE

Não aceitar tracking que destrua Core Web Vitals.

Regras:

- scripts externos carregados de forma apropriada;
- evitar render blocking;
- não adicionar bibliotecas gigantes para tarefa simples;
- não quebrar SSR;
- não aumentar bundle desnecessariamente;
- manter lazy loading onde fizer sentido.

A prioridade continua sendo:

```text
site rápido
+
CTA funcionando
+
medição correta
```

---

# 30. ACESSIBILIDADE

Preservar:

- navegação por teclado;
- foco;
- `aria-*`;
- contraste;
- tap targets;
- menu mobile;
- `prefers-reduced-motion`;
- comportamento atual do design system.

Consent banner também precisa ser acessível.

---

# 31. DOCUMENTAÇÃO

Atualizar:

```text
docs/ANUNCIAR.md
```

porque hoje existem afirmações que não correspondem integralmente ao comportamento real da LP paga.

O documento final precisa explicar:

## O que já está no código

- LPs
- tracking
- atribuição
- consentimento
- eventos

## O que depende de credencial externa

- `GTM_ID`
- `GA4_MEASUREMENT_ID`, se necessário
- `META_PIXEL_ID`
- Google Ads Conversion ID/Label, se usados diretamente

## O que configurar no GTM

## O que configurar no GA4

## O que configurar no Google Ads

## O que configurar na Meta

## Qual é a conversão primária

```text
generate_lead
```

## Como testar

- GTM Preview
- GA4 DebugView
- Meta Events Manager
- Google Tag Assistant

---

# 32. `.env.example`

Adicionar todas as variáveis necessárias e comentários claros.

Exemplo conceitual:

```env
# Google Tag Manager
VITE_GTM_ID=

# Meta Pixel
VITE_META_PIXEL_ID=
```

Se a arquitetura exigir nomes diferentes, usar os tecnicamente corretos.

Não commitar IDs reais.

---

# 33. NÃO EXPOR SEGREDOS

Pixel ID e GTM ID são identificadores públicos, mas:

- não confundir com token;
- não colocar access token client-side;
- não colocar segredo do Google Ads no frontend;
- não colocar Meta Conversion API token no frontend;
- não colocar service account no frontend.

Se futuramente houver CAPI:

deve ser server-side.

---

# 34. PREPARAR PARA CONVERSION API FUTURA

Não precisa implementar CAPI agora.

Mas a arquitetura de eventos deve permitir futuramente:

```text
browser event_id
+
server event_id
```

para deduplicação browser/server.

Se for simples, já criar suporte a `event_id` para `generate_lead`.

Se isso adicionar complexidade desproporcional, documentar o ponto de extensão.

---

# 35. PREPARAR PARA CONVERSÃO OFFLINE FUTURA

Não precisa integrar fechamento ao Google Ads agora.

Mas não perder:

```text
gclid
campaign
content
landing_page
timestamp
```

para que posteriormente seja possível importar:

```text
lead_qualified
appointment
show
sale
```

---

# 36. SEM CRC COMO DEPENDÊNCIA

Repetindo porque é importante:

## NÃO usar o CRC como requisito para o tráfego iniciar.

Não depender de:

```text
/crc
crc_leads
Dental Office
WhatsApp Cloud API
agentes
oportunidades
automação
```

para:

```text
visita
→ CTA
→ WhatsApp
→ medição básica
```

O CRC poderá ser conectado depois.

---

# 37. SEM CHATBOT

Não criar:

- chatbot;
- diagnóstico automático;
- triagem clínica por IA;
- atendimento automático de saúde;
- IA respondendo paciente no WhatsApp.

Nesta fase:

```text
paciente
→ WhatsApp
→ recepção humana
```

---

# 38. CRIAR UMA IMPLEMENTAÇÃO LIMPA

Evitar "if" espalhado por componentes.

Preferir fontes centrais:

```text
analytics
attribution
treatment routes
consent
```

O código precisa ser compreensível meses depois.

---

# 39. ANALISAR O CÓDIGO ANTES DE ALTERAR

Antes do primeiro patch, faça uma auditoria dos arquivos diretamente relacionados.

No mínimo:

```text
src/routes/__root.tsx
src/routes/implante-dentario.tsx
src/routes/tratamentos/$slug.tsx
src/components/site/PaginaDeTratamento.tsx
src/components/site/FloatingCTA.tsx
src/components/site/RastreioDeContato.tsx
src/components/site/ContactForm.tsx
src/lib/contato.ts
src/lib/jp.ts
src/lib/seo.ts
src/lib/dadosEstruturados.ts
src/routes/politica-de-privacidade.tsx
docs/ANUNCIAR.md
.env.example
package.json
vite.config.ts
```

Também pesquisar por:

```text
fbq
dataLayer
gtag
utm_
gclid
fbclid
whatsapp_click
schedule_click
treatment_cta_click
treatment_view
Lead
Contact
```

---

# 40. NÃO CONFIAR CEGAMENTE NA DOCUMENTAÇÃO

O código é a fonte real.

Já existe divergência entre:

```text
docs/ANUNCIAR.md
```

e comportamento atual de:

```text
RastreioDeContato
```

Logo:

1. validar código;
2. corrigir código;
3. atualizar documentação.

Nunca alterar código apenas para "bater" com um documento errado sem verificar a intenção.

---

# 41. NÃO ALTERAR O DESIGN GLOBAL

A landing paga pode ficar mais focada.

Mas:

- preservar marca;
- preservar tipografia;
- preservar cores;
- preservar tokens;
- preservar componentes;
- preservar sistema visual.

Ler `DESIGN.md` antes.

---

# 42. NÃO USAR IMAGEM GENÉRICA DE BANCO

Se precisar de material visual na landing:

preferir os assets já aprovados da clínica/repositório.

Não adicionar sorriso genérico de banco só porque "parece publicidade".

---

# 43. NÃO MEXER EM RH/CRC SEM NECESSIDADE

O repositório contém sistemas grandes além do site.

Não aproveitar esta tarefa para refatorar:

```text
/rh
/crc
Dental Office
workflow
jobs
analytics internos do CRC
```

Escopo é o site público + tracking de aquisição.

---

# 44. BUILD E QUALIDADE

Antes de concluir:

rodar todos os comandos relevantes do projeto.

No mínimo:

```bash
npm ci
npm run lint
npm run typecheck
npm run test
npm run build
npm run e2e
```

Se existir `npm run check` como agregador oficial:

rodar também.

Não considerar tarefa concluída se build passar mas E2E falhar.

---

# 45. TESTAR BUILD REAL

O repositório já teve incidentes em que build verde não significou runtime saudável.

Portanto:

- servir build;
- abrir home;
- abrir `/implante-dentario`;
- verificar console;
- verificar navegação;
- verificar CTA;
- verificar mobile;
- verificar SSR.

---

# 46. CRITÉRIOS DE ACEITE FUNCIONAIS

A tarefa só está concluída se:

- [ ] `/implante-dentario` funciona;
- [ ] página reconhecida como implantes pelo tracking;
- [ ] WhatsApp do hero mantém contexto;
- [ ] WhatsApp sticky mantém contexto;
- [ ] UTM capturada;
- [ ] `gclid` capturado;
- [ ] `fbclid` capturado;
- [ ] referência curta aparece quando aplicável;
- [ ] `generate_lead` dispara uma vez;
- [ ] Meta recebe no máximo um `Lead` por clique;
- [ ] Google recebe uma conversão primária;
- [ ] consentimento funciona;
- [ ] rejeitar tracking não impede WhatsApp;
- [ ] sem GTM o site funciona;
- [ ] sem Pixel o site funciona;
- [ ] sem CRC o funil funciona;
- [ ] E2E cobre tráfego pago;
- [ ] docs atualizadas.

---

# 47. CRITÉRIOS DE ACEITE DE CÓDIGO

- [ ] TypeScript sem erro
- [ ] lint sem erro
- [ ] testes verdes
- [ ] build verde
- [ ] E2E verde
- [ ] sem segredo no bundle
- [ ] sem dependência desnecessária
- [ ] sem duplicação de página
- [ ] sem IDs reais commitados
- [ ] sem analytics espalhado por JSX
- [ ] tracking centralizado
- [ ] arquitetura atual preservada

---

# 48. ENTREGÁVEIS

Ao final, entregar:

## 1. Código implementado

Tudo necessário para a fase 1.

## 2. Lista de arquivos alterados

Formato:

```text
arquivo
→ o que mudou
→ por quê
```

## 3. Variáveis de ambiente necessárias

Sem valores reais.

## 4. Passo a passo externo

Separar o que eu preciso fazer manualmente em:

### Google Tag Manager

### GA4

### Google Ads

### Meta Pixel

## 5. Testes executados

Mostrar resultado real.

## 6. Pendências não técnicas

Exemplo:

```text
confirmar profissional responsável por implantes
criar conta GTM
criar Pixel
vincular Google Ads
```

## 7. Checklist para colocar campanha no ar

---

# 49. CAMPANHA INICIAL PARA A QUAL O SITE ESTÁ SENDO PREPARADO

A arquitetura deve assumir como primeira campanha:

```text
Canal: Google Ads Search
Tratamento: Implantes dentários
Região: Freguesia do Ó / Vila Bruna / Zona Norte próxima
Landing: /implante-dentario
Conversão: generate_lead
Canal de conversão: WhatsApp
```

Exemplo de URL:

```text
https://www.jpclinicaodontologica.com.br/implante-dentario
?utm_source=google
&utm_medium=cpc
&utm_campaign=implante_search
&utm_content=a01
&utm_term={keyword}
```

com auto-tagging do Google habilitado para `gclid`.

---

# 50. META ADS INICIAL

O fluxo de Meta poderá ser:

```text
Instagram/Facebook
→ WhatsApp direto
```

ou:

```text
Instagram/Facebook
→ /implante-dentario
→ WhatsApp
```

A infraestrutura precisa suportar ambos.

Exemplo:

```text
utm_source=instagram
utm_medium=paid_social
utm_campaign=implante_meta
utm_content=video03
```

---

# 51. MÉTRICAS QUE DEVEM SER POSSÍVEIS APÓS A IMPLEMENTAÇÃO

Sem CRC, no mínimo:

```text
sessões por campanha
treatment_view
generate_lead
custo por lead
origem
campanha
criativo
landing
canal
CTA de origem
```

Posteriormente:

```text
agendamento
comparecimento
fechamento
receita
CAC
ROAS real
```

---

# 52. MÉTRICA PRINCIPAL

Não otimizar para:

```text
page_view
```

nem apenas:

```text
CPC
```

Nesta fase a principal métrica digital é:

```text
CUSTO POR LEAD REAL / CONTATO DE WHATSAPP
```

Depois será:

```text
CUSTO POR PACIENTE FECHADO
```

---

# 53. ESTRATÉGIA DE EVENTOS RECOMENDADA

Modelo desejado:

```text
page_view
    ↓
treatment_view
    ↓
generate_lead
```

Opcionalmente:

```text
contact_click
```

para contato genérico.

Não criar um funil analítico em que um único clique artificialmente avance por vários eventos de conversão do mesmo peso.

---

# 54. EXEMPLO DE EVENTO `generate_lead`

Conceitualmente:

```json
{
  "event": "generate_lead",
  "treatment": "implantes-dentarios",
  "channel": "whatsapp",
  "origin": "hero",
  "landing_page": "/implante-dentario",
  "utm_source": "google",
  "utm_medium": "cpc",
  "utm_campaign": "implante_search",
  "utm_content": "a01"
}
```

Não usar isso como contrato rígido se houver convenção melhor no código.

Mas preservar a informação.

---

# 55. MELHORIA DA LP — ORDEM DE PRIORIDADE

## P0

Tracking correto.

## P1

Conversão.

## P2

Otimização visual.

Não gastar dois dias refinando animação antes de corrigir a dupla contagem.

---

# 56. ORDEM DE EXECUÇÃO

Execute nesta ordem:

### Etapa 1

Auditar código atual.

### Etapa 2

Criar/ajustar semântica de eventos.

### Etapa 3

Corrigir reconhecimento das rotas pagas.

### Etapa 4

Criar camada de atribuição.

### Etapa 5

Corrigir contexto de WhatsApp.

### Etapa 6

Adicionar GTM/Meta Pixel configuráveis.

### Etapa 7

Implementar consentimento.

### Etapa 8

Criar modo anúncio da LP.

### Etapa 9

Testes unitários.

### Etapa 10

Testes E2E.

### Etapa 11

Atualizar documentação.

### Etapa 12

Build + validação de runtime.

---

# 57. NÃO ME PEÇA CONFIRMAÇÃO PARA DETALHES ÓBVIOS

Você tem autorização para:

- criar arquivos de analytics;
- refatorar tracking;
- adicionar testes;
- ajustar LP;
- atualizar docs;
- atualizar `.env.example`;
- alterar componentes do site público necessários.

Não precisa pedir confirmação a cada arquivo.

Faça a implementação completa.

Só não invente:

- CRO;
- profissional responsável;
- preço;
- credenciais externas;
- IDs de GTM/Pixel;
- dados da clínica não existentes no repo.

---

# 58. AO ENCONTRAR UMA DECISÃO DUVIDOSA

Escolha a opção que:

1. preserva arquitetura atual;
2. preserva conversão;
3. reduz risco de tracking incorreto;
4. reduz dependência;
5. mantém privacidade;
6. é testável;
7. é simples.

Documente a decisão.

---

# 59. RESULTADO FINAL ESPERADO

Depois da implementação eu quero conseguir criar este anúncio:

```text
Implante Dentário na Freguesia do Ó
JP Clínica Integrada Odontológica
Agende uma avaliação.
```

Mandar para:

```text
https://www.jpclinicaodontologica.com.br/implante-dentario
```

e ter confiança de que:

```text
Google Ads
        ↓
usuário chega com gclid/UTM
        ↓
JP preserva atribuição
        ↓
usuário entende que está numa página de implante
        ↓
clica em WhatsApp
        ↓
mensagem fala de implante
        ↓
generate_lead = 1
        ↓
GA4 recebe corretamente
        ↓
Google Ads recebe corretamente
        ↓
Meta, se aplicável, recebe corretamente
        ↓
recepção humana atende
```

SEM:

```text
dupla contagem
dependência do CRC
chatbot
tracking quebrado
perda de UTM
IDs hardcoded
dados de saúde enviados a analytics
```

---

# 60. CONCLUSÃO DA TAREFA

Não faça apenas uma análise.

**Implemente.**

Faça os patches necessários, rode os testes, revise o comportamento real e entregue o repositório tecnicamente pronto para começar tráfego pago de implantes.

Ao final, responda com:

```text
1. O que foi alterado
2. Arquivos alterados
3. Testes executados
4. Resultado do build
5. Variáveis que eu preciso configurar
6. Passos que eu preciso fazer no Google/Meta
7. Qual URL usar no anúncio
8. Qual evento será a conversão primária
9. Pendências que dependem de dados externos
10. Qualquer risco que ainda exista
```

A implementação deve ser tratada como preparação para **produção real**, não protótipo.
