import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '../../../auth/hooks/useAuth';
import {
  useOntologyAnalysisApi,
  ModelPreset,
  JobStatus,
  JobReport,
} from '../../api/ontologyAnalysisApi';
import OntologyJobProgress from '../../components/OntologyJobProgress';
import OntologyReport from '../../components/OntologyReport';
import SaveOntologyAnalysisModal from '../../components/SaveOntologyAnalysisModal';
import FileUpload from '../../../core/components/file-upload-input';
import customAlert from '../../../core/utils/custom-alert';
import ActionButton from '../../../core/components/action-button';
import BlockAlert from '../../../core/components/block-alert';

type InputMode = 'paste' | 'upload';

type Stage = 'idle' | 'submitting' | 'polling' | 'done' | 'error';

const POLL_INTERVAL_MS = 2000;

export default function OntologyAnalysisPage() {
  const { listModels, submitJob, getStatus, getReport } = useOntologyAnalysisApi();
  const { authUser } = useAuth();

  const [mode, setMode] = useState<InputMode>('paste');
  const [text, setText] = useState('');
  const [saveModalOpen, setSaveModalOpen] = useState(false);

  const [presets, setPresets] = useState<ModelPreset[]>([]);
  const [presetId, setPresetId] = useState('');
  const [runEvaluation, setRunEvaluation] = useState(true);
  const [provider, setProvider] = useState('');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const metadataComplete = provider.trim() !== '' && title.trim() !== '' && date.trim() !== '';

  const [stage, setStage] = useState<Stage>('idle');
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [report, setReport] = useState<JobReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listModels()
      .then((list) => {
        setPresets(list);
        if (list.length > 0) setPresetId(list[0].id);
      })
      .catch(() => {
        /* model dropdown stays empty; submission still works with backend defaults */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (stage !== 'polling' || !jobId) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const s = await getStatus(jobId);
        if (cancelled) return;
        setJobStatus(s);
        if (s.status === 'done') {
          const r = await getReport(jobId);
          if (cancelled) return;
          setReport(r);
          setStage('done');
        } else if (s.status === 'error') {
          setError(s.error ?? 'The analysis failed');
          setStage('error');
        }
      } catch (err: any) {
        if (cancelled) return;
        setError(err.message || 'Failed to check the job status');
        setStage('error');
      }
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [stage, jobId, getStatus, getReport]);

  const handleFileSubmit = async (file: File) => {
    try {
      setText(await file.text());
      setMode('paste');
    } catch {
      customAlert('Could not read the uploaded file as text', 'warning');
    }
  };

  const handleAnalyze = async () => {
    if (!text.trim()) return;
    setError(null);
    setReport(null);
    setJobStatus(null);
    setStage('submitting');
    try {
      const preset = presets.find((p) => p.id === presetId);
      const { jobId: newJobId } = await submitJob(text, {
        provider: provider.trim() || undefined,
        title: title.trim() || undefined,
        date: date || undefined,
        model: preset?.model,
        baseUrl: preset?.base_url,
        runEvaluation,
      });
      setJobId(newJobId);
      setStage('polling');
    } catch (err: any) {
      setError(err.message || 'Failed to submit the contract for analysis');
      setStage('error');
    }
  };

  const reset = () => {
    setStage('idle');
    setJobId(null);
    setJobStatus(null);
    setReport(null);
    setError(null);
  };

  const isBusy = stage === 'submitting' || stage === 'polling';

  return (
    <>
      <Helmet>
        <title>Ontology Analysis | ICAN</title>
      </Helmet>
      <div className="w-full p-4 pb-16 md:p-8">
        <div className="mx-auto max-w-4xl">
          <div className="mb-8 flex items-start justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl text-tp-ink">Ontology Analysis</h1>
              <p className="mt-1 text-sm text-tp-steel">
                Paste a contract's text or upload a plain-text file to convert it into ODRL
                permissions, prohibitions and duties, flag unfair terms, and evaluate
                semantic fidelity, powered by the tos-to-odrl pipeline. The text is cut into
                the same clauses AI Classify analyses.
              </p>
            </div>
            {stage !== 'idle' && (
              <button
                type="button"
                onClick={reset}
                className="shrink-0 cursor-pointer text-sm text-tp-steel transition-colors hover:text-tp-ink"
              >
                ← New analysis
              </button>
            )}
          </div>

          {stage === 'idle' || stage === 'submitting' ? (
            <div className="space-y-4">
              <div className="space-y-4 rounded-lg border border-tp-hairline-soft bg-tp-canvas p-5">
                <div>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-tp-steel">
                    Contract metadata
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs text-tp-steel">Provider</label>
                      <input
                        value={provider}
                        onChange={(e) => setProvider(e.target.value)}
                        placeholder="Acme Inc."
                        required
                        className="w-full rounded-lg border border-tp-hairline-strong bg-tp-canvas px-3 py-2 text-sm text-tp-ink focus:border-tp-primary focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-tp-steel">Title</label>
                      <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Terms of Service"
                        required
                        className="w-full rounded-lg border border-tp-hairline-strong bg-tp-canvas px-3 py-2 text-sm text-tp-ink focus:border-tp-primary focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-tp-steel">Date</label>
                      <input
                        value={date}
                        type="date"
                        onChange={(e) => setDate(e.target.value)}
                        max={new Date().toISOString().slice(0, 10)}
                        required
                        className="w-full rounded-lg border border-tp-hairline-strong bg-tp-canvas px-3 py-2 text-sm text-tp-ink focus:border-tp-primary focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4 border-t border-tp-hairline-soft pt-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-tp-steel">
                    Model settings
                  </h3>
                  <div>
                    <label className="mb-1 block text-xs text-tp-steel">Pipeline model</label>
                    <select
                      value={presetId}
                      onChange={(e) => setPresetId(e.target.value)}
                      className="w-full rounded-lg border border-tp-hairline-strong bg-tp-canvas px-3 py-2 text-sm text-tp-ink focus:border-tp-primary focus:outline-none"
                    >
                      {presets.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={runEvaluation}
                      onChange={(e) => setRunEvaluation(e.target.checked)}
                      className="h-4 w-4 accent-tp-primary"
                    />
                    <span className="text-sm text-tp-slate">Run semantic evaluation</span>
                  </label>
                </div>
              </div>

              <div className="space-y-4 rounded-lg border border-tp-hairline-soft bg-tp-canvas p-5">
                <div className="flex gap-2">
                  {(['paste', 'upload'] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setMode(option)}
                      className={`cursor-pointer rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                        mode === option
                          ? 'bg-tp-primary text-tp-on-primary'
                          : 'border border-tp-hairline text-tp-slate hover:bg-tp-canvas'
                      }`}
                    >
                      {option === 'paste' ? 'Paste text' : 'Upload file'}
                    </button>
                  ))}
                </div>

                {mode === 'paste' ? (
                  <>
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      rows={12}
                      placeholder="Paste the contract's Terms of Service text here..."
                      className="w-full rounded-lg border border-tp-hairline-strong bg-tp-canvas p-3 text-sm text-tp-ink focus:border-tp-primary focus:outline-none"
                    />
                    <ActionButton
                      text={stage === 'submitting' ? 'Starting analysis…' : 'Analyze contract'}
                      onClick={handleAnalyze}
                      disabled={stage === 'submitting' || !text.trim() || !metadataComplete}
                      className="w-full font-bold"
                    />
                    {!metadataComplete && (
                      <p className="text-xs text-tp-steel">
                        Fill in the provider, title and date above before analyzing.
                      </p>
                    )}
                  </>
                ) : (
                  <FileUpload
                    onSubmit={handleFileSubmit}
                    submitButtonText="Load file"
                    accept={{ 'text/plain': ['.txt'], 'text/markdown': ['.md'] }}
                    isNotDragActiveText="Drag and drop a .txt or .md file here"
                    isDragActiveText="Drop the file here"
                  />
                )}
              </div>
            </div>
          ) : null}

          {error && (
            <BlockAlert variant="error" className="mt-4" onDismiss={() => setError(null)}>
              {error}
            </BlockAlert>
          )}

          {isBusy && jobStatus && (
            <div className="mt-6">
              <p className="mb-2 text-sm text-tp-steel">Analyzing document…</p>
              <OntologyJobProgress steps={jobStatus.steps} />
            </div>
          )}

          {stage === 'done' && report && (
            <div className="mt-8">
              <div className="mb-4 flex justify-end">
                {authUser.isAuthenticated ? (
                  <ActionButton text="Save analysis" onClick={() => setSaveModalOpen(true)} />
                ) : (
                  <p className="text-sm text-tp-steel">
                    Save your report once you're{' '}
                    <Link to="/authentication" className="font-medium text-tp-primary hover:underline">
                      logged in
                    </Link>
                    .
                  </p>
                )}
              </div>
              <OntologyReport report={report} />
            </div>
          )}
        </div>
      </div>

      {report && (
        <SaveOntologyAnalysisModal
          open={saveModalOpen}
          onClose={() => setSaveModalOpen(false)}
          report={report}
          text={text}
        />
      )}
    </>
  );
}
