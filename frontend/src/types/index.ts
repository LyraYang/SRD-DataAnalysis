export interface Column {
  colId: string
  index: number
  qId: string
  label: string
  canonicalLabel: string
  displayLabel: string
  importId: string
  groupId: string
  groupLabel: string
  unitId: string | null
  subGroup: string | null
  subKey: string | null
  category: string | null
  canonicalId: string
  filterKey: string
  expectedLevel: string | null
  expectedValue: number | null
}

export interface CategoryGroup {
  id: string
  label: string
  colIds: string[]
}

export interface SubGroup {
  id: string
  label: string
  colIds: string[]
  categories?: CategoryGroup[]
}

export interface QuestionGroup {
  id: string
  label: string
  colIds: string[]
  unitId: string | null
  subGroups: SubGroup[]
}

export interface RowMeta {
  source: string
  platform: 'Sona' | 'Prolific'
}

export interface SourceInfo {
  filename: string
  platform: 'Sona' | 'Prolific'
  rowCount: number
}

export interface CSVData {
  columns: Column[]
  rows: string[][]
  rowMeta: RowMeta[]
  questionGroups: QuestionGroup[]
  totalRows: number
  sources: SourceInfo[]
}

export interface SortConfig {
  canonicalId: string
  dir: 'asc' | 'desc'
}

export type PanelType = 'csv-viewer' | 'summary'

export interface OpenPanel {
  instanceId: string
  type: PanelType
}

export const PLATFORM_COLORS: Record<string, string> = {
  Sona: '#4fc3f7',
  Prolific: '#ffb74d',
}
