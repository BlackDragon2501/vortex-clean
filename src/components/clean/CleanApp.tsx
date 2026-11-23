'use client'

// Vortex Clean - Elimina EXIF/GPS/XMP de fotos JPEG, PNG y WebP por lotes.
// Reporta lo detectado y descarga los archivos limpios (individual o ZIP).

import { useCallback, useState } from 'react'
import {
  ShieldCheck,
  Upload,
  Loader2,
  Download,
  FileArchive,
  MapPin,
  X,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
} from 'lucide-react'
import {
  CleanItem,
  downloadBlob,
  downloadZip,
  fmtBytes,
  inspectFile,
  mimeOfFormat,
  outNameFor,
  stripBytes,
} from '@/lib/clean'

const SUPPORT_EMAIL = 'vortexmusic.soporte.app@gmail.com'
const ACCENT = '#a3e635'
const ACCENT2 = '#bef264'

function VortexLogo({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <rect width="48" height="48" rx="10" fill="#161616" />
      <circle cx="24" cy="24" r="17" fill="none" stroke={ACCENT} strokeWidth="3.5" />
      <path d="M24 10a14 14 0 1 1-9.9 4.1" fill="none" stroke={ACCENT2} strokeWidth="3.5" strokeLinecap="round" />
      <path d="M24 17a7 7 0 1 0 7 7" fill="none" stroke={ACCENT2} strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="24" cy="24" r="3" fill={ACCENT2} />
    </svg>
  )
}

function Footer() {
  return (
    <footer className="mt-auto border-t border-[#2b2b31] bg-[#141416] px-6 py-4">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-1 text-center">
        <p className="text-[11px] text-[#9b9ba4]">
          Vórtex Clean · Derechos Reservados © 2026 Vortex Company ·{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[#bef264] hover:underline">
            {SUPPORT_EMAIL}
          </a>
        </p>
        <p className="text-[11px] text-[#9b9ba4]">Gratis · Sin anuncios · 100% local en tu navegador</p>
      </div>
    </footer>
  )
}

const btn =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#2b2b31] bg-[#1e1e22] px-3 py-2 text-xs font-medium text-[#ececf1] hover:bg-[#26262b] disabled:opacity-40 disabled:cursor-not-allowed transition-colors'

const btnAccent =
  'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-[#0f0f10] transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-[#a3e635] hover:bg-[#bef264]'

export default function CleanApp() {
  const [items, setItems] = useState<CleanItem[]>([])
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [done, setDone] = useState(false)

  const addFiles = useCallback((list: FileList | null) => {
    if (!list) return
    const added: CleanItem[] = Array.from(list)
      .filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name))
      .map((f) => ({ id: Math.random().toString(36).slice(2), file: f, inspect: null, status: 'pending' as const }))
    if (added.length) {
      setItems((prev) => [...prev, ...added])
      setDone(false)
    }
  }, [])

  const removeItem = (id: string) => setItems((prev) => prev.filter((x) => x.id !== id))

  const scanAndClean = useCallback(async () => {
    if (!items.length || busy) return
    setBusy(true)
    setDone(false)
    try {
      for (const item of items.filter((x) => x.status === 'pending')) {
        try {
          const bytes = new Uint8Array(await item.file.arrayBuffer())
          const inspect = inspectFile(item.file, bytes)
          if (inspect.format === 'other') {
            setItems((prev) =>
              prev.map((x) => (x.id === item.id ? { ...x, inspect, status: 'error', error: 'Formato no soportado (usa JPEG, PNG o WebP)' } : x))
            )
            continue
          }
          const clean = stripBytes(inspect, bytes)
          const blob = new Blob([clean.slice().buffer as ArrayBuffer], { type: mimeOfFormat(inspect.format, item.file.name) })
          setItems((prev) =>
            prev.map((x) =>
              x.id === item.id
                ? {
                    ...x,
                    inspect,
                    status: 'done',
                    outBlob: blob,
                    outName: outNameFor(item.file.name),
                    savedBytes: item.file.size - blob.size,
                  }
                : x
            )
          )
        } catch (e) {
          setItems((prev) =>
            prev.map((x) => (x.id === item.id ? { ...x, status: 'error', error: e instanceof Error ? e.message : 'Error' } : x))
          )
        }
      }
      setDone(true)
    } finally {
      setBusy(false)
    }
  }, [items, busy])

  const doneItems = items.filter((x) => x.status === 'done')
  const gpsCount = items.filter((x) => x.inspect?.findings.some((f) => f.label.includes('GPS') && f.present)).length

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-[#2b2b31] bg-[#141416] px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <VortexLogo className="w-9 h-9" />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold tracking-tight">
              Vórtex Clean <span className="font-normal text-[#9b9ba4]">· Limpia metadatos, sin límites</span>
            </h1>
            <p className="text-[11px] text-[#9b9ba4]">Elimina EXIF, GPS y XMP de tus fotos por lotes · nada sale de tu navegador</p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {items.length === 0 ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files) }}
            onClick={() => document.getElementById('clean-input')?.click()}
            className={`flex min-h-[420px] cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-6 text-center transition-colors ${
              dragOver ? 'border-[#a3e635] bg-[#1a2212]' : 'border-[#2b2b31] bg-[#17171a]'
            }`}
          >
            <ShieldCheck className="h-12 w-12 text-[#a3e635]" />
            <div>
              <p className="text-base font-semibold">Arrastra tus fotos JPEG, PNG o WebP</p>
              <p className="mt-1 text-sm text-[#9b9ba4]">
                Veremos qué metadatos llevan (ubicación, cámara, fechas…) y te daremos copias limpias
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <button className={btnAccent} onClick={() => void scanAndClean()} disabled={busy}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {busy ? 'Limpiando…' : 'Escanear y limpiar'}
              </button>
              <button
                className={btn}
                disabled={!doneItems.length}
                onClick={() =>
                  void downloadZip(
                    doneItems.map((x) => ({ name: x.outName!, blob: x.outBlob! })),
                    'vortex-clean.zip'
                  )
                }
              >
                <FileArchive className="h-3.5 w-3.5" /> Descargar ZIP ({doneItems.length})
              </button>
              <button className={btn} onClick={() => document.getElementById('clean-input')?.click()}>
                <Upload className="h-3.5 w-3.5" /> Añadir más
              </button>
              {gpsCount > 0 && (
                <span className="ml-auto flex items-center gap-1.5 rounded-lg border border-[#5c3a14] bg-[#2a1f0e] px-3 py-1.5 text-xs font-semibold text-[#fbbf24]">
                  <MapPin className="h-3.5 w-3.5" /> {gpsCount} foto(s) con ubicación GPS detectada
                </span>
              )}
            </div>

            {done && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-[#3a5a1c] bg-[#182112] px-4 py-2.5 text-sm text-[#bef264]">
                <CheckCircle2 className="h-4 w-4" /> Listo: {doneItems.length} copia(s) limpia(s) sin metadatos, listas para descargar.
              </div>
            )}

            <div className="space-y-3">
              {items.map((x) => (
                <div key={x.id} className="rounded-2xl border border-[#2b2b31] bg-[#17171a] p-4">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{x.file.name}</p>
                      <p className="text-[11px] text-[#9b9ba4]">
                        {fmtBytes(x.file.size)}
                        {x.status === 'done' && x.outBlob && ` → ${fmtBytes(x.outBlob.size)} limpio · ahorro ${fmtBytes(Math.max(0, x.savedBytes ?? 0))}`}
                      </p>
                    </div>
                    {x.status === 'pending' && !busy && <AlertTriangle className="h-4 w-4 text-[#9b9ba4]" />}
                    {busy && x.status === 'pending' && <Loader2 className="h-4 w-4 animate-spin text-[#9b9ba4]" />}
                    {x.status === 'done' && <CheckCircle2 className="h-4 w-4 text-[#22c55e]" />}
                    {x.status === 'done' && x.outBlob && x.outName && (
                      <button className={btnAccent} onClick={() => downloadBlob(x.outBlob!, x.outName!)}>
                        <Download className="h-3.5 w-3.5" /> Descargar
                      </button>
                    )}
                    {x.status === 'error' && <span className="text-xs text-[#f87171]">{x.error}</span>}
                    <button className="text-[#9b9ba4] hover:text-[#f87171]" onClick={() => removeItem(x.id)}>
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {x.inspect && x.inspect.format !== 'other' && (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-[#2b2b31] pt-3">
                      {x.inspect.findings.map((f) => (
                        <span
                          key={f.label}
                          title={f.detail}
                          className={`rounded-full px-2.5 py-1 text-[11px] ${
                            f.present ? 'bg-[#2a1f0e] text-[#fbbf24]' : 'bg-[#15181a] text-[#4b5563]'
                          }`}
                        >
                          {f.label}
                        </span>
                      ))}
                      {x.inspect.format === 'other' && (
                        <span className="rounded-full bg-[#2a1f0e] px-2.5 py-1 text-[11px] text-[#fbbf24]">Formato no soportado</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <input id="clean-input" type="file" hidden multiple accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={(e) => addFiles(e.target.files)} />
          </>
        )}
      </main>

      <Footer />
    </div>
  )
}
