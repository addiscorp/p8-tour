import { compilePhp, makeRoot, runPhp, writeFile, type Directory } from './engine'

let module: WebAssembly.Module | null = null
let root: Directory = makeRoot()
let chain = Promise.resolve()

const args = ['php2', '-d', 'display_errors=1', '-d', 'html_errors=0', '-d', 'date.timezone=UTC', '/tmp/play.php']

function enqueue(job: () => Promise<void>) {
  const run = chain.then(job, job)
  chain = run.then(() => undefined, () => undefined)
  return run
}

self.onmessage = (event: MessageEvent<{ type?: string; id?: number; code?: string }>) => {
  const message = event.data
  void enqueue(async () => {
    if (message.type === 'reset') {
      root = makeRoot()
      self.postMessage({ type: 'reset' })
      return
    }
    if (message.type !== 'run' || message.id == null) return
    try {
      if (!module) {
        self.postMessage({ type: 'status', text: 'Loading p8…' })
        module = await compilePhp('/php2.wasm')
      }
      const source = message.code ?? ''
      const code = source.includes('<?') ? source : `<?php\n${source}`
      writeFile(root, '/tmp/play.php', new TextEncoder().encode(code))
      const started = performance.now()
      const result = await runPhp(module, args, root)
      self.postMessage({
        type: 'result',
        id: message.id,
        stdout: new TextDecoder().decode(result.stdout),
        stderr: result.stderr,
        ms: Math.round(performance.now() - started),
      })
    } catch (error) {
      self.postMessage({
        type: 'result',
        id: message.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })
}
