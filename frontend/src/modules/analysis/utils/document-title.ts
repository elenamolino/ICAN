// The title of a contract: its heading, its Title field and the name it is
// saved with. The collection files the contract by that name, SLA or not.

// "# Title", or "Title" underlined with "=====".
const HEADING = /^#[ \t]+(.*)$/m;
const UNDERLINED = /^([^\s#=].*)(?=\r?\n={3,}[ \t]*\r?$)/m;
// Pasted text often has no marks: its first line is the title if it is short and names a document.
const DOCUMENT_NAME = /\b(agreement|terms|conditions|policy|sla)\b/i;

export const DEFAULT_TITLE = 'Terms of Service';

const markedTitle = (text: string): string | null =>
  (text.match(HEADING) ?? text.match(UNDERLINED))?.[1].trim() ?? null;

function unmarkedTitle(text: string): string | null {
  const line = text.trimStart().split('\n', 1)[0].trim();
  return line.length <= 80 && !/^\d|[.:;,]$/.test(line) && DOCUMENT_NAME.test(line) ? line : null;
}

export const headingTitle = (text: string): string | null => markedTitle(text) ?? unmarkedTitle(text);

/** The Title after an edit of the text: it follows the heading until the two are told apart. */
export function followHeading(title: string, before: string, after: string): string {
  const was = headingTitle(before), now = headingTitle(after);
  if (now === null || now === was) return title;
  const following = was === null ? !title || title === DEFAULT_TITLE : title.trim() === was;
  return following ? now : title;
}

/** The text after an edit of the Title: the heading follows it while they say the same. */
export function retitle(text: string, oldTitle: string, newTitle: string): string {
  if (markedTitle(text) !== oldTitle.trim()) return text;
  return HEADING.test(text)
    ? text.replace(HEADING, () => `# ${newTitle}`)
    : text.replace(UNDERLINED, () => newTitle);
}

/** What was typed as the contract's name, without the "Company — " the API puts before it. */
export function titleFromName(name: string, provider: string): string {
  const prefix = `${provider.trim()} — `;
  return (name.startsWith(prefix) ? name.slice(prefix.length) : name).trim();
}

export const isServiceLevelAgreement = (title: string) => /service level|\bsla\b/i.test(title);
