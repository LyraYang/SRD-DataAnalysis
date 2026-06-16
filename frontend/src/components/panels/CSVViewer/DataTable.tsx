import { useRef, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Column } from '../../../types'

interface DataTableProps {
  columns: Column[]
  rows: string[][]
  activeGroupIds: Set<string>
  columnSearch: string
}

export function DataTable({ columns, rows, activeGroupIds, columnSearch }: DataTableProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const visibleColumns = useMemo(() => {
    const search = columnSearch.toLowerCase()
    return columns.filter((col) => {
      if (!activeGroupIds.has(col.groupId)) return false
      if (!search) return true
      return (
        col.qId.toLowerCase().includes(search) ||
        col.label.toLowerCase().includes(search)
      )
    })
  }, [columns, activeGroupIds, columnSearch])

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 36,
    overscan: 8,
  })

  const virtualItems = rowVirtualizer.getVirtualItems()
  const totalHeight = rowVirtualizer.getTotalSize()
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0
  const paddingBottom =
    virtualItems.length > 0
      ? totalHeight - virtualItems[virtualItems.length - 1].end
      : 0

  if (visibleColumns.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-500">
        No columns selected — enable groups in the filter panel.
      </div>
    )
  }

  return (
    <div ref={containerRef} className="h-full overflow-auto">
      <table
        className="border-collapse text-xs"
        style={{ minWidth: 'max-content', tableLayout: 'auto' }}
      >
        <thead className="sticky top-0 z-20">
          <tr>
            {/* Row number */}
            <th className="sticky left-0 z-30 w-10 min-w-[2.5rem] border border-[#3c3c3c] bg-[#2d2d30] px-2 py-2 text-center text-gray-500">
              #
            </th>
            {visibleColumns.map((col) => (
              <th
                key={col.colId}
                title={col.label}
                className="min-w-[9rem] max-w-[14rem] border border-[#3c3c3c] bg-[#2d2d30] px-2 py-1.5 text-left"
              >
                <div className="truncate font-semibold text-gray-200">{col.qId}</div>
                <div className="mt-0.5 truncate text-[10px] text-gray-500">
                  {col.label.length > 55 ? col.label.slice(0, 55) + '…' : col.label}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {paddingTop > 0 && (
            <tr>
              <td style={{ height: paddingTop }} colSpan={visibleColumns.length + 1} />
            </tr>
          )}
          {virtualItems.map((vRow) => {
            const row = rows[vRow.index]
            const isEven = vRow.index % 2 === 0
            const rowBg = isEven ? '#1e1e1e' : '#252526'
            return (
              <tr key={vRow.index} style={{ height: 36, backgroundColor: rowBg }}>
                <td
                  className="sticky left-0 z-10 border border-[#3c3c3c] px-2 text-center text-gray-600"
                  style={{ backgroundColor: rowBg }}
                >
                  {vRow.index + 1}
                </td>
                {visibleColumns.map((col) => {
                  const cell = row?.[col.index] ?? ''
                  return (
                    <td
                      key={col.colId}
                      title={cell}
                      className="border border-[#3c3c3c] px-2 text-gray-300 max-w-[14rem]"
                    >
                      <div className="truncate">{cell}</div>
                    </td>
                  )
                })}
              </tr>
            )
          })}
          {paddingBottom > 0 && (
            <tr>
              <td style={{ height: paddingBottom }} colSpan={visibleColumns.length + 1} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
