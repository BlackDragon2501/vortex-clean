// Vortex Clean - Inspección y eliminación de metadatos EXIF/GPS/XMP.
// JPEG: reescritura de segmentos APPn/COM · PNG: eliminación de chunks
// ancillary de metadatos · WebP: chunks EXIF/XMP en RIFF.
// Todo se procesa en memoria: 100% local.

import { zipSync } from 'fflate'

export interface MetadataFinding {
  label: string
  present: boolean
  detail?: string
}

export interface InspectResult {
  format: 'jpeg' | 'png' | 'webp' | 'other'
  findings: MetadataFinding[]
  hasAnything: boolean
}

export interface CleanItem {
  id: string
  file: File
  inspect: InspectResult | null
  status: 'pending' | 'done' | 'error'
  outBlob?: Blob
  outName?: string
  savedBytes?: number
  error?: string
}

// ---------- JPEG ----------

interface JpegSegment {
  marker: number
  offset: number
  length: number
}

/** escanea los segmentos del JPEG sin decodificar la imagen */
function jpegSegments(bytes: Uint8Array): JpegSegment[] {
  const segs: JpegSegment[] = []
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return segs
  let i = 2
  while (i + 3 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i++
      continue
    }
    const marker = bytes[i + 1]
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2
      continue
    }
    if (marker === 0xda) {
      // SOS: los datos siguen hasta el EOI, no hay más APPn después
      segs.push({ marker, offset: i, length: 0 })
      break
    }
    const len = (bytes[i + 2] << 8) | bytes[i + 3]
    segs.push({ marker, offset: i, length: len + 2 })
    i += len + 2
  }
  return segs
}

/** detecta si un payload APP1 es EXIF o XMP (payloadStart apunta tras los 2 bytes de longitud) */
function app1Kind(bytes: Uint8Array, payloadStart: number, payloadLen: number): 'exif' | 'xmp' | null {
  const head = new TextDecoder().decode(bytes.subarray(payloadStart, Math.min(payloadStart + payloadLen, payloadStart + 34)))
  if (head.startsWith('Exif')) return 'exif'
  if (head.startsWith('http://ns.adobe.com/xap') || head.includes('x:xmpmeta')) return 'xmp'
  return null
}

export function inspectJpeg(bytes: Uint8Array): InspectResult {
  const segs = jpegSegments(bytes)
  const findings: MetadataFinding[] = []
  let hasExif = false
  let hasXmp = false
  let hasIcc = false
  let hasGps = false
  let hasComment = false
  let camera = ''
  for (const s of segs) {
    if (s.marker >= 0xe0 && s.marker <= 0xef) {
      if (s.marker === 0xe1) {
        const kind = app1Kind(bytes, s.offset + 4, s.length - 4)
        if (kind === 'exif') {
          hasExif = true
          const g = hasGpsTag(bytes, s.offset + 4)
          if (g.gps) hasGps = true
          camera = g.camera
        } else if (kind === 'xmp') hasXmp = true
      } else if (s.marker === 0xe2 && new TextDecoder().decode(bytes.subarray(s.offset + 4, s.offset + 14)).startsWith('ICC')) {
        hasIcc = true
      }
    } else if (s.marker === 0xfe) {
      hasComment = true
    }
  }
  findings.push({ label: 'EXIF (fecha, cámara, ajustes)', present: hasExif, detail: camera || undefined })
  findings.push({ label: 'Ubicación GPS', present: hasGps, detail: hasGps ? 'Coordenadas dentro del EXIF' : undefined })
  findings.push({ label: 'XMP (Adobe)', present: hasXmp })
  findings.push({ label: 'Perfil ICC de color', present: hasIcc })
  findings.push({ label: 'Comentarios incrustados', present: hasComment })
  return { format: 'jpeg', findings, hasAnything: hasExif || hasXmp || hasIcc || hasComment || hasGps }
}

/** lee tags básicos del TIFF embebido en APP1/Exif. app1Start apunta al inicio del payload ("Exif\0\0TIFF…") */
function hasGpsTag(bytes: Uint8Array, app1Start: number): { gps: boolean; camera: string } {
  try {
    // APP1 payload: "Exif\0\0" (6 bytes) + TIFF
    const tiff = app1Start + 6
    const endian = bytes[tiff] === 0x4d ? 'big' : 'little'
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const rd16 = (p: number) => dv.getUint16(p, endian === 'little')
    const rd32 = (p: number) => dv.getUint32(p, endian === 'little')
    const ifd0 = tiff + rd32(tiff + 4)
    const nEntries = rd16(ifd0)
    let gps = false
    let camera = ''
    for (let e = 0; e < nEntries; e++) {
      const off = ifd0 + 2 + e * 12
      const tag = rd16(off)
      if (tag === 0x8825) gps = true // GPS IFD pointer
      if (tag === 0x010f) {
        // Make
        const size = rd32(off + 4)
        const p = rd32(off + 8) + tiff
        if (size > 0 && p < bytes.length) camera += new TextDecoder().decode(bytes.subarray(p, p + size)).replace(/\0/g, '').trim()
      }
      if (tag === 0x0110) {
        const size = rd32(off + 4)
        const p = rd32(off + 8) + tiff
        if (size > 0 && p < bytes.length) camera += ' ' + new TextDecoder().decode(bytes.subarray(p, p + size)).replace(/\0/g, '').trim()
      }
    }
    return { gps, camera: camera.trim() }
  } catch {
    return { gps: false, camera: '' }
  }
}

/** reescribe el JPEG sin APPn ni COM, conservando SOI, tablas, frame y scan */
export function stripJpeg(bytes: Uint8Array): Uint8Array {
  const segs = jpegSegments(bytes)
  const keep: Uint8Array[] = [bytes.subarray(0, 2)] // SOI
  for (const s of segs) {
    if (s.marker === 0xda) {
      // desde SOS hasta el final (incluye imagen comprimida y EOI)
      keep.push(bytes.subarray(s.offset))
      break
    }
    if (s.marker >= 0xe0 && s.marker <= 0xef) continue // APP0..APP15
    if (s.marker === 0xfe) continue // COM
    keep.push(bytes.subarray(s.offset, s.offset + s.length + 2))
  }
  let total = 0
  for (const k of keep) total += k.length
  const out = new Uint8Array(total)
  let p = 0
  for (const k of keep) {
    out.set(k, p)
    p += k.length
  }
  return out
}

// ---------- PNG ----------

const PNG_META_CHUNKS = new Set(['tEXt', 'iTXt', 'zTXt', 'eXIf', 'tIME'])

function pngChunks(bytes: Uint8Array): { type: string; offset: number; total: number }[] {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const chunks: { type: string; offset: number; total: number }[] = []
  let i = 8
  while (i + 8 <= bytes.length) {
    const len = dv.getUint32(i)
    const type = String.fromCharCode(bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7])
    chunks.push({ type, offset: i, total: len + 12 })
    i += len + 12
    if (type === 'IEND') break
  }
  return chunks
}

export function inspectPng(bytes: Uint8Array): InspectResult {
  const chunks = pngChunks(bytes)
  const found = new Set<string>()
  for (const c of chunks) if (PNG_META_CHUNKS.has(c.type) || c.type === 'pHYs') found.add(c.type)
  const findings: MetadataFinding[] = [
    { label: 'EXIF embebido', present: found.has('eXIf') },
    { label: 'Textos (autor, software, descripción)', present: found.has('tEXt') || found.has('iTXt') || found.has('zTXt') },
    { label: 'Fecha de modificación (tIME)', present: found.has('tIME') },
    { label: 'Resolución física de origen (pHYs)', present: found.has('pHYs') },
  ]
  return { format: 'png', findings, hasAnything: found.size > 0 }
}

export function stripPng(bytes: Uint8Array): Uint8Array {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const parts: Uint8Array[] = [bytes.subarray(0, 8)] // firma
  let i = 8
  let crcTable: number[] | null = null
  const makeCrc = () => {
    const table = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c >>> 0
    }
    return [...table]
  }
  const chunkBytes = (type: string, data: Uint8Array) => {
    if (!crcTable) crcTable = makeCrc()
    const out = new Uint8Array(data.length + 12)
    const odv = new DataView(out.buffer)
    odv.setUint32(0, data.length)
    for (let k = 0; k < 4; k++) out[4 + k] = type.charCodeAt(k)
    out.set(data, 8)
    let crc = 0xffffffff
    for (let k = 4; k < 8 + data.length; k++) crc = crcTable[(crc ^ out[k]) & 0xff] ^ (crc >>> 8)
    crc = (crc ^ 0xffffffff) >>> 0
    odv.setUint32(8 + data.length, crc)
    return out
  }
  while (i + 8 <= bytes.length) {
    const len = dv.getUint32(i)
    const type = String.fromCharCode(bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7])
    const total = len + 12
    if (PNG_META_CHUNKS.has(type)) {
      i += total
      continue
    }
    if (type === 'pHYs') {
      // resolución física: revela el origen del archivo; también se elimina
      i += total
      continue
    }
    if (type === 'IEND') {
      parts.push(bytes.subarray(i, i + total))
      break
    }
    parts.push(bytes.subarray(i, i + total))
    i += total
  }
  // chunk de aviso limpio: sTXt no; simplemente devolvemos el PNG sin metadatos
  let total = 0
  for (const k of parts) total += k.length
  const out = new Uint8Array(total)
  let p = 0
  for (const k of parts) {
    out.set(k, p)
    p += k.length
  }
  void chunkBytes
  return out
}

// ---------- WebP ----------

export function inspectWebp(bytes: Uint8Array): InspectResult {
  const sig = new TextDecoder().decode(bytes.subarray(0, 4))
  if (sig !== 'RIFF' || new TextDecoder().decode(bytes.subarray(8, 12)).slice(0, 4) !== 'WEBP') {
    return { format: 'other', findings: [], hasAnything: false }
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let i = 12
  let hasExif = false
  let hasXmp = false
  while (i + 8 <= bytes.length) {
    const type = new TextDecoder().decode(bytes.subarray(i, i + 4))
    const len = dv.getUint32(i + 4, true)
    if (type === 'EXIF') hasExif = true
    if (type === 'XMP ' || type === 'XMP') hasXmp = true
    i += 8 + len + (len % 2)
  }
  const findings: MetadataFinding[] = [
    { label: 'EXIF (fecha, cámara, GPS)', present: hasExif, detail: hasExif ? 'Puede contener coordenadas' : undefined },
    { label: 'XMP (Adobe)', present: hasXmp },
  ]
  return { format: 'webp', findings, hasAnything: hasExif || hasXmp }
}

export function stripWebp(bytes: Uint8Array): Uint8Array {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const parts: Uint8Array[] = [bytes.subarray(0, 12)]
  let i = 12
  while (i + 8 <= bytes.length) {
    const type = new TextDecoder().decode(bytes.subarray(i, i + 4))
    const len = dv.getUint32(i + 4, true)
    const total = 8 + len + (len % 2)
    if (type === 'EXIF' || type === 'XMP ' || type === 'XMP') {
      i += total
      continue
    }
    parts.push(bytes.subarray(i, i + total))
    i += total
  }
  let total = 12
  for (const k of parts.slice(1)) total += k.length
  // corregir tamaño RIFF
  const out = new Uint8Array(total)
  let p = 0
  for (const k of parts) {
    out.set(k, p)
    p += k.length
  }
  const odv = new DataView(out.buffer)
  odv.setUint32(4, total - 8, true)
  return out
}

// ---------- API pública ----------

export function inspectFile(file: File, bytes: Uint8Array): InspectResult {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return inspectJpeg(bytes)
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return inspectPng(bytes)
  if (bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return inspectWebp(bytes)
  return { format: 'other', findings: [], hasAnything: false }
}

export function stripBytes(res: InspectResult, bytes: Uint8Array): Uint8Array {
  if (res.format === 'jpeg') return stripJpeg(bytes)
  if (res.format === 'png') return stripPng(bytes)
  if (res.format === 'webp') return stripWebp(bytes)
  return bytes
}

export function outNameFor(original: string): string {
  const base = original.replace(/\.[^.]+$/, '') || 'foto'
  const ext = original.match(/\.([^.]+)$/)?.[1] ?? 'jpg'
  return `${base}-limpio.${ext}`
}

export function mimeOfFormat(format: InspectResult['format'], original: string): string {
  if (format === 'jpeg') return 'image/jpeg'
  if (format === 'png') return 'image/png'
  if (format === 'webp') return 'image/webp'
  return original.match(/\.([^.]+)$/) ? `image/${original.split('.').pop()!.toLowerCase()}` : 'application/octet-stream'
}

export async function downloadZip(items: { name: string; blob: Blob }[], zipName: string) {
  const files: Record<string, [Uint8Array, { level: number }]> = {}
  for (const it of items) {
    files[it.name] = [new Uint8Array(await it.blob.arrayBuffer()), { level: 6 }]
  }
  const zipped = zipSync(files, { level: 6 })
  const url = URL.createObjectURL(new Blob([zipped as unknown as BlobPart], { type: 'application/zip' }))
  const a = document.createElement('a')
  a.href = url
  a.download = zipName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
