export default function FullFooterSection({ onNavigate: _onNavigate }: { onNavigate: (to: string) => void }) {
  return (
    <footer className="relative z-[5] w-full p-0 m-0">
      <div className="bg-[#111f36] px-6 py-10 md:px-10 md:py-12">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-white/60">ICAN</p>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-white/15 pt-6 text-xs text-white/60 md:flex-row md:items-center md:justify-between">
          <p>
            © {new Date().getFullYear()} ICAN.
          </p>
        </div>
      </div>
    </footer>
  );
}
