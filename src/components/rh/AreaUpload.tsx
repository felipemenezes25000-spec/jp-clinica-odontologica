/**
 * Área de anexo do currículo.
 *
 * O `<input type="file">` é real e mora dentro de um `<label>`: é isso que dá
 * de graça o clique, o Enter/Espaço pelo teclado e o nome acessível do controle.
 * A alternativa comum — esconder o input e chamar `.click()` de um `<div>` —
 * tira o campo da ordem de tabulação e deixa quem usa leitor de tela sem
 * nenhuma pista de que existe um upload ali.
 *
 * A validação de tamanho e formato é repetida aqui de propósito. Quem manda é o
 * servidor (`enviarCandidatura`), mas esperar o upload de 20 MB terminar para
 * descobrir que o arquivo não serve é um jeito cruel de dar a notícia.
 */
import { useState, type DragEvent } from "react";
import { FileText, Trash2, Upload } from "lucide-react";

import { Ajuda, MensagemErro } from "@/components/rh/CampoTexto";
import { idCampo } from "@/components/rh/idsCampo";
import { formatarTamanho } from "@/lib/rh/formatar";
import { EXTENSOES_CURRICULO, TAMANHO_MAX_CURRICULO, TIPOS_CURRICULO } from "@/lib/rh/tipos";

/**
 * Espelho da regra do servidor (`enviarCandidatura`), e precisa acompanhá-la:
 * a extensão é OBRIGATÓRIA, e o mime é prova adicional — nunca substituta.
 * Enquanto os dois valiam em "ou", um arquivo sem extensão conhecida passava
 * pela tela e só era recusado depois do upload inteiro — exatamente a notícia
 * cruel que este arquivo existe para evitar.
 *
 * O mime sozinho não basta; o inverso (extensão conhecida, mime esquisito)
 * segue aceito porque Windows e parte dos navegadores mandam `.doc` como
 * "application/octet-stream" ou como string vazia, e recusar aí jogaria fora
 * currículo legítimo.
 */
function motivoRecusa(arquivo: File): string {
  if (arquivo.size > TAMANHO_MAX_CURRICULO) {
    return `O arquivo tem ${formatarTamanho(arquivo.size)} e o limite é ${formatarTamanho(
      TAMANHO_MAX_CURRICULO,
    )}.`;
  }
  // Mesmo recorte que `nomeArquivoSeguro` faz no servidor: só o pedaço depois
  // do último ponto, sem caminho (Windows manda a barra invertida), sem
  // pontuação e em minúsculas — senão "Curriculo.PDF " seria recusado aqui e
  // aceito lá.
  const nome = arquivo.name.trim().replace(/\\/g, "/").split("/").pop() ?? "";
  const corte = nome.lastIndexOf(".");
  const bruta = corte > 0 ? nome.slice(corte + 1) : "";
  const extensao = bruta.length > 0 ? `.${bruta.replace(/[^A-Za-z0-9]/g, "").toLowerCase()}` : "";

  if (!EXTENSOES_CURRICULO.includes(extensao)) {
    return "Formato não aceito. Envie PDF, DOC, DOCX, JPG ou PNG.";
  }
  return "";
}

export function AreaUpload(props: {
  campo: string;
  arquivo: File | null;
  aoEscolher: (arquivo: File | null) => void;
  erro: string;
  aoErrar: (mensagem: string) => void;
}) {
  const [sobre, setSobre] = useState(false);

  const aceitar = (arquivo: File | null | undefined) => {
    if (!arquivo) return;
    const recusa = motivoRecusa(arquivo);
    if (recusa.length > 0) {
      props.aoErrar(recusa);
      props.aoEscolher(null);
      return;
    }
    props.aoErrar("");
    props.aoEscolher(arquivo);
  };

  const aoSoltar = (evento: DragEvent<HTMLLabelElement>) => {
    evento.preventDefault();
    setSobre(false);
    aceitar(evento.dataTransfer.files[0]);
  };

  const anexado = props.arquivo;

  return (
    <div>
      {/* Sem `htmlFor`: o input já está DENTRO do label, o que basta para o
          rótulo valer. Com os dois ao mesmo tempo, parte dos navegadores dispara
          a ativação duas vezes e o seletor de arquivos abre em duplicata. */}
      <label
        className="rh-dropzone focus-within:ring-2 focus-within:ring-forest focus-within:ring-offset-2"
        data-sobre={sobre ? "true" : "false"}
        data-preenchido={anexado ? "true" : "false"}
        onDragOver={(e) => {
          // Sem o preventDefault no dragover o navegador abre o arquivo numa
          // aba nova em vez de entregá-lo ao drop.
          e.preventDefault();
          setSobre(true);
        }}
        onDragLeave={() => setSobre(false)}
        onDrop={aoSoltar}
      >
        <input
          id={idCampo(props.campo)}
          type="file"
          className="sr-only"
          accept={[...EXTENSOES_CURRICULO, ...TIPOS_CURRICULO].join(",")}
          onChange={(e) => {
            aceitar(e.target.files?.[0]);
            // Zera o input para que escolher o MESMO arquivo de novo, depois de
            // remover, ainda dispare o onChange.
            e.target.value = "";
          }}
          aria-invalid={props.erro.length > 0}
          aria-describedby={`rh-ajuda-${props.campo}${
            props.erro.length > 0 ? ` rh-erro-${props.campo}` : ""
          }`}
        />

        {anexado ? (
          <>
            <FileText className="h-7 w-7 text-forest" aria-hidden="true" />
            <span className="max-w-full break-all font-display text-base font-extrabold text-ink">
              {anexado.name}
            </span>
            <span className="text-xs font-semibold text-ink-soft">
              {formatarTamanho(anexado.size)} · clique ou solte outro arquivo para trocar
            </span>
          </>
        ) : (
          <>
            <Upload className="h-7 w-7 text-forest" aria-hidden="true" />
            <span className="font-display text-base font-extrabold text-ink">Anexar currículo</span>
            <span className="max-w-sm text-xs font-medium">
              Arraste o arquivo até aqui ou clique para escolher. PDF, DOC, DOCX, JPG ou PNG, até{" "}
              {formatarTamanho(TAMANHO_MAX_CURRICULO)}.
            </span>
          </>
        )}
      </label>

      {/* Fora do <label> de propósito: um botão dentro dele herdaria o clique e
          abriria o seletor de arquivos em vez de remover o anexo. */}
      {anexado ? (
        <button
          type="button"
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-border-soft bg-white px-4 text-sm font-bold text-ink transition hover:border-ink-soft hover:bg-cream"
          onClick={() => {
            props.aoEscolher(null);
            props.aoErrar("");
          }}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Remover anexo
        </button>
      ) : null}

      <Ajuda
        campo={props.campo}
        texto="O anexo é opcional, mas ajuda: com ele a equipe avalia formação e experiência antes da conversa."
      />
      <MensagemErro campo={props.campo} texto={props.erro} />
    </div>
  );
}
