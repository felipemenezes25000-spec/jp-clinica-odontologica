import { ArrowUpRight, Facebook, Instagram, MapPin, MessageCircle, Phone } from "lucide-react";
import { Logo } from "@/components/site/Logo";
import { CLINICA, HISTORIA, NAV, RESPONSAVEL_TECNICA, whatsappLink } from "@/lib/jp";

export function Footer() {
  return (
    <footer className="section-deep text-white">
      {/* O respiro extra embaixo só faz sentido no celular, onde a barra fixa
          de CTA (73px) cobre o fim da página. Antes ele crescia com a tela
          (pb-28 → 32 → 36), deixando 144px de vazio justamente onde a barra
          nem existe. */}
      <div className="jp-container py-12 pb-24 sm:py-14 sm:pb-14 lg:py-18 lg:pb-18">
        <div className="grid gap-12 lg:grid-cols-[1.35fr_.72fr_1fr] lg:gap-16">
          <div>
            {/* Sem o disco branco de antes: a arte de fundo escuro vaza o dente,
                então a marca pousa direto no verde em vez de vir colada num
                adesivo. */}
            <div>
              {/* Com alt, diferente das outras telas: aqui a marca não vem
                  dentro de um link nomeado nem ao lado do nome escrito, então
                  ela é a única coisa que abre o bloco. */}
              <Logo
                variante="lockup"
                fundo="escuro"
                altura={68}
                alt={CLINICA.nome}
                className="h-[58px] w-auto sm:h-[68px]"
              />
              <p className="mt-4 text-[11px] font-extrabold uppercase tracking-[.18em] text-white/80">
                Vila Bruna • São Paulo
              </p>
            </div>

            <p className="mt-8 max-w-xl font-display text-[clamp(2.7rem,5.4vw,4.9rem)] font-extrabold leading-[.92] tracking-[-.055em] text-white">
              Ver seu sorriso é <span className="text-lime">nossa missão.</span>
            </p>

            <a
              href={whatsappLink(
                "Olá! Gostaria de agendar uma avaliação na JP Clínica Integrada Odontológica.",
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="button-primary mt-8"
            >
              <MessageCircle className="h-5 w-5" />
              Agendar avaliação
              <ArrowUpRight className="h-4 w-4" />
            </a>
          </div>

          <nav aria-label="Navegação do rodapé">
            <p className="eyebrow text-lime">Navegue</p>
            <ul className="mt-6 grid gap-2.5">
              {NAV.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="text-sm font-semibold text-white transition-colors hover:text-lime"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>

            {/* O portal de vagas vive fora da conversa com paciente, então ganha
                bloco próprio em vez de virar mais um item na lista acima: quem
                chega ao rodapé procurando emprego não está procurando tratamento. */}
            <a
              href="/carreiras"
              className="mt-7 flex items-center justify-between gap-3 rounded-2xl border border-lime/25 bg-white/5 px-4 py-3.5 transition-colors hover:border-lime/60 hover:bg-white/10"
            >
              <span>
                <span className="block text-[10px] font-extrabold uppercase tracking-[.18em] text-lime">
                  Trabalhe na JP
                </span>
                <span className="mt-1 block text-sm font-bold text-white">Ver vagas abertas</span>
              </span>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-lime" aria-hidden="true" />
            </a>
          </nav>

          <div>
            <p className="eyebrow text-lime">Fale com a JP Clínica Integrada</p>
            <ul className="mt-6 grid gap-4 text-sm font-semibold text-white">
              <li>
                <a
                  href={CLINICA.telefoneHref}
                  className="flex items-center gap-3 transition-colors hover:text-lime"
                >
                  <Phone className="h-4 w-4 text-lime" />
                  {CLINICA.telefone}
                </a>
              </li>
              <li>
                <a
                  href={CLINICA.whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 transition-colors hover:text-lime"
                >
                  <MessageCircle className="h-4 w-4 text-lime" />
                  {CLINICA.whatsapp}
                </a>
              </li>
              <li>
                <a
                  href={CLINICA.mapsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 leading-relaxed transition-colors hover:text-lime"
                >
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-lime" />
                  {CLINICA.endereco}
                </a>
              </li>
            </ul>

            <div className="mt-7 flex gap-2">
              <a
                href={CLINICA.instagram}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram da JP Clínica"
                className="grid h-10 w-10 place-items-center rounded-full border border-white/12 text-white transition-all hover:border-lime hover:bg-lime hover:text-forest-2"
              >
                <Instagram className="h-4.5 w-4.5" />
              </a>
              <a
                href={CLINICA.facebook}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Facebook da JP Clínica"
                className="grid h-10 w-10 place-items-center rounded-full border border-white/12 text-white transition-all hover:border-lime hover:bg-lime hover:text-forest-2"
              >
                <Facebook className="h-4.5 w-4.5" />
              </a>
            </div>
          </div>
        </div>

        <div className="mt-12 grid gap-5 border-t border-white/10 pt-6 text-[11px] leading-relaxed text-white/80 sm:grid-cols-2 lg:mt-16">
          <div>
            {/* Fonte explícita, não mais EQUIPE[0]: esta linha é exigida pela
                Resolução CFO 196/2019 e não pode depender da ordem de uma
                lista que a clínica edita. */}
            <p className="font-semibold text-white">
              Responsável técnica: {RESPONSAVEL_TECNICA.nome} — {RESPONSAVEL_TECNICA.registro}
            </p>
            <p className="mt-1">
              {CLINICA.razaoSocial} • CNPJ {CLINICA.cnpj}
            </p>
            <p className="mt-1">{CLINICA.horario}</p>
          </div>
          <div className="sm:text-right">
            <p>
              Conteúdo informativo. Indicações e resultados dependem de avaliação profissional
              individual.
            </p>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 sm:justify-end">
              <a
                href="/politica-de-privacidade"
                className="font-semibold text-white underline decoration-white/25 underline-offset-2 transition hover:text-lime"
              >
                Política de Privacidade
              </a>
              <span aria-hidden="true" className="hidden text-white/35 sm:inline">
                •
              </span>
              <span>© {HISTORIA.anoCopyright} JP Clínica Odontológica. Todos os direitos reservados.</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
