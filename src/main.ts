import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import 'monaco-editor/esm/vs/basic-languages/php/php.contribution'
import 'monaco-editor/min/vs/editor/editor.main.css'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'

self.MonacoEnvironment = {
  getWorker() {
    return new editorWorker()
  },
}

const sample = `<?php
echo "Hello from PHP " . phpversion();
echo "<br>";

// WordPress is available if you need it!
require '/wordpress/wp-load.php';

echo "WordPress " . wp_get_wp_version() . "<br>";

$html_processor = WP_HTML_Processor::create_fragment('<p><span>Hey!</span></p>');
$html_processor->next_tag();
var_dump($html_processor->get_tag());
`

const storageKey = 'p8-tour-code-wp'
const out = document.querySelector<HTMLIFrameElement>('#out')!

function escapeHtml(value: string) {
  return value.replace(/[&<>]/g, (char) => char === '&' ? '&amp;' : char === '<' ? '&lt;' : '&gt;')
}

function show(stdout: string, stderr = '') {
  const err = stderr.trim() ? `<div style="color:#ffb4a8">${escapeHtml(stderr.trim())}</div>` : ''
  const policy = "default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; base-uri 'none'; form-action 'none'"
  out.srcdoc = `<!doctype html><meta http-equiv="Content-Security-Policy" content="${policy}"><meta charset="utf-8"><style>html,body{margin:0;background:#12130f;color:#f3f1ea;font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace}body{padding:16px;white-space:pre-wrap;word-break:break-word}</style>${stdout}${err}`
}

show('Run some PHP.')
const status = document.querySelector<HTMLSpanElement>('#status')!
const runButton = document.querySelector<HTMLButtonElement>('#run')!
const resetButton = document.querySelector<HTMLButtonElement>('#reset')!

const editor = monaco.editor.create(document.querySelector<HTMLElement>('#editor')!, {
  value: localStorage.getItem(storageKey) ?? sample,
  language: 'php',
  theme: 'vs-dark',
  minimap: { enabled: false },
  fontSize: 13,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  automaticLayout: true,
  scrollBeyondLastLine: false,
  padding: { top: 12 },
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
})

const php = new Worker(new URL('./php/worker.ts', import.meta.url), { type: 'module' })
let nextId = 1
let running = false

php.onmessage = (event: MessageEvent<{ type?: string; id?: number; text?: string; stdout?: string; stderr?: string; error?: string; ms?: number }>) => {
  const data = event.data
  if (data.type === 'status') {
    status.textContent = data.text ?? ''
    return
  }
  if (data.type === 'reset') {
    status.textContent = 'Filesystem reset'
    return
  }
  if (data.type !== 'result') return
  running = false
  runButton.disabled = false
  if (data.error) {
    show(escapeHtml(data.error))
    status.textContent = ''
    return
  }
  show(data.stdout || '(no output)', data.stderr)
  status.textContent = data.ms == null ? '' : `${data.ms} ms`
}

php.onerror = (event) => {
  running = false
  runButton.disabled = false
  show(escapeHtml(event.message || 'p8 failed'))
  status.textContent = ''
}

function run() {
  if (running) return
  running = true
  runButton.disabled = true
  php.postMessage({ type: 'run', id: nextId++, code: editor.getValue() })
}

editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, run)
editor.onDidChangeModelContent(() => {
  localStorage.setItem(storageKey, editor.getValue())
})

runButton.addEventListener('click', run)
resetButton.addEventListener('click', () => {
  php.postMessage({ type: 'reset' })
})

run()
