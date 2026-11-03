import { unzipSync } from 'fflate'
import { File, compilePhp, lookup, makeRoot, runPhp, writeFile, type Directory } from './engine'

let module: WebAssembly.Module | null = null
let root: Directory = makeRoot()
let zip: Uint8Array | null = null
let chain = Promise.resolve()

const args = ['php2', '-d', 'display_errors=1', '-d', 'html_errors=0', '-d', 'max_execution_time=0', '-d', 'date.timezone=UTC', '/tmp/play.php']

function enqueue(job: () => Promise<void>) {
  const run = chain.then(job, job)
  chain = run.then(() => undefined, () => undefined)
  return run
}

function mountWordPress() {
  if (!zip) throw new Error('WordPress bundle is missing')
  root = makeRoot()
  const files = unzipSync(zip)
  for (const [path, data] of Object.entries(files)) {
    if (!path || path.endsWith('/')) continue
    writeFile(root, `/wordpress/${path}`, data)
  }
  for (const path of ['/wordpress/wp-config.php', '/wordpress/wp-content/db.php']) {
    const node = lookup(root, path)
    if (!(node instanceof File)) continue
    const text = new TextDecoder().decode(node.data).replaceAll('/www/site', '/wordpress')
    writeFile(root, path, new TextEncoder().encode(text))
  }
}

async function loadZip(): Promise<Uint8Array> {
  const manifest = await fetch('/wp.json').then(async (response) => {
    if (!response.ok) throw new Error('WordPress bundle is missing')
    return response.json() as Promise<{ parts: string[] }>
  })
  const chunks = await Promise.all(manifest.parts.map(async (name) => {
    const response = await fetch(`/wp/${name}`)
    if (!response.ok) throw new Error(`WordPress bundle part ${name} is missing`)
    return new Uint8Array(await response.arrayBuffer())
  }))
  const bytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0))
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return bytes
}

async function boot() {
  self.postMessage({ type: 'status', text: 'Loading WordPress…' })
  const [bytes, compiled] = await Promise.all([loadZip(), compilePhp('/php2.wasm')])
  zip = bytes
  module = compiled
  self.postMessage({ type: 'status', text: 'Unpacking WordPress…' })
  await new Promise((resolve) => setTimeout(resolve, 20))
  mountWordPress()
  self.postMessage({ type: 'ready' })
}

self.onmessage = (event: MessageEvent<{ type?: string; id?: number; code?: string }>) => {
  const message = event.data
  void enqueue(async () => {
    if (message.type === 'reset') {
      mountWordPress()
      self.postMessage({ type: 'reset' })
      return
    }
    if (message.type !== 'run' || message.id == null) return
    if (!module) {
      self.postMessage({ type: 'result', id: message.id, error: 'WordPress is not loaded' })
      return
    }
    try {
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

void enqueue(() => boot()).catch((error: unknown) => {
  self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) })
})
