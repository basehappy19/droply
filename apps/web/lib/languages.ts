/** Language list for the composer (kept separate so highlight.js only loads when a code block renders). */
export const LANGUAGES: { id: string; label: string }[] = [
  { id: '', label: 'อัตโนมัติ' },
  { id: 'python', label: 'Python' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'java', label: 'Java' },
  { id: 'c', label: 'C' },
  { id: 'cpp', label: 'C++' },
  { id: 'csharp', label: 'C#' },
  { id: 'go', label: 'Go' },
  { id: 'rust', label: 'Rust' },
  { id: 'php', label: 'PHP' },
  { id: 'ruby', label: 'Ruby' },
  { id: 'kotlin', label: 'Kotlin' },
  { id: 'swift', label: 'Swift' },
  { id: 'sql', label: 'SQL' },
  { id: 'xml', label: 'HTML / XML' },
  { id: 'css', label: 'CSS' },
  { id: 'json', label: 'JSON' },
  { id: 'yaml', label: 'YAML' },
  { id: 'bash', label: 'Shell' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'plaintext', label: 'ข้อความธรรมดา' },
];

export const langLabel = (id?: string) => LANGUAGES.find((l) => l.id === id)?.label ?? id ?? '';
