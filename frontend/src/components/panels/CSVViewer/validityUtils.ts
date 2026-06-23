import type { Column } from '../../../types'

const QUANT_SUBGROUPS = new Set(['High-Quant', 'Low-Quant', 'Mid-Quant'])

// Correct answer for each unit's attention-check question
const ATTENTION_ANSWERS: Record<string, string> = {
  A: 'Paris',
  B: 'Apple',
  C: 'Dog',
  D: 'Yellow',
  E: 'Flower',
  F: '12',
  G: '4',
}

// [lowSubKey, highSubKey, displayLabel]
// Conflict = lowSubKey value ≤ 2 AND highSubKey value ≥ 4
const CROSS_CHECKS: [string, string, string][] = [
  ['2',  '8', 'Clarity↔Confidence'],
  ['4',  '5', 'Trust↔Compliance'],
  ['9',  '4', 'Competence↔Trust'],
  ['10', '5', 'Safety↔Compliance'],
  ['10', '4', 'Safety↔Trust'],
  ['2',  '7', 'Clarity↔Appropriateness'],
]

// ---------------------------------------------------------------------------
// Likert scale normalisation
// 1 = Strongly Disagree  2 = Somewhat Disagree  3 = Neither  4 = Somewhat Agree  5 = Strongly Agree
// "Disagree" is a known mislabelling of "Somewhat Disagree" and maps to 2.
// ---------------------------------------------------------------------------
const LIKERT_MAP: Record<string, number> = {
  'strongly disagree':          1,
  'disagree':                   2,  // mislabelled — treated as "somewhat disagree"
  'somewhat disagree':          2,
  'neither agree nor disagree': 3,
  'neutral':                    3,
  'somewhat agree':             4,
  'strongly agree':             5,
}

function parseLikert(val: string): number | null {
  if (val === '') return null
  const n = parseInt(val, 10)
  if (!isNaN(n) && n >= 1 && n <= 5) return n
  return LIKERT_MAP[val.toLowerCase().trim()] ?? null
}

// Returns a canonical key for grouping identical responses (straight-line detection).
// Numeric values and their text equivalents collapse to the same key.
function normalizeLikert(val: string): string {
  const n = parseLikert(val)
  return n !== null ? String(n) : val.toLowerCase().trim()
}

export interface ValidityResult {
  level: 'ok' | 'warning' | 'critical'
  notes: string[]
  criticalCount: number
  partialCount: number
}

export function computeRowValidity(row: string[], columns: Column[]): ValidityResult {
  const criticals: string[] = []
  const partials: string[] = []

  // --- Critical: participant typed "test" in any open-text field ---
  for (const col of columns) {
    const isOpenText =
      (col.subGroup != null && (col.subGroup.endsWith('-Impression') || col.subGroup === 'Summary')) ||
      col.groupId === 'Pre-Survey'
    if (!isOpenText) continue
    const val = (row[col.index] ?? '').trim()
    if (val.toLowerCase() === 'test') {
      criticals.push(`"test" in ${col.displayLabel}`)
    }
  }

  // Group quant columns by "unit:subgroup" → Map<subKey, Column>
  const quantGroups = new Map<string, Map<string, Column>>()
  for (const col of columns) {
    if (!col.unitId || !col.subGroup || !QUANT_SUBGROUPS.has(col.subGroup) || !col.subKey) continue
    const key = `${col.unitId}:${col.subGroup}`
    if (!quantGroups.has(key)) quantGroups.set(key, new Map())
    quantGroups.get(key)!.set(col.subKey, col)
  }

  // Critical: quant columns exist but none are filled in any unit
  if (quantGroups.size > 0) {
    const anyFilled = Array.from(quantGroups.values()).some((skMap) =>
      Array.from(skMap.values()).some((col) => (row[col.index] ?? '') !== ''),
    )
    if (!anyFilled) criticals.push('No responses in any unit')
  }

  // Accumulate straight-lining results per unit before deciding critical vs partial
  const straightLinedByUnit = new Map<string, string[]>()  // unit → ['High(2)', ...]
  const levelCountByUnit    = new Map<string, number>()     // unit → total levels present

  for (const [key, skMap] of quantGroups) {
    const [unit, sg] = key.split(':')
    const sgShort = sg.replace('-Quant', '')  // "High", "Low", "Mid"

    levelCountByUnit.set(unit, (levelCountByUnit.get(unit) ?? 0) + 1)

    // Normalise the 13 answers so text and numeric variants of the same rating compare equal
    const allVals = Array.from({ length: 13 }, (_, i) => {
      const col = skMap.get(String(i + 1))
      return col ? normalizeLikert(row[col.index] ?? '') : ''
    })
    const filled = allVals.filter((v) => v !== '')

    if (filled.length === 13 && new Set(filled).size === 1) {
      if (!straightLinedByUnit.has(unit)) straightLinedByUnit.set(unit, [])
      straightLinedByUnit.get(unit)!.push(`${sgShort}(${filled[0]})`)
    }

    // --- Partial: internal cross-check contradictions ---
    for (const [lowKey, highKey, label] of CROSS_CHECKS) {
      const lowCol  = skMap.get(lowKey)
      const highCol = skMap.get(highKey)
      if (!lowCol || !highCol) continue
      const lo = parseLikert(row[lowCol.index]  ?? '')
      const hi = parseLikert(row[highCol.index] ?? '')
      if (lo !== null && hi !== null && lo <= 2 && hi >= 4) {
        const loText = lowCol.canonicalLabel  || lowCol.displayLabel
        const hiText = highCol.canonicalLabel || highCol.displayLabel
        partials.push(
          `Unit ${unit} ${sgShort}: ${label} (${lo}↔${hi}) — "${loText}" [${lo}] vs "${hiText}" [${hi}]`,
        )
      }
    }
  }

  // Critical only when ALL levels in a unit are straight-lined; otherwise partial
  for (const [unit, levels] of straightLinedByUnit) {
    const msg = `Unit ${unit} straight-line: ${levels.join(', ')}`
    if (levels.length === (levelCountByUnit.get(unit) ?? 0)) {
      criticals.push(msg)
    } else {
      partials.push(msg)
    }
  }

  // --- Partial: attention check filled incorrectly (blank is OK) ---
  for (const col of columns) {
    if (col.subGroup !== 'Attention-Check' || !col.unitId) continue
    const expected = ATTENTION_ANSWERS[col.unitId]
    if (!expected) continue
    const actual = (row[col.index] ?? '').trim()
    if (actual !== '' && actual !== expected) {
      partials.push(`Unit ${col.unitId} attn: "${actual}"`)
    }
  }

  // --- Critical: audio check must be answered and equal 8803 ---
  const audioCol = columns.find(
    (c) => c.groupId === 'Pre-Survey' && c.displayLabel.toLowerCase().includes('audio'),
  )
  if (audioCol) {
    const raw = (row[audioCol.index] ?? '').trim()
    if (raw === '') {
      criticals.push('Audio check not answered')
    } else {
      const normalized = raw.replace(/[\s\-_.,]/g, '')
      if (normalized !== '8803') {
        criticals.push(`Audio check failed: "${raw}" (expected 8803)`)
      }
    }
  }

  // --- Partial: duration below 15 minutes (900 seconds) ---
  const durationCol = columns.find(
    (c) => c.groupId === 'Metadata' && c.displayLabel.toLowerCase().includes('duration'),
  )
  if (durationCol) {
    const raw = (row[durationCol.index] ?? '').trim()
    const seconds = parseInt(raw, 10)
    if (!isNaN(seconds) && seconds < 900) {
      const mins = Math.floor(seconds / 60)
      const secs = seconds % 60
      partials.push(`Short duration: ${mins}m ${secs}s (minimum 15 min)`)
    }
  }

  const notes = [...criticals, ...partials]
  // Rows with fewer than 5 partial issues (and no criticals) are green/valid;
  // notes are still preserved and displayed in muted grey.
  const level: ValidityResult['level'] =
    criticals.length > 0
      ? 'critical'
      : partials.length >= 5
      ? 'warning'
      : 'ok'

  return { level, notes, criticalCount: criticals.length, partialCount: partials.length }
}

export const VALIDITY_COLORS: Record<ValidityResult['level'], string> = {
  ok:       '#4ade80',  // green-400
  warning:  '#fbbf24',  // amber-400
  critical: '#f87171',  // red-400
}

// Exported so other modules (score calculations, etc.) use the same scale
export { parseLikert, normalizeLikert }
