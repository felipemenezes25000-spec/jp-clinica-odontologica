/**
 * Portal do JP CRC — `/crc`.
 *
 * O shell concentra sessão, navegação e orientação de contexto. As regras de
 * negócio continuam nos módulos de `src/lib/crc` e nas telas específicas.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BarChart3,
  BookOpenText,
  Brain,
  Compass,
  CalendarDays,
  Camera,
  Cable,
  CircleDollarSign,
  ChevronDown,
  ChevronRight,
  Columns3,
  FileUp,
  House,
  ImageOff,
  ListTodo,
  LogOut,
  Megaphone,
  MessageSquareText,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserRoundCog,
  UsersRound,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import { Automacoes } from "@/components/crc/Automacoes";
import { Agenda } from "@/components/crc/Agenda";
import { Funil } from "@/components/crc/Funil";
import { Gestao } from "@/components/crc/Gestao";
import { Home } from "@/components/crc/Home";
import { Inbox } from "@/components/crc/Inbox";
import { Integracoes } from "@/components/crc/Integracoes";
import { Logo } from "@/components/site/Logo";

import { Campanhas } from "@/components/crc/Campanhas";
import { Inteligencia } from "@/components/crc/Inteligencia";
import { Conhecimento } from "@/components/crc/Conhecimento";
import { ModelosECusto } from "@/components/crc/ModelosECusto";
import { Configuracoes } from "@/components/crc/Configuracoes";
import { Equipe } from "@/components/crc/Equipe";
import { Importar } from "@/components/crc/Importar";
import { MeuTrabalho } from "@/components/crc/MeuTrabalho";
import { BuscaPacientes, CentralDoPaciente } from "@/components/crc/Pacientes";
import { Paleta, type AcaoPaleta } from "@/components/crc/Paleta";
import { Aviso, Botao, Campo, Entrada, useAcao } from "@/components/crc/base";
import "@/components/crc/crc.css";
import "@/components/crc/crc-premium.css";
import {
  entrarNoCrc,
  estadoSessaoCrc,
  sairDoCrc,
  salvarMinhaFoto,
  type EstadoSessao,
} from "@/lib/crc/api";
import { ROTULO_PAPEL } from "@/lib/crc/dominio/rbac";
import type { Permissao } from "@/lib/crc/dominio/rbac";

export const Route = createFileRoute("/crc")({
  component: PortalCrc,
  head: () => ({
    meta: [
      { title: "JP CRC — Central de Relacionamento" },
      { name: "robots", content: "noindex, nofollow" },
    ],
    // O Bricolage Grotesque e a fonte de display DESTE app, e so dele. Vinha no
    // <head> global e bloqueava 946ms de render em toda pagina do site — que
    // nao o usa. Carrega aqui, onde serve.
    links: [
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700;12..96,800&display=swap",
      },
    ],
  }),
});

type Aba =
  | "home"
  | "trabalho"
  | "inbox"
  | "agenda"
  | "funil"
  | "pacientes"
  | "gestao"
  | "importar"
  | "automacoes"
  | "campanhas"
  | "inteligencia"
  | "conhecimento"
  | "modelos"
  | "integracoes"
  | "configuracoes"
  | "equipe";

type ItemNav = {
  aba: Aba;
  rotulo: string;
  permissao: Permissao;
  icone: LucideIcon;
};

type GrupoNav = {
  id: "operacao" | "crescimento" | "administracao";
  rotulo: string;
  itens: readonly ItemNav[];
};

type TomLegenda = "neutra" | "positiva" | "alerta" | "perigo" | "info";

/**
 * O que uma tela precisa dizer sobre si mesma.
 *
 * `descricao` responde "o que é isto". `acoes` responde a pergunta que vem
 * logo depois, e que nenhuma interface responde sozinha: **o que acontece se
 * eu clicar?**
 *
 * Os dois são separados de propósito. Descrição é leitura de uma vez; a lista
 * de ação -> efeito é consulta, e é o que alguém relê no terceiro dia quando
 * está com o dedo em cima de "Revisar e agendar" sem saber se aquilo já manda
 * mensagem para 964 pessoas.
 */
type GuiaAba = {
  sobretitulo: string;
  /**
   * Uma linha, no imperativo do usuário e não do sistema.
   *
   * Aparece em DOIS lugares a partir de uma única fonte: no mapa do CRC dentro
   * da Home e como `title` de cada item do menu. Duplicar esse texto seria
   * garantir que um dos dois envelhecesse.
   */
  paraQue: string;
  descricao: string;
  /** `faca` é o que se clica; `efeito` é o que muda no mundo depois. */
  acoes: readonly { faca: string; efeito: string }[];
  legendas: readonly { rotulo: string; tom: TomLegenda }[];
};

const GRUPOS_NAVEGACAO: readonly GrupoNav[] = [
  {
    id: "operacao",
    rotulo: "Operação",
    itens: [
      { aba: "home", rotulo: "Início", permissao: "ver_oportunidade", icone: House },
      { aba: "trabalho", rotulo: "Meu trabalho", permissao: "ver_tarefa", icone: ListTodo },
      { aba: "inbox", rotulo: "Conversas", permissao: "ver_conversa", icone: MessageSquareText },
      { aba: "funil", rotulo: "Funil", permissao: "ver_oportunidade", icone: Columns3 },
      { aba: "agenda", rotulo: "Agenda", permissao: "ver_paciente", icone: CalendarDays },
      { aba: "pacientes", rotulo: "Pacientes", permissao: "ver_paciente", icone: UsersRound },
    ],
  },
  {
    id: "crescimento",
    rotulo: "Performance",
    itens: [
      { aba: "gestao", rotulo: "Gestão", permissao: "ver_analytics_gerencial", icone: BarChart3 },
      { aba: "importar", rotulo: "Importar", permissao: "importar_dados", icone: FileUp },
      { aba: "automacoes", rotulo: "Automações", permissao: "ver_automacao", icone: Workflow },
      { aba: "campanhas", rotulo: "Campanhas", permissao: "gerenciar_automacao", icone: Megaphone },
      {
        aba: "inteligencia",
        rotulo: "Inteligência",
        // A MESMA permissão de automação, e não `ver_conversa`: a resposta
        // candidata é conteúdo que NÃO foi enviado, e lê-la é afinar a
        // máquina, não atender paciente.
        permissao: "gerenciar_automacao",
        icone: Brain,
      },
      {
        aba: "conhecimento",
        rotulo: "Conhecimento",
        // Mesma permissão da Inteligência: escrever o que o agente responde é
        // afinar a máquina, e não atender paciente.
        permissao: "gerenciar_automacao",
        icone: BookOpenText,
      },
    ],
  },
  {
    id: "administracao",
    rotulo: "Administração",
    itens: [
      { aba: "integracoes", rotulo: "Integrações", permissao: "ver_integracoes", icone: Cable },
      {
        aba: "modelos",
        rotulo: "Modelos e custo",
        // `gerenciar_integracoes`, e não `ver_integracoes`: aqui se cadastra
        // credencial de provedor e se define quanto a clínica pode gastar. Quem
        // só acompanha a saúde das conexões não precisa disso.
        permissao: "gerenciar_integracoes",
        icone: CircleDollarSign,
      },
      { aba: "equipe", rotulo: "Equipe", permissao: "gerenciar_usuarios", icone: UserRoundCog },
      {
        aba: "configuracoes",
        rotulo: "Configurações",
        permissao: "ver_integracoes",
        icone: Settings2,
      },
    ],
  },
];

const NAVEGACAO: readonly ItemNav[] = GRUPOS_NAVEGACAO.flatMap((grupo) => grupo.itens);

/**
 * O guia de cada tela.
 *
 * ESTE OBJETO É A DOCUMENTAÇÃO DO PRODUTO, e vive dentro dele. Um manual em
 * PDF numa pasta compartilhada envelhece na primeira semana; um texto que
 * aparece ao lado do botão que ele descreve envelhece junto com o botão, e
 * quem mexe no botão vê o texto.
 *
 * REGRA AO ESCREVER `efeito`: dizer o que muda DEPOIS do clique, no mundo do
 * paciente e da clínica — não repetir o nome do botão em outras palavras.
 * "Envia a mensagem" não ensina nada; "manda no WhatsApp na hora, e não dá
 * para desfazer" ensina.
 *
 * Toda linha aqui foi conferida contra o componente que ela descreve. Uma
 * legenda que mente é pior que legenda nenhuma: ela é lida com confiança.
 */
const GUIA_ABAS: Record<Aba, GuiaAba> = {
  home: {
    sobretitulo: "O dia da clínica",
    paraQue: "quem precisa de você hoje, em ordem",
    descricao:
      "A primeira frase responde o dia: quantos pacientes precisam de você agora e quantos a automação está cuidando sozinha. A fila abaixo já vem na ordem certa — comece do topo e desça. Se sobrar tempo no fim do dia, ótimo; se não sobrar, você trabalhou o que mais importava.",
    acoes: [
      {
        faca: "Por quê?",
        efeito:
          "Abre a decomposição da nota: de onde vieram os pontos daquele paciente. O primeiro da fila já vem com ela aberta, para ensinar a ler os outros.",
      },
      {
        faca: "Abrir",
        efeito:
          "Leva à ficha do paciente, com histórico, conversas, oportunidades e tarefas no mesmo lugar.",
      },
      {
        faca: "Ctrl + K",
        efeito:
          "Busca global, de qualquer tela: encontra paciente, conversa ou tarefa sem passar pelo menu.",
      },
      {
        faca: "A fita do dia, à direita",
        efeito:
          "Mostra onde estamos na janela de atendimento. Fora dela a automação não fala com ninguém — ela espera e envia na abertura.",
      },
    ],
    legendas: [
      { rotulo: "Precisa de você", tom: "perigo" },
      { rotulo: "Automação cuidando", tom: "info" },
      { rotulo: "Em dia", tom: "positiva" },
    ],
  },
  trabalho: {
    sobretitulo: "Sua fila pessoal",
    paraQue: "suas tarefas, e só as suas",
    descricao:
      "Cada tarefa aqui nasceu de alguma coisa: uma automação que desistiu, um caso que precisa de gente, um paciente que a máquina não devia atender sozinha. Quando aparecer \u201cVocê está em dia\u201d, é verdade — pode fechar a tela.",
    acoes: [
      {
        faca: "Assumir",
        efeito:
          "Põe a tarefa no seu nome. Ela sai da lista dos outros, e ninguém faz o mesmo contato em dobro.",
      },
      {
        faca: "Concluir",
        efeito:
          "Tira da sua lista. O registro continua no histórico do paciente — concluir não apaga nada.",
      },
      {
        faca: "Ver paciente",
        efeito: "Abre a ficha de quem a tarefa é sobre, sem perder o lugar na lista.",
      },
      {
        faca: "Nova tarefa",
        efeito:
          "Cria uma tarefa à mão, para algo que o sistema não viu. Você escolhe o responsável e o prazo.",
      },
    ],
    legendas: [
      { rotulo: "Vencida / urgente", tom: "perigo" },
      { rotulo: "Em andamento", tom: "info" },
      { rotulo: "Em dia", tom: "positiva" },
    ],
  },
  inbox: {
    sobretitulo: "Atendimento em tempo real",
    paraQue: "o WhatsApp da clínica, com contexto ao lado",
    descricao:
      "Três colunas: as conversas, a conversa aberta e o contexto do paciente. Antes de responder, leia o resumo automático da direita — ele diz em uma linha o que a pessoa quer e economiza a leitura de quinze mensagens.",
    acoes: [
      {
        faca: "Só não lidas",
        efeito: "Esconde tudo que já foi respondido. Clique de novo para ver a lista inteira.",
      },
      {
        faca: "A chave Resposta ao paciente / Nota interna",
        efeito:
          "Em Nota interna, o que você escreve fica SÓ no sistema — o paciente não recebe. Confira qual dos dois está ligado antes de enviar: é o único erro desta tela que o paciente enxerga.",
      },
      {
        faca: "Enviar",
        efeito: "Manda pelo WhatsApp na hora. Não dá para desfazer nem apagar do celular dele.",
      },
      {
        faca: "Ver ficha",
        efeito: "Abre a ficha completa do paciente sem fechar a conversa.",
      },
      {
        faca: 'Quando aparecer "outro atendente está respondendo"',
        efeito:
          "Não responda junto. Duas pessoas no mesmo paciente ao mesmo tempo é o pior que acontece nesta tela — fale com quem abriu.",
      },
    ],
    legendas: [
      { rotulo: "Recebida", tom: "neutra" },
      { rotulo: "Enviada", tom: "positiva" },
      { rotulo: "Nota interna", tom: "alerta" },
    ],
  },
  agenda: {
    sobretitulo: "Da oportunidade ao horário marcado",
    paraQue: "o que a agenda está pedindo de vocês",
    descricao:
      "Não é a agenda do Dental Office repetida. Lá ela responde \u201cquem vem\u201d; aqui ela responde \u201co que a agenda está pedindo de nós\u201d: quem não confirmou, quem o CRC marcou sozinho, quem tem horário e mesmo assim continua na fila de alguém. Dia sem consulta não aparece.",
    acoes: [
      {
        faca: "7 / 14 / 30 dias",
        efeito: "Muda a janela mostrada. Os três números do topo acompanham.",
      },
      {
        faca: "Marcar e desmarcar",
        efeito:
          "Não acontece aqui — esta tela é de leitura. Remarcar é na conversa (onde o paciente está) ou no Dental Office (onde a recepção já trabalha). Uma terceira porta seria uma terceira chance de as duas discordarem.",
      },
    ],
    legendas: [
      { rotulo: "Confirmado", tom: "positiva" },
      { rotulo: "A confirmar", tom: "alerta" },
      { rotulo: "Informação", tom: "info" },
    ],
  },
  funil: {
    sobretitulo: "Pipeline de relacionamento",
    paraQue: "toda oportunidade aberta, por etapa",
    descricao:
      "A fila inteira, que na Home aparece cortada nos doze primeiros. Cada cartão diz em que etapa a oportunidade está e se a automação já está conduzindo sozinha.",
    acoes: [
      {
        faca: "Filtrar por etapa / por tipo",
        efeito: "Recorta a lista. Os dois filtros somam — etapa E tipo ao mesmo tempo.",
      },
      {
        faca: "Salvar esta visão",
        efeito:
          "Guarda o filtro atual com um nome, para voltar a ele com um clique. Marcando compartilhada, o resto da equipe também vê.",
      },
      {
        faca: "Limpar filtros",
        efeito: "Volta a mostrar tudo. Não apaga nenhuma visão salva.",
      },
      { faca: "Abrir", efeito: "Vai para a ficha do paciente daquela oportunidade." },
      {
        faca: "Marcar como perdida",
        efeito:
          "Encerra a oportunidade e pede o motivo. As automações dela param na hora, e o motivo alimenta o relatório de perdas na Gestão.",
      },
    ],
    legendas: [
      { rotulo: "Prioridade alta", tom: "perigo" },
      { rotulo: "Prioridade média", tom: "alerta" },
      { rotulo: "Automação ativa", tom: "info" },
    ],
  },
  pacientes: {
    sobretitulo: "Visão única do paciente",
    paraQue: "a ficha completa de uma pessoa",
    descricao:
      "Busque por nome ou telefone e veja tudo de uma pessoa num lugar só: linha do tempo, agenda, conversas, oportunidades abertas e tarefas — sem caçar informação em telas diferentes.",
    acoes: [
      {
        faca: "Buscar",
        efeito:
          "A partir de 2 letras a lista aparece sozinha, sem apertar nada. Telefone também funciona.",
      },
      {
        faca: "Abrir, em Conversas",
        efeito: "Pula direto para o WhatsApp dessa pessoa, com a conversa já selecionada.",
      },
      {
        faca: "Concluir, em Tarefas",
        efeito: "Fecha uma tarefa dela sem sair da ficha.",
      },
    ],
    legendas: [
      { rotulo: "Histórico", tom: "neutra" },
      { rotulo: "Oportunidade", tom: "info" },
      { rotulo: "Contato realizado", tom: "positiva" },
    ],
  },
  gestao: {
    sobretitulo: "Performance com contexto",
    paraQue: "quanto a operação está recuperando",
    descricao:
      "O painel de quem cobra resultado, separado da Home de propósito: a Home responde \u201co que eu faço agora\u201d, esta responde \u201cquanto isso está trazendo de volta\u201d. Enquanto não houver financeiro integrado, o número grande se chama valor POTENCIAL — e a tela escreve isso, porque chamar potencial de receita seria a mentira mais cara de um painel.",
    acoes: [
      {
        faca: "Oportunidades / Pacientes / Tarefas",
        efeito:
          "Baixa a lista em CSV, já com o período aplicado. Abre no Excel para cruzar com o que você quiser.",
      },
      {
        faca: "O funil e as barras",
        efeito:
          "Cada valor também aparece escrito ao lado da barra — gráfico que só existe como forma é invisível para quem usa leitor de tela.",
      },
    ],
    legendas: [
      { rotulo: "Resultado", tom: "positiva" },
      { rotulo: "Potencial", tom: "info" },
      { rotulo: "Requer atenção", tom: "alerta" },
    ],
  },
  importar: {
    sobretitulo: "Entrada de dados com segurança",
    paraQue: "trazer planilha do Dental Office",
    descricao:
      "Em dois tempos, e é isso que torna a tela segura. Primeiro a prévia, que NÃO grava nada. Só depois a confirmação. É por aqui que entram orçamentos e parcelas, que a API do Dental Office não expõe.",
    acoes: [
      {
        faca: "Escolher arquivo",
        efeito:
          "A planilha é lida no seu próprio navegador. Nada é gravado ainda, e não fica arquivo nenhum no servidor.",
      },
      {
        faca: "A prévia",
        efeito:
          "Diz quantas linhas entram, quantas atualizam, quantas estão sem paciente e quais estão erradas — com o número da linha no Excel, para você não caçar.",
      },
      {
        faca: "Confirmar",
        efeito:
          "Grava de verdade. É um segundo clique de propósito: importar 1.500 orçamentos não pode acontecer por acidente.",
      },
    ],
    legendas: [
      { rotulo: "Prévia", tom: "info" },
      { rotulo: "Validado", tom: "positiva" },
      { rotulo: "Rejeitado", tom: "perigo" },
    ],
  },
  automacoes: {
    sobretitulo: "Jornadas que trabalham sozinhas",
    paraQue: "as jornadas que rodam sem ninguém",
    descricao:
      "Cada jornada dispara sozinha a partir de um sinal: alguém faltou, alguém sumiu, amanhã tem consulta a confirmar. O MODO decide o quanto ela pode agir, e é o centro da tela: simulação → só recomenda → executa.",
    acoes: [
      {
        faca: "Ver jornada",
        efeito:
          "Abre os passos na ordem: o que dispara, quanto espera, o que envia e em que condição ela para antes do fim.",
      },
      {
        faca: "Simulação",
        efeito:
          "Ela calcula tudo e registra o que faria, sem falar com nenhum paciente. É como toda automação nasce.",
      },
      {
        faca: "Só recomenda",
        efeito: "Ela sugere o contato e deixa a decisão com uma pessoa.",
      },
      {
        faca: "Executa",
        efeito:
          "Ela manda mensagem de verdade. Só um gestor pode ligar isso, e o botão pede confirmação.",
      },
      {
        faca: "Ativar / Pausar",
        efeito: "Liga ou congela a jornada inteira, sem mexer no modo dela.",
      },
      {
        faca: 'A linha "Até R$ X por paciente"',
        efeito:
          "Diz o que essa jornada custa de WhatsApp por pessoa, e de que categoria são as mensagens. Marketing custa 9 vezes utilidade.",
      },
    ],
    legendas: [
      { rotulo: "Ativa", tom: "positiva" },
      { rotulo: "Pausada", tom: "alerta" },
      { rotulo: "Simulação", tom: "info" },
    ],
  },
  campanhas: {
    sobretitulo: "Comunicação em escala, sem perder controle",
    paraQue: "falar com um grupo, sem virar disparo",
    descricao:
      "Três passos, nessa ordem: quem recebe, o que chega, quando sai. Toda campanha passa pelas mesmas regras de uma mensagem individual — uma por pessoa por dia, só em horário comercial, e quem pediu para parar fica de fora.",
    acoes: [
      {
        faca: "Montar campanha",
        efeito: "Abre os três passos. Nada é enviado, e nada é salvo ainda.",
      },
      {
        faca: "Mexer nos filtros",
        efeito:
          "O número de pessoas E o custo estimado se recalculam sozinhos. Os dois têm o mesmo peso na tela porque são as duas metades da mesma decisão.",
      },
      {
        faca: "Criar rascunho",
        efeito:
          "Salva a campanha e NÃO envia nada. O público ainda não está congelado — dá para conferir com calma.",
      },
      {
        faca: "Revisar e agendar",
        efeito:
          "É aqui que começa a enviar. Congela o público e entra na fila, no ritmo de \u201cquantas por dia\u201d que você escolheu.",
      },
      {
        faca: "Pausar / Retomar",
        efeito: "Interrompe o envio no meio. O que já saiu, saiu — mas o resto da fila para.",
      },
      {
        faca: '"X puladas pelas regras"',
        efeito:
          "São pessoas que entraram no filtro e não receberam: já tinham sido contatadas hoje, pediram para parar, ou estão fora do horário. Aparece sempre que existe.",
      },
    ],
    legendas: [
      { rotulo: "Rascunho", tom: "neutra" },
      { rotulo: "Em execução", tom: "info" },
      { rotulo: "Concluída", tom: "positiva" },
    ],
  },
  inteligencia: {
    sobretitulo: "O que a máquina decidiu",
    paraQue: "o que o agente pensou, e o que não enviou",
    descricao:
      "Cada vez que um paciente escreve, o agente lê, decide e registra o que faria. Esta tela mostra essas decisões — inclusive as que foram barradas antes de virar mensagem. Enquanto o envio estiver desligado, nada daqui chegou a ninguém, e a faixa do topo diz isso com todas as letras.",
    acoes: [
      {
        faca: "A faixa verde do topo",
        efeito:
          "Responde a primeira pergunta de quem abre esta tela: a máquina falou com alguém? Se estiver verde, nenhuma resposta saiu.",
      },
      {
        faca: '"barrado por…"',
        efeito:
          "Diz qual regra impediu a resposta de sair — conteúdo clínico, promessa sem ação, vazamento interno. É a regra funcionando sobre um caso real.",
      },
      {
        faca: "N etapas",
        efeito:
          "Abre o passo a passo do turno: montar contexto, cada ferramenta usada, os portões. É o que responde por que demorou e por que custou.",
      },
      {
        faca: "Custo destes turnos",
        efeito:
          "Soma TODAS as voltas do laço, não só a última chamada. Um turno que usa três ferramentas faz quatro chamadas de modelo.",
      },
      {
        faca: '"revisão do sistema" embaixo da resposta',
        efeito:
          "Aparece quando a chave de revisão está ligada em Configurações. Traz a nota de 0 a 10, o que a pessoa queria, do que ela reclamou, e se a resposta quebrou alguma regra. Serve para achar as piores respostas sem reler conversa.",
      },
      {
        faca: '"O que o agente anotou sobre as pessoas"',
        efeito:
          "Tudo que ficou guardado, com prazo para sumir sozinho. Só entra o que a pessoa DISSE — “só posso depois das 17h”. Opinião sobre a pessoa é recusada pelo sistema, inclusive se alguém digitar à mão.",
      },
      {
        faca: "Apagar, numa anotação",
        efeito:
          "Tira a frase do agente para sempre: ela não volta nem se o paciente repetir a mesma coisa. A linha continua registrada, para dar para saber depois por que o agente respondeu o que respondeu.",
      },
      {
        faca: '"Está certo, pode usar"',
        efeito:
          "Aparece nas anotações em que o sistema não teve certeza. Até você confirmar, elas NÃO influenciam nenhuma resposta.",
      },
    ],
    legendas: [
      { rotulo: "Não enviou", tom: "neutra" },
      { rotulo: "Passou para a equipe", tom: "alerta" },
      { rotulo: "Falhou com segurança", tom: "perigo" },
      { rotulo: "Anotação esperando você conferir", tom: "alerta" },
    ],
  },
  conhecimento: {
    sobretitulo: "O que a clínica ensina",
    paraQue: "os textos que o agente usa para responder",
    descricao:
      "Aqui ficam os textos que o agente consulta antes de responder: formas de pagamento, convênios, o que fazer antes de uma extração. Ele responde SÓ com o que estiver escrito — quando não acha, diz que vai confirmar com a equipe em vez de inventar. Um texto passa por três etapas antes de valer: escrever, indexar e publicar. Escrever não custa nada; indexar é o que ensina o agente a achar o texto; publicar é o momento em que ele passa a responder paciente.",
    acoes: [
      {
        faca: "Ver o que o agente acha",
        efeito:
          "Roda a busca de verdade com a sua pergunta e mostra os trechos que o agente veria — nada mais do que isso. É o jeito de descobrir em dez segundos que a pergunta óbvia não achava o parágrafo óbvio, em vez de descobrir semanas depois na conversa de um paciente.",
      },
      {
        faca: "Indexar",
        efeito:
          "Corta o texto em pedaços e ensina o sistema a reconhecê-los. Custa uma consulta de IA por pedaço, então é botão separado de Salvar: corrigir uma vírgula não precisa custar dinheiro.",
      },
      {
        faca: "Publicar",
        efeito:
          "A partir daqui o texto responde paciente. Fica registrado quem publicou e quando. Texto sem indexar não pode ser publicado, porque ficaria invisível para a busca sem nada explicando por quê.",
      },
      {
        faca: "Editar um texto já publicado",
        efeito:
          "Volta para rascunho automaticamente e sai do ar. É de propósito: a versão nova não responde paciente antes de alguém reler e publicar de novo.",
      },
      {
        faca: "Tirar do ar",
        efeito:
          "Para de responder na hora e o texto continua guardado aqui, para ser republicado depois. Não apaga nada.",
      },
      {
        faca: "Linha em branco no meio do texto",
        efeito:
          "É onde o sistema corta. Cada pedaço responde uma pergunta, então separar assuntos com uma linha em branco melhora a busca mais do que qualquer outra coisa que você faça nesta tela.",
      },
    ],
    legendas: [
      { rotulo: "O agente usa", tom: "positiva" },
      { rotulo: "Só você vê", tom: "alerta" },
      { rotulo: "Falta indexar", tom: "perigo" },
    ],
  },
  modelos: {
    sobretitulo: "O dinheiro da IA",
    paraQue: "quanto a IA gasta, e o limite disso",
    descricao:
      "Toda vez que a IA lê uma mensagem, responde alguém, revisa um atendimento ou procura no material da clínica, ela consulta um serviço que cobra por uso. Esta tela mostra quanto isso somou hoje e no mês, e deixa você pôr um limite — que é verificado ANTES de cada consulta, não depois. Aqui também se escolhe qual modelo faz cada tarefa e, se a clínica quiser pagar direto ao provedor, se cadastra a chave dela.",
    acoes: [
      {
        faca: "Limite por dia / por mês",
        efeito:
          "Ao atingir o limite, a IA para de responder na hora — a verificação acontece antes de cada consulta. Em branco significa sem limite. Zero significa desligar a IA por aqui.",
      },
      {
        faca: "A caixa “colocar na fila da recepção”",
        efeito:
          "Marcada, cada paciente que escrever depois de o limite acabar vira um caso para alguém responder à mão. Desmarcada, as mensagens ficam sem resposta. Do outro lado tem gente esperando, então a escolha é real.",
      },
      {
        faca: "Mudar, numa das quatro tarefas",
        efeito:
          "Troca o modelo usado só naquela tarefa. Conversar com paciente e classificar mensagem têm exigências opostas: a primeira alguém lê, a segunda acontece a cada mensagem que chega. Sem mexer, fica no padrão.",
      },
      {
        faca: "Guardar chave",
        efeito:
          "A partir daí o consumo é cobrado no cartão cadastrado no provedor pela clínica, e não no do sistema. A chave é guardada embaralhada e nunca mais aparece: fica só o começo e o fim, para você conferir que colou a certa.",
      },
      {
        faca: "Parar de usar, numa chave",
        efeito:
          "A IA para de usá-la imediatamente. A chave não é apagada, e quem tentar usá-la recebe uma mensagem dizendo que foi revogada — em vez de o sistema voltar calado para a chave dele.",
      },
    ],
    legendas: [
      { rotulo: "Em uso", tom: "positiva" },
      { rotulo: "Chegando no limite", tom: "alerta" },
      { rotulo: "Parada por limite de gasto", tom: "perigo" },
    ],
  },
  integracoes: {
    sobretitulo: "Saúde das conexões",
    paraQue: "estado real de cada conexão",
    descricao:
      "A tela que não pode mentir. Ela mostra três estados diferentes, e a diferença importa: sem credencial (e diz QUAL variável falta), em sandbox (dados de exemplo, em amarelo) e conectada de verdade. Um cartão verde genérico faria a equipe achar que mensagens estão saindo quando não estão.",
    acoes: [
      {
        faca: "Testar conexão",
        efeito: "Faz uma chamada real ao serviço e mostra o que voltou, inclusive o erro.",
      },
      {
        faca: "Sincronizar agora",
        efeito: "Puxa pacientes e agenda do Dental Office sem esperar o próximo ciclo automático.",
      },
      {
        faca: "Pausar agora",
        efeito:
          "O interruptor de emergência: para as mensagens NA HORA. Enquanto estiver pausado a equipe acompanha os pacientes à mão, e a ação fica na auditoria com o seu nome.",
      },
    ],
    legendas: [
      { rotulo: "Conectada", tom: "positiva" },
      { rotulo: "Sandbox / pendente", tom: "alerta" },
      { rotulo: "Falha", tom: "perigo" },
    ],
  },
  equipe: {
    sobretitulo: "Acesso e responsabilidade",
    paraQue: "quem entra e o que cada um pode",
    descricao:
      "Um login por pessoa. Não é organização: é o que faz o histórico dizer QUEM fez, em vez de \u201calguém\u201d. Cada papel vem com a frase do que ele pode ver e fazer, porque um menu com seis substantivos não responde \u201cela vai ver valor de orçamento?\u201d.",
    acoes: [
      {
        faca: "Cadastrar pessoa",
        efeito:
          "Cria o acesso na hora. A senha é escolhida aqui e entregue pessoalmente — não existe e-mail de convite, então ninguém fica esperando um.",
      },
      {
        faca: "Trocar senha",
        efeito: "Define uma nova imediatamente. A pessoa entra com ela no próximo login.",
      },
      {
        faca: "Tirar acesso",
        efeito:
          "A pessoa não entra mais, e o histórico dela CONTINUA. Apagar o usuário deixaria meses de tarefas e mensagens órfãs.",
      },
      {
        faca: "Devolver acesso",
        efeito: "Reativa o login na hora, com o mesmo histórico.",
      },
    ],
    legendas: [
      { rotulo: "Usuário ativo", tom: "positiva" },
      { rotulo: "Permissões", tom: "info" },
      { rotulo: "Sem acesso", tom: "neutra" },
    ],
  },
  configuracoes: {
    sobretitulo: "Regras da operação",
    paraQue: "as regras que a automação obedece",
    descricao:
      "Os números que governam o comportamento do sistema: quantos dias até o retorno de rotina, quantas horas de espera depois de uma falta, quantas mensagens o mesmo paciente pode receber por dia. Cada campo diz o que muda se você mexer, para a consequência ser prevista antes e não descoberta pelo WhatsApp de um paciente irritado.",
    acoes: [
      {
        faca: "Mudar um número",
        efeito:
          "Salva sozinho ao sair do campo. Não existe \u201csalvar tudo\u201d — ajustar um número não deveria virar uma transação de doze campos.",
      },
      {
        faca: "O intervalo ao lado do campo",
        efeito:
          "É o que o sistema aceita. O servidor recusa fora dele mesmo que a tela seja contornada.",
      },
      {
        faca: "O quanto a IA pode fazer sozinha",
        efeito:
          "Três chaves em rampa. A 1 deixa a IA escrever sem mandar (você lê em Inteligência). A 2 deixa ela olhar a agenda. A 3 é a que faz o paciente receber. Ligue de cima para baixo, e só desça um degrau depois de ver o resultado do anterior.",
      },
      {
        faca: "Salvar a semana",
        efeito:
          "Grava o horário em que a automação pode falar. Fora dele ela não envia: espera e manda na abertura do dia seguinte.",
      },
      { faca: "Descartar", efeito: "Volta a semana ao que estava salvo, sem gravar." },
    ],
    legendas: [
      { rotulo: "Operação", tom: "info" },
      { rotulo: "Salvo", tom: "positiva" },
      { rotulo: "Requer revisão", tom: "alerta" },
    ],
  },
};

/**
 * A chave que liga o guia, guardada entre sessões.
 *
 * UMA DECISÃO, E NÃO TREZE. Guardar por tela faria alguém fechar o guia doze
 * vezes antes de ficar em paz. Quem já sabe usar o CRC desliga uma vez e nunca
 * mais vê; quem chegou hoje encontra tudo aberto sem procurar botão nenhum.
 *
 * Por isso o padrão é LIGADO. Um guia que começa fechado só ajuda quem já
 * sabia que ele existia — exatamente quem não precisa dele.
 */
const CHAVE_GUIA = "crc:guia-aberto";

/**
 * Quais seções do menu estão recolhidas.
 *
 * GRAVAR OS FECHADOS, E NÃO OS ABERTOS, é o que faz um grupo novo nascer
 * visível: quem já usava o sistema não descobre um item por acaso porque ele
 * apareceu fechado numa lista que ele nunca mais abriu.
 */
const CHAVE_GRUPOS = "crc:grupos-fechados";

/** Quais seções de conteúdo estão recolhidas, por título. */
const CHAVE_SECOES = "crc:secoes-fechadas";

/** O lado do avatar depois de reduzido. 128px cobre a tela retina de 36px. */
const LADO_FOTO = 128;

/**
 * Reduz a imagem escolhida a um quadrado de 128px antes de sair do navegador.
 *
 * POR QUE NO CLIENTE: a foto que sai de um celular tem 3 a 8 MB. Mandar isso
 * para o servidor para ele reduzir gasta a banda da recepção, o tempo de quem
 * está esperando e um limite de corpo de requisição — para no fim guardar
 * 15 KB. Reduzir antes resolve os quatro de uma vez.
 *
 * O RECORTE É CENTRAL E QUADRADO. Um avatar redondo com imagem retangular
 * esmagada é o defeito clássico; aqui a imagem é cortada no menor lado e o
 * miolo é o que sobra, que é onde o rosto costuma estar.
 */
async function reduzirParaAvatar(arquivo: File): Promise<string> {
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, falhou) => {
      const i = new Image();
      i.onload = () => {
        ok(i);
      };
      i.onerror = () => {
        falhou(new Error("Não consegui ler essa imagem."));
      };
      i.src = url;
    });

    const lado = Math.min(img.naturalWidth, img.naturalHeight);
    if (lado === 0) throw new Error("Imagem vazia.");

    const tela = document.createElement("canvas");
    tela.width = LADO_FOTO;
    tela.height = LADO_FOTO;
    const ctx = tela.getContext("2d");
    if (ctx === null) throw new Error("Não consegui preparar a imagem.");

    ctx.drawImage(
      img,
      (img.naturalWidth - lado) / 2,
      (img.naturalHeight - lado) / 2,
      lado,
      lado,
      0,
      0,
      LADO_FOTO,
      LADO_FOTO,
    );

    // JPEG e não PNG: um retrato em PNG de 128px passa de 40 KB, em JPEG fica
    // perto de 8 KB com a mesma aparência nesse tamanho.
    return tela.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Toda seção com cabeçalho passa a abrir e fechar — nas treze telas de uma vez.
 *
 * POR QUE POR DELEGAÇÃO, E NÃO COMPONENTE: as seções já existem em seis telas,
 * cada uma com sua classe (`crc-settings-painel-v2`, `crc-gestao-painel-v2`…)
 * e seu cabeçalho montado à mão. Trocar todas por um componente comum seria
 * reescrever seis arquivos para chegar no mesmo lugar — e a próxima tela
 * nasceria de fora do mecanismo. Um ouvinte no container pega as que existem
 * hoje e as que forem escritas depois, sem elas precisarem saber disso.
 *
 * A CHAVE É O TÍTULO, e não a posição: reordenar as seções de Configurações
 * não pode fazer alguém reabrir o bloco errado. Título muda com pouca
 * frequência, e quando muda o pior caso é a seção voltar aberta.
 *
 * `data-recolhida` é escrito no DOM e o React não o apaga: ele não aparece no
 * JSX, então não faz parte do que o React reconcilia.
 */
/* O prefixo `use` é exigência do React e do lint, mesmo num arquivo em
   português: é assim que as duas ferramentas reconhecem um hook. */
function useSecoesRecolhiveis(container: HTMLElement | null, aba: string): void {
  useEffect(() => {
    if (container === null) return;

    const ler = (): string[] => {
      try {
        const cru = window.localStorage.getItem(CHAVE_SECOES);
        const v: unknown = cru === null ? [] : JSON.parse(cru);
        return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
      } catch {
        return [];
      }
    };

    const gravar = (ids: string[]): void => {
      try {
        window.localStorage.setItem(CHAVE_SECOES, JSON.stringify(ids));
      } catch {
        /* vale só nesta sessão */
      }
    };

    const tituloDe = (sec: HTMLElement): string =>
      (sec.querySelector("h2, h3")?.textContent ?? "").trim();

    const aplicar = (): void => {
      const fechadas = new Set(ler());
      for (const sec of container.querySelectorAll<HTMLElement>("section > header")) {
        const secao = sec.parentElement;
        if (secao === null) continue;
        const titulo = tituloDe(secao);
        if (titulo.length === 0) continue;

        secao.dataset["recolhivel"] = "sim";
        secao.dataset["recolhida"] = fechadas.has(titulo) ? "sim" : "nao";

        // O cabeçalho vira controle de verdade para quem usa teclado e leitor
        // de tela — não só uma área clicável.
        sec.setAttribute("role", "button");
        sec.setAttribute("tabindex", "0");
        sec.setAttribute("aria-expanded", fechadas.has(titulo) ? "false" : "true");
      }
    };

    const alternar = (secao: HTMLElement): void => {
      const titulo = tituloDe(secao);
      if (titulo.length === 0) return;
      const fechadas = ler();
      const proximo = fechadas.includes(titulo)
        ? fechadas.filter((x) => x !== titulo)
        : [...fechadas, titulo];
      gravar(proximo);
      aplicar();
    };

    const alvo = (e: Event): HTMLElement | null => {
      const el = e.target;
      if (!(el instanceof HTMLElement)) return null;
      // Cabeçalho com botão dentro: o botão é o dono do clique.
      if (el.closest("button, a, input, select, textarea, [role=switch]") !== null) return null;
      const cab = el.closest("header");
      const secao = cab?.parentElement ?? null;
      return secao !== null && secao.tagName === "SECTION" ? secao : null;
    };

    const aoClicar = (e: MouseEvent): void => {
      const secao = alvo(e);
      if (secao !== null) alternar(secao);
    };

    const aoTeclar = (e: KeyboardEvent): void => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const secao = alvo(e);
      if (secao === null) return;
      e.preventDefault();
      alternar(secao);
    };

    aplicar();
    // As telas carregam dados depois do primeiro render; sem observar, só a
    // primeira leva de seções ganharia o comportamento.
    const observador = new MutationObserver(aplicar);
    observador.observe(container, { childList: true, subtree: true });

    container.addEventListener("click", aoClicar);
    container.addEventListener("keydown", aoTeclar);
    return () => {
      observador.disconnect();
      container.removeEventListener("click", aoClicar);
      container.removeEventListener("keydown", aoTeclar);
    };
  }, [container, aba]);
}

function lerGruposFechados(): string[] {
  try {
    const cru = window.localStorage.getItem(CHAVE_GRUPOS);
    if (cru === null) return [];
    const v: unknown = JSON.parse(cru);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function gravarGruposFechados(ids: string[]): void {
  try {
    window.localStorage.setItem(CHAVE_GRUPOS, JSON.stringify(ids));
  } catch {
    // Sem persistir, a escolha vale só nesta sessão.
  }
}

function lerPreferenciaDoGuia(): boolean {
  try {
    return window.localStorage.getItem(CHAVE_GUIA) !== "0";
  } catch {
    // Navegador com armazenamento bloqueado, aba anônima, iframe restrito: o
    // guia aparece. Falhar para o lado de explicar demais é o lado certo.
    return true;
  }
}

function gravarPreferenciaDoGuia(aberto: boolean): void {
  try {
    window.localStorage.setItem(CHAVE_GUIA, aberto ? "1" : "0");
  } catch {
    // Sem persistir, a escolha vale só nesta sessão. É melhor que quebrar.
  }
}

/**
 * O painel "o que dá para fazer aqui".
 *
 * É UMA LISTA DE DEFINIÇÃO, e não uma tabela nem uma sequência de cartões.
 * Cada linha é um par — o que se clica e o que acontece — e `<dl>` é
 * literalmente isso em HTML: um leitor de tela anuncia "Assumir: põe a tarefa
 * no seu nome", que é a frase certa.
 *
 * O MAPA DO CRC SÓ APARECE NA HOME. Repetir as treze telas em todas as telas
 * seria ruído; na Home ele responde a pergunta do primeiro dia — "onde fica o
 * quê?" — usando o mesmo `paraQue` que serve de dica no menu, sem texto
 * duplicado para envelhecer.
 */
function GuiaDaTela({
  guia,
  tela,
  mapa,
  aoDesligar,
}: {
  guia: GuiaAba;
  tela: string;
  mapa: readonly { rotulo: string; paraQue: string; icone: LucideIcon }[] | null;
  aoDesligar: () => void;
}) {
  return (
    <section className="crc-guia" aria-label={`Como usar ${tela}`}>
      <div className="crc-guia-topo">
        <span className="crc-guia-selo">
          <Compass aria-hidden="true" />
          Como usar
        </span>
        <p className="crc-guia-resumo">{guia.descricao}</p>
      </div>

      <dl className="crc-guia-lista">
        {guia.acoes.map((acao) => (
          <div key={acao.faca} className="crc-guia-par">
            <dt className="crc-guia-faca">{acao.faca}</dt>
            <dd className="crc-guia-efeito">{acao.efeito}</dd>
          </div>
        ))}
      </dl>

      {mapa !== null && (
        <div className="crc-guia-mapa">
          <div className="crc-guia-mapa-titulo">O CRC inteiro, em uma lista</div>
          <ul className="crc-guia-mapa-lista">
            {mapa.map((m) => {
              const Icone = m.icone;
              return (
                <li key={m.rotulo}>
                  <Icone aria-hidden="true" />
                  <strong>{m.rotulo}</strong>
                  <span>{m.paraQue}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <button type="button" className="crc-guia-desligar" onClick={aoDesligar}>
        Já sei usar — não mostrar mais
      </button>
    </section>
  );
}

function PortalCrc() {
  const [sessao, setSessao] = useState<EstadoSessao | null>(null);
  const [aba, setAba] = useState<Aba>("home");
  /*
    Ler o localStorage já no inicializador é seguro AQUI porque este componente
    nunca chega ao HTML do servidor: enquanto a sessão não carrega, a tela é
    "Carregando…". Não há render de servidor para divergir na hidratação.
  */
  const [guiaAberto, setGuiaAberto] = useState<boolean>(() =>
    typeof window === "undefined" ? true : lerPreferenciaDoGuia(),
  );

  const [gruposFechados, setGruposFechados] = useState<readonly string[]>(() =>
    typeof window === "undefined" ? [] : lerGruposFechados(),
  );

  const [conteudoEl, setConteudoEl] = useState<HTMLElement | null>(null);

  const alternarGrupo = useCallback((id: string) => {
    setGruposFechados((atuais) => {
      const proximo = atuais.includes(id) ? atuais.filter((x) => x !== id) : [...atuais, id];
      gravarGruposFechados([...proximo]);
      return proximo;
    });
  }, []);

  const alternarGuia = useCallback((ligado: boolean) => {
    setGuiaAberto(ligado);
    gravarPreferenciaDoGuia(ligado);
  }, []);

  useSecoesRecolhiveis(conteudoEl, aba);

  const [conversaAberta, setConversaAberta] = useState<string | null>(null);
  const [pacienteAberto, setPacienteAberto] = useState<string | null>(null);

  const carregarSessao = useCallback(async (): Promise<void> => {
    try {
      setSessao(await estadoSessaoCrc());
    } catch {
      setSessao({
        autenticado: false,
        configurado: false,
        motivo: "Não conseguimos falar com o servidor agora.",
        usuario: null,
      });
    }
  }, []);

  const [erroFoto, setErroFoto] = useState<string | null>(null);
  const campoFoto = useRef<HTMLInputElement>(null);

  const removerFoto = useCallback(async (): Promise<void> => {
    setErroFoto(null);
    const r = await salvarMinhaFoto({ data: { dataUrl: null } });
    if (r.ok) await carregarSessao();
    else setErroFoto(r.message);
  }, [carregarSessao]);

  const trocarFoto = useCallback(
    async (arquivo: File): Promise<void> => {
      setErroFoto(null);
      try {
        const dataUrl = await reduzirParaAvatar(arquivo);
        const r = await salvarMinhaFoto({ data: { dataUrl } });
        if (r.ok) {
          // Recarrega a sessão em vez de remendar o estado local: a foto
          // aparece em qualquer lugar que leia `usuario`, e não só aqui.
          await carregarSessao();
        } else {
          setErroFoto(r.message);
        }
      } catch (erro) {
        setErroFoto(erro instanceof Error ? erro.message : "Não consegui usar essa imagem.");
      }
    },
    [carregarSessao],
  );

  useEffect(() => {
    void carregarSessao();
  }, [carregarSessao]);

  const abrirPaciente = useCallback((patientId: string) => {
    setPacienteAberto(patientId);
    setAba("pacientes");
  }, []);

  if (sessao === null) {
    return (
      <div className="crc-app">
        <div style={{ display: "grid", placeItems: "center", minHeight: "100dvh" }}>
          <p className="crc-meta">Carregando…</p>
        </div>
      </div>
    );
  }

  if (!sessao.configurado) {
    return (
      <div className="crc-app">
        <div
          style={{
            display: "grid",
            placeItems: "center",
            minHeight: "100dvh",
            padding: "var(--crc-e5)",
          }}
        >
          <div style={{ maxWidth: 520, width: "100%" }}>
            <Aviso tom="alerta">{sessao.motivo}</Aviso>
          </div>
        </div>
      </div>
    );
  }

  if (!sessao.autenticado || sessao.usuario === null) {
    return (
      <div className="crc-app">
        <TelaDeEntrada aoEntrar={() => void carregarSessao()} />
      </div>
    );
  }

  const usuario = sessao.usuario;
  const permitidas = NAVEGACAO.filter((n) => usuario.permissoes.includes(n.permissao));
  const abaAtual = permitidas.some((n) => n.aba === aba) ? aba : (permitidas[0]?.aba ?? "home");
  const itemAtual = NAVEGACAO.find((n) => n.aba === abaAtual) ?? NAVEGACAO[0]!;
  const IconeAtual = itemAtual.icone;
  const guiaAtual = GUIA_ABAS[abaAtual];

  /*
    A ficha de um paciente é o único lugar onde o guia atrapalha: quem chegou
    ali veio de um clique com destino, e o que ele quer ver é a pessoa.
  */
  const naFichaDoPaciente = abaAtual === "pacientes" && pacienteAberto !== null;

  const gruposPermitidos = GRUPOS_NAVEGACAO.map((grupo) => ({
    ...grupo,
    itens: grupo.itens.filter((n) => usuario.permissoes.includes(n.permissao)),
  })).filter((grupo) => grupo.itens.length > 0);

  const acoesDaPaleta: AcaoPaleta[] = permitidas.map((n) => ({
    id: n.aba,
    rotulo: `Ir para ${n.rotulo}`,
    dica: "Navegação",
    executar: () => {
      setAba(n.aba);
      if (n.aba !== "pacientes") setPacienteAberto(null);
    },
  }));

  const iniciais = usuario.nome
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((parte) => parte.charAt(0).toUpperCase())
    .join("");

  return (
    <div className="crc-app">
      <Paleta
        acoes={acoesDaPaleta}
        aoAbrirPaciente={abrirPaciente}
        aoAbrirConversa={(conversationId) => {
          setConversaAberta(conversationId);
          setAba("inbox");
          setPacienteAberto(null);
        }}
      />

      <div className="crc-shell">
        <nav className="crc-lateral" aria-label="Seções do CRC">
          <div className="crc-marca">
            {/*
              `fundo` nomeia a SUPERFÍCIE, não a arte. O menu é verde escuro,
              então a marca certa é a de fundo escuro — branca, com a folha em
              #56A805. Enquanto pedia "claro", a única forma de ela aparecer era
              o adesivo branco atrás, que é o que ficava estranho.
              O login continua "claro": lá o cartão é branco de verdade.
            */}
            <Logo
              variante="lockup"
              fundo="escuro"
              altura={44}
              alt="JP Clínica Integrada Odontológica"
            />
            <span className="crc-modulo">CRC</span>
          </div>

          {gruposPermitidos.map((grupo) => {
            /*
              A seção que contém a tela aberta nunca aparece fechada. Sem isso,
              recolher "Operação" e depois chegar em Conversas pelo Ctrl+K
              deixaria o menu inteiro sem nenhuma marca de onde a pessoa está.
            */
            const temAtual = grupo.itens.some((n) => n.aba === abaAtual);
            const fechado = gruposFechados.includes(grupo.id) && !temAtual;
            const idLista = `crc-grupo-${grupo.id}`;

            return (
              <div key={grupo.id} className="crc-nav-grupo" data-fechado={fechado ? "sim" : "nao"}>
                <button
                  type="button"
                  className="crc-nav-rotulo"
                  aria-expanded={!fechado}
                  aria-controls={idLista}
                  onClick={() => {
                    alternarGrupo(grupo.id);
                  }}
                >
                  <span>{grupo.rotulo}</span>
                  <ChevronDown aria-hidden="true" />
                </button>

                <div id={idLista} className="crc-nav-lista" hidden={fechado}>
                  {grupo.itens.map((n) => {
                    const Icone = n.icone;
                    return (
                      <button
                        key={n.aba}
                        type="button"
                        className="crc-nav-item"
                        /* A mesma linha do mapa do CRC, para quem passa o mouse
                       antes de clicar em algo que nunca abriu. */
                        title={`${n.rotulo} — ${GUIA_ABAS[n.aba].paraQue}`}
                        aria-current={abaAtual === n.aba ? "page" : undefined}
                        onClick={() => {
                          setAba(n.aba);
                          if (n.aba !== "pacientes") setPacienteAberto(null);
                        }}
                      >
                        <Icone aria-hidden="true" />
                        <span>{n.rotulo}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className="crc-usuario-shell">
            <div className="crc-usuario">
              {/*
                Um `div` com dois botões dentro, e NÃO um `label` envolvendo
                tudo: com o label, o botão de remover abriria o seletor de
                arquivo junto, porque clicar em qualquer lugar de um label
                aciona o campo dele. O input fica fora e é acionado por
                referência.
              */}
              <div className="crc-avatar crc-avatar-troca">
                {usuario.fotoUrl === null ? (
                  <span aria-hidden="true">{iniciais || "JP"}</span>
                ) : (
                  <img src={usuario.fotoUrl} alt="" />
                )}

                <span className="crc-avatar-acoes">
                  <button
                    type="button"
                    aria-label={usuario.fotoUrl === null ? "Colocar sua foto" : "Trocar sua foto"}
                    title={usuario.fotoUrl === null ? "Colocar foto" : "Trocar foto"}
                    onClick={() => {
                      campoFoto.current?.click();
                    }}
                  >
                    <Camera aria-hidden="true" />
                  </button>

                  {usuario.fotoUrl !== null && (
                    <button
                      type="button"
                      aria-label="Remover sua foto"
                      title="Remover foto"
                      onClick={() => {
                        void removerFoto();
                      }}
                    >
                      <ImageOff aria-hidden="true" />
                    </button>
                  )}
                </span>

                <input
                  ref={campoFoto}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="crc-so-leitor"
                  onChange={(e) => {
                    const arquivo = e.target.files?.[0];
                    // Limpa o campo para escolher o MESMO arquivo de novo
                    // funcionar — sem isso, `change` não dispara na segunda vez.
                    e.target.value = "";
                    if (arquivo !== undefined) void trocarFoto(arquivo);
                  }}
                />
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="crc-usuario-nome">{usuario.nome}</div>
                <div className="crc-meta">{ROTULO_PAPEL[usuario.papel]}</div>
              </div>
              <Botao
                variante="discreto"
                pequeno
                aria-label="Sair do CRC"
                title="Sair"
                onClick={() => {
                  void (async () => {
                    await sairDoCrc();
                    await carregarSessao();
                  })();
                }}
              >
                <LogOut size={17} aria-hidden="true" />
              </Botao>
            </div>

            {/* Se a troca falhar, a pessoa fica olhando o avatar antigo sem
                saber por quê. O aviso mora no próprio cartão, ao lado do que
                ela acabou de tentar mudar. */}
            {erroFoto !== null && (
              <p className="crc-usuario-erro" role="alert">
                {erroFoto}
              </p>
            )}
          </div>
        </nav>

        <main className="crc-conteudo" ref={setConteudoEl}>
          <div className="crc-barra-contexto" aria-label="Contexto da tela">
            <div className="crc-barra-trilha">
              <ShieldCheck aria-hidden="true" />
              <strong>JP CRC</strong>
              <ChevronRight aria-hidden="true" />
              <span>{itemAtual.rotulo}</span>
            </div>
            <div className="crc-barra-acoes">
              <button
                type="button"
                className="crc-guia-botao"
                aria-expanded={guiaAberto}
                onClick={() => {
                  alternarGuia(!guiaAberto);
                }}
              >
                <Compass aria-hidden="true" />
                <span>{guiaAberto ? "Ocultar guia" : "Como usar esta tela"}</span>
              </button>

              <div className="crc-atalho-dica" title="Use Ctrl+K ou ⌘K para abrir a busca global">
                <Search aria-hidden="true" />
                <span>Buscar ou navegar</span>
                <kbd>Ctrl K</kbd>
              </div>
            </div>
          </div>

          {abaAtual !== "home" && !naFichaDoPaciente && (
            <header className="crc-cabecalho-pagina crc-cabecalho-premium">
              <div className="crc-cabecalho-icone" aria-hidden="true">
                <IconeAtual />
              </div>
              <div className="crc-cabecalho-copy">
                <div className="crc-sobretitulo">{guiaAtual.sobretitulo}</div>
                <h1 className="crc-titulo-pagina">{itemAtual.rotulo}</h1>
                <p className="crc-corpo">{guiaAtual.descricao}</p>
              </div>
              <div className="crc-legenda" aria-label={`Legenda de ${itemAtual.rotulo}`}>
                {guiaAtual.legendas.map((legenda) => (
                  <span key={legenda.rotulo} className="crc-legenda-item" data-tom={legenda.tom}>
                    <span className="crc-legenda-ponto" aria-hidden="true" />
                    {legenda.rotulo}
                  </span>
                ))}
              </div>
            </header>
          )}

          {guiaAberto && !naFichaDoPaciente && (
            <GuiaDaTela
              guia={guiaAtual}
              tela={itemAtual.rotulo}
              mapa={
                abaAtual === "home"
                  ? permitidas.map((n) => ({
                      rotulo: n.rotulo,
                      paraQue: GUIA_ABAS[n.aba].paraQue,
                      icone: n.icone,
                    }))
                  : null
              }
              aoDesligar={() => {
                alternarGuia(false);
              }}
            />
          )}

          {abaAtual === "home" && (
            <Home nomeUsuario={usuario.nome} aoAbrirPaciente={abrirPaciente} />
          )}

          {abaAtual === "trabalho" && (
            <MeuTrabalho usuarioId={usuario.id} aoAbrirPaciente={abrirPaciente} />
          )}

          {abaAtual === "inbox" && (
            <Inbox
              aoAbrirPaciente={abrirPaciente}
              conversaInicial={conversaAberta}
              aoConsumirInicial={() => {
                setConversaAberta(null);
              }}
            />
          )}

          {abaAtual === "funil" && <Funil aoAbrirPaciente={abrirPaciente} />}
          {abaAtual === "agenda" && <Agenda aoAbrirPaciente={abrirPaciente} />}

          {abaAtual === "pacientes" &&
            (pacienteAberto === null ? (
              <BuscaPacientes aoAbrirPaciente={abrirPaciente} />
            ) : (
              <CentralDoPaciente
                patientId={pacienteAberto}
                aoVoltar={() => {
                  setPacienteAberto(null);
                }}
              />
            ))}

          {abaAtual === "gestao" && (
            <Gestao
              podeExportar={usuario.permissoes.includes("exportar_dados")}
              podeVerFinanceiro={usuario.permissoes.includes("ver_financeiro")}
            />
          )}

          {abaAtual === "importar" && <Importar />}

          {abaAtual === "automacoes" && (
            <Automacoes podeGerenciar={usuario.permissoes.includes("gerenciar_automacao")} />
          )}

          {abaAtual === "integracoes" && (
            <Integracoes podeGerenciar={usuario.permissoes.includes("gerenciar_integracoes")} />
          )}

          {abaAtual === "campanhas" && <Campanhas />}

          {abaAtual === "inteligencia" && <Inteligencia />}
          {abaAtual === "conhecimento" && <Conhecimento />}
          {abaAtual === "modelos" && <ModelosECusto />}
          {abaAtual === "equipe" && <Equipe />}
          {abaAtual === "configuracoes" && <Configuracoes />}
        </main>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Entrada                                                                    */
/* -------------------------------------------------------------------------- */

function TelaDeEntrada({ aoEntrar }: { aoEntrar: () => void }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const acao = useAcao();

  const entrar = useCallback(async (): Promise<void> => {
    await acao.executar(() => entrarNoCrc({ data: { email, senha } }), aoEntrar);
  }, [acao, aoEntrar, email, senha]);

  return (
    <div className="crc-login">
      <section className="crc-login-apresentacao" aria-label="Sobre o JP CRC">
        <div className="crc-login-lockup">
          <Logo
            variante="lockup"
            fundo="escuro"
            altura={52}
            alt="JP Clínica Integrada Odontológica"
          />
        </div>

        <div className="crc-login-copy">
          <div className="crc-login-kicker">
            <Sparkles size={15} aria-hidden="true" />
            Central de relacionamento
          </div>
          <h1>Menos pacientes esquecidos. Mais cuidado que volta.</h1>
          <p>
            O JP CRC transforma faltas, cancelamentos e silêncios em uma operação clara: prioriza,
            automatiza, registra cada contato e mostra exatamente onde a equipe precisa agir.
          </p>

          <div className="crc-login-provas" aria-label="Principais recursos">
            <div className="crc-login-prova">
              <strong>Fila inteligente</strong>
              <span>Prioridade explicada, não uma caixa-preta.</span>
            </div>
            <div className="crc-login-prova">
              <strong>Automação segura</strong>
              <span>Contato com horário, cooldown e opt-out.</span>
            </div>
            <div className="crc-login-prova">
              <strong>Contexto completo</strong>
              <span>Paciente, conversa e resultado no mesmo fluxo.</span>
            </div>
          </div>
        </div>

        <div
          style={{
            position: "relative",
            zIndex: 1,
            color: "rgba(255,255,255,.52)",
            fontSize: ".75rem",
          }}
        >
          Uso interno • JP Clínica Integrada Odontológica
        </div>
      </section>

      <div className="crc-login-formulario">
        <form
          className="crc-login-cartao"
          onSubmit={(e) => {
            e.preventDefault();
            void entrar();
          }}
        >
          <div className="crc-login-mini-logo crc-marca" style={{ padding: 0 }}>
            <Logo
              variante="lockup"
              fundo="claro"
              altura={48}
              alt="JP Clínica Integrada Odontológica"
            />
            <span className="crc-modulo">CRC</span>
          </div>

          <div className="crc-sobretitulo">Acesso interno</div>
          <h2
            className="crc-titulo-pagina"
            style={{ fontSize: "2rem", marginBottom: "var(--crc-e2)" }}
          >
            Bem-vindo de volta.
          </h2>
          <p className="crc-corpo" style={{ marginBottom: "var(--crc-e6)" }}>
            Entre para continuar a operação da central de relacionamento da JP.
          </p>

          {acao.recado !== null && (
            <div style={{ marginBottom: "var(--crc-e4)" }}>
              <Aviso tom={acao.recado.tom}>{acao.recado.texto}</Aviso>
            </div>
          )}

          <div className="crc-pilha">
            <Campo rotulo="E-mail">
              {(id) => (
                <Entrada
                  id={id}
                  type="email"
                  autoComplete="username"
                  placeholder="seu@email.com"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                  }}
                />
              )}
            </Campo>

            <Campo rotulo="Senha">
              {(id) => (
                <Entrada
                  id={id}
                  type="password"
                  autoComplete="current-password"
                  placeholder="Sua senha"
                  required
                  value={senha}
                  onChange={(e) => {
                    setSenha(e.target.value);
                  }}
                />
              )}
            </Campo>

            <Botao type="submit" variante="primario" carregando={acao.rodando}>
              Entrar no CRC
            </Botao>
          </div>
        </form>
      </div>
    </div>
  );
}
