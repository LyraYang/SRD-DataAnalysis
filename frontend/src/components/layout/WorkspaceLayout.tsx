import { useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { CSVViewer } from '../panels/CSVViewer'
import { PANEL_REGISTRY, AVAILABLE_PANELS } from '../panels/registry'
import type { OpenPanel, PanelType } from '../../types'

// Layout is a 2D grid: array of columns, each column is an array of panels (rows)
interface Column {
  id: string
  panels: OpenPanel[]
}

function renderPanel(type: PanelType) {
  switch (type) {
    case 'csv-viewer':
      return <CSVViewer />
  }
}

function mkPanel(type: PanelType): OpenPanel {
  return { instanceId: `${type}-${Date.now()}-${Math.random().toString(36).slice(2)}`, type }
}

function mkColumn(type: PanelType): Column {
  return { id: `col-${Date.now()}-${Math.random().toString(36).slice(2)}`, panels: [mkPanel(type)] }
}

export function WorkspaceLayout() {
  const [columns, setColumns] = useState<Column[]>([
    { id: 'col-default', panels: [{ instanceId: 'csv-viewer-default', type: 'csv-viewer' }] },
  ])
  const [menuOpen, setMenuOpen] = useState(false)

  const totalPanels = columns.reduce((s, c) => s + c.panels.length, 0)

  // Add a new column to the right of colIdx (or at end if colIdx = -1)
  const addColumn = (afterColIdx: number, type: PanelType) => {
    setColumns((prev) => {
      const col = mkColumn(type)
      const next = [...prev]
      next.splice(afterColIdx + 1, 0, col)
      return next
    })
  }

  // Add a new row below rowIdx inside colIdx
  const addRow = (colIdx: number, afterRowIdx: number, type: PanelType) => {
    setColumns((prev) =>
      prev.map((col, i) => {
        if (i !== colIdx) return col
        const panels = [...col.panels]
        panels.splice(afterRowIdx + 1, 0, mkPanel(type))
        return { ...col, panels }
      }),
    )
  }

  // Remove a specific panel; remove column if it becomes empty
  const removePanel = (colIdx: number, rowIdx: number) => {
    setColumns((prev) => {
      const next = prev
        .map((col, i) => {
          if (i !== colIdx) return col
          return { ...col, panels: col.panels.filter((_, j) => j !== rowIdx) }
        })
        .filter((col) => col.panels.length > 0)
      return next.length > 0 ? next : [mkColumn('csv-viewer')]
    })
  }

  const isEmpty = columns.length === 0

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 h-10 bg-[#323233] border-b border-[#3c3c3c] flex-shrink-0">
        <span className="text-sm font-semibold text-gray-200 tracking-wide">
          SRD Data Analysis
        </span>
        <div className="ml-auto relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-1.5 px-3 py-1 text-xs bg-[#007acc] hover:bg-[#1b8dc4] text-white rounded transition-colors"
          >
            <span>+</span>
            <span>Add Panel</span>
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-8 z-20 w-52 bg-[#252526] border border-[#3c3c3c] rounded shadow-xl py-1">
                {AVAILABLE_PANELS.map((type) => (
                  <button
                    key={type}
                    onClick={() => { addColumn(columns.length - 1, type); setMenuOpen(false) }}
                    className="w-full text-left px-4 py-2 text-xs text-gray-300 hover:bg-[#094771] transition-colors"
                  >
                    <div className="font-medium">{PANEL_REGISTRY[type].title}</div>
                    <div className="text-gray-500 mt-0.5">{PANEL_REGISTRY[type].description}</div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Workspace */}
      {isEmpty ? (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-3">
          <span className="text-4xl">📊</span>
          <p className="text-sm">No panels open</p>
          <button
            onClick={() => addColumn(-1, 'csv-viewer')}
            className="px-4 py-2 text-xs bg-[#007acc] hover:bg-[#1b8dc4] text-white rounded"
          >
            Open CSV Viewer
          </button>
        </div>
      ) : (
        <PanelGroup direction="horizontal" className="flex-1 min-h-0">
          {columns.map((col, colIdx) => (
            <>
              {colIdx > 0 && (
                <PanelResizeHandle className="w-1 bg-[#3c3c3c] hover:bg-[#007acc] data-[resize-handle-active]:bg-[#007acc] transition-colors flex-shrink-0" />
              )}
              <Panel
                key={col.id}
                id={col.id}
                minSize={15}
                defaultSize={Math.floor(100 / columns.length)}
              >
                <PanelGroup direction="vertical">
                  {col.panels.map((panel, rowIdx) => (
                    <>
                      {rowIdx > 0 && (
                        <PanelResizeHandle className="h-1 bg-[#3c3c3c] hover:bg-[#007acc] data-[resize-handle-active]:bg-[#007acc] transition-colors flex-shrink-0" />
                      )}
                      <Panel
                        key={panel.instanceId}
                        id={panel.instanceId}
                        minSize={10}
                        defaultSize={Math.floor(100 / col.panels.length)}
                      >
                        <div className="flex flex-col h-full">
                          {/* Panel title bar */}
                          <div className="flex items-center px-3 h-8 bg-[#2d2d30] border-b border-[#3c3c3c] flex-shrink-0 gap-1">
                            <span className="text-xs text-gray-400 font-medium flex-1 truncate">
                              {PANEL_REGISTRY[panel.type].title}
                            </span>
                            {/* Split right */}
                            <button
                              onClick={() => addColumn(colIdx, panel.type)}
                              title="Split right"
                              className="text-[#007acc] hover:text-[#4fc3f7] p-0.5 rounded hover:bg-[#37373d] flex items-center"
                            >
                              <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor">
                                <rect x="1" y="1" width="4" height="11" rx="1" opacity="0.45"/>
                                <rect x="8" y="1" width="4" height="11" rx="1"/>
                                <rect x="5.5" y="1" width="1" height="11" opacity="0.3"/>
                              </svg>
                            </button>
                            {/* Split down */}
                            <button
                              onClick={() => addRow(colIdx, rowIdx, panel.type)}
                              title="Split down"
                              className="text-[#007acc] hover:text-[#4fc3f7] p-0.5 rounded hover:bg-[#37373d] flex items-center"
                            >
                              <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor">
                                <rect x="1" y="1" width="11" height="4" rx="1" opacity="0.45"/>
                                <rect x="1" y="8" width="11" height="4" rx="1"/>
                                <rect x="1" y="5.5" width="11" height="1" opacity="0.3"/>
                              </svg>
                            </button>
                            {/* Close */}
                            {totalPanels > 1 && (
                              <button
                                onClick={() => removePanel(colIdx, rowIdx)}
                                title="Close panel"
                                className="text-gray-600 hover:text-gray-300 text-xs leading-none px-1 py-0.5 rounded hover:bg-[#37373d]"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                          <div className="flex-1 min-h-0">{renderPanel(panel.type)}</div>
                        </div>
                      </Panel>
                    </>
                  ))}
                </PanelGroup>
              </Panel>
            </>
          ))}
        </PanelGroup>
      )}
    </div>
  )
}
