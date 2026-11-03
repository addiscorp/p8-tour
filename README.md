# p8 tour

A PHP repl in the browser. The page runs `php2.wasm` (PHP 8.4, wasm32-wasip1) on an in-memory filesystem. SQLite is PDO `pdo_sqlite`, backed by Turso.

The editor is half the window and the output is the other half. Below 800px they stack.

WordPress is already mounted at `/wordpress`, so `require '/wordpress/wp-load.php'` works.

## Cloudflare

Worker name: `p8-tour`

Attach `p8-tour.addis.gg` in the Cloudflare dashboard. The domain is not in wrangler config.

Workers Builds, from the repository root, production branch `main`:

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`

`npx wrangler deploy` publishes the worker named `p8-tour`.
