/**
 * A ficha de entrevista dentro da gaveta do candidato.
 *
 * Entra logo depois de `<LeituraIa>` porque a ordem da tela é a ordem da
 * decisão: primeiro a leitura do currículo (vale a pena?), depois a ficha (o
 * que eu pergunto, e onde eu anoto). É a mesma sequência do guia da clínica —
 * leitura rápida, triagem objetiva, perguntas — e o formato não é nosso: é a
 * seção 3 do PDF que a Dra. Ana Beatriz e o Jefferson escreveram.
 *
 * A divisão que manda em tudo aqui, e que vale a pena repetir: a metade de cima
 * (ponto forte, o que validar, triagem, perguntas, notas sugeridas) é da IA e a
 * tela só a EXIBE — nada dela volta ao servidor por este componente. A metade
 * de baixo (respostas, observações, notas, resumos) é do entrevistador, e é a
 * única coisa que este arquivo envia. Regenerar refaz a primeira metade sem
 * encostar na segunda, e é isso que o aviso do botão "Regenerar" promete.
 *
 * A superfície é o verde profundo da gaveta, e a regra de contraste do cliente
 * vale sem exceção: sobre verde, LETRA BRANCA. O lime continua em ícone, borda,
 * anel e barra — que não são letra —, mas todo texto legível é `text-white`, e
 * o texto de apoio não desce de `text-white/85`. E `agora` desce por prop, como
 * no resto da gaveta: `new Date()` no render sai diferente no servidor e no
 * navegador e derruba a hidratação.
 */
import { useEffect, useId, useRef, useState } from "react";
import {
  Check,
  CircleAlert,
  ClipboardList,
  Copy,
  ListChecks,
  LoaderCircle,
  Play,
  Printer,
  RefreshCw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { CabecalhoFolha } from "@/components/rh/CabecalhoFolha";
import { LEITURAS, montarDuvidas } from "@/lib/rh/duvidas";
import { formatarData, formatarDataHora, tempoRelativo } from "@/lib/rh/formatar";
import {
  DECISOES,
  fichaVazia,
  IMPRESSOES,
  RESPOSTAS_TRIAGEM,
  comRespostaDeTriagem,
  leiturasDeDuvidas,
  notaDaFicha,
  partesDoEntrevistador,
  respostaDaPergunta,
  respostaDaTriagem,
  respostasDeDuvidas,
  totalDaFicha,
} from "@/lib/rh/ficha";
import type { FichaEntrevista, RespostaTriagem } from "@/lib/rh/ficha";
import { totalPossivel } from "@/lib/rh/guia";
import type { GuiaEntrevista } from "@/lib/rh/guia";
import type { Candidatura } from "@/lib/rh/tipos";

/* -------------------------------------------------------------------------- */
/* Constantes de estilo                                                       */
/* -------------------------------------------------------------------------- */

/* Métrica de `.rh-rotulo` sobre o vidro escuro. Branco, e não lime: sobre verde
   a letra é branca — o lime fica para o que não é letra (ícone, borda, anel). */
const ROTULO = "text-[0.68rem] font-bold uppercase tracking-[0.14em] text-white";

const BOTAO =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-bold ring-1 transition";
const BOTAO_PRINCIPAL = `${BOTAO} bg-lime text-brand-deep ring-lime hover:bg-lime/85`;
const BOTAO_SECUNDARIO = `${BOTAO} bg-white/10 text-white ring-white/20 hover:bg-white/20`;

/* Campo escuro. Não é `.rh-campo`: aquela classe é branca, desenhada para o
   formulário público, e no vidro escuro da gaveta cada campo viraria um bloco
   de luz. A métrica (altura, raio, respiro) é a mesma. */
const CAMPO =
  "block w-full min-h-11 rounded-xl border border-white/15 bg-white/[0.07] px-3 py-2 " +
  "text-sm leading-relaxed text-white placeholder:text-white/85 transition-colors " +
  "hover:border-white/30 focus:border-lime";

/**
 * Quanto tempo a tela espera antes de mandar a anotação ao servidor.
 *
 * Um POST por tecla derrubaria a fila de escrita do disco e faria o texto piscar
 * a cada resposta que chegasse atrasada. Um segundo é a pausa natural entre
 * frases de quem está digitando enquanto conversa; quem sai do campo antes disso
 * dispara na hora, pelo `onBlur`.
 */
const ESPERA_SALVAR = 1000;

/**
 * O que a tela diz enquanto o modelo escreve a ficha.
 *
 * Mesma escolha da leitura da IA: os passos são os reais, na ordem em que
 * acontecem, e trocam por tempo — melhor uma expectativa honesta do que uma
 * barra de progresso falsa.
 */
const PASSOS = [
  "Lendo o guia de entrevista da clínica…",
  "Relendo o currículo e as datas já calculadas…",
  "Escrevendo a triagem objetiva…",
  "Formulando as quatro perguntas deste currículo…",
  "Sugerindo notas com a evidência que as sustenta…",
];

/* -------------------------------------------------------------------------- */
/* Helpers puros                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `navigator.clipboard` some fora de contexto seguro (o painel roda em rede
 * local da clínica com frequência) e navegador antigo ainda depende do
 * `execCommand`. Sem o segundo caminho, o botão simplesmente não faria nada em
 * metade dos computadores da recepção.
 */
async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard !== undefined) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    // Sem contexto seguro ou sem permissão: cai no caminho antigo abaixo.
  }

  try {
    const area = document.createElement("textarea");
    area.value = texto;
    area.setAttribute("readonly", "");
    // Fora da tela, mas ainda focável: `display:none` impediria a seleção.
    area.style.position = "fixed";
    area.style.top = "-1000px";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

function rotuloDe(lista: { valor: string; rotulo: string }[], valor: string): string {
  return lista.find((i) => i.valor === valor)?.rotulo ?? "";
}

/**
 * A ficha como texto puro, do jeito que ela vai para o WhatsApp de quem vai
 * entrevistar.
 *
 * Sai formatada para ser lida no celular, em pé, na sala ao lado: sem markdown,
 * sem emoji, com as respostas já anotadas embaixo de cada pergunta. O aviso do
 * fim acompanha o texto porque a mensagem viaja para fora do painel — e ali
 * ninguém mais vê o rodapé da tela.
 */
function textoDaFicha(item: Candidatura, guia: GuiaEntrevista | null, f: FichaEntrevista): string {
  const nome = item.nome.trim() === "" ? "candidata" : item.nome.trim();
  const linhas: string[] = [`FICHA DE ENTREVISTA — ${nome}`];

  const cabecalho = [
    item.vagaTitulo.trim() === "" ? "" : `Vaga: ${item.vagaTitulo.trim()}`,
    item.protocolo === "" ? "" : `Protocolo: ${item.protocolo}`,
    f.guiaTitulo === "" ? "" : `Guia: ${f.guiaTitulo}`,
    f.entrevistaEm === "" ? "" : `Data: ${formatarData(f.entrevistaEm)} ${f.horario}`.trim(),
    f.entrevistadores.trim() === "" ? "" : `Entrevistadores: ${f.entrevistadores.trim()}`,
  ].filter((t) => t !== "");
  linhas.push(...cabecalho, "");

  if (f.pontoForte.trim() !== "") linhas.push("PONTO FORTE", f.pontoForte.trim(), "");
  if (f.oQueValidar.trim() !== "") linhas.push("O QUE VALIDAR", f.oQueValidar.trim(), "");

  if (f.triagem.length > 0) {
    linhas.push("TRIAGEM OBJETIVA (confirmar antes de aprofundar)");
    f.triagem.forEach((t, i) => {
      const r = respostaDaTriagem(f, t.pergunta);
      const marcada = r === null ? "" : rotuloDe(RESPOSTAS_TRIAGEM, r.resposta);
      linhas.push(
        `${i + 1}. ${t.pergunta} [ ${marcada === "" ? "sim / não / parcial" : marcada} ]`,
      );
      if (r !== null && r.observacao.trim() !== "") linhas.push(`   obs.: ${r.observacao.trim()}`);
    });
    linhas.push("");
  }

  if (guia !== null && guia.perguntasGerais.length > 0) {
    linhas.push("PERGUNTAS GERAIS (as mesmas com todas as candidatas)");
    guia.perguntasGerais.forEach((p, i) => {
      linhas.push(`${i + 1}. ${p}`);
      const r = respostaDaPergunta(f, p);
      if (r !== null && r.resposta.trim() !== "") linhas.push(`   -> ${r.resposta.trim()}`);
    });
    linhas.push("");
  }

  if (f.perguntasEspecificas.length > 0) {
    linhas.push("PERGUNTAS DESTE CURRÍCULO");
    f.perguntasEspecificas.forEach((p, i) => {
      linhas.push(`${i + 1}. ${p.pergunta}`);
      if (p.porque.trim() !== "") linhas.push(`   para saber: ${p.porque.trim()}`);
      const r = respostaDaPergunta(f, p.pergunta);
      if (r !== null && r.resposta.trim() !== "") linhas.push(`   -> ${r.resposta.trim()}`);
    });
    linhas.push("");
  }

  if (guia !== null && guia.criterios.length > 0) {
    const { total, avaliados } = totalDaFicha(f.notas);
    linhas.push(`PONTUAÇÃO (${total}/${totalPossivel(guia)} — ${avaliados} critérios avaliados)`);
    for (const c of guia.criterios) {
      const n = notaDaFicha(f, c.chave);
      const nota = n === null || n.nota === null ? "__" : String(n.nota);
      linhas.push(`- ${c.rotulo}: ${nota}/${guia.notaMaxima}`);
      if (n !== null && n.evidencia.trim() !== "") linhas.push(`   ${n.evidencia.trim()}`);
    }
    linhas.push("");
  }

  if (f.sinaisObservados.length > 0) {
    linhas.push("SINAIS OBSERVADOS", ...f.sinaisObservados.map((s) => `- ${s}`), "");
  }

  const fecho = [
    f.impressao === "" ? "" : `Impressão: ${rotuloDe(IMPRESSOES, f.impressao)}`,
    f.decisao === "" ? "" : `Decisão: ${rotuloDe(DECISOES, f.decisao)}`,
    f.evidenciaPositiva.trim() === "" ? "" : `Evidência positiva: ${f.evidenciaPositiva.trim()}`,
    f.duvidaAberta.trim() === "" ? "" : `Dúvida em aberto: ${f.duvidaAberta.trim()}`,
    f.motivoParaAvancar.trim() === "" ? "" : `Motivo para avançar: ${f.motivoParaAvancar.trim()}`,
    f.checarAntesDeContratar.trim() === ""
      ? ""
      : `Checar antes de contratar: ${f.checarAntesDeContratar.trim()}`,
  ].filter((t) => t !== "");
  if (fecho.length > 0) linhas.push("FECHAMENTO", ...fecho, "");

  linhas.push(
    "A leitura da IA é apoio à decisão humana: quem decide é a entrevista.",
    guia === null ? "" : guia.notaEtica,
  );
  return linhas.filter((l, i, todas) => !(l === "" && todas[i - 1] === "")).join("\n");
}

/* -------------------------------------------------------------------------- */
/* Peças                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Sim · Não · Parcial, os três do guia.
 *
 * `aria-pressed` e não `radiogroup` porque os três são botões de alternância de
 * verdade: clicar no que já está marcado desmarca. Quem marcou "Não" por engano
 * no meio da conversa precisa conseguir voltar ao estado "ainda não perguntei",
 * que é diferente de "perguntei e a resposta foi não".
 */
function BotoesResposta(props: {
  legenda: string;
  valor: RespostaTriagem;
  aoEscolher: (valor: RespostaTriagem) => void;
}) {
  const { legenda, valor, aoEscolher } = props;
  return (
    <div role="group" aria-label={legenda} className="flex flex-wrap gap-1.5">
      {RESPOSTAS_TRIAGEM.map((o) => {
        const ativo = valor === o.valor;
        return (
          <button
            key={o.valor}
            type="button"
            aria-pressed={ativo}
            onClick={() => aoEscolher(ativo ? "" : o.valor)}
            className={[
              "inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-bold ring-1 transition",
              ativo
                ? "bg-lime text-brand-deep ring-lime"
                : "bg-white/10 text-white ring-white/20 hover:bg-white/20",
            ].join(" ")}
          >
            {o.rotulo}
          </button>
        );
      })}
    </div>
  );
}

/** Um contador do progresso: "3 de 4". */
function Contador(props: { rotulo: string; feitos: number; total: number }) {
  const { rotulo, feitos, total } = props;
  if (total === 0) return null;
  const completo = feitos >= total;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ring-1 ${
        completo ? "bg-lime/15 text-white ring-lime/30" : "bg-white/10 text-white ring-white/20"
      }`}
    >
      {completo ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
      {rotulo} {feitos}/{total}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* A folha de impressão                                                       */
/* -------------------------------------------------------------------------- */

/** Caixinha de marcar, no papel. O "X" é texto de propósito: fundo colorido é a primeira coisa que o navegador descarta ao imprimir. */
function Caixa(props: { marcada: boolean; rotulo: string }) {
  return (
    <span className="rh-folha-opcao">
      <span className="rh-folha-caixa">{props.marcada ? "X" : ""}</span>
      {props.rotulo}
    </span>
  );
}

/** Linhas pautadas para escrever à mão quando o campo saiu em branco. */
function Pauta(props: { linhas: number }) {
  return (
    <>
      {Array.from({ length: props.linhas }, (_, i) => (
        <span key={i} className="rh-folha-linha" />
      ))}
    </>
  );
}

/** Campo do papel: mostra o que foi anotado, ou pauta em branco para a caneta. */
function CampoDaFolha(props: { rotulo: string; valor: string; linhas: number }) {
  const { rotulo, valor, linhas } = props;
  return (
    <div className="rh-folha-campo">
      <h3>{rotulo}</h3>
      {valor.trim() === "" ? <Pauta linhas={linhas} /> : <p>{valor}</p>}
    </div>
  );
}

/**
 * A ficha em A4, para quem prefere papel.
 *
 * Ela fica sempre no DOM e sempre escondida na tela (`.rh-folha` só existe
 * dentro do `@media print`), porque é assim que o Ctrl+P do navegador — e não
 * só o nosso botão — imprime a ficha certa. Impressa em branco, ela é o
 * formulário do guia: as 15 perguntas gerais, as 4 de triagem, as 4 do
 * currículo e a tabela de pontuação, com pauta para a caneta. Impressa depois
 * da entrevista, é o registro do que foi respondido.
 */
function FolhaDaFicha(props: {
  item: Candidatura;
  guia: GuiaEntrevista | null;
  ficha: FichaEntrevista;
}) {
  const { item, guia, ficha } = props;

  /* O topo institucional é `<CabecalhoFolha>`, que serve a marca oficial em SVG.
     Antes daqui saía uma folha anônima — nome de candidata e notas de entrevista
     sem dizer de onde vieram —, e é exatamente o defeito que o cliente apontou:
     o PDF que a clínica já usa traz a marca no topo de TODA página. Título,
     subtítulo e a linha de vaga/protocolo/data/horário são os mesmos de antes,
     só que montados como texto porque o cabeçalho recebe strings. */
  const nome = item.nome.trim() === "" ? "candidata" : item.nome.trim();
  const subtituloDaFolha = [
    ficha.guiaTitulo === "" ? "Guia de entrevista da clínica" : ficha.guiaTitulo,
    guia === null || guia.entrevistadores.trim() === "" ? "" : guia.entrevistadores.trim(),
  ]
    .filter((t) => t !== "")
    .join(" · ");
  /* Os sublinhados continuam: impressa em branco, esta folha é o formulário —
     quem preenche à caneta precisa da linha para escrever. */
  const dadosDaFolha = [
    `Vaga: ${item.vagaTitulo.trim() === "" ? "____________________" : item.vagaTitulo.trim()}`,
    `Protocolo: ${item.protocolo === "" ? "__________" : item.protocolo}`,
    `Data: ${ficha.entrevistaEm === "" ? "____/____/______" : formatarData(ficha.entrevistaEm)}`,
    `Horário: ${ficha.horario === "" ? "______" : ficha.horario}`,
  ].join(" · ");

  const criterios = guia?.criterios ?? [];
  const notaMaxima = guia?.notaMaxima ?? 5;
  const escala = Array.from({ length: notaMaxima + 1 }, (_, i) => i);
  const { total, avaliados } = totalDaFicha(ficha.notas);

  /* O roteiro sai de `montarDuvidas`, e não da ficha: ele consolida triagem,
     sinais calculados e perguntas da IA numa lista só, já sem repetição e na
     ordem em que as dúvidas pesam. A ficha guarda apenas o que foi LIDO de cada
     uma — por isso os dois registros vêm à parte, tolerantes a ficha antiga que
     voltou do disco sem eles. */
  const duvidas = montarDuvidas(item);
  const leituras = leiturasDeDuvidas(ficha);
  const respostas = respostasDeDuvidas(ficha);

  return (
    <section className="rh-folha" aria-hidden="true">
      {/* `confidencial`: a folha leva nome, vaga e protocolo de uma pessoa
          identificada, e depois de sair da bandeja não há controle de acesso
          nenhum — o aviso vai no próprio suporte. */}
      <CabecalhoFolha
        titulo={`Ficha de entrevista — ${nome}`}
        subtitulo={subtituloDaFolha}
        linhaDados={dadosDaFolha}
        confidencial
      />

      {ficha.pontoForte.trim() === "" ? null : (
        <div className="rh-folha-campo">
          <h3>Ponto forte</h3>
          <p>{ficha.pontoForte}</p>
        </div>
      )}
      {ficha.oQueValidar.trim() === "" ? null : (
        <div className="rh-folha-campo">
          <h3>O que validar</h3>
          <p>{ficha.oQueValidar}</p>
        </div>
      )}

      {ficha.triagem.length === 0 ? null : (
        <div className="rh-folha-bloco">
          <h2>Triagem objetiva — confirmar antes de aprofundar</h2>
          <ol>
            {ficha.triagem.map((t) => {
              const r = respostaDaTriagem(ficha, t.pergunta);
              return (
                <li key={t.pergunta}>
                  <p className="rh-folha-pergunta">{t.pergunta}</p>
                  <p className="rh-folha-opcoes">
                    {RESPOSTAS_TRIAGEM.map((o) => (
                      <Caixa key={o.valor} marcada={r?.resposta === o.valor} rotulo={o.rotulo} />
                    ))}
                  </p>
                  {r === null || r.observacao.trim() === "" ? (
                    <Pauta linhas={1} />
                  ) : (
                    <p>{r.observacao}</p>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {guia === null || guia.perguntasGerais.length === 0 ? null : (
        <div className="rh-folha-bloco">
          <h2>Perguntas gerais — as mesmas com todas as candidatas</h2>
          <ol>
            {guia.perguntasGerais.map((p) => {
              const r = respostaDaPergunta(ficha, p);
              return (
                <li key={p}>
                  <p className="rh-folha-pergunta">{p}</p>
                  {r === null || r.resposta.trim() === "" ? (
                    <Pauta linhas={2} />
                  ) : (
                    <p>{r.resposta}</p>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {ficha.perguntasEspecificas.length === 0 ? null : (
        <div className="rh-folha-bloco">
          <h2>Perguntas deste currículo</h2>
          <ol>
            {ficha.perguntasEspecificas.map((p) => {
              const r = respostaDaPergunta(ficha, p.pergunta);
              return (
                <li key={p.pergunta}>
                  <p className="rh-folha-pergunta">{p.pergunta}</p>
                  {p.porque.trim() === "" ? null : (
                    <p className="rh-folha-ajuda">para saber: {p.porque}</p>
                  )}
                  {r === null || r.resposta.trim() === "" ? (
                    <Pauta linhas={2} />
                  ) : (
                    <p>{r.resposta}</p>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* ---------- O que perguntar ----------
          Depois das perguntas do currículo e antes da pontuação, na mesma ordem
          da tela e do modo entrevista: o papel e a tela precisam contar a mesma
          história, senão quem imprime a ficha entrevista por um roteiro e quem
          usa o painel entrevista por outro.

          No papel é tudo preto no branco — impressora sem toner colorido é a
          regra na recepção, não a exceção —, e os dois lados da leitura vêm
          escritos por extenso porque quem está com a folha na mão não tem a tela
          para consultar. As três caixinhas são as mesmas da triagem: marcar a
          caneta é o gesto natural de quem entrevista com prancheta. */}
      {duvidas.length === 0 ? null : (
        <div className="rh-folha-bloco">
          <h2>O que perguntar — e como ler a resposta</h2>
          <ol>
            {duvidas.map((d) => {
              const leitura = leituras[d.id] ?? "";
              const resposta = (respostas[d.id] ?? "").trim();
              return (
                <li key={d.id}>
                  <p className="rh-folha-pergunta">{d.pergunta}</p>
                  {d.oQueChamouAtencao.trim() === "" ? null : (
                    <p className="rh-folha-ajuda">o que chamou atenção: {d.oQueChamouAtencao}</p>
                  )}
                  {d.seConvence.trim() === "" ? null : (
                    <p className="rh-folha-ajuda">faz sentido se: {d.seConvence}</p>
                  )}
                  {d.seNaoConvence.trim() === "" ? null : (
                    <p className="rh-folha-ajuda">não faz sentido se: {d.seNaoConvence}</p>
                  )}
                  <p className="rh-folha-opcoes">
                    {LEITURAS.map((o) => (
                      <Caixa key={o.valor} marcada={leitura === o.valor} rotulo={o.rotulo} />
                    ))}
                  </p>
                  {/* Pauta mesmo quando já há resposta digitada não faz sentido:
                      o papel repete o que foi anotado, e a linha em branco existe
                      só para quem vai escrever à caneta. */}
                  {resposta === "" ? <Pauta linhas={2} /> : <p>{resposta}</p>}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {criterios.length === 0 ? null : (
        <div className="rh-folha-bloco">
          <h2>
            Pontuação — total {avaliados === 0 ? "____" : total} de {criterios.length * notaMaxima}
          </h2>
          <table className="rh-folha-tabela">
            <thead>
              <tr>
                <th scope="col">Critério</th>
                {escala.map((n) => (
                  <th key={n} scope="col" className="rh-folha-nota">
                    {n}
                  </th>
                ))}
                <th scope="col">Evidência / observação</th>
              </tr>
            </thead>
            <tbody>
              {criterios.map((c) => {
                const n = notaDaFicha(ficha, c.chave);
                return (
                  <tr key={c.chave}>
                    <th scope="row">{c.rotulo}</th>
                    {escala.map((v) => (
                      <td key={v} className="rh-folha-nota">
                        {n !== null && n.nota === v ? "X" : ""}
                      </td>
                    ))}
                    <td>{n?.evidencia ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {guia === null || guia.sinaisObservacao.length === 0 ? null : (
        <div className="rh-folha-bloco">
          <h2>Sinais observados na conversa</h2>
          <p className="rh-folha-opcoes">
            {guia.sinaisObservacao.map((s) => (
              <Caixa key={s} marcada={ficha.sinaisObservados.includes(s)} rotulo={s} />
            ))}
          </p>
        </div>
      )}

      <div className="rh-folha-bloco">
        <h2>Fechamento</h2>
        <p className="rh-folha-opcoes">
          <strong>Impressão:</strong>
          {IMPRESSOES.map((o) => (
            <Caixa key={o.valor} marcada={ficha.impressao === o.valor} rotulo={o.rotulo} />
          ))}
        </p>
        <p className="rh-folha-opcoes">
          <strong>Decisão:</strong>
          {DECISOES.map((o) => (
            <Caixa key={o.valor} marcada={ficha.decisao === o.valor} rotulo={o.rotulo} />
          ))}
        </p>
        <CampoDaFolha
          rotulo="Principal evidência positiva"
          valor={ficha.evidenciaPositiva}
          linhas={2}
        />
        <CampoDaFolha
          rotulo="Principal dúvida / risco em aberto"
          valor={ficha.duvidaAberta}
          linhas={2}
        />
        <CampoDaFolha rotulo="Motivo para avançar" valor={ficha.motivoParaAvancar} linhas={2} />
        <CampoDaFolha
          rotulo="O que checar antes da contratação"
          valor={ficha.checarAntesDeContratar}
          linhas={2}
        />
      </div>

      <footer className="rh-folha-rodape">
        <p>{guia === null ? "" : guia.notaEtica}</p>
        <p>
          Assinatura dos entrevistadores: ____________________________________
          {ficha.entrevistadores.trim() === "" ? "" : ` (${ficha.entrevistadores})`}
        </p>
      </footer>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Componente público                                                         */
/* -------------------------------------------------------------------------- */

export function BlocoFicha(props: {
  item: Candidatura;
  guia: GuiaEntrevista | null;
  agora: Date;
  gerando: boolean;
  salvando: boolean;
  aoGerar: (forcar: boolean) => void;
  aoSalvar: (ficha: FichaEntrevista) => void;
  aoAbrirModoEntrevista: () => void;
}) {
  const { item, guia, agora, gerando, salvando, aoGerar, aoSalvar, aoAbrirModoEntrevista } = props;
  const ficha = item.ficha;
  const uid = useId();

  /* ---------------------------------------------------------------- estado */

  /**
   * O rascunho local guarda só a metade do entrevistador. A metade da IA é lida
   * direto de `item.ficha` no render: assim uma regeração que termina enquanto
   * alguém digita troca o texto do modelo na tela sem encostar na anotação, e
   * sem que a anotação possa reenviar texto velho do modelo ao servidor.
   */
  const [rascunho, setRascunho] = useState<FichaEntrevista>(() => ficha ?? fichaVazia());
  const [copiado, setCopiado] = useState<"" | "sim" | "nao">("");
  const [passo, setPasso] = useState(0);

  /* Carimbo de ordem. `seq` conta as edições locais; `enviado` guarda em qual
     delas o último POST saiu. Enquanto as duas não baterem — ou enquanto houver
     salvamento em voo — a tela é dona do texto e ignora o que volta do servidor:
     é exatamente aí que a resposta atrasada de um POST anterior chegaria por
     cima do que a pessoa acabou de digitar. */
  const refSujo = useRef(false);
  const refSeq = useRef(0);
  const refEnviado = useRef(0);
  const refTempo = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refPendente = useRef<FichaEntrevista | null>(null);
  const refDespachar = useRef<(f: FichaEntrevista) => void>(() => {});
  const refSalvandoAntes = useRef(salvando);
  const refTempoCopia = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (refSujo.current || salvando) return;
    setRascunho(item.ficha ?? fichaVazia());
  }, [item.ficha, salvando]);

  // O ciclo fecha quando o salvamento termina sem nenhuma edição nova no meio:
  // só então a tela volta a aceitar o que vem do servidor.
  useEffect(() => {
    if (refSalvandoAntes.current && !salvando && refSeq.current === refEnviado.current) {
      refSujo.current = false;
    }
    refSalvandoAntes.current = salvando;
  }, [salvando]);

  useEffect(() => {
    if (!gerando) return undefined;
    setPasso(0);
    const t = setInterval(() => setPasso((p) => (p + 1) % PASSOS.length), 5200);
    return () => clearInterval(t);
  }, [gerando]);

  useEffect(() => {
    return () => {
      if (refTempoCopia.current !== null) clearTimeout(refTempoCopia.current);
    };
  }, []);

  /* ---------------------------------------------------------- salvamento */

  function despachar(f: FichaEntrevista) {
    if (refTempo.current !== null) {
      clearTimeout(refTempo.current);
      refTempo.current = null;
    }
    refPendente.current = null;
    refEnviado.current = refSeq.current;
    // A base é a ficha do servidor, não o rascunho: o que sai daqui é a metade
    // humana; a metade da IA vai como está no disco, inclusive se acabou de ser
    // regerada.
    const base = item.ficha ?? fichaVazia();
    aoSalvar({
      ...base,
      ...partesDoEntrevistador(f),
      /* O roteiro de dúvidas é a exceção dentro da metade humana: quem o edita é
         o `<PainelDuvidas>` ao lado, que salva pela mesma rota. Este bloco não
         encosta nele, então reenviar a cópia do rascunho local — que foi semeada
         antes da última marcação — apagaria do disco o "convenceu" que a pessoa
         acabou de marcar dois centímetros acima. Vai o que está gravado, pela
         mesma lógica que faz a metade da IA viajar do servidor e não daqui. */
      leiturasDuvidas: leiturasDeDuvidas(base),
      respostasDuvidas: respostasDeDuvidas(base),
    });
  }

  function editar(f: FichaEntrevista, imediato: boolean) {
    refSeq.current += 1;
    refSujo.current = true;
    setRascunho(f);
    if (refTempo.current !== null) clearTimeout(refTempo.current);
    if (imediato) {
      despachar(f);
      return;
    }
    refPendente.current = f;
    refTempo.current = setTimeout(() => despachar(f), ESPERA_SALVAR);
  }

  // `refDespachar` acompanha a versão mais recente de `despachar` (que fecha
  // sobre `item.ficha` e `aoSalvar`), para o efeito de desmontagem abaixo não
  // despachar com props congeladas na primeira renderização.
  useEffect(() => {
    refDespachar.current = despachar;
  });

  // Fechar a gaveta com um debounce em voo não pode custar a anotação: o que
  // estava para sair sai agora.
  useEffect(() => {
    return () => {
      if (refTempo.current !== null) clearTimeout(refTempo.current);
      const pendente = refPendente.current;
      if (pendente !== null) refDespachar.current(pendente);
    };
  }, []);

  async function copiar(texto: string) {
    const ok = await copiarTexto(texto);
    setCopiado(ok ? "sim" : "nao");
    if (refTempoCopia.current !== null) clearTimeout(refTempoCopia.current);
    refTempoCopia.current = setTimeout(() => setCopiado(""), 4000);
  }

  /* ---------------------------------------------------------------- topo */

  const titulo = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3
        id={`${uid}-titulo`}
        className="flex items-center gap-2 font-display text-[0.72rem] font-extrabold uppercase tracking-[0.14em] text-white"
      >
        <ClipboardList className="h-4 w-4 shrink-0" aria-hidden="true" />
        Ficha de entrevista
      </h3>
    </div>
  );

  /* -------------------------------------------------------------- estados */

  const gerada = ficha !== null && ficha.geradaEm !== "";

  // Gerando pela primeira vez: a seção inteira é a espera.
  if (gerando && !gerada) {
    return (
      <section aria-labelledby={`${uid}-titulo`} className="rh-vidro p-4 sm:p-5">
        {titulo}
        <div className="mt-3 flex items-center gap-3">
          <LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-lime" aria-hidden="true" />
          <div className="min-w-0">
            <p role="status" aria-live="polite" className="text-sm font-bold text-white">
              {PASSOS[passo] ?? PASSOS[0]}
            </p>
            <p className="mt-0.5 text-xs text-white/85">
              A ficha sai no formato do guia da clínica: costuma levar meio minuto.
            </p>
          </div>
        </div>
      </section>
    );
  }

  // Ainda não existe ficha: o convite.
  if (!gerada) {
    return (
      <section aria-labelledby={`${uid}-titulo`} className="rh-vidro p-4 sm:p-5">
        {titulo}
        <p className="mt-2 text-sm leading-relaxed text-white/85">
          O sistema monta a ficha no formato do guia da clínica: ponto forte, o que validar, 4 itens
          de triagem objetiva e 4 perguntas tiradas do currículo dela.
        </p>

        {ficha !== null && ficha.erro !== "" ? (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-rose-300/10 p-3 text-sm leading-relaxed text-rose-100 ring-1 ring-rose-200/30">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              <strong className="font-bold">A ficha não ficou pronta.</strong> {ficha.erro}
            </span>
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => aoGerar(false)}
          disabled={gerando}
          className={`${BOTAO_PRINCIPAL} mt-3 disabled:opacity-60`}
        >
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          {ficha !== null && ficha.erro !== "" ? "Tentar de novo" : "Preparar entrevista"}
        </button>
      </section>
    );
  }

  /* ---------------------------------------------------------- com ficha */

  // A ficha que a tela mostra e que vai para o papel: metade da IA vinda do
  // servidor, metade do entrevistador vinda do rascunho local — menos o roteiro
  // de dúvidas, que este bloco não edita e por isso lê do disco, como faz o
  // despacho. Sem esta ressalva a folha impressa sairia com a leitura de antes
  // da última marcação.
  const atual: FichaEntrevista = {
    ...ficha,
    ...partesDoEntrevistador(rascunho),
    leiturasDuvidas: leiturasDeDuvidas(ficha),
    respostasDuvidas: respostasDeDuvidas(ficha),
  };

  const criterios = guia?.criterios ?? [];
  const triagemFeita = atual.triagem.filter(
    (t) => (respostaDaTriagem(atual, t.pergunta)?.resposta ?? "") !== "",
  ).length;
  const perguntasFeitas = atual.perguntasEspecificas.filter(
    (p) => (respostaDaPergunta(atual, p.pergunta)?.resposta ?? "").trim() !== "",
  ).length;
  const pontuados = criterios.filter((c) => {
    const n = notaDaFicha(atual, c.chave);
    return n !== null && n.nota !== null;
  }).length;
  const { total } = totalDaFicha(atual.notas);
  const maximo = guia === null ? 0 : totalPossivel(guia);
  const relativo = tempoRelativo(atual.geradaEm, agora);

  return (
    <section aria-labelledby={`${uid}-titulo`} className="rh-vidro p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        {titulo}
        <button
          type="button"
          onClick={() => aoGerar(true)}
          disabled={gerando}
          className={`${BOTAO_SECUNDARIO} min-h-9 px-3 text-xs disabled:opacity-60`}
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${gerando ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          Regenerar
        </button>
      </div>

      <p className="mt-1 text-xs leading-relaxed text-white/85">
        {atual.guiaTitulo === "" ? "Guia da clínica" : atual.guiaTitulo}
        {atual.geradaEm === "" ? "" : ` · preparada em ${formatarDataHora(atual.geradaEm)}`}
        {relativo === "" ? "" : ` (${relativo})`}
        {/* O aviso do "Regenerar" fica colado nele, e não escondido num tooltip:
            é a pergunta que qualquer pessoa faz antes de clicar. */}
        <br />
        Regenerar refaz só o que a IA escreveu. As respostas, notas e observações anotadas aqui
        ficam.
      </p>

      {gerando ? (
        <p
          role="status"
          aria-live="polite"
          className="mt-3 flex items-center gap-2 rounded-xl bg-lime/10 px-3 py-2 text-sm font-semibold text-white ring-1 ring-lime/25"
        >
          <LoaderCircle className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
          {PASSOS[passo] ?? PASSOS[0]}
        </p>
      ) : null}

      {atual.erro !== "" ? (
        <div className="mt-3 rounded-xl bg-rose-300/10 p-3 ring-1 ring-rose-200/30">
          <p className="flex items-start gap-2 text-sm leading-relaxed text-rose-100">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              <strong className="font-bold">A última geração falhou.</strong> {atual.erro} O que
              está abaixo é a versão anterior.
            </span>
          </p>
          {!gerando ? (
            <button
              type="button"
              onClick={() => aoGerar(true)}
              className={`${BOTAO_SECUNDARIO} mt-2.5 min-h-9 px-3 text-xs`}
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Tentar de novo
            </button>
          ) : null}
        </div>
      ) : null}

      {/* ---------- Leitura rápida ---------- */}
      <div className="mt-4 grid gap-3">
        {atual.pontoForte.trim() === "" ? null : (
          <div className="rounded-xl border-l-4 border-lime bg-white/[0.05] p-3.5">
            <h4 className={ROTULO}>Ponto forte</h4>
            <p className="mt-1.5 text-sm leading-relaxed text-white/90">{atual.pontoForte}</p>
          </div>
        )}
        {atual.oQueValidar.trim() === "" ? null : (
          <div className="rounded-xl border-l-4 border-amber-300 bg-white/[0.05] p-3.5">
            <h4 className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-amber-200">
              O que validar
            </h4>
            <p className="mt-1.5 text-sm leading-relaxed text-white/90">{atual.oQueValidar}</p>
          </div>
        )}
      </div>

      {/* ---------- O botão grande ----------
          Ele é o caminho principal desta seção: a ficha existe para ser usada
          com a candidata na frente, e não para ser lida na gaveta. */}
      <button
        type="button"
        onClick={aoAbrirModoEntrevista}
        className={`${BOTAO_PRINCIPAL} mt-4 min-h-14 w-full text-base`}
      >
        <Play className="h-5 w-5" aria-hidden="true" />
        Iniciar entrevista
      </button>

      {/* ---------- Progresso ---------- */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Contador rotulo="triagem" feitos={triagemFeita} total={atual.triagem.length} />
        <Contador
          rotulo="perguntas"
          feitos={perguntasFeitas}
          total={atual.perguntasEspecificas.length}
        />
        <Contador rotulo="critérios" feitos={pontuados} total={criterios.length} />
        {maximo > 0 && pontuados > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-lime/15 px-3 py-1 text-xs font-extrabold tabular-nums text-white ring-1 ring-lime/30">
            <ListChecks className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {total}/{maximo} pontos
          </span>
        ) : null}
        {atual.decisao === "" ? null : (
          <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white ring-1 ring-white/20">
            {rotuloDe(DECISOES, atual.decisao)}
          </span>
        )}
      </div>

      {/* ---------- Triagem objetiva ---------- */}
      {atual.triagem.length > 0 ? (
        <div className="mt-4 border-t border-white/10 pt-4">
          <h4 className={ROTULO}>Triagem objetiva</h4>
          <p className="mt-1 text-xs leading-relaxed text-white/85">
            Confirme estes quatro antes de aprofundar — é o que o guia manda fazer primeiro.
          </p>

          <ol className="mt-3 space-y-4">
            {atual.triagem.map((t, i) => {
              const r = respostaDaTriagem(atual, t.pergunta);
              const idObs = `${uid}-obs-${i}`;
              return (
                <li
                  key={t.pergunta}
                  className="rounded-xl bg-white/[0.04] p-3 ring-1 ring-white/10"
                >
                  <p className="text-sm font-semibold leading-relaxed text-white">
                    <span className="mr-1.5 font-extrabold tabular-nums text-white">{i + 1}.</span>
                    {t.pergunta}
                  </p>
                  {t.porque.trim() === "" ? null : (
                    <p className="mt-0.5 text-xs leading-relaxed text-white/85">{t.porque}</p>
                  )}

                  <div className="mt-2.5">
                    <BotoesResposta
                      legenda={`Resposta: ${t.pergunta}`}
                      valor={r?.resposta ?? ""}
                      aoEscolher={(valor) =>
                        editar(
                          comRespostaDeTriagem(rascunho, t.pergunta, { resposta: valor }),
                          true,
                        )
                      }
                    />
                  </div>

                  <label htmlFor={idObs} className="sr-only">
                    Observação sobre: {t.pergunta}
                  </label>
                  <textarea
                    id={idObs}
                    rows={2}
                    value={r?.observacao ?? ""}
                    placeholder="o que ela respondeu…"
                    onChange={(e) =>
                      editar(
                        comRespostaDeTriagem(rascunho, t.pergunta, { observacao: e.target.value }),
                        false,
                      )
                    }
                    onBlur={() => {
                      const pendente = refPendente.current;
                      if (pendente !== null) despachar(pendente);
                    }}
                    className={`${CAMPO} mt-2 resize-y`}
                  />
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}

      {/* ---------- As quatro perguntas deste currículo ---------- */}
      {atual.perguntasEspecificas.length > 0 ? (
        <div className="mt-4 border-t border-white/10 pt-4">
          <h4 className={ROTULO}>Perguntas deste currículo</h4>
          <ol className="mt-2 space-y-3">
            {atual.perguntasEspecificas.map((p, i) => {
              const r = respostaDaPergunta(atual, p.pergunta);
              return (
                <li key={p.pergunta} className="flex gap-2.5">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-lime/15 text-xs font-extrabold tabular-nums text-white ring-1 ring-lime/30">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-relaxed text-white">{p.pergunta}</p>
                    {p.porque.trim() === "" ? null : (
                      <p className="mt-0.5 text-xs leading-relaxed text-white/85">
                        para saber: {p.porque}
                      </p>
                    )}
                    {/* A anotação aparece aqui em leitura: quem escreve é o modo
                        entrevista, com a candidata na frente e a tela inteira. */}
                    {r !== null && r.resposta.trim() !== "" ? (
                      <p className="mt-1.5 rounded-lg border-l-2 border-lime/40 bg-white/[0.05] px-2.5 py-1.5 text-sm leading-relaxed text-white">
                        {r.resposta}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}

      {/* ---------- Ações de papel ---------- */}
      <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4">
        <button
          type="button"
          onClick={() => window.print()}
          className={`${BOTAO_SECUNDARIO} min-h-10 px-3 text-xs`}
        >
          <Printer className="h-3.5 w-3.5" aria-hidden="true" />
          Imprimir ficha
        </button>
        <button
          type="button"
          onClick={() => void copiar(textoDaFicha(item, guia, atual))}
          className={`${BOTAO_SECUNDARIO} min-h-10 px-3 text-xs`}
        >
          {copiado === "sim" ? (
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          Copiar ficha
        </button>
      </div>

      <p role="status" aria-live="polite" className="mt-1.5 text-xs font-semibold text-white">
        {copiado === "sim" ? "Ficha copiada para a área de transferência." : ""}
        {copiado === "nao" ? (
          <span className="text-amber-200">
            Não consegui copiar neste navegador — imprima ou selecione o texto à mão.
          </span>
        ) : null}
        {salvando ? <span className="text-white/85">Salvando…</span> : ""}
      </p>

      {guia === null ? null : (
        <p className="mt-3 flex items-start gap-2 border-t border-white/10 pt-3 text-[0.7rem] leading-relaxed text-white/85">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{guia.notaEtica}</span>
        </p>
      )}

      <FolhaDaFicha item={item} guia={guia} ficha={atual} />
    </section>
  );
}
