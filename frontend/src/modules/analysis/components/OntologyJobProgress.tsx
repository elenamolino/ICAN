import { JobStepInfo } from '../api/ontologyAnalysisApi';

const STEP_LABELS: Record<string, string> = {
  split: 'Clause splitting',
  phase1: 'Classification',
  phase2: 'Turtle generation',
  phase3: 'Validation & repair',
  analysis: 'Deontic analysis',
  evaluation: 'Semantic evaluation',
};

function StepIcon({ status }: { status: JobStepInfo['status'] }) {
  if (status === 'done') {
    return <span className="text-tp-severity-success">✓</span>;
  }
  if (status === 'error') {
    return <span className="text-tp-severity-error">✗</span>;
  }
  if (status === 'running') {
    return (
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-tp-primary border-t-transparent" />
    );
  }
  return <span className="inline-block h-4 w-4 rounded-full border-2 border-tp-hairline" />;
}

function StepRow({ name, info }: { name: string; info: JobStepInfo }) {
  const label = STEP_LABELS[name] ?? name;
  const pct = info.total > 0 ? Math.round((info.done / info.total) * 100) : 0;

  return (
    <div className="flex items-center gap-4 py-3">
      <div className="flex w-5 shrink-0 items-center justify-center">
        <StepIcon status={info.status} />
      </div>
      <div className="flex-1">
        <div className="mb-1 flex justify-between text-sm">
          <span className={info.status === 'pending' ? 'text-tp-steel' : 'text-tp-ink'}>{label}</span>
          {info.total > 0 && (
            <span className="text-xs text-tp-steel">
              {info.done}/{info.total}
            </span>
          )}
        </div>
        {info.status === 'running' && info.total > 0 && (
          <div className="h-1 overflow-hidden rounded-full bg-tp-hairline-soft">
            <div
              className="h-full rounded-full bg-tp-primary transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default function OntologyJobProgress({ steps }: { steps: Record<string, JobStepInfo> }) {
  return (
    <div className="divide-y divide-tp-hairline-soft rounded-lg border border-tp-hairline-soft bg-tp-canvas px-4">
      {Object.entries(steps).map(([name, info]) => (
        <StepRow key={name} name={name} info={info} />
      ))}
    </div>
  );
}
