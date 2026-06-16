import { useState, useCallback, useRef, useEffect } from 'react'
import type { Column, QuestionGroup } from '../../../types'

// Checkbox that supports indeterminate state
function Tri({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean
  indeterminate: boolean
  onChange: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className="accent-[#007acc] w-3 h-3 flex-shrink-0 cursor-pointer"
    />
  )
}

interface FilterSidebarProps {
  columns: Column[]
  questionGroups: QuestionGroup[]
  activeFilterKeys: Set<string>
  onSetFilterKeys: (keys: Set<string>) => void
  columnSearch: string
  onColumnSearchChange: (v: string) => void
}

export function FilterSidebar({
  columns,
  questionGroups,
  activeFilterKeys,
  onSetFilterKeys,
  columnSearch,
  onColumnSearchChange,
}: FilterSidebarProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const allFilterKeys = useCallback(
    () => new Set(columns.map((c) => c.filterKey)),
    [columns],
  )

  const toggleExpand = (gid: string) =>
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      next.has(gid) ? next.delete(gid) : next.add(gid)
      return next
    })

  const setKeys = (keys: Set<string>) => onSetFilterKeys(new Set(keys))

  // Toggle a single filter key
  const toggleKey = (key: string) => {
    const next = new Set(activeFilterKeys)
    next.has(key) ? next.delete(key) : next.add(key)
    onSetFilterKeys(next)
  }

  // Toggle all filter keys belonging to a group
  const toggleGroupKeys = (groupColIds: string[]) => {
    const groupCols = columns.filter((c) => groupColIds.includes(c.colId))
    const keys = [...new Set(groupCols.map((c) => c.filterKey))]
    const allActive = keys.every((k) => activeFilterKeys.has(k))
    const next = new Set(activeFilterKeys)
    if (allActive) {
      keys.forEach((k) => next.delete(k))
    } else {
      keys.forEach((k) => next.add(k))
    }
    onSetFilterKeys(next)
  }

  // Toggle a sub-group filter key
  const toggleSubGroup = (key: string) => toggleKey(key)

  // Toggle an individual column's filter key
  const toggleCol = (col: Column) => toggleKey(col.filterKey)

  const visibleCount = columns.filter((c) => activeFilterKeys.has(c.filterKey)).length

  return (
    <div className="w-56 flex-shrink-0 bg-[#252526] border-r border-[#3c3c3c] flex flex-col h-full">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 border-b border-[#3c3c3c]">
        <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Columns
        </div>
        <input
          type="text"
          placeholder="Search columns…"
          value={columnSearch}
          onChange={(e) => onColumnSearchChange(e.target.value)}
          className="w-full bg-[#3c3c3c] text-gray-300 text-xs px-2 py-1.5 rounded border border-[#555] focus:outline-none focus:border-[#007acc] placeholder-gray-600"
        />
      </div>

      {/* Global controls */}
      <div className="px-3 py-1.5 border-b border-[#3c3c3c] flex items-center justify-between">
        <span className="text-[10px] text-gray-500">{visibleCount} shown</span>
        <div className="flex gap-2">
          <button
            onClick={() => setKeys(allFilterKeys())}
            className="text-[10px] text-[#007acc] hover:text-[#1b8dc4]"
          >
            All
          </button>
          <span className="text-gray-600 text-[10px]">|</span>
          <button
            onClick={() => setKeys(new Set())}
            className="text-[10px] text-[#007acc] hover:text-[#1b8dc4]"
          >
            None
          </button>
        </div>
      </div>

      {/* Group list */}
      <div className="flex-1 overflow-y-auto py-1">
        {questionGroups.map((group) => {
          const isUnit = group.unitId != null
          const isExpanded = expandedGroups.has(group.id)

          // Determine group check state
          const groupCols = columns.filter((c) => group.colIds.includes(c.colId))
          const groupKeys = [...new Set(groupCols.map((c) => c.filterKey))]
          const activeCount = groupKeys.filter((k) => activeFilterKeys.has(k)).length
          const groupChecked = activeCount === groupKeys.length && groupKeys.length > 0
          const groupIndet = activeCount > 0 && activeCount < groupKeys.length

          return (
            <div key={group.id}>
              {/* Group header row */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-[#2a2d2e] select-none">
                <Tri
                  checked={groupChecked}
                  indeterminate={groupIndet}
                  onChange={() => toggleGroupKeys(group.colIds)}
                />
                {(isUnit || group.id === 'Metadata' || group.id === 'Pre-Survey') && (
                  <button
                    onClick={() => toggleExpand(group.id)}
                    className="text-gray-500 hover:text-gray-300 w-3 text-[10px] flex-shrink-0"
                  >
                    {isExpanded ? '▾' : '▸'}
                  </button>
                )}
                <span
                  className="text-xs text-gray-300 flex-1 truncate cursor-pointer"
                  onClick={() => toggleGroupKeys(group.colIds)}
                >
                  {group.label}
                </span>
                <span className="text-[10px] text-gray-600 flex-shrink-0">
                  {group.colIds.length}
                </span>
              </div>

              {/* Unit group: show sub-group checkboxes when expanded */}
              {isUnit && isExpanded && group.subGroups.map((sg) => {
                const sgKey = `${group.unitId}:${sg.id}`
                const sgChecked = activeFilterKeys.has(sgKey)
                return (
                  <label
                    key={sg.id}
                    className="flex items-center gap-2 pl-8 pr-3 py-1 hover:bg-[#2a2d2e] cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      checked={sgChecked}
                      onChange={() => toggleSubGroup(sgKey)}
                      className="accent-[#007acc] w-3 h-3 flex-shrink-0"
                    />
                    <span className="text-[11px] text-gray-400 flex-1 truncate">{sg.label}</span>
                    <span className="text-[10px] text-gray-600 flex-shrink-0">{sg.colIds.length}</span>
                  </label>
                )
              })}

              {/* Metadata / Pre-Survey: show individual column checkboxes when expanded */}
              {!isUnit && isExpanded && (group.id === 'Metadata' || group.id === 'Pre-Survey') &&
                groupCols.map((col) => {
                  const colChecked = activeFilterKeys.has(col.filterKey)
                  return (
                    <label
                      key={col.colId}
                      className="flex items-center gap-2 pl-8 pr-3 py-1 hover:bg-[#2a2d2e] cursor-pointer select-none"
                      title={col.label}
                    >
                      <input
                        type="checkbox"
                        checked={colChecked}
                        onChange={() => toggleCol(col)}
                        className="accent-[#007acc] w-3 h-3 flex-shrink-0"
                      />
                      <span className="text-[11px] text-gray-400 flex-1 truncate">{col.qId}</span>
                    </label>
                  )
                })
              }
            </div>
          )
        })}
      </div>
    </div>
  )
}
