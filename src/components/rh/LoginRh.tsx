/**
 * Porta de entrada do painel de RH.
 *
 * A tela não sabe nada sobre sessão: quem conversa com o servidor é a rota, que
 * desce aqui só o resultado (`erro`, `segundos` de bloqueio, `ocupado`). Assim o
 * mesmo componente serve para a primeira carga, para o erro de senha e para a
 * espera do rate limit, sem cada estado virar uma tela diferente.
 */
import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowLeft,
  ClipboardList,
  Eye,
  EyeOff,
  Inbox,
  LockKeyhole,
  Megaphone,
  TriangleAlert,
} from "lucide-react";

import fotoConsultorio from "@/assets/consultorio-implantes-1.webp";
import { Logo } from "@/components/site/Logo";
import { AvataresEquipe } from "@/components/site/ui/AvataresEquipe";

import "./painel.css";

/**
 * O que a coordenação encontra depois de entrar. Só o que existe sempre: a
 * triagem por IA depende de chave no servidor e por isso fica de fora daqui.
 */
const DENTRO_DO_PAINEL = [
  {
    Icone: Inbox,
    titulo: "Candidaturas",
    texto: "Tudo o que chega pelo site, com currículo e contato.",
  },
  {
    Icone: ClipboardList,
    titulo: "Entrevistas",
    texto: "Roteiro e ficha de cada conversa, lado a lado.",
  },
  {
    Icone: Megaphone,
    titulo: "Vagas",
    texto: "Abra, pause e feche as vagas publicadas no site.",
  },
] as const;

/**
 * Abaixo de um minuto o texto fica em segundos ("45s"): "0:45" faz a pessoa
 * traduzir mentalmente uma espera que é curta. Acima disso vira relógio.
 */
function formatarEspera(segundos: number): string {
  if (segundos <= 0) return "";
  if (segundos < 60) return `${segundos}s`;
  const minutos = Math.floor(segundos / 60);
  const resto = segundos % 60;
  return `${minutos}:${String(resto).padStart(2, "0")}`;
}

export function LoginRh({
  configurado,
  motivo,
  ocupado,
  erro,
  segundos,
  aoEnviar,
}: {
  /** `false` quando faltam as variáveis de ambiente do portal no servidor. */
  configurado: boolean;
  /** Explicação do servidor para o portal estar fora do ar. */
  motivo: string;
  ocupado: boolean;
  erro: string;
  /** Segundos restantes do bloqueio por tentativas seguidas. Zero = liberado. */
  segundos: number;
  aoEnviar: (senha: string) => void;
}) {
  const [senha, setSenha] = useState("");
  const [mostrar, setMostrar] = useState(false);
  // Cópia local do bloqueio: o servidor manda o número uma vez, quem faz a conta
  // andar na tela é este estado. Sem isso o contador ficaria congelado em "60s"
  // até a próxima resposta, e a pessoa não saberia se ainda falta esperar.
  const [restantes, setRestantes] = useState(segundos);

  // Foco automático só onde há mouse e teclado físico: no celular ele abriria o
  // teclado virtual de imediato e cobriria a tela antes de a pessoa ler o título.
  const campoSenha = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      campoSenha.current?.focus();
    }
  }, []);

  const idBase = useId();
  const idSenha = `${idBase}-senha`;
  const idAjuda = `${idBase}-ajuda`;
  const idErro = `${idBase}-erro`;
  const idEspera = `${idBase}-espera`;

  useEffect(() => {
    setRestantes(segundos);
  }, [segundos]);

  const contando = restantes > 0;

  // A dependência é o booleano, e não `restantes`: com o número o intervalo
  // seria destruído e recriado a cada segundo, o que faz a contagem derrapar.
  useEffect(() => {
    if (!contando) return;
    const id = window.setInterval(() => {
      setRestantes((valor) => (valor > 1 ? valor - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [contando]);

  const bloqueado = !configurado || ocupado || contando;

  const descreve = [idAjuda, erro ? idErro : "", contando ? idEspera : ""]
    .filter((id) => id !== "")
    .join(" ");

  return (
    <div className="rh-entrada">
      {/* A metade da marca é a clínica de verdade: o consultório ao fundo, um
          véu verde para o texto ler, a frase do portal, os rostos da equipe e
          uma prévia do que existe lá dentro. No celular vira uma faixa com a
          foto, a assinatura e a frase; a prévia e os rostos ficam para a tela
          larga, onde há lugar para eles. */}
      <div className="rh-entrada__marca">
        <img
          className="rh-entrada__foto"
          src={fotoConsultorio}
          alt=""
          width={1200}
          height={1500}
          decoding="async"
          fetchPriority="high"
        />
        <div className="rh-entrada__veu" aria-hidden="true" />

        {/* Símbolo + nome em texto: o lockup raster ficava pixelado e o
            "Clínica Odontológica" miúdo era ilegível sobre o verde. */}
        <div className="rh-entrada__topo">
          <div className="rh-entrada__assinatura">
            <Logo variante="simbolo" fundo="escuro" altura={40} alt="" />
            <span>JP Clínica Integrada</span>
          </div>
          <span className="rh-entrada__chip">Portal de RH</span>
        </div>

        <div className="rh-entrada__base">
          <p className="rh-entrada__frase">Candidaturas e vagas num só lugar.</p>

          <div className="rh-entrada__equipe">
            <AvataresEquipe max={5} tamanho={40} />
            <span>A equipe cresce por aqui.</span>
          </div>

          <ul className="rh-entrada__previa" aria-label="O que tem no painel">
            {DENTRO_DO_PAINEL.map(({ Icone, titulo, texto }) => (
              <li key={titulo}>
                <span className="rh-entrada__icone" aria-hidden="true">
                  <Icone size={20} strokeWidth={1.9} />
                </span>
                <span>
                  <strong>{titulo}</strong>
                  <span>{texto}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <main className="rh-entrada__form fundo-brilho">
        <div className="rh-entrada__conteudo">
          <p className="rh-entrada__acesso">
            <span className="rh-entrada__cadeado" aria-hidden="true">
              <LockKeyhole size={18} strokeWidth={2} />
            </span>
            Área da coordenação
          </p>
          <h1>Portal de RH</h1>
          <p className="rh-entrada__lide">
            Entre com a senha do painel para ver as candidaturas que chegaram pelo site e cuidar das
            vagas publicadas.
          </p>

          {!configurado ? (
            <div className="rh-entrada__aviso">
              <TriangleAlert size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-semibold">
                  {motivo || "O portal ainda não foi configurado neste servidor."}
                </p>
                {/* Sem o nome das variáveis aqui, de propósito. Este bloco é
                    servido no HTML de /rh para QUALQUER visitante sem sessão, e
                    `segredosConfigurados()` já parou de citá-las por isso mesmo
                    (`servidor/sessao.ts`): repeti-las na tela desfaria a
                    correção. Quem opera o servidor recebe a lista exata no
                    `console.warn` do processo, que é onde ela é útil. */}
                <p className="mt-2">
                  Faltam variáveis de ambiente do portal. O log do servidor diz quais — configure-as
                  no provedor de hospedagem e publique de novo.
                </p>
              </div>
            </div>
          ) : null}

          <form
            className="mt-8"
            onSubmit={(evento) => {
              evento.preventDefault();
              if (bloqueado) return;
              aoEnviar(senha);
            }}
          >
            <label className="rh-rotulo" htmlFor={idSenha}>
              Senha do painel
            </label>

            <div className="relative">
              <input
                id={idSenha}
                ref={campoSenha}
                name="senha"
                type={mostrar ? "text" : "password"}
                className="rh-campo"
                // O padding da direita é inline porque `.rh-campo` declara
                // `padding` fora de qualquer camada do Tailwind e venceria a
                // utilitária correspondente.
                style={{ paddingRight: "3.25rem" }}
                value={senha}
                onChange={(evento) => setSenha(evento.target.value)}
                disabled={!configurado || ocupado}
                autoComplete="current-password"
                aria-describedby={descreve}
                aria-invalid={erro !== ""}
                placeholder="••••••••"
              />

              <button
                type="button"
                onClick={() => setMostrar((v) => !v)}
                disabled={!configurado}
                aria-pressed={mostrar}
                aria-label={mostrar ? "Ocultar senha" : "Mostrar senha"}
                className="absolute inset-y-0 right-1 flex w-11 items-center justify-center rounded-xl text-tinta-suave transition hover:text-tinta disabled:opacity-50"
              >
                {mostrar ? (
                  <EyeOff size={18} aria-hidden="true" />
                ) : (
                  <Eye size={18} aria-hidden="true" />
                )}
              </button>
            </div>

            <p id={idAjuda} className="rh-entrada__ajuda">
              A senha é a mesma para toda a coordenação e fica só no servidor.
            </p>

            {erro ? (
              // O erro nunca depende só da cor: ícone, texto e `role="alert"`.
              <p id={idErro} role="alert" className="rh-entrada__erro">
                <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                {erro}
              </p>
            ) : null}

            {contando ? (
              <p id={idEspera} aria-live="polite" className="rh-entrada__ajuda font-semibold">
                Muitas tentativas seguidas. Tente de novo em {formatarEspera(restantes)}.
              </p>
            ) : null}

            <button
              type="submit"
              className="botao botao-acento mt-6 w-full disabled:opacity-60"
              disabled={bloqueado}
            >
              {ocupado ? "Entrando..." : "Entrar no painel"}
            </button>
          </form>

          <a href="/" className="rh-entrada__voltar">
            <ArrowLeft size={15} aria-hidden="true" />
            Voltar ao site
          </a>
        </div>
      </main>
    </div>
  );
}
