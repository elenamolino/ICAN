export default function AppFooter() {
  return (
    <footer className="bg-tp-footer-cream">
      <div className="mx-auto w-full max-w-[1280px] px-6 py-10 md:px-10 md:py-12">
        <p className="text-[11px] uppercase tracking-[0.22em] text-tp-on-cream/60">ICAN</p>

        <div className="mt-10 flex flex-col gap-3 border-t border-tp-on-cream/15 pt-6 text-xs text-tp-on-cream/60 md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} ICAN.</p>
        </div>
      </div>
    </footer>
  );
}
