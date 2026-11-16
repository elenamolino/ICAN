// The clause classifier splits text into clauses at full stops and ignores
// line breaks, so Markdown confuses it: "## 2. The service" becomes a clause
// "## 2." and glues "The service" to the paragraph after it, and list items
// without a final full stop run into each other. This turns Markdown into the
// plain sentences it expects. Plain text passes through unchanged.

const ATX_HEADING = /^\s{0,3}#{1,6}\s+.*$/;
const SETEXT_UNDERLINE = /^\s{0,3}(=+|-+)\s*$/;
const LIST_MARKER = /^\s*(?:[-*+]|\d+[.)])\s+/;
const HORIZONTAL_RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;

function inline(text: string) {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // images: keep the alt text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links: keep the text
    .replace(/(\*\*|__)(.+?)\1/g, '$2') // bold
    .replace(/(^|[^\w*])[*_]([^*_\n]+)[*_](?=[^\w*]|$)/g, '$1$2') // italics
    .replace(/`([^`]+)`/g, '$1') // inline code
    .replace(/\\([\\`*_{}[\]()#+\-.!])/g, '$1'); // escapes: "1\." -> "1."
}

/** Ends a list item as a sentence, so the classifier takes it as a clause of its own. */
function closeSentence(text: string) {
  const trimmed = text.trimEnd();
  if (/[.!?]["')\]]*$/.test(trimmed)) return trimmed;
  return trimmed.replace(/[;,:]$/, '') + '.';
}

export function prepareForClassifier(text: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];

  lines.forEach((line, index) => {
    const next = lines[index + 1] ?? '';
    // Headings are titles, not clauses: the classifier gets only their text's clauses.
    if (ATX_HEADING.test(line)) return;
    if (SETEXT_UNDERLINE.test(next) && line.trim() && !LIST_MARKER.test(line)) return;
    if (SETEXT_UNDERLINE.test(line) || HORIZONTAL_RULE.test(line)) return;

    if (LIST_MARKER.test(line)) {
      out.push(closeSentence(inline(line.replace(LIST_MARKER, ''))));
      return;
    }
    out.push(inline(line));
  });

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
