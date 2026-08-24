import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import {
  useOntologyAnalysisApi,
  ModelPreset,
  JobStatus,
  JobReport,
} from '../../api/ontologyAnalysisApi';
import OntologyJobProgress from '../../components/OntologyJobProgress';
import OntologyReport from '../../components/OntologyReport';
import FileUpload from '../../../core/components/file-upload-input';
import BlockAlert from '../../../core/components/block-alert';

type Stage = 'idle' | 'submitting' | 'polling' | 'done' | 'error';

const POLL_INTERVAL_MS = 2000;

export default function OntologyAnalysisPage() {
  const { listModels, submitJob, getStatus, getReport } = useOntologyAnalysisApi();

  const [presets, setPresets] = useState<ModelPreset[]>([]);
  const [presetId, setPresetId] = useState('');
  const [runEvaluation, setRunEvaluation] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [provider, setProvider] = useState('');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');

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
    setError(null);
    setReport(null);
    setJobStatus(null);
    setStage('submitting');
    try {
      const preset = presets.find((p) => p.id === presetId);
      const { jobId: newJobId } = await submitJob(file, {
        provider: provider || undefined,
        title: title || undefined,
        date: date || undefined,
        model: preset?.model,
        baseUrl: preset?.base_url,
        runEvaluation,
      });
      setJobId(newJobId);
      setStage('polling');
    } catch (err: any) {
      setError(err.message || 'Failed to submit the document for analysis');
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
                Upload a contract (.json, .txt or .pdf) to convert it into ODRL
                permissions, prohibitions and duties, flag unfair terms, and evaluate
                semantic fidelity, powered by the tos-to-odrl pipeline.
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
              <FileUpload
                onSubmit={handleFileSubmit}
                submitButtonText={stage === 'submitting' ? 'Starting analysis…' : 'Analyze'}
                accept={{
                  'application/json': ['.json'],
                  'text/plain': ['.txt'],
                  'application/pdf': ['.pdf'],
                }}
                isNotDragActiveText="Drag and drop a .json, .txt or .pdf file here"
                isDragActiveText="Drop the file here"
                disabled={stage === 'submitting'}
              />

              <div className="space-y-4 rounded-lg border border-tp-hairline-soft bg-tp-canvas p-5">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-tp-steel">
                  Model settings
                </h2>

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

                <button
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="flex cursor-pointer items-center gap-1 text-xs text-tp-steel transition-colors hover:text-tp-ink"
                >
                  <span>{showAdvanced ? '▲' : '▶'}</span> Contract metadata (optional)
                </button>

                {showAdvanced && (
                  <div className="grid gap-3 border-t border-tp-hairline-soft pt-3 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs text-tp-steel">Provider</label>
                      <input
                        value={provider}
                        onChange={(e) => setProvider(e.target.value)}
                        placeholder="Acme Inc."
                        className="w-full rounded-lg border border-tp-hairline-strong bg-tp-canvas px-3 py-2 text-sm text-tp-ink focus:border-tp-primary focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-tp-steel">Title</label>
                      <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Terms of Service"
                        className="w-full rounded-lg border border-tp-hairline-strong bg-tp-canvas px-3 py-2 text-sm text-tp-ink focus:border-tp-primary focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-tp-steel">Date</label>
                      <input
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        placeholder="2024"
                        className="w-full rounded-lg border border-tp-hairline-strong bg-tp-canvas px-3 py-2 text-sm text-tp-ink focus:border-tp-primary focus:outline-none"
                      />
                    </div>
                  </div>
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
              <OntologyReport report={report} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
