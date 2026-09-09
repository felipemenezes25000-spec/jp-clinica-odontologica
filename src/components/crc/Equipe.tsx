import { useCallback, useEffect, useState } from "react";
import {
  KeyRound,
  Plus,
  ShieldCheck,
  UserRoundCheck,
  UserRoundX,
  UsersRound,
} from "lucide-react";

import {
  carregarEquipe,
  convidarMembroDaEquipe,
  mudarAtivacaoDoMembro,
  mudarPapelDoMembro,
  redefinirSenhaDoMembro,
  type MembroDto,
} from "@/lib/crc/api";
import { EXPLICACAO_PAPEL, ROTULO_PAPEL } from "@/lib/crc/dominio/rotulos";
import { PAPEIS, type Papel } from "@/lib/crc/dominio/tipos";

import { Aviso, BarraDeRecado, Botao, Campo, Entrada, Etiqueta, ListaEsqueleto, Modal, useAcao } from "./base";
import "./crc-team.css";

const MIN_SENHA = 10;

function quando(iso: string | null): string {
  if (iso === null) return "nunca entrou";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "nunca entrou";
  return new Date(t).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
}

export function Equipe() {
  const [membros, setMembros] = useState<MembroDto[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [convidando, setConvidando] = useState(false);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [papel, setPapel] = useState<Papel>("recepcao");
  const [trocandoSenhaDe, setTrocandoSenhaDe] = useState<MembroDto | null>(null);
  const [novaSenha, setNovaSenha] = useState("");
  const acao = useAcao();

  const recarregar = useCallback(async (): Promise<void> => {
    try {
      const r = await carregarEquipe();
      if (r.ok) {
        setMembros(r.membros);
        setErro(null);
      } else setErro(r.message);
    } catch {
      setErro("Não conseguimos carregar a equipe. Tente atualizar a página.");
    }
  }, []);

  useEffect(() => { void recarregar(); }, [recarregar]);

  const limparFormulario = useCallback((): void => {
    setNome(""); setEmail(""); setSenha(""); setPapel("recepcao");
  }, []);

  const convidar = useCallback(async (): Promise<void> => {
    await acao.executar(
      () => convidarMembroDaEquipe({ data: { nome, email, senha, papel } }),
      () => { setConvidando(false); limparFormulario(); void recarregar(); },
      `${nome.trim()} já pode entrar. Passe a senha pessoalmente.`,
    );
  }, [acao, email, limparFormulario, nome, papel, recarregar, senha]);

  const trocarPapel = useCallback(async (m: MembroDto, novo: Papel): Promise<void> => {
    await acao.executar(
      () => mudarPapelDoMembro({ data: { userId: m.id, papel: novo } }),
      () => void recarregar(),
      `${m.nome} agora é ${ROTULO_PAPEL[novo]}.`,
    );
  }, [acao, recarregar]);

  const alternarAtivacao = useCallback(async (m: MembroDto): Promise<void> => {
    await acao.executar(
      () => mudarAtivacaoDoMembro({ data: { userId: m.id, ativo: !m.ativo } }),
      () => void recarregar(),
      m.ativo ? `${m.nome} não entra mais.` : `${m.nome} voltou a ter acesso.`,
    );
  }, [acao, recarregar]);

  const confirmarNovaSenha = useCallback(async (): Promise<void> => {
    if (trocandoSenhaDe === null) return;
    const alvo = trocandoSenhaDe;
    await acao.executar(
      () => redefinirSenhaDoMembro({ data: { userId: alvo.id, senha: novaSenha } }),
      () => { setTrocandoSenhaDe(null); setNovaSenha(""); },
      `Senha de ${alvo.nome} trocada. Passe a nova pessoalmente.`,
    );
  }, [acao, novaSenha, trocandoSenhaDe]);

  if (erro !== null && membros === null) return <Aviso tom="perigo">{erro}</Aviso>;
  if (membros === null) return <ListaEsqueleto linhas={4} />;

  const ativos = membros.filter((m) => m.ativo);
  const inativos = membros.filter((m) => !m.ativo);
  const papeisUsados = new Set(ativos.map((m) => m.papel)).size;

  return (
    <div className="crc-team-v2">
      <BarraDeRecado recado={acao.recado} aoFechar={acao.limpar} />

      <section className="crc-team-command-v2">
        <div>
          <div className="crc-team-kicker-v2"><ShieldCheck size={14} aria-hidden="true" /> Acesso e responsabilidade</div>
          <h2>Um login por pessoa. Um histórico que diz quem fez o quê.</h2>
          <p>Papel define alcance; desativar corta acesso sem apagar o passado. Senha continua sendo entregue pessoalmente porque não existe fluxo de convite por e-mail.</p>
        </div>
        <Botao variante="primario" onClick={() => setConvidando(true)}><Plus size={16} aria-hidden="true" /> Cadastrar pessoa</Botao>
      </section>

      <section className="crc-team-resumo-v2">
        <ResumoTeam icone={UserRoundCheck} rotulo="Com acesso" valor={ativos.length} nota="Usuários ativos" tom="positivo" />
        <ResumoTeam icone={UserRoundX} rotulo="Sem acesso" valor={inativos.length} nota="Histórico preservado" />
        <ResumoTeam icone={UsersRound} rotulo="Papéis em uso" valor={papeisUsados} nota="Perfis diferentes na operação" tom="info" />
      </section>

      {membros.length === 1 && <Aviso tom="alerta">Só existe um acesso no sistema. Enquanto a equipe compartilhar este login, o histórico não consegue dizer quem fez cada tarefa ou mensagem.</Aviso>}

      <section className="crc-team-secao-v2">
        <header><div><div className="crc-sobretitulo">Equipe ativa</div><h2 className="crc-titulo-secao">Quem entra no CRC</h2></div><span>{ativos.length}</span></header>
        <div className="crc-team-grid-v2">
          {ativos.map((m) => <MembroCard key={m.id} membro={m} ocupado={acao.rodando} aoTrocarPapel={trocarPapel} aoAlternar={alternarAtivacao} aoTrocarSenha={setTrocandoSenhaDe} />)}
        </div>
      </section>

      {inativos.length > 0 && (
        <section className="crc-team-secao-v2 crc-team-inativos-v2">
          <header><div><div className="crc-sobretitulo">Histórico preservado</div><h2 className="crc-titulo-secao">Sem acesso</h2><p>Essas pessoas não entram mais, mas tarefas e mensagens antigas continuam assinadas com o nome delas.</p></div><span>{inativos.length}</span></header>
          <div className="crc-team-grid-v2">
            {inativos.map((m) => <MembroCard key={m.id} membro={m} ocupado={acao.rodando} aoTrocarPapel={trocarPapel} aoAlternar={alternarAtivacao} aoTrocarSenha={setTrocandoSenhaDe} />)}
          </div>
        </section>
      )}

      <Modal
        titulo="Cadastrar pessoa"
        aberto={convidando}
        aoFechar={() => setConvidando(false)}
        rodape={<><Botao onClick={() => setConvidando(false)}>Cancelar</Botao><Botao variante="primario" carregando={acao.rodando} disabled={nome.trim().length < 2 || senha.length < MIN_SENHA} onClick={() => void convidar()}>Cadastrar</Botao></>}
      >
        <div className="crc-team-form-v2">
          <Campo rotulo="Nome">{(id) => <Entrada id={id} value={nome} maxLength={120} autoComplete="off" onChange={(e) => setNome(e.target.value)} />}</Campo>
          <Campo rotulo="E-mail" dica="É com ele que a pessoa entra.">{(id) => <Entrada id={id} type="email" value={email} maxLength={200} autoComplete="off" onChange={(e) => setEmail(e.target.value)} />}</Campo>
          <Campo rotulo="Senha" dica={`Pelo menos ${String(MIN_SENHA)} caracteres. Entregue pessoalmente.`}>{(id) => <Entrada id={id} type="password" value={senha} autoComplete="new-password" onChange={(e) => setSenha(e.target.value)} />}</Campo>
          <Campo rotulo="Papel" dica={EXPLICACAO_PAPEL[papel]}>{(id) => <select id={id} className="crc-selecao" value={papel} onChange={(e) => setPapel(e.target.value as Papel)}>{PAPEIS.map((p) => <option key={p} value={p}>{ROTULO_PAPEL[p]}</option>)}</select>}</Campo>
        </div>
      </Modal>

      <Modal
        titulo={`Nova senha para ${trocandoSenhaDe?.nome ?? ""}`}
        aberto={trocandoSenhaDe !== null}
        aoFechar={() => { setTrocandoSenhaDe(null); setNovaSenha(""); }}
        rodape={<><Botao onClick={() => setTrocandoSenhaDe(null)}>Cancelar</Botao><Botao variante="primario" carregando={acao.rodando} disabled={novaSenha.length < MIN_SENHA} onClick={() => void confirmarNovaSenha()}>Trocar senha</Botao></>}
      >
        <div className="crc-team-senha-v2"><span><KeyRound aria-hidden="true" /></span><div><Campo rotulo="Nova senha" dica={`Pelo menos ${String(MIN_SENHA)} caracteres.`}>{(id) => <Entrada id={id} type="password" value={novaSenha} autoComplete="new-password" onChange={(e) => setNovaSenha(e.target.value)} />}</Campo><p>Trocar a senha não derruba uma sessão já aberta. Se a pessoa saiu da clínica, use <strong>Tirar acesso</strong>.</p></div></div>
      </Modal>
    </div>
  );
}

function ResumoTeam({ icone: Icone, rotulo, valor, nota, tom="neutro" }: { icone: typeof UsersRound; rotulo:string; valor:number; nota:string; tom?:"neutro"|"positivo"|"info" }) {
  return <article className="crc-team-resumo-card-v2" data-tom={tom}><span><Icone aria-hidden="true" /></span><div><small>{rotulo}</small><strong>{valor}</strong><em>{nota}</em></div></article>;
}

function MembroCard({ membro, ocupado, aoTrocarPapel, aoAlternar, aoTrocarSenha }: { membro:MembroDto; ocupado:boolean; aoTrocarPapel:(m:MembroDto,papel:Papel)=>Promise<void>; aoAlternar:(m:MembroDto)=>Promise<void>; aoTrocarSenha:(m:MembroDto)=>void }) {
  const iniciais = membro.nome.trim().split(/\s+/u).slice(0,2).map((p)=>p.charAt(0).toUpperCase()).join("") || "JP";
  const papelMembro = membro.papel as Papel;
  return (
    <article className="crc-team-card-v2" data-ativo={membro.ativo?"sim":"nao"}>
      <header><span className="crc-team-avatar-v2">{iniciais}</span><div><div className="crc-team-nome-v2"><strong>{membro.nome}</strong>{membro.souEu && <Etiqueta tom="info">Você</Etiqueta>}</div><p>{membro.email}</p></div></header>
      <div className="crc-team-card-info-v2"><span><small>Papel</small><strong>{ROTULO_PAPEL[papelMembro]}</strong></span><span><small>Último acesso</small><strong>{quando(membro.ultimoAcesso)}</strong></span></div>
      <p className="crc-team-explicacao-v2">{EXPLICACAO_PAPEL[papelMembro]}</p>
      <div className="crc-team-papel-v2"><label htmlFor={`papel-${membro.id}`}>Permissão principal</label><select id={`papel-${membro.id}`} className="crc-selecao" value={membro.papel} disabled={ocupado} onChange={(e)=>void aoTrocarPapel(membro,e.target.value as Papel)}>{PAPEIS.map((p)=><option key={p} value={p}>{ROTULO_PAPEL[p]}</option>)}</select></div>
      <footer><Botao pequeno disabled={ocupado} onClick={()=>aoTrocarSenha(membro)}><KeyRound size={14} aria-hidden="true" /> Senha</Botao>{!membro.souEu && <Botao pequeno variante={membro.ativo?"perigo":"secundario"} disabled={ocupado} onClick={()=>void aoAlternar(membro)}>{membro.ativo?"Tirar acesso":"Devolver acesso"}</Botao>}</footer>
    </article>
  );
}
