import { useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { CSVViewer } from '../panels/CSVViewer'
import { PANEL_REGISTRY, AVAILABLE_PANELS } from '../panels/registry'
import type { OpenPanel, PanelType } from '../../types'

function renderPanel(type: PanelType) {
  switch (type) {
    case 'csv-viewer':
      return <CSVViewer />
  }
}

export function WorkspaceLayout() {
  const [panels, setPanels] = useState<OpenPanel[]>([
    { instanceId: 'csv-viewer-default', type: 'csv-viewer' },
  ])
  const [menuOpen, setMenuOpen] = useState(false)

  const addPanel = (type: PanelType) => {
    setPanels((prev) => [
      ...prev,
      { instanceId: `${type}-${Date.now()}`, type },
    ])
    setMenuOpen(false)
  }

  const removePanel = (instanceId: string) => {
    setPanels((prev) => prev.filter((p) => p.instanceId !== instanceId))
  }

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
              <div
                className="fixed inset-0 z-10"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 top-8 z-20 w-52 bg-[#252526] border border-[#3c3c3c] rounded shadow-xl py-1">
                {AVAILABLE_PANELS.map((type) => (
                  <button
                    key={type}
                    onClick={() => addPanel(type)}
                    className="w-full text-left px-4 py-2 text-xs text-gray-300 hover:bg-[#094771] transition-colors"
                  >
                    <div className="font-medium">{PANEL_REGISTRY[type].title}</div>
                    <div className="text-gray-500 mt-0.5">
                      {PANEL_REGISTRY[type].description}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Workspace */}
      {panels.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-3">
          <span className="text-4xl">📊</span>
          <p className="text-sm">No panels open</p>
          <button
            onClick={() => addPanel('csv-viewer')}
            className="px-4 py-2 text-xs bg-[#007acc] hover:bg-[#1b8dc4] text-white rounded"
          >
            Open CSV Viewer
          </button>
        </div>
      ) : (
        <PanelGroup direction="horizontal" className="flex-1 min-h-0">
          {panels.map((panel, index) => (
            <>
              {index > 0 && (
                <PanelResizeHandle className="w-1 bg-[#3c3c3c] hover:bg-[#007acc] data-[resize-handle-active]:bg-[#007acc] transition-colors" />
              )}
              <Panel
                key={panel.instanceId}
                minSize={20}
                defaultSize={Math.floor(100 / panels.length)}
              >
                <div className="flex flex-col h-full">
                  {/* Panel title bar */}
                  <div className="flex items-center px-3 h-8 bg-[#2d2d30] border-b border-[#3c3c3c] flex-shrink-0">
                    <span className="text-xs text-gray-400 font-medium">
                      {PANEL_REGISTRY[panel.type].title}
                    </span>
                    {panels.length > 1 && (
                      <button
                        onClick={() => removePanel(panel.instanceId)}
                        className="ml-auto text-gray-600 hover:text-gray-300 text-xs leading-none px-1"
                        title="Close panel"
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
      )}
    </div>
  )
}
