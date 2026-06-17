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

export interface ValidityResult {
  level: 'ok' | 'warning' | 'critical'
  notes: string[]
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

  for (const [key, skMap] of quantGroups) {
    const [unit, sg] = key.split(':')
    const sgShort = sg.replace('-Quant', '')  // "High", "Low", "Mid"

    // All 13 answer values for this condition
    const allVals = Array.from({ length: 13 }, (_, i) => {
      const col = skMap.get(String(i + 1))
      return col ? (row[col.index] ?? '') : ''
    })
    const filled = allVals.filter((v) => v !== '')

    // --- Critical: all 13 answered and identical (straight-lining) ---
    if (filled.length === 13 && new Set(filled).size === 1) {
      criticals.push(`Unit ${unit} ${sgShort}: all same (${filled[0]})`)
    }

    // --- Partial: internal cross-check contradictions ---
    for (const [lowKey, highKey, label] of CROSS_CHECKS) {
      const lowCol = skMap.get(lowKey)
      const highCol = skMap.get(highKey)
      if (!lowCol || !highCol) continue
      const lo = parseInt(row[lowCol.index] ?? '', 10)
      const hi = parseInt(row[highCol.index] ?? '', 10)
      if (!isNaN(lo) && !isNaN(hi) && lo <= 2 && hi >= 4) {
        partials.push(`Unit ${unit} ${sgShort}: ${label}`)
      }
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

  // --- Partial: audio check answered but not "8803" ---
  const audioCol = columns.find(
    (c) => c.groupId === 'Pre-Survey' && c.displayLabel.toLowerCase().includes('audio'),
  )
  if (audioCol) {
    const v = (row[audioCol.index] ?? '').trim()
    if (v !== '' && v !== '8803') {
      partials.push(`Audio: "${v}" (expected 8803)`)
    }
  }

  const notes = [...criticals, ...partials]
  const level: ValidityResult['level'] =
    criticals.length > 0 || partials.length > 5
      ? 'critical'
      : partials.length >= 3
      ? 'warning'
      : 'ok'

  return { level, notes }
}

export const VALIDITY_COLORS: Record<ValidityResult['level'], string> = {
  ok:       '#4ade80',  // green-400
  warning:  '#fbbf24',  // amber-400
  critical: '#f87171',  // red-400
}
