import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import Editor, { loader, OnMount } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import { useMode } from '../../../core/hooks/useTheme';

// Bundle Monaco with the app instead of letting @monaco-editor/react fetch it
// from a CDN, and only with the Markdown language the contracts are written in.
self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });

export interface MarkedLine {
  line: number;
  /** Shown when hovering the line. */
  message: string;
  /** error: a potentially unfair clause; warning: something left to fill in. */
  kind: 'error' | 'warning';
}

export interface ContractTextEditorHandle {
  revealLine: (line: number) => void;
  /** Adds text at the end of the contract and shows it. */
  append: (text: string) => void;
}

const ContractTextEditor = forwardRef<ContractTextEditorHandle, {
  value: string;
  onChange: (value: string) => void;
  markedLines?: MarkedLine[];
}>(function ContractTextEditor({ value, onChange, markedLines = [] }, ref) {
  const { mode } = useMode();
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const decorationsRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);

  useImperativeHandle(ref, () => ({
    revealLine: (line) => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.revealLineInCenter(line);
      editor.setPosition({ lineNumber: line, column: 1 });
      editor.focus();
    },
    append: (text) => {
      const editor = editorRef.current;
      const model = editor?.getModel();
      if (!editor || !model) return;
      const lastLine = model.getLineCount();
      const end = model.getLineMaxColumn(lastLine);
      const separator = model.getValue().endsWith('\n\n') ? '' : model.getValue().endsWith('\n') ? '\n' : '\n\n';
      editor.executeEdits('add-section', [{ range: new monaco.Range(lastLine, end, lastLine, end), text: separator + text }]);
      editor.revealLineInCenter(model.getLineCount());
      editor.focus();
    },
  }));

  const markedLinesRef = useRef(markedLines);
  markedLinesRef.current = markedLines;

  const paintMarks = () => {
    decorationsRef.current?.set(markedLinesRef.current.map(({ line, message, kind }) => ({
      range: new monaco.Range(line, 1, line, 1),
      options: {
        isWholeLine: true,
        className: `contract-editor-${kind}-line`,
        linesDecorationsClassName: `contract-editor-${kind}-gutter`,
        hoverMessage: { value: message },
        // The overview ruler takes a literal colour, not a CSS variable.
        overviewRuler: { color: kind === 'error' ? '#ef4444' : '#f59e0b', position: monaco.editor.OverviewRulerLane.Right },
      },
    })));
  };

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor as unknown as monaco.editor.IStandaloneCodeEditor;
    decorationsRef.current = editorRef.current.createDecorationsCollection();
    // Marks computed before Monaco finished loading.
    paintMarks();
  };

  useEffect(paintMarks, [markedLines]);

  return (
    <Editor
      language="markdown"
      theme={mode === 'dark' ? 'vs-dark' : 'vs'}
      value={value}
      onChange={(next) => onChange(next ?? '')}
      onMount={handleMount}
      loading={<span className="text-sm text-tp-steel">Loading editor…</span>}
      options={{
        wordWrap: 'on',
        minimap: { enabled: false },
        fontSize: 14,
        lineHeight: 22,
        fontFamily: "'JetBrains Mono', 'SF Mono', Menlo, monospace",
        scrollBeyondLastLine: false,
        renderLineHighlight: 'line',
        padding: { top: 12, bottom: 12 },
        automaticLayout: true,
      }}
    />
  );
});

export default ContractTextEditor;
