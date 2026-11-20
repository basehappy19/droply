import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import kotlin from 'highlight.js/lib/languages/kotlin';
import markdown from 'highlight.js/lib/languages/markdown';
import php from 'highlight.js/lib/languages/php';
import python from 'highlight.js/lib/languages/python';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import swift from 'highlight.js/lib/languages/swift';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import plaintext from 'highlight.js/lib/languages/plaintext';

const langs = { bash, c, cpp, csharp, css, go, java, javascript, json, kotlin, markdown, php, python, ruby, rust, sql, swift, typescript, xml, yaml, plaintext };
for (const [name, def] of Object.entries(langs)) hljs.registerLanguage(name, def);

export { LANGUAGES, langLabel } from './languages';

/** Returns highlighted HTML (escaped by highlight.js) and the language used. */
export function highlight(code: string, lang?: string): { html: string; lang: string } {
  if (lang && hljs.getLanguage(lang)) return { html: hljs.highlight(code, { language: lang }).value, lang };
  const auto = hljs.highlightAuto(code, Object.keys(langs).filter((l) => l !== 'plaintext'));
  return { html: auto.value, lang: auto.language ?? 'plaintext' };
}
