/**
 * Campos de formulário do Portal de RH.
 *
 * Existem para que rótulo, texto de ajuda, mensagem de erro e os atributos de
 * acessibilidade andem sempre grudados. O formulário público tem quase quarenta
 * campos; escrito à mão em cada um, algum sairia sem o `aria-describedby` que
 * liga a mensagem de erro ao campo — e quem usa leitor de tela ouviria só
 * "inválido", sem saber o motivo.
 *
 * O `id` do elemento é derivado do NOME do campo (`cpf` -> `rh-campo-cpf`).
 * É esse contrato que deixa o assistente mover o foco para o primeiro campo
 * inválido com um `getElementById`, sem precisar guardar uma ref por campo nem
 * repassar refs por cinco níveis de props.
 */
import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";

// `idCampo`, `descritores` e os ids irmãos moram em `idsCampo.ts`: este módulo
// só exporta componentes, que é o que o Fast Refresh do Vite exige para trocar
// um componente sem remontar a árvore (e sem jogar o formulário de volta ao
// passo 1). Quem já importava daqui passa a importar de lá.
import { descritores, idAjuda, idCampo, idErro, idRotulo } from "@/components/rh/idsCampo";

/** Etiqueta discreta de "opcional". Marcar o opcional é mais honesto do que
 *  encher a tela de asteriscos: aqui a maioria dos campos é obrigatória. */
function Opcional() {
  return (
    <span className="ml-2 text-[0.65rem] font-semibold normal-case tracking-normal text-ink-soft">
      opcional
    </span>
  );
}

export function Rotulo(props: {
  campo: string;
  texto: string;
  opcional?: boolean | undefined;
  /** `false` transforma o rótulo em <p>, para grupos que não têm um controle único. */
  paraCampo?: boolean | undefined;
}) {
  const conteudo = (
    <>
      {props.texto}
      {props.opcional === true ? <Opcional /> : null}
    </>
  );

  // Um <label for> apontando para um grupo de botões não teria alvo válido;
  // nesse caso o texto vira <p> e o grupo o referencia por aria-labelledby.
  if (props.paraCampo === false) {
    return (
      <p className="rh-rotulo" id={idRotulo(props.campo)}>
        {conteudo}
      </p>
    );
  }
  return (
    <label className="rh-rotulo" id={idRotulo(props.campo)} htmlFor={idCampo(props.campo)}>
      {conteudo}
    </label>
  );
}

export function Ajuda(props: { campo: string; texto: string }) {
  if (props.texto.length === 0) return null;
  return (
    <p className="rh-ajuda" id={idAjuda(props.campo)}>
      {props.texto}
    </p>
  );
}

/**
 * `role="alert"` faz o leitor anunciar a mensagem no instante em que ela
 * aparece — que é justamente quando a pessoa tentou avançar e foi barrada.
 */
export function MensagemErro(props: { campo: string; texto: string }) {
  if (props.texto.length === 0) return null;
  return (
    <p className="rh-erro" id={idErro(props.campo)} role="alert">
      <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{props.texto}</span>
    </p>
  );
}

type Comuns = {
  campo: string;
  rotulo: string;
  erro?: string | undefined;
  ajuda?: string | undefined;
  opcional?: boolean | undefined;
  className?: string | undefined;
};

export function CampoTexto(
  props: Comuns & {
    valor: string;
    aoMudar: (valor: string) => void;
    tipo?: "text" | "email" | "tel" | "url" | "date" | "password" | undefined;
    placeholder?: string | undefined;
    autoComplete?: string | undefined;
    inputMode?: "text" | "numeric" | "tel" | "email" | "url" | undefined;
    maxLength?: number | undefined;
    max?: string | undefined;
  },
) {
  const erro = props.erro ?? "";
  const ajuda = props.ajuda ?? "";

  return (
    <div className={props.className ?? ""}>
      <Rotulo campo={props.campo} texto={props.rotulo} opcional={props.opcional} />
      <input
        id={idCampo(props.campo)}
        className="rh-campo"
        type={props.tipo ?? "text"}
        value={props.valor}
        onChange={(e) => props.aoMudar(e.target.value)}
        placeholder={props.placeholder}
        autoComplete={props.autoComplete}
        inputMode={props.inputMode}
        maxLength={props.maxLength}
        max={props.max}
        aria-invalid={erro.length > 0}
        aria-describedby={descritores(props.campo, ajuda, erro)}
      />
      <Ajuda campo={props.campo} texto={ajuda} />
      <MensagemErro campo={props.campo} texto={erro} />
    </div>
  );
}

export function CampoTextarea(
  props: Comuns & {
    valor: string;
    aoMudar: (valor: string) => void;
    linhas?: number | undefined;
    placeholder?: string | undefined;
    maxLength?: number | undefined;
    /** Rodapé livre do campo — usado pelo contador de caracteres da carta. */
    rodape?: ReactNode;
  },
) {
  const erro = props.erro ?? "";
  const ajuda = props.ajuda ?? "";

  return (
    <div className={props.className ?? ""}>
      <Rotulo campo={props.campo} texto={props.rotulo} opcional={props.opcional} />
      <textarea
        id={idCampo(props.campo)}
        className="rh-campo"
        rows={props.linhas ?? 4}
        value={props.valor}
        onChange={(e) => props.aoMudar(e.target.value)}
        placeholder={props.placeholder}
        maxLength={props.maxLength}
        aria-invalid={erro.length > 0}
        aria-describedby={descritores(props.campo, ajuda, erro)}
      />
      {props.rodape}
      <Ajuda campo={props.campo} texto={ajuda} />
      <MensagemErro campo={props.campo} texto={erro} />
    </div>
  );
}

export function CampoSelect(
  props: Comuns & {
    valor: string;
    aoMudar: (valor: string) => void;
    opcoes: { valor: string; rotulo: string }[];
    /** Primeira linha, sem valor. Serve de placeholder acessível. */
    vazio?: string | undefined;
  },
) {
  const erro = props.erro ?? "";
  const ajuda = props.ajuda ?? "";

  return (
    <div className={props.className ?? ""}>
      <Rotulo campo={props.campo} texto={props.rotulo} opcional={props.opcional} />
      <select
        id={idCampo(props.campo)}
        className="rh-campo"
        value={props.valor}
        onChange={(e) => props.aoMudar(e.target.value)}
        aria-invalid={erro.length > 0}
        aria-describedby={descritores(props.campo, ajuda, erro)}
      >
        <option value="">{props.vazio ?? "Selecione..."}</option>
        {props.opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
      <Ajuda campo={props.campo} texto={ajuda} />
      <MensagemErro campo={props.campo} texto={erro} />
    </div>
  );
}
