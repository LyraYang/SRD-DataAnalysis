import { useState, useEffect, useMemo } from 'react'
import { fetchFiles, fetchCSVData } from '../../../api/csv'
import { FileSelector } from './FileSelector'
import { FilterSidebar } from './FilterSidebar'
import { DataTable } from './DataTable'
import type { CSVData } from '../../../types'

export function CSVViewer() {
  const [files, setFiles] = useState<string[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [csvData, setCsvData] = useState<CSVData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeGroupIds, setActiveGroupIds] = useState<Set<string>>(new Set())
  const [columnSearch, setColumnSearch] = useState('')

  useEffect(() => {
    fetchFiles()
      .then(setFiles)
      .catch((e) => console.error('Failed to load file list:', e))
  }, [])

  useEffect(() => {
    if (!selectedFile) return
    setLoading(true)
    setError(null)
    setCsvData(null)
    fetchCSVData(selectedFile)
      .then((data) => {
        setCsvData(data)
        setActiveGroupIds(new Set(data.questionGroups.map((g) => g.id)))
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [selectedFile])

  const toggleGroup = (groupId: string) => {
    setActiveGroupIds((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  const visibleColumnCount = useMemo(() => {
    if (!csvData) return 0
    return csvData.columns.filter((c) => activeGroupIds.has(c.groupId)).length
  }, [csvData, activeGroupIds])

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 h-10 border-b border-[#3c3c3c] bg-[#252526] flex-shrink-0">
        <FileSelector
          files={files}
          selectedFile={selectedFile}
          onSelect={setSelectedFile}
        />
        {csvData && (
          <span className="ml-auto text-[11px] text-gray-500">
            {csvData.totalRows} rows · {visibleColumnCount} / {csvData.columns.length} columns
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {csvData && (
          <FilterSidebar
            questionGroups={csvData.questionGroups}
            activeGroupIds={activeGroupIds}
            onToggleGroup={toggleGroup}
            onSelectAll={() =>
              setActiveGroupIds(new Set(csvData.questionGroups.map((g) => g.id)))
            }
            onClearAll={() => setActiveGroupIds(new Set())}
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
              <span className="text-sm">Select a CSV file above to begin</span>
            </div>
          )}
          {!loading && !error && csvData && (
            <DataTable
              columns={csvData.columns}
              rows={csvData.rows}
              activeGroupIds={activeGroupIds}
              columnSearch={columnSearch}
            />
          )}
        </div>
      </div>
    </div>
  )
}
