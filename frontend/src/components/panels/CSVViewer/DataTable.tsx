import { useRef, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Column, RowMeta } from '../../../types'
import { PLATFORM_COLORS } from '../../../types'

interface DataTableProps {
  columns: Column[]
  rows: string[][]
  rowMeta: RowMeta[]
  activeFilterKeys: Set<string>
  columnSearch: string
  multiSource: boolean
}

export function DataTable({
  columns,
  rows,
  rowMeta,
  activeFilterKeys,
  columnSearch,
  multiSource,
}: DataTableProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const visibleColumns = useMemo(() => {
    const search = columnSearch.toLowerCase()
    return columns.filter((col) => {
      if (!activeFilterKeys.has(col.filterKey)) return false
      if (!search) return true
      return (
        col.qId.toLowerCase().includes(search) ||
        col.canonicalLabel.toLowerCase().includes(search) ||
        col.canonicalId.toLowerCase().includes(search)
      )
    })
  }, [columns, activeFilterKeys, columnSearch])

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
    virtualItems.length > 0 ? totalHeight - virtualItems[virtualItems.length - 1].end : 0

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
            {multiSource && (
              <th className="sticky left-0 z-30 w-2 min-w-[0.5rem] border border-[#3c3c3c] bg-[#2d2d30]" />
            )}
            <th className="sticky left-0 z-30 w-10 min-w-[2.5rem] border border-[#3c3c3c] bg-[#2d2d30] px-2 py-2 text-center text-gray-500">
              #
            </th>
            {visibleColumns.map((col) => (
              <th
                key={col.colId}
                title={col.label}
                className="min-w-[9rem] max-w-[14rem] border border-[#3c3c3c] bg-[#2d2d30] px-2 py-1.5 text-left"
              >
                <div className="truncate font-semibold text-gray-200 text-[10px]">
                  {col.unitId
                    ? `${col.unitId} · ${col.subGroup}${col.subKey ? ' ' + col.subKey : ''}`
                    : col.qId}
                </div>
                <div className="mt-0.5 truncate text-[10px] text-gray-500">
                  {col.canonicalLabel.length > 55
                    ? col.canonicalLabel.slice(0, 55) + '…'
                    : col.canonicalLabel}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {paddingTop > 0 && (
            <tr>
              <td style={{ height: paddingTop }} colSpan={visibleColumns.length + (multiSource ? 2 : 1)} />
            </tr>
          )}
          {virtualItems.map((vRow) => {
            const row = rows[vRow.index]
            const meta = rowMeta[vRow.index]
            const isEven = vRow.index % 2 === 0
            const rowBg = isEven ? '#1e1e1e' : '#252526'
            const platformColor = meta ? PLATFORM_COLORS[meta.platform] : undefined

            return (
              <tr key={vRow.index} style={{ height: 36, backgroundColor: rowBg }}>
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
              <td style={{ height: paddingBottom }} colSpan={visibleColumns.length + (multiSource ? 2 : 1)} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
