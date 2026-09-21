import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '../../../auth/hooks/useAuth';
import { useAnalysisApi, AnalyzeResponse } from '../../api/analysisApi';
import ClauseResultsList from '../../components/ClauseResultsList';
import SaveAnalysisModal from '../../components/SaveAnalysisModal';
import FileUpload from '../../../core/components/file-upload-input';
import ActionButton from '../../../core/components/action-button';
import BlockAlert from '../../../core/components/block-alert';
import customAlert from '../../../core/utils/custom-alert';

type InputMode = 'paste' | 'upload';

export default function AiClassifyPage() {
  const { classify } = useAnalysisApi();
  const { authUser } = useAuth();
  const [mode, setMode] = useState<InputMode>('paste');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [saveModalOpen, setSaveModalOpen] = useState(false);

  const [provider, setProvider] = useState('');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const metadataComplete = provider.trim() !== '' && title.trim() !== '' && date.trim() !== '';

  const handleFileSubmit = async (file: File) => {
    try {
      const content = await file.text();
      setText(content);
      setMode('paste');
    } catch {
      customAlert('Could not read the uploaded file as text', 'warning');
    }
  };

  const handleAnalyze = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await classify(text);
      setResult(response);
    } catch (err: any) {
      setError(err.message || 'Failed to analyze the contract');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>AI Classify | ICAN</title>
      </Helmet>
      <div className="w-full p-4 pb-16 md:p-8">
        <div className="mx-auto max-w-4xl">
          <div className="mb-8">
            <h1 className="font-display text-2xl text-tp-ink">AI Classify</h1>
            <p className="mt-1 text-sm text-tp-steel">
              Paste a contract's text or upload a plain-text file to detect potentially unfair
              clauses across 8 categories, powered by the unfair-tos-detector model.
            </p>
          </div>

          <div className="mb-4 space-y-4 rounded-lg border border-tp-hairline-soft bg-tp-canvas p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-tp-steel">
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
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  max={new Date().toISOString().slice(0, 10)}
                  required
                  className="w-full rounded-lg border border-tp-hairline-strong bg-tp-canvas px-3 py-2 text-sm text-tp-ink focus:border-tp-primary focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-lg border border-tp-hairline-soft bg-tp-canvas p-5">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode('paste')}
                className={`cursor-pointer rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  mode === 'paste'
                    ? 'bg-tp-primary text-tp-on-primary'
                    : 'border border-tp-hairline text-tp-slate hover:bg-tp-canvas'
                }`}
              >
                Paste text
              </button>
              <button
                type="button"
                onClick={() => setMode('upload')}
                className={`cursor-pointer rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  mode === 'upload'
                    ? 'bg-tp-primary text-tp-on-primary'
                    : 'border border-tp-hairline text-tp-slate hover:bg-tp-canvas'
                }`}
              >
                Upload file
              </button>
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
                  text={loading ? 'Analyzing…' : 'Analyze contract'}
                  onClick={handleAnalyze}
                  disabled={loading || !text.trim() || !metadataComplete}
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

          {error && (
            <BlockAlert variant="error" className="mt-4" onDismiss={() => setError(null)}>
              {error}
            </BlockAlert>
          )}

          {result && (
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
              <ClauseResultsList result={result} />
            </div>
          )}
        </div>
      </div>

      {result && (
        <SaveAnalysisModal
          open={saveModalOpen}
          onClose={() => setSaveModalOpen(false)}
          text={text}
          result={result}
          provider={provider.trim()}
          title={title.trim()}
          date={date}
        />
      )}
    </>
  );
}
