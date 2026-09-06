import { deflateRawSync, inflateRawSync } from 'node:zlib'

/**
 * Just enough of the ZIP format to carry a theme pack: a writer that stores or deflates every
 * entry, and a reader that walks the central directory and accepts those two methods. No
 * dependency, no zip64, no encryption, no data descriptors — a pack is a handful of small text
 * files, and anything fancier is refused with a plain message.
 */

export interface ZipEntry {
  /** forward-slash path inside the archive; a trailing slash is a directory */
  name: string
  data: Uint8Array
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of data) crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

const LOCAL = 0x04034b50
const CENTRAL = 0x02014b50
const END = 0x06054b50
const UTF8_FLAG = 0x0800
const STORE = 0
const DEFLATE = 8

function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear())
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  }
}

/** Build an archive; text-like entries are deflated, anything that does not shrink is stored. */
export function writeZip(entries: ZipEntry[], now = new Date()): Buffer {
  const { time, date } = dosDateTime(now)
  const parts: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const e of entries) {
    if (e.name.startsWith('/') || e.name.split('/').includes('..'))
      throw new Error(`a zip cannot contain such a path: ${e.name}`)
    const name = Buffer.from(e.name, 'utf8')
    const raw = Buffer.from(e.data)
    const deflated = raw.length > 0 ? deflateRawSync(raw) : raw
    const method = deflated.length < raw.length ? DEFLATE : STORE
    const body = method === DEFLATE ? deflated : raw
    const crc = crc32(raw)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(LOCAL, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(UTF8_FLAG, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    parts.push(local, name, body)
    const cd = Buffer.alloc(46)
    cd.writeUInt32LE(CENTRAL, 0)
    cd.writeUInt16LE(20, 4)
    cd.writeUInt16LE(20, 6)
    cd.writeUInt16LE(UTF8_FLAG, 8)
    cd.writeUInt16LE(method, 10)
    cd.writeUInt16LE(time, 12)
    cd.writeUInt16LE(date, 14)
    cd.writeUInt32LE(crc, 16)
    cd.writeUInt32LE(body.length, 20)
    cd.writeUInt32LE(raw.length, 24)
    cd.writeUInt16LE(name.length, 28)
    cd.writeUInt16LE(0, 30)
    cd.writeUInt16LE(0, 32)
    cd.writeUInt16LE(0, 34)
    cd.writeUInt16LE(0, 36)
    cd.writeUInt32LE(0, 38)
    cd.writeUInt32LE(offset, 42)
    central.push(cd, name)
    offset += local.length + name.length + body.length
  }
  const cdBuf = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(END, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(cdBuf.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)
  return Buffer.concat([...parts, cdBuf, end])
}

/** Read every file entry (directories are skipped) and verify each CRC. */
export function readZip(archive: Uint8Array): ZipEntry[] {
  const buf = Buffer.from(archive.buffer, archive.byteOffset, archive.byteLength)
  let endAt = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === END) {
      endAt = i
      break
    }
  }
  if (endAt < 0) throw new Error('not a zip file (end record not found)')
  const count = buf.readUInt16LE(endAt + 10)
  const cdSize = buf.readUInt32LE(endAt + 12)
  const cdOffset = buf.readUInt32LE(endAt + 16)
  if (cdOffset + cdSize > endAt)
    throw new Error("the zip's central directory runs past the end of the file")
  const out: ZipEntry[] = []
  let p = cdOffset
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== CENTRAL)
      throw new Error('corrupt central directory record in the zip')
    const flags = buf.readUInt16LE(p + 8)
    const method = buf.readUInt16LE(p + 10)
    const crc = buf.readUInt32LE(p + 16)
    const csize = buf.readUInt32LE(p + 20)
    const usize = buf.readUInt32LE(p + 24)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const local = buf.readUInt32LE(p + 42)
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8')
    p += 46 + nameLen + extraLen + commentLen
    if (name.endsWith('/')) continue
    if (name.startsWith('/') || /^[A-Za-z]:/.test(name) || name.split('/').includes('..'))
      throw new Error(`unsafe path in the zip: ${name}`)
    if (flags & 0x0008)
      throw new Error(`the zip uses data descriptors (${name}), which are not supported here`)
    if (buf.readUInt32LE(local) !== LOCAL)
      throw new Error(`corrupt local file record in the zip: ${name}`)
    const dataAt = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
    const body = buf.subarray(dataAt, dataAt + csize)
    let data: Buffer
    if (method === STORE) data = Buffer.from(body)
    else if (method === DEFLATE) data = inflateRawSync(body)
    else throw new Error(`the zip uses unsupported compression method ${method} (${name})`)
    if (data.length !== usize || crc32(data) !== crc)
      throw new Error(`${name} in the zip is corrupt`)
    out.push({ name, data })
  }
  return out
}
