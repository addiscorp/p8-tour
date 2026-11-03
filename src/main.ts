import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import 'monaco-editor/esm/vs/basic-languages/php/php.contribution'
import 'monaco-editor/min/vs/editor/editor.main.css'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import { compilePhp, makeRoot, runPhp, writeFile, type Directory } from './php/engine'

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

editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => { void run() })
editor.onDidChangeModelContent(() => {
  localStorage.setItem(storageKey, editor.getValue())
})

let module: WebAssembly.Module | null = null
let root: Directory = makeRoot()
let running = false

async function php(): Promise<WebAssembly.Module> {
  if (!module) {
    status.textContent = 'Loading p8…'
    module = await compilePhp('/php2.wasm')
    status.textContent = ''
  }
  return module
}

async function run() {
  if (running) return
  running = true
  runButton.disabled = true
  const started = performance.now()
  try {
    const compiled = await php()
    const source = editor.getValue()
    const code = source.includes('<?') ? source : `<?php\n${source}`
    writeFile(root, '/tmp/play.php', new TextEncoder().encode(code))
    const result = runPhp(compiled, ['php2', '-d', 'display_errors=1', '-d', 'html_errors=0', '-d', 'date.timezone=UTC', '/tmp/play.php'], root)
    const stdout = new TextDecoder().decode(result.stdout)
    out.replaceChildren()
    out.append(stdout || '(no output)')
    if (result.stderr.trim()) {
      const err = document.createElement('div')
      err.className = 'err'
      err.textContent = `\n${result.stderr.trim()}`
      out.append(err)
    }
    status.textContent = `${Math.round(performance.now() - started)} ms`
  } catch (error) {
    out.textContent = error instanceof Error ? error.message : String(error)
    status.textContent = ''
  } finally {
    running = false
    runButton.disabled = false
  }
}

runButton.addEventListener('click', () => { void run() })
resetButton.addEventListener('click', () => {
  root = makeRoot()
  status.textContent = 'Filesystem reset'
})

void php().then(() => run())
