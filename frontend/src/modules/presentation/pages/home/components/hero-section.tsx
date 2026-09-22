import RevealBlock from './reveal-block';

export default function HeroSection({ onNavigate }: { onNavigate: (to: string) => void }) {
  return (
    <section className="py-24 md:py-32">
      <RevealBlock className="mb-8">
        <span className="inline-flex rounded-full border border-black/10 bg-white/70 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.22em] text-[#475467]">
          Contract Intelligence Ecosystem
        </span>
      </RevealBlock>

      <RevealBlock delay={80}>
        <h1 className="max-w-3xl text-4xl font-medium leading-[1.05] tracking-tight text-[#101828] md:text-6xl">
          Know what you agree to before you click accept.
        </h1>
      </RevealBlock>

      <RevealBlock delay={160} className="mt-6">
        <p className="max-w-2xl text-base leading-relaxed text-[#475467] md:text-lg">
          ICAN analyses the Terms of Service of SaaS products and flags potentially unfair clauses,
          using a language model and a formal ontology.
        </p>
      </RevealBlock>

      <RevealBlock delay={240} className="mt-10">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => onNavigate('/analyse/ai-classify')}
            className="inline-flex h-11 cursor-pointer items-center rounded-full border border-black/10 bg-[#0f172a] px-6 text-xs uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#1e293b] active:scale-[0.98]"
          >
            Analyse a contract
          </button>
          <button
            type="button"
            onClick={() => onNavigate('/collections')}
            className="inline-flex h-11 cursor-pointer items-center rounded-full border border-black/10 bg-white/70 px-6 text-xs uppercase tracking-[0.14em] text-[#101828] transition-colors hover:bg-white active:scale-[0.98]"
          >
            Explore contracts
          </button>
        </div>
      </RevealBlock>
    </section>
  );
}
