import type { PanelType } from '../../types'

export interface PanelMeta {
  title: string
  description: string
}

export const PANEL_REGISTRY: Record<PanelType, PanelMeta> = {
  'csv-viewer': {
    title: 'CSV Viewer',
    description: 'View and filter raw Qualtrics CSV responses',
  },
}

export const AVAILABLE_PANELS: PanelType[] = ['csv-viewer']
