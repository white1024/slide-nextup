import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createDevServer } from '../dev/server.ts'

const args = process.argv.slice(2)
const portIndex = args.indexOf('--port')
const port = portIndex === -1 ? 4321 : Number(args[portIndex + 1])
const target = args.find((a, i) => !a.startsWith('-') && (portIndex === -1 || i !== portIndex + 1))
if (!target || !existsSync(resolve(target))) {
  console.error('用法：pnpm dev <deck.json> [--port 4321]')
  process.exit(2)
}

const server = await createDevServer({ deckFile: resolve(target), port })
console.log(`${server.url}/?edit=1   （只綁 127.0.0.1；編輯會在停手 1.5 秒後自動寫回 ${target}）`)
console.log('Ctrl+C 結束')

const stop = async () => {
  await server.close()
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
