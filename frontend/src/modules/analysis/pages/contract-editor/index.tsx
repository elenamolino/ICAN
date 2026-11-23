import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useRouter } from '../../../core/hooks/useRouter';
import { Helmet } from 'react-helmet-async';
import ContractTextEditor, { ContractTextEditorHandle, MarkedLine } from '../../components/contract-editor/ContractTextEditor';
import SectionsPanel from '../../components/contract-editor/SectionsPanel';
import { Problem } from '../../components/contract-editor/ProblemsPanel';
import SaveAnalysisModal from '../../components/SaveAnalysisModal';
import { CONTRACT_TEMPLATES, templateText } from '../../data/contract-templates';
import { analyseSections, sectionStarter } from '../../utils/contract-sections';
import { findPlaceholders, locateClause } from '../../utils/contract-checks';
import { editText, FieldId, linkSavedText, pricingIn, setField, setPricing, unlinked } from '../../utils/linked-fields';
import { nextVersionNumbers } from '../../../contract-collection/utils/versions';
import { DEFAULT_TITLE, followHeading, isServiceLevelAgreement, retitle } from '../../utils/document-title';
import { topCategories } from '../../constants/clauseCategories';
import { AnalyzeResponse, useAnalysisApi } from '../../api/analysisApi';
import { ContractVersionListItem, useContractCollectionsApi } from '../../../contract-collection/api/contractCollectionsApi';
import { useAuth } from '../../../auth/hooks/useAuth';
import { useDebouncedValue } from '../../../core/hooks/useDebouncedValue';
import customConfirm from '../../../core/utils/custom-confirm';
import customAlert from '../../../core/utils/custom-alert';
import Iconify from '../../../core/components/iconify';

/** The contract the editor saves new versions to, after the first save. */
interface SaveTarget {
  organizationId: string;
  collectionId: string;
  collectionName: string;
  contractId: string;
  /** The API asks for the service even when adding a version to an existing contract. */
  serviceId?: string;
  contractSlug: string;
  contractName: string;
  /** The version opened with Edit: what is saved next comes from it, as a branch if it was not the latest. */
  parentVersionId?: string;
}

// Template value while editing a saved contract, which comes from no template.
const FROM_CONTRACT = 'saved-contract';

// A draft can be saved without them, and a contract needs a name.
const NO_COMPANY = 'Unnamed company';
const NO_TITLE = 'Untitled contract';

const FIELD = 'min-w-0 rounded-lg border border-tp-hairline bg-tp-canvas px-2.5 py-1.5 text-sm text-tp-ink focus:border-tp-primary focus:outline-none';
const BUTTON = 'inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';

// Every visit starts clean from the default template: going to Editor from
// the menu, even from the editor itself, mounts a new page (each navigation
// has its own location key). A contract's Edit button arrives with
// ?organization=&contract=&version= and loads that version instead.
export default function ContractEditorPage() {
  const location = useLocation();
  return <ContractEditor key={location.key} />;
}

function ContractEditor() {
  const { classify, saveAnalysis } = useAnalysisApi();
  const { getContract, getContractVersion, listContractVersions } = useContractCollectionsApi();
  const [searchParams] = useSearchParams();
  const router = useRouter();
  const [versionName, setVersionName] = useState('');
  const { authUser } = useAuth();

  const [templateId, setTemplateId] = useState(CONTRACT_TEMPLATES[0].id);
  const [linked, setLinked] = useState(() => unlinked(templateText(CONTRACT_TEMPLATES[0])));
  const { text } = linked;
  const [values, setValues] = useState<Record<FieldId, string>>({ service: '', company: '', pricing: '' });
  const { company, service, pricing } = values;
  const [savedVersions, setSavedVersions] = useState<ContractVersionListItem[]>([]);
  const [step, setStep] = useState<'minor' | 'major'>('minor');
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [target, setTarget] = useState<SaveTarget | null>(null);
  const editorRef = useRef<ContractTextEditorHandle>(null);
  const fieldRefs = {
    Service: useRef<HTMLInputElement>(null),
    Company: useRef<HTMLInputElement>(null),
    Title: useRef<HTMLInputElement>(null),
  };

  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [analysedText, setAnalysedText] = useState<string | null>(null);
  const [busy, setBusy] = useState<'analysing' | 'saving' | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Opened from a contract's Edit button (?organization=&contract=&version=):
  // load that version and save the next ones to the same contract.
  useEffect(() => {
    const organizationId = searchParams.get('organization');
    const contractSlug = searchParams.get('contract');
    if (!organizationId || !contractSlug) return;
    let cancelled = false;
    (async () => {
      try {
        const contract = await getContract(organizationId, contractSlug);
        const versions = await listContractVersions(organizationId, contractSlug);
        const versionId = searchParams.get('version') ?? versions.find((v) => v.label === 'last')?.id ?? versions[versions.length - 1]?.id;
        if (!versionId || !contract.collection) throw new Error('This contract has no saved version to edit.');
        const version = await getContractVersion(organizationId, contractSlug, versionId);
        if (cancelled) return;

        // Contracts saved from the editor are named "Company — Title".
        const [namedCompany, ...rest] = contract.name.split(' — ');
        const content = version.content ?? '';
        const savedCompany = rest.length ? namedCompany : contract.service?.name ?? namedCompany;
        const savedTitle = rest.length ? rest.join(' — ') : contract.name;
        const savedValues = {
          // A field still in brackets in the text was left empty when the draft was saved.
          service: content.includes('[Service]') ? '' : contract.service?.name ?? '',
          company: savedCompany === NO_COMPANY || content.includes('[Company]') ? '' : savedCompany,
          pricing: pricingIn(content),
        };
        setValues(savedValues);
        setLinked(linkSavedText(content, savedValues));
        setSavedVersions(versions);
        setTemplateId(FROM_CONTRACT);
        setTitle(savedTitle === NO_TITLE ? '' : savedTitle);
        setTarget({
          organizationId,
          collectionId: contract.collection.id,
          collectionName: contract.collection.name,
          contractId: contract.id,
          serviceId: contract.service?.id,
          contractSlug,
          contractName: contract.name,
          parentVersionId: versionId,
        });
        setAnalysis(null);
        setAnalysedText(null);
      } catch (err: any) {
        if (!cancelled) await customAlert(err.message || 'The contract could not be opened.', 'error');
      }
    })();
    return () => {
      cancelled = true;
    };
    // Only when arriving with a contract in the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get('organization'), searchParams.get('contract'), searchParams.get('version')]);

  // The panel follows the text a moment after typing stops, not on every key.
  const settledText = useDebouncedValue(text, 250);
  const report = useMemo(() => analyseSections(settledText), [settledText]);
  const placeholders = useMemo(() => findPlaceholders(settledText), [settledText]);

  // Unfair clauses of the last analysis, placed in the current text: a clause
  // edited since then is no longer found and drops out.
  const unfair = useMemo(() => {
    if (!analysis) return [];
    return analysis.clauses
      .filter((clause) => clause.isUnfair)
      .map((clause) => ({
        line: locateClause(settledText, clause.term),
        category: topCategories(clause)[0]?.label ?? 'Potentially unfair',
        term: clause.term,
      }))
      .filter((c): c is { line: number; category: string; term: string } => c.line !== null);
  }, [analysis, settledText]);

  const unfairBySection = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of report.sections) {
      counts[s.section.id] = unfair.filter((u) => s.ranges.some(([from, to]) => u.line >= from && u.line <= to)).length;
    }
    return counts;
  }, [report, unfair]);

  const missingFields: ('Service' | 'Company' | 'Title')[] = [
    ...(service.trim() ? [] : ['Service' as const]),
    ...(company.trim() ? [] : ['Company' as const]),
    ...(title.trim() ? [] : ['Title' as const]),
  ];

  const problems: Problem[] = [
    ...missingFields.map((field) => ({
      id: `field-${field}`,
      kind: 'field' as const,
      text: {
        Service: 'Service is empty: write its name, in Contract.',
        Company: 'Company is empty: write who provides the service, in Contract.',
        Title: 'Title is empty: write the name of the document, in Contract.',
      }[field],
      onSelect: () => fieldRefs[field].current?.focus(),
    })),
    ...placeholders.map((p, i) => ({ id: `ph-${i}`, kind: 'placeholder' as const, text: `Replace ${p.text}.`, line: p.line })),
    ...unfair.map((u, i) => ({ id: `unfair-${i}`, kind: 'unfair' as const, text: u.category, line: u.line })),
    ...report.sections
      .filter((s) => s.status !== 'present')
      .map((s) => ({
        id: `section-${s.section.id}`,
        kind: s.status === 'missing' ? ('missing' as const) : ('mentioned' as const),
        text: s.section.title,
        line: s.line ?? undefined,
      })),
  ];

  const markedLines: MarkedLine[] = useMemo(() => [
    ...placeholders.map((p) => ({ line: p.line, kind: 'warning' as const, message: `Replace **${p.text}**. Until then it is a draft.` })),
    ...unfair.map((u) => ({ line: u.line, kind: 'error' as const, message: `**Potentially unfair:** ${u.category}` })),
  ], [placeholders, unfair]);

  const analysisOutdated = analysis !== null && analysedText !== text;
  const problemsNote = busy === 'analysing'
    ? 'Analysing…'
    : !analysis
      ? 'Unfair clauses: press Analyse'
      : analysisOutdated
        ? 'Text changed since the analysis'
        : `${analysis.summary.unfairClauses} unfair of ${analysis.summary.totalClauses} clauses`;

  // Anything can be saved. An unfinished contract can only take a minor version.
  const saveBlockers = [
    ...(authUser.isAuthenticated ? [] : ['log in']),
    ...(text.trim() ? [] : ['write some text']),
  ];
  // On the text as it is now, not settled: Save can be pressed right after typing.
  const incomplete =
    missingFields.length > 0 ||
    findPlaceholders(text).length > 0 ||
    // The expected sections are those of Terms of Service: an SLA has others.
    (!isServiceLevelAgreement(title) && report.sections.some((s) => s.status === 'missing'));
  const versionStep = incomplete ? 'minor' : step;
  const nextNumbers = nextVersionNumbers(target ? savedVersions : []);

  const changeField = (field: FieldId, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setLinked((current) => {
      if (field !== 'pricing') return setField(current, field, value);
      const fees = analyseSections(current.text).sections.find((s) => s.section.id === 'payment');
      return setPricing(current, value, fees?.status === 'present' ? fees.line : null);
    });
  };

  const runAnalysis = async (): Promise<AnalyzeResponse> => {
    if (analysis && analysedText === text) return analysis;
    const result = await classify(text);
    setAnalysis(result);
    setAnalysedText(text);
    return result;
  };

  const handleAnalyse = async () => {
    setBusy('analysing');
    try {
      await runAnalysis();
    } catch (err: any) {
      await customAlert(err.message || 'The analysis failed. Try again in a moment.', 'error');
    } finally {
      setBusy(null);
    }
  };

  // After saving, the contract page shows the new version in its graph.
  const openSavedVersion = (organizationId: string, contractSlug: string, versionId: string) => {
    setVersionName('');
    router.push(`/contracts/${organizationId}/${contractSlug}?tab=versions&version=${versionId}`);
  };

  const handleSave = async () => {
    if (saveBlockers.length) return;
    setBusy('saving');
    try {
      const result = await runAnalysis();
      if (!target) {
        setModalOpen(true);
        return;
      }
      // Drafts saved before the editor kept the service do not have it: look it up.
      const serviceId = target.serviceId ?? (await getContract(target.organizationId, target.contractSlug)).service?.id;
      if (!serviceId) throw new Error('This contract has no service, so a new version cannot be added to it.');
      if (!target.serviceId) setTarget({ ...target, serviceId });
      const saved = await saveAnalysis(target.organizationId, {
        collectionId: target.collectionId,
        serviceId,
        contractId: target.contractId,
        ...(target.parentVersionId ? { parentVersionId: target.parentVersionId } : {}),
        date: new Date().toISOString(),
        text,
        versionNumber: nextNumbers[versionStep],
        summary: result.summary,
        clauses: result.clauses,
        ...(versionName.trim() ? { versionName: versionName.trim() } : {}),
      });
      openSavedVersion(saved.organizationId, saved.contractSlug, saved.versionId);
    } catch (err: any) {
      await customAlert(err.message || 'The contract could not be saved.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const handleTemplateChange = async (nextId: string) => {
    const next = CONTRACT_TEMPLATES.find((t) => t.id === nextId);
    if (!next) return;
    const untouched = CONTRACT_TEMPLATES.some((t) => templateText(t) === text);
    if (!untouched) {
      try {
        await customConfirm(`Replace your text with the “${next.name}” template? What you wrote will be lost.`, {
          danger: true,
          confirmLabel: 'Replace',
        });
      } catch {
        return;
      }
    }
    setTemplateId(next.id);
    setLinked(unlinked(templateText(next)));
    setTitle(DEFAULT_TITLE);
    setValues({ service: '', company: '', pricing: '' });
  };

  const template = CONTRACT_TEMPLATES.find((t) => t.id === templateId);
  const contractHref = target ? `/contracts/${target.organizationId}/${target.contractSlug}?tab=versions` : null;

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-3 px-4 py-4 md:px-6">
      <Helmet>
        <title>Contract editor | ICAN</title>
      </Helmet>

      {/* A thin bar, as in SPHERE: the page and its two actions.
          The help line under it only appears when something blocks saving. */}
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-normal text-tp-ink">Contract editor</h1>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={handleAnalyse}
              disabled={busy !== null || !text.trim()}
              className={`${BUTTON} border-tp-hairline bg-tp-canvas text-tp-ink hover:border-tp-primary hover:text-tp-primary`}
            >
              <Iconify icon={busy === 'analysing' ? 'mdi:loading' : 'mdi:magnify'} width={16} className={busy === 'analysing' ? 'animate-spin' : ''} />
              Analyse
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={busy !== null || saveBlockers.length > 0}
              title={saveBlockers.length ? `To save, ${saveBlockers.join(', ')}` : undefined}
              className={`${BUTTON} border-tp-primary bg-tp-primary text-tp-on-primary hover:bg-tp-primary/90`}
            >
              <Iconify icon={busy === 'saving' ? 'mdi:loading' : 'mdi:check'} width={16} className={busy === 'saving' ? 'animate-spin' : ''} />
              {target ? 'Save new version' : 'Save'}
            </button>
          </div>
        </div>
        {saveBlockers.length > 0 && (
          <p className="text-right text-xs text-tp-steel">
            To save, {saveBlockers.join(', ')}.
            {!authUser.isAuthenticated && (
              <> <Link to="/authentication" className="font-medium text-tp-primary hover:underline">Log in</Link></>
            )}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 rounded-xl border border-tp-hairline bg-tp-canvas lg:h-[calc(100vh-11rem)] lg:min-h-[520px] lg:grid-cols-[minmax(0,1fr)_380px] lg:overflow-hidden">
        <div className="flex h-[65vh] min-h-[360px] min-w-0 flex-col lg:h-auto">
          {/* The editor's own bar: which template the text started from. */}
          <div className="flex items-center gap-2 border-b border-tp-hairline-soft px-3 py-1.5">
            <Iconify icon="mdi:view-dashboard-outline" width={15} className="text-tp-steel" />
            <select
              value={templateId}
              onChange={(e) => handleTemplateChange(e.target.value)}
              title={template?.description ?? 'Start again from a template'}
              aria-label="Template"
              className="cursor-pointer rounded-md bg-transparent py-0.5 pr-1 text-xs font-medium text-tp-ink hover:text-tp-primary focus:outline-none"
            >
              {!template && (
                <option value={templateId} disabled>
                  From a saved contract
                </option>
              )}
              {CONTRACT_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  Template: {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="min-h-0 flex-1">
            <ContractTextEditor ref={editorRef} value={text} onChange={(next) => {
              setTitle((current) => followHeading(current, text, next));
              setLinked((current) => editText(current, next));
            }} markedLines={markedLines} />
          </div>
        </div>
        <aside className="flex min-h-0 flex-col border-t border-tp-hairline lg:border-l lg:border-t-0">
          {/* The contract's details: they only matter when saving, so they sit
              here, out of the way of the text. */}
          <div className="flex flex-col gap-2 border-b border-tp-hairline px-4 py-3">
            <h2 className="text-sm font-semibold text-tp-ink">Contract</h2>
            {[
              { label: 'Service', field: (
                <input
                  ref={fieldRefs.Service}
                  value={service}
                  onChange={(e) => changeField('service', e.target.value)}
                  placeholder="Name of the service"
                  className={`${FIELD} w-full`}
                />
              ) },
              { label: 'Company', field: (
                <input
                  ref={fieldRefs.Company}
                  value={company}
                  onChange={(e) => changeField('company', e.target.value)}
                  placeholder="Who provides the service"
                  className={`${FIELD} w-full`}
                />
              ) },
              { label: 'Title', field: (
                <input
                  ref={fieldRefs.Title}
                  value={title}
                  onChange={(e) => {
                    const next = e.target.value;
                    setTitle(next);
                    setLinked((current) => editText(current, retitle(current.text, title, next)));
                  }}
                  className={`${FIELD} w-full`}
                />
              ) },
              { label: 'Pricing', field: (
                <input
                  type="url"
                  value={pricing}
                  onChange={(e) => changeField('pricing', e.target.value)}
                  placeholder="Permanent link from SPHERE"
                  className={`${FIELD} w-full`}
                />
              ) },
              { label: 'Version', field: (
                <div className="flex min-w-0 gap-2">
                  <select
                    value={versionStep}
                    onChange={(e) => setStep(e.target.value as 'minor' | 'major')}
                    aria-label="Version number"
                    title={incomplete ? 'An incomplete contract can only take a minor version' : undefined}
                    className={`${FIELD} w-[5rem] shrink-0 cursor-pointer`}
                  >
                    <option value="minor">{nextNumbers.minor}</option>
                    <option value="major" disabled={incomplete}>
                      {nextNumbers.major}{incomplete ? ' (when complete)' : ''}
                    </option>
                  </select>
                  <input
                    value={versionName}
                    onChange={(e) => setVersionName(e.target.value)}
                    maxLength={80}
                    placeholder="Name, optional"
                    aria-label="Version name"
                    className={`${FIELD} w-full`}
                  />
                </div>
              ) },
            ].map(({ label, field }) => (
              <label key={label} className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-2 text-xs text-tp-steel">
                {label}
                {field}
              </label>
            ))}
            {target && (
              <p className="text-xs text-tp-steel">
                Saves to <span className="font-medium text-tp-ink">{target.collectionName}</span> ·{' '}
                <Link to={contractHref!} className="font-medium text-tp-primary hover:underline">{target.contractName}</Link>
                {' · '}
                <button type="button" onClick={() => setTarget(null)} className="cursor-pointer underline hover:text-tp-ink">
                  change
                </button>
              </p>
            )}
          </div>
          <div className="min-h-0 flex-1">
            <SectionsPanel
              report={report}
              unfairBySection={unfairBySection}
              problems={problems}
              problemsNote={problemsNote}
              onReveal={(line) => editorRef.current?.revealLine(line)}
              onAdd={(section) => editorRef.current?.append(sectionStarter(section))}
            />
          </div>
        </aside>
      </div>

      {analysis && (
        <SaveAnalysisModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          text={text}
          result={analysis}
          provider={company.trim() || NO_COMPANY}
          title={title.trim() || NO_TITLE}
          serviceName={service}
          versionStep={versionStep}
          date={new Date().toISOString()}
          heading="Save contract"
          submitLabel="Save contract"
          versionName={versionName}
          onSaved={async (saved) => {
            try {
              const contract = await getContract(saved.organizationId, saved.contractSlug);
              setTarget({
                organizationId: saved.organizationId,
                collectionId: saved.collectionId,
                collectionName: saved.collectionName,
                contractId: contract.id,
                serviceId: contract.service?.id,
                contractSlug: saved.contractSlug,
                contractName: contract.name,
              });
            } catch {
              // Saved, but the editor could not look the contract up: the next save asks again.
            }
            openSavedVersion(saved.organizationId, saved.contractSlug, saved.versionId);
          }}
        />
      )}
    </div>
  );
}
