import { useState, type ReactNode } from 'react';
import { Helmet } from 'react-helmet-async';
import Iconify from '../../../core/components/iconify';
import unfairCategories, { type UnfairCategory } from './data/unfair-categories';

const SECTIONS = [
  { id: 'introduction', label: 'Introduction' },
  { id: 'unfair-terms', label: 'Unfair terms' },
  { id: 'ai-classify', label: 'AI Classify' },
  { id: 'ontology-analysis', label: 'Ontology Analysis' },
  { id: 'privacy-and-limits', label: 'Privacy and limits' },
  { id: 'credits', label: 'Credits and data' },
];

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-tp-primary hover:underline"
    >
      {children}
    </a>
  );
}

function SectionHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="mt-12 scroll-mt-20 font-display text-xl text-tp-ink">
      {children}
    </h2>
  );
}

function CategoryItem({ category }: { category: UnfairCategory }) {
  const [open, setOpen] = useState(false);
  const panelId = `cat-${category.id}`;
  const { example } = category;

  return (
    <div className="border-b border-tp-hairline last:border-b-0">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(o => !o)}
          className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-tp-ink transition-colors hover:bg-tp-surface"
        >
          {category.title}
          <Iconify
            icon="mdi:chevron-down"
            width={18}
            className={`shrink-0 text-tp-steel transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </h3>
      {open && (
        <div id={panelId} className="space-y-3 px-4 pb-4 text-sm text-tp-slate">
          <p>{category.definition}</p>
          <p className="text-tp-steel">
            <em>
              <ExternalLink href={example.url}>{example.source}</ExternalLink>:
            </em>{' '}
            “
            {example.quote.map((segment, i) =>
              typeof segment === 'string' ? (
                segment
              ) : (
                <strong key={i} className="font-semibold text-tp-ink">
                  {segment.bold}
                </strong>
              )
            )}
            ”
          </p>
        </div>
      )}
    </div>
  );
}

export default function DocsPage() {
  const scrollTo = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <Helmet>
        <title>Docs | ICAN</title>
      </Helmet>
      <div className="mx-auto max-w-[1280px] px-4 py-6 pb-16 md:px-8">
        <header>
          <h1 className="font-display text-3xl text-tp-ink">Documentation</h1>
          <p className="mt-2 text-sm text-tp-steel">
            What unfair terms are, and how the two analysers in ICAN find them.
          </p>
        </header>

        <div className="mt-8 grid gap-8 lg:grid-cols-[14rem_minmax(0,1fr)]">
          <nav
            aria-label="On this page"
            className="h-fit rounded-lg border border-tp-hairline-soft bg-tp-canvas p-4 lg:sticky lg:top-20"
          >
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-tp-steel">
              On this page
            </p>
            <ul className="grid grid-cols-2 gap-1 text-sm lg:grid-cols-1">
              {SECTIONS.map(s => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    onClick={scrollTo(s.id)}
                    className="text-tp-primary hover:underline"
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <article className="space-y-4 text-base leading-relaxed text-tp-slate [&>h2:first-child]:mt-0">
            <SectionHeading id="introduction">Introduction</SectionHeading>
            <p>
              Online platforms often include terms in their Terms of Service (ToS) that can be
              abusive for consumers. The EU has rules against this, such as the{' '}
              <ExternalLink href="https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:31993L0013">
                Unfair Contract Terms Directive 93/13/EEC
              </ExternalLink>{' '}
              (UCTD) and the{' '}
              <ExternalLink href="https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32011L0083">
                Consumer Rights Directive 2011/83/EU
              </ExternalLink>
              . Even so, these terms still appear in many online ToS.
            </p>
            <p>
              ICAN helps users find these terms with two analysers. <strong>AI Classify</strong>{' '}
              classifies each clause with a language model. <strong>Ontology Analysis</strong>{' '}
              translates the ToS into a formal model and queries it.
            </p>

            <SectionHeading id="unfair-terms">Unfair terms</SectionHeading>
            <p>
              Under the UCTD, a term is unfair, and not binding on the consumer, when two conditions
              apply. It was not individually negotiated. It also creates a significant imbalance in
              the rights and obligations of the parties, against the requirement of good faith.
            </p>
            <p>
              AI Classify works with the following categories. Open each one to see a definition and
              an example.
            </p>
            <div className="overflow-hidden rounded-lg border border-tp-hairline bg-tp-canvas">
              {unfairCategories.map(category => (
                <CategoryItem key={category.id} category={category} />
              ))}
            </div>

            <SectionHeading id="ai-classify">AI Classify</SectionHeading>
            <p>
              AI Classify runs{' '}
              <ExternalLink href="https://huggingface.co/marmolpen3/lexglue-unfair-tos">
                lexglue-unfair-tos
              </ExternalLink>
              , a <code>bert-base-uncased</code> model fine-tuned for the unfair-terms task defined
              in the{' '}
              <ExternalLink href="https://github.com/coastalcph/lex-glue">
                LexGLUE project
              </ExternalLink>
              . It was trained on{' '}
              <ExternalLink href="https://huggingface.co/datasets/marmolpen3/memnet_tos">
                memnet_tos
              </ExternalLink>
              , a dataset of about 20,400 clauses taken from the Terms of Service of commercial
              services.
            </p>
            <p>
              It solves a multi-label classification task. One clause can belong to several
              categories at the same time. The model has one output for each category. A sigmoid
              function turns each output into a value between 0 and 1. If the value is above 0.5,
              the clause is flagged for that category.
            </p>
            <p>
              The interface shows these values. They are not probabilities. Read them as a relative
              indicator of how strongly a clause matches a category.
            </p>
            <h3 className="pt-2 text-base font-semibold text-tp-ink">Reading the result</h3>
            <ul className="list-disc space-y-1 pl-6">
              <li>
                The summary shows the number of clauses, how many are potentially unfair, and the
                number of words.
              </li>
              <li>
                Each clause lists its score for each of the eight categories above. A clause marked
                as potentially unfair has at least one category above 0.5.
              </li>
            </ul>

            <SectionHeading id="ontology-analysis">Ontology Analysis</SectionHeading>
            <p>
              Ontology Analysis uses LLMs to translate ToS written in natural language into the{' '}
              <ExternalLink href="https://w3id.org/tosl/">
                Terms of Service Language (TOSL)
              </ExternalLink>{' '}
              model. The result is a knowledge graph of the agreement in Turtle (TTL). The analyser
              then queries this graph to find the terms that are potentially abusive.
            </p>

            <h3 className="pt-2 text-base font-semibold text-tp-ink">From ToS to TOSL</h3>
            <p>The translation runs in three phases.</p>
            <ol className="list-decimal space-y-1 pl-6">
              <li>
                <strong>Metadata extraction.</strong> The LLM identifies the elements of each rule:
                deontic modality, action, party and asset.
              </li>
              <li>
                <strong>Initial representation.</strong> The LLM builds a TOSL graph from the
                extracted metadata, the ontology concepts and a modelling guide.
              </li>
              <li>
                <strong>Auto-correction.</strong> Syntactic and semantic errors in the TTL are
                detected and fixed. The output is the final graph of the agreement.
              </li>
            </ol>

            <h3 className="pt-2 text-base font-semibold text-tp-ink">Analysis of the terms</h3>
            <p>
              Once the Turtle graph of the agreement is ready, the analyser runs a set of{' '}
              <ExternalLink href="https://github.com/isa-group/tosl/tree/main/sparql_queries">
                SPARQL queries
              </ExternalLink>{' '}
              over it. These queries return the obligations, rights and prohibitions that are
              potentially abusive for the user.
            </p>

            <h3 className="pt-2 text-base font-semibold text-tp-ink">Reading the report</h3>
            <ul className="list-disc space-y-1 pl-6">
              <li>
                <strong>Permissions, prohibitions and duties</strong> found in the agreement, with
                the party each one applies to.
              </li>
              <li>
                <strong>Unfair term categories</strong> flagged by the queries for each clause.
              </li>
              <li>
                <strong>Semantic similarity</strong>, when semantic evaluation is enabled. It
                measures how close the text regenerated from the graph (the back-translation) is to
                the original clause. A low value suggests the graph may not capture the clause well.
              </li>
              <li>
                <strong>Conforms</strong> and <strong>repair rounds</strong> show whether the graph
                passed validation and how many correction attempts it needed.
              </li>
              <li>
                <strong>Turtle (TTL)</strong> for each clause, which you can copy to reuse the
                graph.
              </li>
            </ul>

            <p>
              Both analysers read the same clauses: ICAN cuts the text into sentences once and gives
              them to each. They can still flag different ones, because “potentially unfair” does not
              mean the same thing in each. AI Classify flags a clause when the model scores it above
              0.5 in one of the eight categories. Ontology Analysis flags a right, obligation or
              prohibition when one of its SPARQL queries matches it in the graph. This is expected,
              not an error.
            </p>

            <SectionHeading id="privacy-and-limits">Privacy and limits</SectionHeading>
            <ul className="list-disc space-y-1 pl-6">
              <li>
                <strong>Not legal advice.</strong> Both analysers are an aid to reading a contract.
                They can miss unfair terms and flag fair ones, and LLM output can contain mistakes.
                For a legal decision, ask a qualified professional.
              </li>
              <li>
                <strong>Where your text goes.</strong> AI Classify is processed by the classifier
                service that runs with ICAN. Ontology Analysis sends the text of your document to
                the external LLM provider behind the pipeline model you select (for example
                OpenRouter, OpenAI or Hugging Face). Do not analyse confidential documents with it.
              </li>
            </ul>

            <SectionHeading id="credits">Credits and data</SectionHeading>
            <ul className="list-disc space-y-1 pl-6">
              <li>
                The eight categories are those of the UNFAIR-ToS task, included in{' '}
                <ExternalLink href="https://github.com/coastalcph/lex-glue">LexGLUE</ExternalLink>.
              </li>
              <li>
                The classifier is{' '}
                <ExternalLink href="https://huggingface.co/marmolpen3/lexglue-unfair-tos">
                  marmolpen3/lexglue-unfair-tos
                </ExternalLink>{' '}
                (Apache 2.0), trained on the{' '}
                <ExternalLink href="https://huggingface.co/datasets/marmolpen3/memnet_tos">
                  memnet_tos
                </ExternalLink>{' '}
                dataset.
              </li>
              <li>
                The ontology pipeline is{' '}
                <ExternalLink href="https://github.com/elenamolino/tos-to-tosl">
                  tos-to-odrl
                </ExternalLink>
                , built on <ExternalLink href="https://w3id.org/tosl/">TOSL</ExternalLink>.
              </li>
              <li>
                The contracts available in ICAN are collected with{' '}
                <ExternalLink href="https://github.com/OpenTermsArchive/contrib-versions">
                  OpenTermsArchive
                </ExternalLink>
                .
              </li>
            </ul>
          </article>
        </div>
      </div>
    </>
  );
}
