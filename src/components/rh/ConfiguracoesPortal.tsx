/**
 * Aba "Config": os textos do portal de carreiras e as chaves de contato do RH.
 *
 * Tudo aqui é conteúdo publicado — o que se escreve nesta tela é o que o
 * candidato lê na página de carreiras. Por isso cada campo diz onde aparece, e
 * o rodapé avisa quando há alteração pendente: sair da aba com o formulário
 * sujo significaria achar que publicou algo que continua antigo.
 *
 * O formulário mora num cartão claro (`.rh-papel`) sobre o fundo escuro do
 * painel: `.rh-rotulo`, `.rh-ajuda` e `.rh-campo` são desenhados para superfície
 * clara e perderiam contraste direto no verde profundo.
 */
import { useEffect, useRef, useState } from "react";
import { HardDrive, Info, Lock, Save, Sparkles, TriangleAlert } from "lucide-react";
import { CampoTexto, CampoTextarea } from "@/components/rh/CampoTexto";
import { Interruptor, ListaEditavel } from "@/components/rh/ControlesRh";
import { TrocarSenha } from "@/components/rh/TrocarSenha";
import { formatarDataHora, mascararTelefone } from "@/lib/rh/formatar";
import { custoEstimado, formatarDolar } from "@/lib/rh/ia/precos";
import type { RespostaEstadoSenha } from "@/lib/rh/api";
import type { ConfiguracoesRh } from "@/lib/rh/tipos";
import { LIMITES } from "@/lib/rh/tipos";

/** Plural sem "(s)": a tela é lida todo dia, e essa muleta cansa. */
function plural(n: number, singular: string, plural_: string): string {
  return n === 1 ? `1 ${singular}` : `${n} ${plural_}`;
}

/**
 * Compara só o que a tela edita. `atualizadoEm` fica de fora de propósito: ele é
 * carimbado pelo servidor no salvamento, e incluí-lo faria o formulário nascer
 * "com alterações não salvas" logo depois de salvar.
 */
function mesmoConteudo(a: ConfiguracoesRh, b: ConfiguracoesRh): boolean {
  return (
    a.tituloPortal === b.tituloPortal &&
    a.chamadaPortal === b.chamadaPortal &&
    a.textoSobre === b.textoSobre &&
    a.emailRh === b.emailRh &&
    a.whatsappRh === b.whatsappRh &&
    a.aceitandoEspontanea === b.aceitandoEspontanea &&
    a.analisarAoReceber === b.analisarAoReceber &&
    a.assinaturaRh === b.assinaturaRh &&
    a.mensagemSemVagas === b.mensagemSemVagas &&
    a.beneficiosPadrao.length === b.beneficiosPadrao.length &&
    a.beneficiosPadrao.every((item, i) => item === b.beneficiosPadrao[i])
  );
}

/**
 * O que a rota já sabe sobre a triagem por IA. Opcional e anulável porque a
 * consulta pode ter falhado (sessão caindo, servidor fora) sem que isso impeça
 * de editar os textos do portal — nesse caso o bloco só diz que não conseguiu
 * ler o estado, em vez de afirmar que a chave não existe.
 */
export type EstadoIaConfig = {
  configurada: boolean;
  motivo: string;
  modelo: string;
  pendentes: number;
  analisadas: number;
};

export function ConfiguracoesPortal(props: {
  config: ConfiguracoesRh;
  salvando: boolean;
  aoSalvar: (c: ConfiguracoesRh) => void;
  estadoIa?: EstadoIaConfig | null;
  /** `null` enquanto o painel ainda não consultou o servidor. */
  estadoSenha?: RespostaEstadoSenha | null;
  aoTrocarSenha?: (atualizadoEm: string) => void;
  aoAvisar?: (tipo: "ok" | "erro", texto: string) => void;
}) {
  const [form, setForm] = useState<ConfiguracoesRh>(props.config);

  /** Versão do servidor que o formulário usou como ponto de partida. */
  const baseDoForm = useRef<ConfiguracoesRh>(props.config);

  // Ressincroniza quando o servidor devolve a versão gravada (ou quando o painel
  // recarrega). Sem isso, o "atualizado em" ficaria congelado no valor que veio
  // na primeira renderização — mas só quando não há edição local pendente:
  // adotar a resposta do salvamento por cima do que a pessoa continuou digitando
  // apagaria esse texto sem aviso nenhum.
  useEffect(() => {
    if (props.config === baseDoForm.current) return;
    const pendente = !mesmoConteudo(form, baseDoForm.current);
    baseDoForm.current = props.config;
    if (!pendente) setForm(props.config);
  }, [props.config, form]);

  const sujo = !mesmoConteudo(form, props.config);

  // Mesmo motivo de `EditorVaga`: com chave genérica, o spread com `[campo]`
  // deixaria de tipar como `ConfiguracoesRh`.
  const trocar = <C extends keyof ConfiguracoesRh>(campo: C, valor: ConfiguracoesRh[C]) => {
    setForm((atual) => {
      const proximo: ConfiguracoesRh = { ...atual };
      proximo[campo] = valor;
      return proximo;
    });
  };

  const atualizado = formatarDataHora(props.config.atualizadoEm);

  /**
   * Quanto sai UMA leitura no modelo que o servidor está usando. Fica no texto
   * do interruptor porque "custa dinheiro" sem número é aviso que ninguém lê.
   * Modelo fora da tabela de preços não vira chute: a frase simplesmente não
   * cita valor nenhum.
   */
  const estimativaUnitaria = custoEstimado(props.estadoIa?.modelo ?? "", 1);
  const custoPorCurriculo = estimativaUnitaria.conhecido
    ? ` (cerca de ${formatarDolar(estimativaUnitaria.dolares)} por currículo em ${props.estadoIa?.modelo ?? ""})`
    : "";

  return (
    <section aria-labelledby="rh-config-titulo" className="space-y-6">
      <header className="rh-vidro p-4 sm:p-5">
        <h2
          id="rh-config-titulo"
          className="font-display text-2xl font-extrabold leading-tight text-white"
        >
          Configurações do portal
        </h2>
        <p className="mt-1 max-w-2xl text-sm font-medium text-white/85">
          Os textos abaixo são os que o candidato lê na página de carreiras. Ao salvar, a mudança
          entra no site na hora.
        </p>
        <p className="mt-2 text-xs font-semibold text-white/85">
          {atualizado.length > 0
            ? `Atualizado em ${atualizado}.`
            : "Ainda não foi salvo nenhuma vez: o portal está com os textos que vieram de fábrica."}
        </p>
      </header>

      {/* O foco volta ao contorno base: a folha global pinta de lime dentro de
          `.rh-aurora` (painel escuro), e sobre este cartão claro o lime mede
          2,81:1. */}
      <div className="rh-papel space-y-8 p-4 sm:p-6 [&_:focus-visible]:outline-forest-2">
        <section className="space-y-4">
          <h3 className="font-display text-lg font-extrabold text-forest-2">Textos da página</h3>
          <p className="-mt-2 max-w-2xl text-sm font-medium leading-relaxed text-ink">
            É o que a candidata lê na página de carreiras do site, antes de decidir se envia o
            currículo. Ao salvar, entra no ar na hora.
          </p>

          <CampoTexto
            campo="config-tituloPortal"
            rotulo="Título do portal"
            valor={form.tituloPortal}
            maxLength={80}
            ajuda="É o título grande no topo da página de carreiras."
            aoMudar={(v) => trocar("tituloPortal", v)}
          />

          <CampoTextarea
            campo="config-chamadaPortal"
            rotulo="Chamada"
            valor={form.chamadaPortal}
            linhas={3}
            maxLength={400}
            ajuda="Uma ou duas frases logo abaixo do título. É o que convence a pessoa a rolar a página."
            aoMudar={(v) => trocar("chamadaPortal", v)}
          />

          <CampoTextarea
            campo="config-textoSobre"
            rotulo="Sobre a clínica"
            valor={form.textoSobre}
            linhas={7}
            // O mesmo número que `montarConfiguracoes` grava: com 2500 a tela
            // aceitaria 500 caracteres que seriam cortados no meio da frase, em
            // silêncio, na hora de gravar.
            maxLength={LIMITES.textoSobre}
            ajuda="Aparece no bloco “quem somos” da página de carreiras."
            aoMudar={(v) => trocar("textoSobre", v)}
          />

          <CampoTextarea
            campo="config-mensagemSemVagas"
            rotulo="Mensagem quando não há vagas abertas"
            valor={form.mensagemSemVagas}
            linhas={3}
            maxLength={400}
            ajuda="É o único texto da página nos períodos sem vaga publicada. Vale convidar para o banco de talentos."
            aoMudar={(v) => trocar("mensagemSemVagas", v)}
          />
        </section>

        <section className="space-y-4">
          <h3 className="font-display text-lg font-extrabold text-forest-2">
            Benefícios padrão da clínica
          </h3>
          <ListaEditavel
            rotulo="Benefícios oferecidos"
            ajuda="Esta lista vira sugestão de um clique dentro do editor de cada vaga. Mudar aqui não reescreve as vagas já publicadas."
            placeholder="Ex.: Vale-transporte"
            itens={form.beneficiosPadrao}
            sugestoes={[]}
            rotuloSugestoes=""
            aoMudar={(itens) => trocar("beneficiosPadrao", itens)}
          />
        </section>

        <section className="space-y-4">
          <h3 className="font-display text-lg font-extrabold text-forest-2">Contato do RH</h3>
          <p className="-mt-2 max-w-2xl text-sm font-medium leading-relaxed text-ink">
            Para onde a clínica quer ser procurada. O e-mail recebe o aviso de candidatura nova; o
            WhatsApp aparece para a candidata falar com vocês.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <CampoTexto
              campo="config-emailRh"
              rotulo="E-mail do RH"
              tipo="email"
              inputMode="email"
              autoComplete="off"
              valor={form.emailRh}
              maxLength={120}
              opcional
              placeholder="rh@suaclinica.com.br"
              aoMudar={(v) => trocar("emailRh", v)}
            />
            <CampoTexto
              campo="config-whatsappRh"
              rotulo="WhatsApp do RH"
              tipo="tel"
              inputMode="tel"
              autoComplete="off"
              valor={form.whatsappRh}
              opcional
              placeholder="(11) 90000-0000"
              aoMudar={(v) => trocar("whatsappRh", mascararTelefone(v))}
            />
          </div>
          <p className="rh-ajuda">
            Publicados no portal para dúvidas sobre o processo. Em branco, o portal simplesmente não
            mostra o canal — melhor do que exibir um contato que ninguém acompanha.
          </p>

          {/* A assinatura não é publicada em lugar nenhum: ela entra nas
              mensagens que a central de contato escreve para a candidata. Fica
              aqui, e não numa tela nova, porque é a mesma pergunta das outras
              duas — "quem é o RH desta clínica?". */}
          <CampoTexto
            campo="config-assinaturaRh"
            rotulo="Quem assina as mensagens"
            valor={form.assinaturaRh}
            maxLength={80}
            opcional
            placeholder="Ex.: Ana Beatriz"
            ajuda="É o nome que aparece no WhatsApp e no e-mail enviados pelo painel (“Aqui é a Ana Beatriz, da JP…”). Em branco, as mensagens assinam com o nome da clínica."
            aoMudar={(v) => trocar("assinaturaRh", v)}
          />
        </section>

        <section className="space-y-4">
          <h3 className="font-display text-lg font-extrabold text-forest-2">Banco de talentos</h3>
          <p className="-mt-2 max-w-2xl text-sm font-medium leading-relaxed text-ink">
            Currículo enviado sem vaga aberta. Serve para ter gente na mão quando abrir uma vaga de
            repente.
          </p>
          <Interruptor
            rotulo="Aceitar candidaturas espontâneas"
            descricao="Desligado, o portal só aceita currículo ligado a uma vaga aberta: o formulário do banco de talentos sai do ar e quem tentar enviar recebe um aviso explicando."
            ligado={form.aceitandoEspontanea}
            desativado={props.salvando}
            aoMudar={(v) => trocar("aceitandoEspontanea", v)}
          />
        </section>

        {props.aoTrocarSenha !== undefined && props.aoAvisar !== undefined ? (
          <TrocarSenha
            estado={props.estadoSenha ?? null}
            aoTrocar={props.aoTrocarSenha}
            aoAvisar={props.aoAvisar}
          />
        ) : null}

        <section className="space-y-4">
          <h3 className="flex items-center gap-2 font-display text-lg font-extrabold text-forest-2">
            <Sparkles className="h-5 w-5 shrink-0" aria-hidden="true" />
            Triagem por IA
          </h3>

          {/* O texto avisa do custo antes do clique, e não depois da fatura:
              este interruptor nasce DESLIGADO justamente porque divulgar uma
              vaga e receber 200 currículos dispararia 200 leituras sem que
              ninguém tenha autorizado o gasto. */}
          <Interruptor
            rotulo="Analisar automaticamente as candidaturas que chegarem pelo site"
            descricao={`Isto custa dinheiro: cada currículo são duas leituras pagas do modelo${custoPorCurriculo}, cobradas na conta da OpenAI da clínica. Ligado, tudo que chega pelo site é lido sozinho — inclusive uma enxurrada de 200 candidaturas no dia em que a vaga viralizar. Desligado (como vem de fábrica), nada é lido até alguém clicar na aba Triagem por IA, que mostra o custo estimado antes de rodar.`}
            ligado={form.analisarAoReceber}
            desativado={props.salvando}
            aoMudar={(v) => trocar("analisarAoReceber", v)}
          />

          {/*
            Daqui para baixo é leitura, sem campo nenhum: modelo, se a chave
            existe e quantas fichas já foram lidas. Nada disso se edita na tela,
            e é assim de propósito — chave de API não mora em banco de dados de
            aplicação, mora na hospedagem.

            O nome exato da variável não é escrito aqui: este componente vira um
            arquivo JavaScript estático que qualquer visitante baixa, com ou sem
            sessão (o mesmo motivo já explicado no bloco de infraestrutura
            abaixo). Quem precisa do nome o recebe do próprio servidor, dentro
            de `motivo`, que só é gerado depois do login.
          */}
          <dl className="grid gap-3 rounded-2xl border border-border-soft bg-paper p-4 text-sm sm:grid-cols-3">
            <div className="min-w-0">
              <dt className="text-xs font-bold uppercase tracking-[0.1em] text-ink">
                Chave da OpenAI
              </dt>
              <dd className="mt-0.5 font-bold text-ink">
                {props.estadoIa == null
                  ? "Não foi possível consultar"
                  : props.estadoIa.configurada
                    ? "Cadastrada no servidor"
                    : "Não cadastrada"}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs font-bold uppercase tracking-[0.1em] text-ink">
                Modelo em uso
              </dt>
              <dd className="mt-0.5 truncate font-mono text-xs font-bold text-ink">
                {props.estadoIa?.modelo ?? "—"}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs font-bold uppercase tracking-[0.1em] text-ink">
                Fichas lidas
              </dt>
              <dd className="mt-0.5 font-bold tabular-nums text-ink">
                {props.estadoIa == null
                  ? "—"
                  : `${plural(props.estadoIa.analisadas, "lida", "lidas")} · ${props.estadoIa.pendentes} pendentes`}
              </dd>
            </div>
          </dl>

          {props.estadoIa != null && !props.estadoIa.configurada ? (
            <p className="flex items-start gap-2 rounded-2xl bg-amber-50 p-4 text-sm leading-relaxed text-amber-900 ring-1 ring-amber-300">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                <strong className="font-bold">A leitura por IA está desligada.</strong>{" "}
                {props.estadoIa.motivo.length > 0
                  ? props.estadoIa.motivo
                  : "O servidor não encontrou a chave da OpenAI."}
              </span>
            </p>
          ) : null}

          <p className="rh-ajuda">
            A chave da OpenAI é cadastrada por quem cuida da hospedagem, nunca por esta tela: no
            computador de quem desenvolve ela vai no arquivo <code>.env</code> (o
            <code> .env.example</code> do projeto traz o nome exato de cada variável); na Vercel, em{" "}
            <strong>Settings › Environment Variables</strong>, marcando Production e Preview e
            publicando de novo, porque variável nova só vale a partir da próxima publicação. O valor
            da chave não aparece nesta tela nem em nenhuma outra — nem inteiro, nem em pedaço.
          </p>
        </section>

        {/* Rodapé de ação: fica no fim do cartão, com o aviso de pendência ao
            lado do botão — é onde o olho já está quando termina de digitar. */}
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border-soft pt-5">
          <p className="mr-auto text-sm font-bold" role="status" aria-live="polite">
            {sujo ? (
              <span className="flex items-center gap-2 text-amber-800">
                <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                Você tem alterações não salvas.
              </span>
            ) : (
              <span className="text-ink">Tudo salvo.</span>
            )}
          </p>
          <button
            type="button"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-border-soft bg-white px-5 text-sm font-extrabold text-ink transition hover:border-forest disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!sujo || props.salvando}
            onClick={() => setForm(props.config)}
          >
            Descartar alterações
          </button>
          <button
            type="button"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-forest px-6 text-sm font-extrabold text-white transition hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!sujo || props.salvando}
            onClick={() => props.aoSalvar(form)}
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            {props.salvando ? "Salvando…" : "Salvar e publicar textos"}
          </button>
        </div>
      </div>

      {/*
        Bloco de leitura, sem campo nenhum: é a documentação mínima para quem
        assumir a clínica depois e abrir esta tela sem ter acompanhado a
        implantação.

        Fala de servidor, mas descreve o COMPORTAMENTO, nunca o nome de uma
        variável de ambiente nem um caminho no disco. O motivo é que o chunk
        JavaScript de /rh é um arquivo estático que qualquer visitante baixa,
        com ou sem sessão: o que estiver escrito aqui é público na prática. Esse
        detalhe é para quem faz o deploy, e mora no `.env.example` — onde é útil
        e não é servido. Mesma razão pela qual `segredosConfigurados()` parou de
        citar as variáveis na tela de login.
      */}
      <aside className="rh-vidro p-4 sm:p-5" aria-labelledby="rh-config-infra">
        <h3
          id="rh-config-infra"
          className="flex items-center gap-2 font-display text-base font-extrabold text-white"
        >
          <Info className="h-5 w-5 shrink-0 text-lime" aria-hidden="true" />
          Como este portal guarda os dados
        </h3>
        <dl className="mt-4 space-y-4 text-sm leading-relaxed text-white/85">
          <div className="flex gap-3">
            <dt className="shrink-0 pt-0.5">
              <HardDrive className="h-5 w-5 text-lime" aria-hidden="true" />
              <span className="sr-only">Onde ficam os currículos</span>
            </dt>
            <dd>
              Currículos e fichas ficam em arquivos no próprio servidor, numa pasta de dados
              separada — é ela que entra na rotina de backup da clínica. Quem cuida da hospedagem
              precisa garantir que essa pasta fique num disco permanente: em servidor de disco
              descartável, cada publicação nova levaria os arquivos junto.
            </dd>
          </div>
          <div className="flex gap-3">
            <dt className="shrink-0 pt-0.5">
              <Lock className="h-5 w-5 text-lime" aria-hidden="true" />
              <span className="sr-only">Como se entra no painel</span>
            </dt>
            <dd>
              O acesso a este painel usa uma senha única. Ela nasce nas variáveis de ambiente do
              servidor e pode ser trocada aqui em cima, em “Senha do painel” — a troca vale na hora
              e a senha anterior para de abrir. O painel guarda só uma marca embaralhada dela:
              ninguém, nem quem cuida do servidor, consegue ler a senha de volta.
            </dd>
          </div>
          <div className="flex gap-3">
            <dt className="shrink-0 pt-0.5">
              <TriangleAlert className="h-5 w-5 text-lime" aria-hidden="true" />
              <span className="sr-only">Cuidado com dados pessoais</span>
            </dt>
            <dd>
              As fichas trazem dados pessoais (CPF, endereço, currículo). Compartilhe só com quem
              participa da seleção e apague o que não for mais necessário — excluir uma candidatura
              no painel apaga junto o arquivo de currículo guardado no servidor.
            </dd>
          </div>
        </dl>
      </aside>
    </section>
  );
}
