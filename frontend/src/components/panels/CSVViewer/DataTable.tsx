import { useRef, useMemo, useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Column, RowMeta, SortConfig } from '../../../types'
import { PLATFORM_COLORS } from '../../../types'

interface DataTableProps {
  columns: Column[]
  rows: string[][]
  rowMeta: RowMeta[]
  activeFilterKeys: Set<string>
  columnSearch: string
  multiSource: boolean
  sortConfig: SortConfig | null
  onSortChange: (config: SortConfig | null) => void
  columnValueFilters: Map<string, Set<string>>
  onColumnValueFilterChange: (canonicalId: string, values: Set<string> | null) => void
  wrapText: boolean
}

export function DataTable({
  columns,
  rows,
  rowMeta,
  activeFilterKeys,
  columnSearch,
  multiSource,
  sortConfig,
  onSortChange,
  columnValueFilters,
  onColumnValueFilterChange,
  wrapText,
}: DataTableProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [openFilterColId, setOpenFilterColId] = useState<string | null>(null)
  const [filterDropdownPos, setFilterDropdownPos] = useState({ x: 0, y: 0 })
  const [filterSearch, setFilterSearch] = useState('')

  const visibleColumns = useMemo(() => {
    const search = columnSearch.toLowerCase()
    return columns.filter((col) => {
      if (!activeFilterKeys.has(col.filterKey)) return false
      if (!search) return true
      return (
        col.displayLabel.toLowerCase().includes(search) ||
        col.canonicalLabel.toLowerCase().includes(search) ||
        col.qId.toLowerCase().includes(search)
      )
    })
  }, [columns, activeFilterKeys, columnSearch])

  // Filtered + sorted row indices
  const filteredSortedIndices = useMemo(() => {
    let indices = Array.from({ length: rows.length }, (_, i) => i)

    for (const [canonicalId, allowedVals] of columnValueFilters) {
      if (allowedVals.size === 0) return []
      const col = columns.find((c) => c.canonicalId === canonicalId)
      if (!col) continue
      indices = indices.filter((i) => allowedVals.has(rows[i]?.[col.index] ?? ''))
    }

    if (sortConfig) {
      const col = columns.find((c) => c.canonicalId === sortConfig.canonicalId)
      if (col) {
        const dir = sortConfig.dir === 'asc' ? 1 : -1
        indices = [...indices].sort((a, b) => {
          const av = rows[a]?.[col.index] ?? ''
          const bv = rows[b]?.[col.index] ?? ''
          return dir * av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' })
        })
      }
    }

    return indices
  }, [rows, columns, columnValueFilters, sortConfig])

  // Unique values for the currently open filter column
  const uniqueValues = useMemo(() => {
    if (!openFilterColId) return []
    const col = columns.find((c) => c.canonicalId === openFilterColId)
    if (!col) return []
    const vals = new Set<string>()
    for (const row of rows) vals.add(row[col.index] ?? '')
    return Array.from(vals).sort((a, b) => {
      if (a === '' && b !== '') return 1
      if (b === '' && a !== '') return -1
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    })
  }, [openFilterColId, columns, rows])

  const filteredUniqueValues = useMemo(() => {
    if (!filterSearch) return uniqueValues
    const lower = filterSearch.toLowerCase()
    return uniqueValues.filter((v) => v.toLowerCase().includes(lower))
  }, [uniqueValues, filterSearch])

  // Virtualizer — disabled (count=0) when wrapText is on
  const rowVirtualizer = useVirtualizer({
    count: wrapText ? 0 : filteredSortedIndices.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 36,
    overscan: 8,
  })

  const virtualItems = rowVirtualizer.getVirtualItems()
  const totalHeight = rowVirtualizer.getTotalSize()
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0
  const paddingBottom =
    virtualItems.length > 0 ? totalHeight - virtualItems[virtualItems.length - 1].end : 0

  // Close value-filter dropdown on outside click or Escape
  useEffect(() => {
    if (!openFilterColId) return
    const handleMouse = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest('[data-filter-dropdown]') && !t.closest('[data-filter-btn]'))
        setOpenFilterColId(null)
    }
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenFilterColId(null) }
    document.addEventListener('mousedown', handleMouse)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleMouse)
      document.removeEventListener('keydown', handleKey)
    }
  }, [openFilterColId])

  const handleSortClick = useCallback(
    (col: Column) => {
      if (!sortConfig || sortConfig.canonicalId !== col.canonicalId) {
        onSortChange({ canonicalId: col.canonicalId, dir: 'asc' })
      } else if (sortConfig.dir === 'asc') {
        onSortChange({ canonicalId: col.canonicalId, dir: 'desc' })
      } else {
        onSortChange(null)
      }
    },
    [sortConfig, onSortChange],
  )

  const handleFilterBtnClick = useCallback(
    (col: Column, e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation()
      if (openFilterColId === col.canonicalId) { setOpenFilterColId(null); return }
      const rect = e.currentTarget.getBoundingClientRect()
      setFilterDropdownPos({ x: rect.left, y: rect.bottom + 2 })
      setOpenFilterColId(col.canonicalId)
      setFilterSearch('')
    },
    [openFilterColId],
  )

  const isValueChecked = (val: string) => {
    if (!openFilterColId) return true
    const filter = columnValueFilters.get(openFilterColId)
    return filter === undefined || filter.has(val)
  }

  const toggleValue = (val: string) => {
    if (!openFilterColId) return
    const current = columnValueFilters.get(openFilterColId)
    if (current === undefined) {
      const newSet = new Set(uniqueValues)
      newSet.delete(val)
      onColumnValueFilterChange(openFilterColId, newSet)
    } else {
      const newSet = new Set(current)
      newSet.has(val) ? newSet.delete(val) : newSet.add(val)
      onColumnValueFilterChange(openFilterColId, newSet)
    }
  }

  if (visibleColumns.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-500">
        No columns selected — enable groups in the filter panel.
      </div>
    )
  }

  const colSpanTotal = visibleColumns.length + (multiSource ? 2 : 1)

  const renderRow = (origIdx: number, visIdx: number) => {
    const row = rows[origIdx]
    const meta = rowMeta[origIdx]
    const isEven = visIdx % 2 === 0
    const rowBg = isEven ? '#1e1e1e' : '#252526'
    const platformColor = meta ? PLATFORM_COLORS[meta.platform] : undefined
    return (
      <tr
        key={origIdx}
        style={wrapText ? { backgroundColor: rowBg } : { height: 36, backgroundColor: rowBg }}
      >
        {multiSource && (
          <td
            className="border border-[#3c3c3c] p-0 w-1"
            style={{ backgroundColor: platformColor ?? rowBg }}
            title={meta?.platform}
          />
        )}
        <td
          className="sticky left-0 z-10 border border-[#3c3c3c] px-2 text-center text-gray-600"
          style={{ backgroundColor: rowBg }}
        >
          {origIdx + 1}
        </td>
        {visibleColumns.map((col) => {
          const cell = row?.[col.index] ?? ''
          return (
            <td
              key={col.colId}
              title={cell}
              className="border border-[#3c3c3c] px-2 text-gray-300 max-w-[14rem]"
            >
              {wrapText ? (
                <div className="whitespace-normal break-words py-1 text-[11px]">{cell}</div>
              ) : (
                <div className="truncate">{cell}</div>
              )}
            </td>
          )
        })}
      </tr>
    )
  }

  return (
    <>
      <div ref={containerRef} className="h-full overflow-auto">
        <table
          className="border-collapse text-xs"
          style={{ minWidth: 'max-content', tableLayout: 'auto' }}
        >
          <thead className="sticky top-0 z-20">
            <tr>
              {multiSource && (
                <th className="sticky left-0 z-30 w-2 min-w-[0.5rem] border border-[#3c3c3c] bg-[#2d2d30]" />
              )}
              <th className="sticky left-0 z-30 w-10 min-w-[2.5rem] border border-[#3c3c3c] bg-[#2d2d30] px-2 py-2 text-center text-gray-500">
                #
              </th>
              {visibleColumns.map((col) => {
                const isActiveSort = sortConfig?.canonicalId === col.canonicalId
                const hasFilter =
                  columnValueFilters.has(col.canonicalId) &&
                  (columnValueFilters.get(col.canonicalId)?.size ?? 0) > 0
                const isFilterOpen = openFilterColId === col.canonicalId
                const subtitle =
                  col.canonicalLabel && col.canonicalLabel !== col.displayLabel
                    ? col.canonicalLabel
                    : null
                return (
                  <th
                    key={col.colId}
                    title={col.label}
                    className="min-w-[9rem] max-w-[14rem] border border-[#3c3c3c] bg-[#2d2d30] px-2 py-1.5 text-left group"
                  >
                    <div className="flex items-start gap-0.5">
                      <button
                        onClick={() => handleSortClick(col)}
                        className="flex-1 text-left min-w-0"
                      >
                        <div className="flex items-center gap-1">
                          <span className="truncate font-semibold text-gray-200 text-[10px]">
                            {col.displayLabel}
                          </span>
                          {isActiveSort && (
                            <span className="text-[#007acc] text-[10px] flex-shrink-0">
                              {sortConfig?.dir === 'asc' ? '↑' : '↓'}
                            </span>
                          )}
                        </div>
                        {subtitle && (
                          <div className="mt-0.5 truncate text-[9px] text-gray-500 font-normal">
                            {subtitle.length > 60 ? subtitle.slice(0, 60) + '…' : subtitle}
                          </div>
                        )}
                      </button>
                      <button
                        data-filter-btn=""
                        onClick={(e) => handleFilterBtnClick(col, e)}
                        title="Filter by value"
                        style={{ opacity: hasFilter || isFilterOpen ? 1 : undefined }}
                        className={`flex-shrink-0 opacity-0 group-hover:opacity-100 text-[11px] w-4 h-4 flex items-center justify-center rounded mt-0.5 ${
                          hasFilter || isFilterOpen
                            ? 'text-[#007acc]'
                            : 'text-gray-500 hover:text-gray-300'
                        }`}
                      >
                        ▾
                      </button>
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {wrapText ? (
              filteredSortedIndices.map((origIdx, visIdx) => renderRow(origIdx, visIdx))
            ) : (
              <>
                {paddingTop > 0 && (
                  <tr><td style={{ height: paddingTop }} colSpan={colSpanTotal} /></tr>
                )}
                {virtualItems.map((vRow) =>
                  renderRow(filteredSortedIndices[vRow.index], vRow.index),
                )}
                {paddingBottom > 0 && (
                  <tr><td style={{ height: paddingBottom }} colSpan={colSpanTotal} /></tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>

      {openFilterColId &&
        createPortal(
          <div
            data-filter-dropdown=""
            style={{
              position: 'fixed',
              left: filterDropdownPos.x,
              top: filterDropdownPos.y,
              zIndex: 9999,
              minWidth: '200px',
              maxWidth: '300px',
            }}
            className="bg-[#2d2d30] border border-[#555] rounded shadow-2xl text-xs"
          >
            <div className="p-2 border-b border-[#3c3c3c]">
              <input
                type="text"
                autoFocus
                placeholder="Search values…"
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                className="w-full bg-[#3c3c3c] text-gray-300 text-[11px] px-2 py-1 rounded border border-[#555] focus:outline-none focus:border-[#007acc]"
              />
            </div>
            <div className="flex items-center justify-between px-2 py-1.5 border-b border-[#3c3c3c]">
              <span className="text-[10px] text-gray-500">
                {uniqueValues.length} unique value{uniqueValues.length !== 1 ? 's' : ''}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => onColumnValueFilterChange(openFilterColId, null)}
                  className="text-[10px] text-[#007acc] hover:underline"
                >
                  Select All
                </button>
                <button
                  onClick={() => onColumnValueFilterChange(openFilterColId, new Set())}
                  className="text-[10px] text-[#007acc] hover:underline"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto py-1">
              {filteredUniqueValues.length === 0 ? (
                <div className="px-3 py-2 text-[11px] text-gray-500">No matches</div>
              ) : (
                filteredUniqueValues.map((val) => (
                  <label
                    key={val === '' ? '__empty__' : val}
                    className="flex items-center gap-2 px-3 py-1 hover:bg-[#37373d] cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      checked={isValueChecked(val)}
                      onChange={() => toggleValue(val)}
                      className="accent-[#007acc] w-3 h-3 flex-shrink-0"
                    />
                    <span className="text-[11px] text-gray-300 truncate flex-1">
                      {val === '' ? (
                        <span className="text-gray-500 italic">(empty)</span>
                      ) : (
                        val
                      )}
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
