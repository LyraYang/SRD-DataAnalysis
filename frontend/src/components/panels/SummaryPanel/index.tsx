import { useState, useEffect, useMemo, useCallback, type ReactNode } from 'react'
import { fetchCombinedData } from '../../../api/csv'
import type { CSVData, FileCatalogProps } from '../../../types'
import { FileSelector } from '../CSVViewer/FileSelector'
import { computeRowValidity } from '../CSVViewer/validityUtils'

const QUANT_SUBGROUPS = new Set(['High-Quant', 'Low-Quant', 'Mid-Quant'])
const UNIT_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G']
const AGE_BUCKETS = ['<20', '20–29', '30–39', '40–49', '50+']

function ageBucket(age: number): string {
  if (age < 20) return '<20'
  if (age < 30) return '20–29'
  if (age < 40) return '30–39'
  if (age < 50) return '40–49'
  return '50+'
}

// ---------------------------------------------------------------------------
// UI primitives
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-6">
      <div className="px-4 py-1 mb-3 border-b border-[#3c3c3c]">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">{title}</span>
      </div>
      <div className="px-4">{children}</div>
    </div>
  )
}

function StatCard({
  label,
  value,
  total,
  color,
}: {
  label: string
  value: number
  total: number
  color: string
}) {
  const pct = total > 0 ? ((value / total) * 100).toFixed(0) : '0'
  return (
    <div className="rounded p-3 bg-[#252526] border border-[#3c3c3c] flex flex-col gap-1">
      <div className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</div>
      <div className="text-3xl font-bold tabular-nums" style={{ color }}>{value}</div>
      <div className="text-[10px] text-gray-600">{pct}% of {total}</div>
    </div>
  )
}

function HBar({
  label,
  value,
  max,
  color,
  showPct,
  subtitle,
}: {
  label: string
  value: number
  max: number
  color: string
  showPct?: boolean
  subtitle?: string
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-shrink-0 w-20 text-right">
        <div className="text-[11px] text-gray-300 truncate" title={label}>{label}</div>
        {subtitle && <div className="text-[9px] text-gray-600 truncate">{subtitle}</div>}
      </div>
      <div className="flex-1 min-w-0 relative h-5 bg-[#2d2d30] rounded-sm overflow-hidden">
        <div
          className="h-full rounded-sm transition-all duration-200"
          style={{ width: `${pct}%`, backgroundColor: color, minWidth: value > 0 ? 3 : 0 }}
        />
      </div>
      <div className="flex-shrink-0 w-16 text-[10px] tabular-nums text-gray-300 flex gap-1">
        <span>{value}</span>
        {showPct && max > 0 && (
          <span className="text-gray-600">({pct.toFixed(0)}%)</span>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Data computation
// ---------------------------------------------------------------------------

function computeSummary(csvData: CSVData) {
  const { rows, columns } = csvData

  // Validity per row
  const validity = rows.map(row => computeRowValidity(row, columns))
  const validCount   = validity.filter(v => v.level === 'ok').length
  const partialCount = validity.filter(v => v.level === 'warning').length
  const invalidCount = validity.filter(v => v.level === 'critical').length
  const total = rows.length
  const usableIndices = rows
    .map((_, i) => i)
    .filter(i => validity[i].level !== 'critical')

  // Unit column indices — one set per unit letter
  const unitColIdxs: Partial<Record<string, number[]>> = {}
  for (const col of columns) {
    if (col.unitId && QUANT_SUBGROUPS.has(col.subGroup ?? '')) {
      if (!unitColIdxs[col.unitId]) unitColIdxs[col.unitId] = []
      unitColIdxs[col.unitId]!.push(col.index)
    }
  }

  // Unit distribution across ALL rows
  const unitDist: Partial<Record<string, number>> = {}
  // Unit distribution across valid + partial rows
  const unitValidDist: Partial<Record<string, number>> = {}
  for (const unit of UNIT_LETTERS) {
    const idxs = unitColIdxs[unit]
    if (!idxs?.length) continue
    unitDist[unit]      = rows.filter(row => idxs.some(ci => (row[ci] ?? '') !== '')).length
    unitValidDist[unit] = usableIndices.filter(i => idxs.some(ci => (rows[i][ci] ?? '') !== '')).length
  }

  // Demographics columns
  const genderCol = columns.find(
    c => c.groupId === 'Pre-Survey' && c.displayLabel.toLowerCase().includes('gender'),
  )
  const ageCol = columns.find(
    c => c.groupId === 'Pre-Survey' && c.displayLabel.toLowerCase().includes('age'),
  )
  const englishCol = columns.find(
    c => c.groupId === 'Pre-Survey' && (
      c.displayLabel.toLowerCase().includes('english') ||
      c.displayLabel.toLowerCase().includes('proficiency')
    ),
  )
  const perceptualCol = columns.find(
    c => c.groupId === 'Pre-Survey' && (
      c.displayLabel.toLowerCase().includes('perceptual') ||
      c.displayLabel.toLowerCase().includes('hearing')
    ),
  )

  const genderMap     = new Map<string, number>()
  const ageMap        = new Map<string, number>()
  const englishMap    = new Map<string, number>()
  const perceptualMap = new Map<string, number>()
  let ageUnknown = 0

  function countCategorical(map: Map<string, number>, val: string) {
    const v = val.trim()
    if (v) map.set(v, (map.get(v) ?? 0) + 1)
  }

  for (const i of usableIndices) {
    const row = rows[i]

    if (genderCol)     countCategorical(genderMap,     row[genderCol.index]     ?? '')
    if (englishCol)    countCategorical(englishMap,    row[englishCol.index]    ?? '')
    if (perceptualCol) countCategorical(perceptualMap, row[perceptualCol.index] ?? '')

    if (ageCol) {
      const age = parseInt(row[ageCol.index] ?? '', 10)
      if (!isNaN(age) && age > 0) {
        const b = ageBucket(age)
        ageMap.set(b, (ageMap.get(b) ?? 0) + 1)
      } else if ((row[ageCol.index] ?? '').trim() !== '') {
        ageUnknown++
      }
    }
  }

  function sortedData(map: Map<string, number>) {
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }))
  }

  function mapTotal(map: Map<string, number>) {
    let t = 0; for (const v of map.values()) t += v; return t
  }

  const usableCount = usableIndices.length

  function withBlank(data: { label: string; value: number }[], n: number) {
    const blank = usableCount - n
    return blank > 0 ? [...data, { label: 'Not answered', value: blank }] : data
  }

  const genderN     = mapTotal(genderMap)
  const englishN    = mapTotal(englishMap)
  const perceptualN = mapTotal(perceptualMap)
  const ageN        = mapTotal(ageMap) + ageUnknown

  const genderData     = withBlank(sortedData(genderMap), genderN)
  const englishData    = withBlank(sortedData(englishMap), englishN)
  const perceptualData = withBlank(sortedData(perceptualMap), perceptualN)

  const ageData = withBlank([
    ...AGE_BUCKETS.filter(b => ageMap.has(b)).map(b => ({ label: b, value: ageMap.get(b)! })),
    ...(ageUnknown > 0 ? [{ label: 'Unknown', value: ageUnknown }] : []),
  ], ageN)

  const presentUnits = UNIT_LETTERS.filter(u => u in unitDist)

  return {
    total,
    validCount,
    partialCount,
    invalidCount,
    usableCount,
    unitDist,
    unitValidDist,
    genderData,     genderN,
    ageData,        ageN,
    englishData,    englishN,
    perceptualData, perceptualN,
    hasGender:     !!genderCol,
    hasAge:        !!ageCol,
    hasEnglish:    !!englishCol,
    hasPerceptual: !!perceptualCol,
    presentUnits,
  }
}

// ---------------------------------------------------------------------------
// Panel component
// ---------------------------------------------------------------------------

export function SummaryPanel({ files, filesVersion, onUploadFile, onDeleteFile }: FileCatalogProps) {
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const [csvData, setCsvData]           = useState<CSVData | null>(null)
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState<string | null>(null)

  useEffect(() => {
    setSelectedFiles((prev) => prev.filter((f) => files.includes(f)))
  }, [files])

  useEffect(() => {
    if (selectedFiles.length === 0) { setCsvData(null); return }
    setLoading(true)
    setError(null)
    fetchCombinedData(selectedFiles)
      .then(setCsvData)
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [selectedFiles, filesVersion])

  const toggleFile = (f: string) =>
    setSelectedFiles(prev =>
      prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f],
    )

  const handleUploadFile = useCallback(async (file: File) => {
    setError(null)
    try {
      await onUploadFile(file)
    } catch (err) {
      setError(`Upload failed: ${(err as Error).message}`)
    }
  }, [onUploadFile])

  const handleDeleteFile = useCallback(async (filename: string) => {
    try {
      await onDeleteFile(filename)
      setSelectedFiles((prev) => prev.filter((f) => f !== filename))
    } catch (err) {
      setError(`Delete failed: ${(err as Error).message}`)
    }
  }, [onDeleteFile])

  const summary = useMemo(
    () => (csvData ? computeSummary(csvData) : null),
    [csvData],
  )

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e]">
      {/* Header bar */}
      <div className="flex items-center gap-3 px-3 h-10 bg-[#252526] border-b border-[#3c3c3c] flex-shrink-0">
        <FileSelector files={files} selectedFiles={selectedFiles} onToggle={toggleFile} onDelete={handleDeleteFile} onUpload={handleUploadFile} />
        {loading && <span className="text-[11px] text-gray-500">Loading…</span>}
        {error   && <span className="text-[11px] text-[#f87171] truncate">{error}</span>}
      </div>

      {/* Body */}
      {!summary ? (
        <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
          Select one or more CSV files to see the summary
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto py-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-[#555] [&::-webkit-scrollbar-track]:bg-transparent">

          {/* ── 1. Validity counts ── */}
          <Section title="Response Validity">
            <div className="grid grid-cols-3 gap-2 mb-2">
              <StatCard label="Valid"         value={summary.validCount}   total={summary.total} color="#4ade80" />
              <StatCard label="Partial Valid" value={summary.partialCount} total={summary.total} color="#fbbf24" />
              <StatCard label="Invalid"       value={summary.invalidCount} total={summary.total} color="#f87171" />
            </div>
            <p className="text-[10px] text-gray-600">{summary.total} total responses</p>
          </Section>

          {/* ── 2. Unit distribution — all responses ── */}
          {summary.presentUnits.length > 0 && (
            <Section title="Unit Distribution — All Responses">
              <div className="space-y-1.5">
                {summary.presentUnits.map(u => (
                  <HBar
                    key={u}
                    label={`Unit ${u}`}
                    value={summary.unitDist[u] ?? 0}
                    max={summary.total}
                    color="#4fc3f7"
                    showPct
                  />
                ))}
              </div>
              <p className="text-[10px] text-gray-600 mt-2">
                Rows with at least one quantitative response for that unit.
              </p>
            </Section>
          )}

          {/* ── 3. Demographics — valid + partial valid ── */}
          {summary.usableCount > 0 && (summary.hasGender || summary.hasAge || summary.hasEnglish || summary.hasPerceptual) && (
            <Section title={`Demographics — Valid & Partial Valid (n = ${summary.usableCount})`}>
              {summary.hasGender && (
                <div className="mb-5">
                  <div className="text-[11px] text-gray-400 mb-2">Gender <span className="text-gray-600">(n = {summary.genderN})</span></div>
                  {summary.genderData.length > 0 ? (
                    <div className="space-y-1.5">
                      {summary.genderData.map(d => (
                        <HBar key={d.label} label={d.label} value={d.value} max={summary.usableCount} color={d.label === 'Not answered' ? '#4b5563' : '#a78bfa'} showPct />
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-gray-600">No gender data in selected files.</p>
                  )}
                </div>
              )}

              {summary.hasAge && (
                <div className="mb-5">
                  <div className="text-[11px] text-gray-400 mb-2">Age Groups <span className="text-gray-600">(n = {summary.ageN})</span></div>
                  {summary.ageData.length > 0 ? (
                    <div className="space-y-1.5">
                      {summary.ageData.map(d => (
                        <HBar key={d.label} label={d.label} value={d.value} max={summary.usableCount} color={d.label === 'Not answered' ? '#4b5563' : '#34d399'} showPct />
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-gray-600">No age data in selected files.</p>
                  )}
                </div>
              )}

              {summary.hasEnglish && (
                <div className="mb-5">
                  <div className="text-[11px] text-gray-400 mb-2">English Proficiency <span className="text-gray-600">(n = {summary.englishN})</span></div>
                  {summary.englishData.length > 0 ? (
                    <div className="space-y-1.5">
                      {summary.englishData.map(d => (
                        <HBar key={d.label} label={d.label} value={d.value} max={summary.usableCount} color={d.label === 'Not answered' ? '#4b5563' : '#fb923c'} showPct />
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-gray-600">No English proficiency data in selected files.</p>
                  )}
                </div>
              )}

              {summary.hasPerceptual && (
                <div>
                  <div className="text-[11px] text-gray-400 mb-2">Perceptual Ability <span className="text-gray-600">(n = {summary.perceptualN})</span></div>
                  {summary.perceptualData.length > 0 ? (
                    <div className="space-y-1.5">
                      {summary.perceptualData.map(d => (
                        <HBar key={d.label} label={d.label} value={d.value} max={summary.usableCount} color={d.label === 'Not answered' ? '#4b5563' : '#38bdf8'} showPct />
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-gray-600">No perceptual ability data in selected files.</p>
                  )}
                </div>
              )}
            </Section>
          )}

          {/* ── 4. Valid responses per unit ── */}
          {summary.presentUnits.length > 0 && summary.usableCount > 0 && (
            <Section title={`Valid Responses Per Unit — Valid & Partial Valid (n = ${summary.usableCount})`}>
              <div className="space-y-1.5">
                {summary.presentUnits.map(u => (
                  <HBar
                    key={u}
                    label={`Unit ${u}`}
                    value={summary.unitValidDist[u] ?? 0}
                    max={summary.usableCount}
                    color="#4ade80"
                    showPct
                  />
                ))}
              </div>
            </Section>
          )}

        </div>
      )}
    </div>
  )
}
