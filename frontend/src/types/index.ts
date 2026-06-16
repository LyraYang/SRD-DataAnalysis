export interface Column {
  colId: string
  index: number
  qId: string
  label: string
  importId: string
  groupId: string
}

export interface QuestionGroup {
  id: string
  label: string
  colIds: string[]
}

export interface CSVData {
  columns: Column[]
  rows: string[][]
  questionGroups: QuestionGroup[]
  totalRows: number
}

export type PanelType = 'csv-viewer'

export interface OpenPanel {
  instanceId: string
  type: PanelType
}
