import { useState, useEffect, useMemo } from 'react'
import { fetchFiles, fetchCombinedData } from '../../../api/csv'
import { FileSelector } from './FileSelector'
import { FilterSidebar } from './FilterSidebar'
import { DataTable } from './DataTable'
import type { CSVData } from '../../../types'
import { PLATFORM_COLORS } from '../../../types'

export function CSVViewer() {
  const [files, setFiles] = useState<string[]>([])
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const [csvData, setCsvData] = useState<CSVData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeFilterKeys, setActiveFilterKeys] = useState<Set<string>>(new Set())
  const [columnSearch, setColumnSearch] = useState('')

  useEffect(() => {
    fetchFiles()
      .then(setFiles)
      .catch((e) => console.error('Failed to load file list:', e))
  }, [])

  // Reload whenever selected files change
  useEffect(() => {
    if (selectedFiles.length === 0) {
      setCsvData(null)
      return
    }
    setLoading(true)
    setError(null)
    setCsvData(null)
    fetchCombinedData(selectedFiles)
      .then((data) => {
        setCsvData(data)
        setActiveFilterKeys(new Set(data.columns.map((c) => c.filterKey)))
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [selectedFiles])

  const toggleFile = (filename: string) => {
    setSelectedFiles((prev) =>
      prev.includes(filename) ? prev.filter((f) => f !== filename) : [...prev, filename],
    )
  }

  const visibleColumnCount = useMemo(() => {
    if (!csvData) return 0
    return csvData.columns.filter((c) => activeFilterKeys.has(c.filterKey)).length
  }, [csvData, activeFilterKeys])

  const multiSource = (csvData?.sources?.length ?? 0) > 1

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e]">
      {/* Header bar */}
      <div className="flex items-center gap-3 px-4 h-10 border-b border-[#3c3c3c] bg-[#252526] flex-shrink-0">
        <FileSelector
          files={files}
          selectedFiles={selectedFiles}
          onToggle={toggleFile}
        />

        {/* Platform legend (shown when multiple sources loaded) */}
        {multiSource && csvData && (
          <div className="flex items-center gap-3 ml-2">
            {csvData.sources.map((src) => (
              <div key={src.filename} className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: PLATFORM_COLORS[src.platform] }}
                />
                <span className="text-[11px]" style={{ color: PLATFORM_COLORS[src.platform] }}>
                  {src.platform} ({src.rowCount})
                </span>
              </div>
            ))}
          </div>
        )}

        {csvData && (
          <span className="ml-auto text-[11px] text-gray-500">
            {csvData.totalRows} rows · {visibleColumnCount} / {csvData.columns.length} cols
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {csvData && (
          <FilterSidebar
            columns={csvData.columns}
            questionGroups={csvData.questionGroups}
            activeFilterKeys={activeFilterKeys}
            onSetFilterKeys={setActiveFilterKeys}
            columnSearch={columnSearch}
            onColumnSearchChange={setColumnSearch}
          />
        )}

        <div className="flex-1 min-w-0 min-h-0">
          {loading && (
            <div className="flex h-full items-center justify-center text-gray-400 text-sm">
              Loading…
            </div>
          )}
          {error && (
            <div className="flex h-full items-center justify-center text-red-400 text-sm px-8 text-center">
              Error: {error}
            </div>
          )}
          {!loading && !error && !csvData && (
            <div className="flex h-full items-center justify-center flex-col gap-2 text-gray-600">
              <span className="text-3xl">📂</span>
              <span className="text-sm">Select CSV files above to begin</span>
            </div>
          )}
          {!loading && !error && csvData && (
            <DataTable
              columns={csvData.columns}
              rows={csvData.rows}
              rowMeta={csvData.rowMeta}
              activeFilterKeys={activeFilterKeys}
              columnSearch={columnSearch}
              multiSource={multiSource}
            />
          )}
        </div>
      </div>
    </div>
  )
}
