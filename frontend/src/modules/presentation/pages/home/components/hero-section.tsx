import RevealBlock from './reveal-block';

export default function HeroSection() {
  return (
    <section className="py-24 md:py-32">
      <RevealBlock className="mb-8">
        <span className="inline-flex rounded-full border border-black/10 bg-white/70 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.22em] text-[#475467]">
          Contract Intelligence Ecosystem
        </span>
      </RevealBlock>
    </section>
  );
}
