import { Helmet } from 'react-helmet-async';

export default function PlaceholderPage({ title }: { title: string }) {
  return (
    <>
      <Helmet>
        <title>{title} | ICAN</title>
      </Helmet>

      <div className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center px-4 text-center">
        <h1 className="font-display text-2xl text-tp-ink">{title}</h1>
        <p className="mt-2 text-sm text-tp-steel">Coming soon.</p>
      </div>
    </>
  );
}
