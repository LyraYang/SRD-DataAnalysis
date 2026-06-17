import { useState, useEffect, useMemo, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { fetchFiles, fetchCombinedData } from '../../../api/csv'
import { FileSelector } from './FileSelector'
import { FilterSidebar } from './FilterSidebar'
import { DataTable } from './DataTable'
import type { CSVData, SortConfig } from '../../../types'
import { PLATFORM_COLORS } from '../../../types'

export function CSVViewer() {
  const [files, setFiles] = useState<string[]>([])
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const [csvData, setCsvData] = useState<CSVData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeFilterKeys, setActiveFilterKeys] = useState<Set<string>>(new Set())
  const [columnSearch, setColumnSearch] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [wrapText, setWrapText] = useState(true)
  const [hideInvalid, setHideInvalid] = useState(false)
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null)
  const [columnValueFilters, setColumnValueFilters] = useState<Map<string, Set<string>>>(new Map())

  useEffect(() => {
    fetchFiles()
      .then(setFiles)
      .catch((e) => console.error('Failed to load file list:', e))
  }, [])

  useEffect(() => {
    if (selectedFiles.length === 0) {
      setCsvData(null)
      return
    }
    setLoading(true)
    setError(null)
    setCsvData(null)
    setSortConfig(null)
    setColumnValueFilters(new Map())
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

  const handleColumnValueFilterChange = useCallback(
    (canonicalId: string, values: Set<string> | null) => {
      setColumnValueFilters((prev) => {
        const next = new Map(prev)
        if (values === null) {
          next.delete(canonicalId)
        } else {
          next.set(canonicalId, values)
        }
        return next
      })
    },
    [],
  )

  const visibleColumnCount = useMemo(() => {
    if (!csvData) return 0
    return csvData.columns.filter((c) => activeFilterKeys.has(c.filterKey)).length
  }, [csvData, activeFilterKeys])

  // Row count after value filters are applied (for header display)
  const filteredRowCount = useMemo(() => {
    if (!csvData) return 0
    if (columnValueFilters.size === 0) return csvData.totalRows
    let indices = Array.from({ length: csvData.rows.length }, (_, i) => i)
    for (const [canonicalId, allowedVals] of columnValueFilters) {
      if (allowedVals.size === 0) return 0
      const col = csvData.columns.find((c) => c.canonicalId === canonicalId)
      if (!col) continue
      indices = indices.filter((i) => allowedVals.has(csvData.rows[i]?.[col.index] ?? ''))
    }
    return indices.length
  }, [csvData, columnValueFilters])

  const multiSource = (csvData?.sources?.length ?? 0) > 1

  const handleDownloadExcel = useCallback(() => {
    if (!csvData) return

    // Mirror DataTable's visibleColumns logic
    const search = columnSearch.toLowerCase()
    const visibleCols = csvData.columns.filter((col) => {
      if (!activeFilterKeys.has(col.filterKey)) return false
      if (!search) return true
      return (
        col.displayLabel.toLowerCase().includes(search) ||
        col.canonicalLabel.toLowerCase().includes(search) ||
        col.qId.toLowerCase().includes(search)
      )
    })

    // Mirror DataTable's filteredSortedIndices logic
    let indices = Array.from({ length: csvData.rows.length }, (_, i) => i)
    for (const [canonicalId, allowedVals] of columnValueFilters) {
      if (allowedVals.size === 0) { indices = []; break }
      const col = csvData.columns.find((c) => c.canonicalId === canonicalId)
      if (!col) continue
      indices = indices.filter((i) => allowedVals.has(csvData.rows[i]?.[col.index] ?? ''))
    }
    if (sortConfig) {
      const col = csvData.columns.find((c) => c.canonicalId === sortConfig.canonicalId)
      if (col) {
        const dir = sortConfig.dir === 'asc' ? 1 : -1
        indices = [...indices].sort((a, b) => {
          const av = csvData.rows[a]?.[col.index] ?? ''
          const bv = csvData.rows[b]?.[col.index] ?? ''
          return dir * av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' })
        })
      }
    }

    // Header row — append (H/3) annotation for Assertiveness-Rank columns
    const headers = [
      ...(multiSource ? ['Platform'] : []),
      '#',
      ...visibleCols.map((col) => {
        let label = col.displayLabel
        if (col.expectedLevel != null && col.expectedValue != null)
          label += ` (${col.expectedLevel}/${col.expectedValue})`
        return label
      }),
    ]

    // Data rows
    const dataRows = indices.map((origIdx) => {
      const row = csvData.rows[origIdx]
      const meta = csvData.rowMeta[origIdx]
      return [
        ...(multiSource ? [meta?.platform ?? ''] : []),
        origIdx + 1,
        ...visibleCols.map((col) => row?.[col.index] ?? ''),
      ]
    })

    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows])

    // Auto column widths (cap at 40 chars)
    ws['!cols'] = headers.map((h, i) => {
      const maxLen = Math.max(
        String(h).length,
        ...dataRows.slice(0, 200).map((r) => String(r[i] ?? '').length),
      )
      return { wch: Math.min(maxLen + 2, 42) }
    })

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Data')

    const stem = selectedFiles.length === 1
      ? selectedFiles[0].replace(/\.csv$/i, '')
      : 'combined'
    XLSX.writeFile(wb, `${stem}_export.xlsx`)
  }, [csvData, activeFilterKeys, columnSearch, columnValueFilters, sortConfig, multiSource, selectedFiles])

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e]">
      {/* Header bar */}
      <div className="flex items-center gap-3 px-4 h-10 border-b border-[#3c3c3c] bg-[#252526] flex-shrink-0">
        <FileSelector files={files} selectedFiles={selectedFiles} onToggle={toggleFile} />

        {/* Platform badge — always visible once data is loaded */}
        {csvData && csvData.sources.length > 0 && (
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

        {/* Wrap toggle */}
        {csvData && (
          <label className="flex items-center gap-1.5 text-[11px] text-gray-500 cursor-pointer select-none ml-1">
            <input
              type="checkbox"
              checked={wrapText}
              onChange={(e) => setWrapText(e.target.checked)}
              className="accent-[#007acc] w-3 h-3"
            />
            Wrap
          </label>
        )}
        {/* Hide invalid rows toggle */}
        {csvData && (
          <label className="flex items-center gap-1.5 text-[11px] text-gray-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hideInvalid}
              onChange={(e) => setHideInvalid(e.target.checked)}
              className="accent-[#007acc] w-3 h-3"
            />
            <span className={hideInvalid ? 'text-[#f87171]' : undefined}>Hide invalid</span>
          </label>
        )}

        {csvData && (
          <button
            onClick={handleDownloadExcel}
            title="Download visible, filtered, sorted data as Excel"
            className="ml-auto flex items-center gap-1 px-2 py-0.5 text-[11px] text-[#007acc] border border-[#007acc] rounded hover:bg-[#007acc] hover:text-white transition-colors"
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor">
              <path d="M5.5 7.5 L2 4 H4 V1 H7 V4 H9 Z"/>
              <rect x="1" y="9" width="9" height="1.2" rx="0.5"/>
            </svg>
            Export
          </button>
        )}

        {csvData && (
          <span className="text-[11px] text-gray-500">
            {filteredRowCount !== csvData.totalRows ? (
              <span>
                <span className="text-gray-300">{filteredRowCount}</span>
                {' / '}
              </span>
            ) : null}
            {csvData.totalRows} rows · {visibleColumnCount} / {csvData.columns.length} cols
            {sortConfig && (
              <span className="ml-2 text-[#007acc]">
                sorted {sortConfig.dir === 'asc' ? '↑' : '↓'}
              </span>
            )}
            {columnValueFilters.size > 0 && (
              <button
                onClick={() => setColumnValueFilters(new Map())}
                className="ml-2 text-[#ffb74d] hover:underline"
                title="Clear all value filters"
              >
                ✕ {columnValueFilters.size} filter{columnValueFilters.size !== 1 ? 's' : ''}
              </button>
            )}
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
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
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
              sortConfig={sortConfig}
              onSortChange={setSortConfig}
              columnValueFilters={columnValueFilters}
              onColumnValueFilterChange={handleColumnValueFilterChange}
              wrapText={wrapText}
              hideInvalid={hideInvalid}
            />
          )}
        </div>
      </div>
    </div>
  )
}
