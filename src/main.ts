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

echo 'p8 ', PHP_VERSION, "\\n\\n";

$pdo = new PDO('sqlite:/tmp/demo.db');
$pdo->exec('create table if not exists notes (id integer primary key, body text)');
$pdo->exec("insert into notes (body) values ('stored with Turso')");

foreach ($pdo->query('select id, body from notes') as $row) {
    echo $row['id'], '  ', $row['body'], "\\n";
}
`

const storageKey = 'p8-tour-code'
const out = document.querySelector<HTMLPreElement>('#out')!
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
    out.textContent = data.error
    status.textContent = ''
    return
  }
  out.replaceChildren()
  out.append(data.stdout || '(no output)')
  if (data.stderr?.trim()) {
    const err = document.createElement('div')
    err.className = 'err'
    err.textContent = `\n${data.stderr.trim()}`
    out.append(err)
  }
  status.textContent = data.ms == null ? '' : `${data.ms} ms`
}

php.onerror = (event) => {
  running = false
  runButton.disabled = false
  out.textContent = event.message || 'p8 failed'
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
