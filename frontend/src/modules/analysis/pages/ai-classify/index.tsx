import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useAnalysisApi, AnalyzeResponse } from '../../api/analysisApi';
import ClauseResultsList from '../../components/ClauseResultsList';
import FileUpload from '../../../core/components/file-upload-input';
import ActionButton from '../../../core/components/action-button';
import BlockAlert from '../../../core/components/block-alert';
import customAlert from '../../../core/utils/custom-alert';

type InputMode = 'paste' | 'upload';

export default function AiClassifyPage() {
  const { classify } = useAnalysisApi();
  const [mode, setMode] = useState<InputMode>('paste');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);

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

          <div className="mb-4 flex gap-2">
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
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={12}
              placeholder="Paste the contract's Terms of Service text here..."
              className="w-full rounded-lg border border-tp-hairline-strong bg-tp-canvas p-3 text-sm text-tp-ink focus:border-tp-primary focus:outline-none"
            />
          ) : (
            <FileUpload
              onSubmit={handleFileSubmit}
              submitButtonText="Load file"
              accept={{ 'text/plain': ['.txt'], 'text/markdown': ['.md'] }}
              isNotDragActiveText="Drag and drop a .txt or .md file here"
              isDragActiveText="Drop the file here"
            />
          )}

          {error && (
            <BlockAlert variant="error" className="mt-4" onDismiss={() => setError(null)}>
              {error}
            </BlockAlert>
          )}

          {mode === 'paste' && (
            <ActionButton
              text={loading ? 'Analyzing…' : 'Analyze contract'}
              onClick={handleAnalyze}
              disabled={loading || !text.trim()}
              className="mt-4 font-bold"
            />
          )}

          {result && (
            <div className="mt-8">
              <ClauseResultsList result={result} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
