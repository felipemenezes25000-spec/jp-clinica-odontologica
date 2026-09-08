/**
 * Troca da senha do painel, dentro do próprio painel.
 *
 * Até aqui a senha do `/rh` só existia como variável de ambiente: trocá-la
 * significava abrir o provedor de hospedagem, editar `ADMIN_RH_PASSWORD` e
 * publicar de novo. Na prática isso quer dizer que a senha nunca era trocada —
 * nem quando alguém saía da clínica, que é justamente quando trocar importa.
 *
 * O formulário pede a senha ATUAL mesmo com a sessão aberta. Não é cerimônia:
 * sessão é o cookie de quem já entrou, e notebook aberto na recepção, aba
 * esquecida num computador emprestado e cookie roubado são as três formas
 * realistas de alguém chegar nesta tela sem ser a dona do painel.
 *
 * A conferência e as regras da senha nova moram no servidor
 * (`servidor/sessao.ts`). O que existe aqui é o aviso ANTES do envio — dizer
 * "faltam caracteres" na hora em que a pessoa digita é melhor do que depois de
 * uma ida ao servidor —, e o servidor confere tudo outra vez de qualquer jeito.
 */
import { useState } from "react";
import { KeyRound, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import { CampoTexto } from "@/components/rh/CampoTexto";
import { formatarDataHora } from "@/lib/rh/formatar";
import { trocarSenhaRh } from "@/lib/rh/api";
import type { RespostaEstadoSenha } from "@/lib/rh/api";

export function TrocarSenha(props: {
  estado: RespostaEstadoSenha | null;
  aoTrocar: (atualizadoEm: string) => void;
  aoAvisar: (tipo: "ok" | "erro", texto: string) => void;
}) {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  const minimo = props.estado?.minimo ?? 10;
  const tipo = mostrar ? "text" : "password";

  /* Só reclama do que a pessoa já terminou de escrever: acusar "faltam
     caracteres" no primeiro toque transforma o campo num alarme. */
  const erroNova =
    nova.length > 0 && nova.length < minimo ? `Pelo menos ${String(minimo)} caracteres.` : "";
  const erroConfirmacao =
    confirmacao.length > 0 && confirmacao !== nova ? "As duas senhas não são iguais." : "";

  const podeEnviar =
    !enviando &&
    atual.length > 0 &&
    nova.length >= minimo &&
    confirmacao === nova &&
    nova !== atual;

  const enviar = () => {
    if (!podeEnviar) return;
    setEnviando(true);
    setErro("");

    trocarSenhaRh({ data: { atual, nova } })
      .then((r) => {
        if (!r.ok) {
          setErro(r.erro);
          return;
        }
        setAtual("");
        setNova("");
        setConfirmacao("");
        setMostrar(false);
        props.aoTrocar(r.atualizadoEm);
        props.aoAvisar("ok", "Senha do painel trocada. A anterior não abre mais.");
      })
      .catch(() => {
        setErro("Não foi possível falar com o servidor. Tente de novo.");
      })
      .finally(() => {
        setEnviando(false);
      });
  };

  const trocadaEm = formatarDataHora(props.estado?.atualizadoEm ?? "");

  return (
    <section className="space-y-4">
      <h3 className="flex items-center gap-2 font-display text-lg font-extrabold text-forest-2">
        <KeyRound className="h-5 w-5 shrink-0" aria-hidden="true" />
        Senha do painel
      </h3>

      <p className="max-w-2xl text-sm font-medium leading-relaxed text-ink">
        Esta é a senha que abre o <strong className="font-bold">/rh</strong>. Trocar aqui vale na
        hora, para todo mundo: quem sabia a anterior deixa de entrar no mesmo instante.
      </p>

      {/* O estado é dito em uma linha, e nenhuma das duas versões conta nada que
          ajude a adivinhar a senha — só de onde ela vem hoje. */}
      {props.estado === null ? null : props.estado.emRecuperacao ? (
        <p className="flex items-start gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold leading-relaxed text-amber-900">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            O modo de recuperação está <strong className="font-extrabold">ligado</strong> no
            servidor. Enquanto ele estiver assim, vale a senha configurada na hospedagem e qualquer
            troca feita aqui fica ignorada. Peça a quem cuida do servidor para desligá-lo depois de
            recuperar o acesso.
          </span>
        </p>
      ) : props.estado.propria ? (
        <p className="flex items-start gap-2 rounded-2xl border border-border-soft bg-paper p-3 text-sm font-semibold leading-relaxed text-ink">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-forest-2" aria-hidden="true" />
          <span>
            Vale a senha definida por aqui
            {trocadaEm.length > 0 ? `, trocada em ${trocadaEm}` : ""}.
          </span>
        </p>
      ) : (
        <p className="flex items-start gap-2 rounded-2xl border border-border-soft bg-paper p-3 text-sm font-semibold leading-relaxed text-ink">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-forest-2" aria-hidden="true" />
          <span>
            Ainda vale a senha que foi configurada no servidor quando o painel subiu. Trocando aqui,
            passa a valer a nova.
          </span>
        </p>
      )}

      <div className="grid gap-4 sm:max-w-xl">
        <CampoTexto
          campo="rh-senha-atual"
          rotulo="Senha atual"
          valor={atual}
          aoMudar={setAtual}
          tipo={tipo}
          autoComplete="current-password"
          maxLength={200}
        />
        <CampoTexto
          campo="rh-senha-nova"
          rotulo="Senha nova"
          valor={nova}
          aoMudar={setNova}
          tipo={tipo}
          autoComplete="new-password"
          maxLength={200}
          ajuda={`No mínimo ${String(minimo)} caracteres. Use uma que você não usa em nenhum outro lugar.`}
          erro={erroNova}
        />
        <CampoTexto
          campo="rh-senha-confirmacao"
          rotulo="Repita a senha nova"
          valor={confirmacao}
          aoMudar={setConfirmacao}
          tipo={tipo}
          autoComplete="new-password"
          maxLength={200}
          erro={erroConfirmacao}
        />

        {/* Ver o que se digita é o que evita gravar uma senha com um dedo
            errado e descobrir só no próximo login. */}
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-ink">
          <input
            type="checkbox"
            className="h-4 w-4 accent-forest"
            checked={mostrar}
            onChange={(e) => setMostrar(e.target.checked)}
          />
          Mostrar o que estou digitando
        </label>

        {erro.length > 0 ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-2xl border border-rose-300 bg-rose-50 p-3 text-sm font-semibold leading-relaxed text-rose-900"
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{erro}</span>
          </p>
        ) : null}

        <div>
          <button
            type="button"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-forest px-6 text-sm font-extrabold text-white transition hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!podeEnviar}
            onClick={enviar}
          >
            {enviando ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <KeyRound className="h-4 w-4" aria-hidden="true" />
            )}
            {enviando ? "Trocando…" : "Trocar a senha"}
          </button>
        </div>
      </div>

      <p className="max-w-2xl text-xs font-semibold leading-relaxed text-ink-soft">
        Esqueceu a senha? Ela não pode ser mostrada nem por quem cuida do servidor — o painel guarda
        só uma marca dela, e de marca não se volta para a senha. O caminho é pedir o modo de
        recuperação a quem administra a hospedagem: com ele ligado, a senha original do servidor
        abre o painel de novo e você define uma nova aqui.
      </p>
    </section>
  );
}
