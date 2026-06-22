import { useState, useEffect, useMemo, type ReactNode } from 'react'
import { fetchFiles, fetchCombinedData } from '../../../api/csv'
import type { CSVData } from '../../../types'
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

  const genderMap  = new Map<string, number>()
  const ageMap     = new Map<string, number>()
  let ageUnknown   = 0

  for (const i of usableIndices) {
    const row = rows[i]

    if (genderCol) {
      const g = (row[genderCol.index] ?? '').trim()
      if (g) genderMap.set(g, (genderMap.get(g) ?? 0) + 1)
    }

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

  const genderData = Array.from(genderMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value }))

  const ageData = [
    ...AGE_BUCKETS.filter(b => ageMap.has(b)).map(b => ({ label: b, value: ageMap.get(b)! })),
    ...(ageUnknown > 0 ? [{ label: 'Unknown', value: ageUnknown }] : []),
  ]

  const presentUnits = UNIT_LETTERS.filter(u => u in unitDist)

  return {
    total,
    validCount,
    partialCount,
    invalidCount,
    usableCount: usableIndices.length,
    unitDist,
    unitValidDist,
    genderData,
    ageData,
    hasGender: !!genderCol,
    hasAge: !!ageCol,
    presentUnits,
  }
}

// ---------------------------------------------------------------------------
// Panel component
// ---------------------------------------------------------------------------

export function SummaryPanel() {
  const [files, setFiles]               = useState<string[]>([])
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const [csvData, setCsvData]           = useState<CSVData | null>(null)
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState<string | null>(null)

  useEffect(() => {
    fetchFiles().then(setFiles).catch(() => {})
  }, [])

  useEffect(() => {
    if (selectedFiles.length === 0) { setCsvData(null); return }
    setLoading(true)
    setError(null)
    fetchCombinedData(selectedFiles)
      .then(setCsvData)
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [selectedFiles])

  const toggleFile = (f: string) =>
    setSelectedFiles(prev =>
      prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f],
    )

  const summary = useMemo(
    () => (csvData ? computeSummary(csvData) : null),
    [csvData],
  )

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e]">
      {/* Header bar */}
      <div className="flex items-center gap-3 px-3 h-10 bg-[#252526] border-b border-[#3c3c3c] flex-shrink-0">
        <FileSelector files={files} selectedFiles={selectedFiles} onToggle={toggleFile} />
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
          {summary.usableCount > 0 && (summary.hasGender || summary.hasAge) && (
            <Section title={`Demographics — Valid & Partial Valid (n = ${summary.usableCount})`}>
              {summary.hasGender && (
                <div className="mb-5">
                  <div className="text-[11px] text-gray-400 mb-2">Gender</div>
                  {summary.genderData.length > 0 ? (
                    <div className="space-y-1.5">
                      {summary.genderData.map(d => (
                        <HBar
                          key={d.label}
                          label={d.label}
                          value={d.value}
                          max={summary.usableCount}
                          color="#a78bfa"
                          showPct
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-gray-600">No gender data in selected files.</p>
                  )}
                </div>
              )}

              {summary.hasAge && (
                <div>
                  <div className="text-[11px] text-gray-400 mb-2">Age Groups</div>
                  {summary.ageData.length > 0 ? (
                    <div className="space-y-1.5">
                      {summary.ageData.map(d => (
                        <HBar
                          key={d.label}
                          label={d.label}
                          value={d.value}
                          max={summary.usableCount}
                          color="#34d399"
                          showPct
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-gray-600">No age data in selected files.</p>
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
