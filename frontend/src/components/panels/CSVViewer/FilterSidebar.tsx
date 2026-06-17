import { useState, useCallback, useRef, useEffect } from 'react'
import type { Column, QuestionGroup } from '../../../types'

function FilterIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M1.5 2.5A.5.5 0 0 1 2 2h12a.5.5 0 0 1 .354.854L10 9.207V13.5a.5.5 0 0 1-.777.416l-3-2A.5.5 0 0 1 6 11.5V9.207L1.646 2.854A.5.5 0 0 1 1.5 2.5z" />
    </svg>
  )
}

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
  collapsed: boolean
  onToggleCollapse: () => void
}

export function FilterSidebar({
  columns,
  questionGroups,
  activeFilterKeys,
  onSetFilterKeys,
  columnSearch,
  onColumnSearchChange,
  collapsed,
  onToggleCollapse,
}: FilterSidebarProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [expandedSubGroups, setExpandedSubGroups] = useState<Set<string>>(new Set())

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

  const toggleSubGroupExpand = (sgKey: string) =>
    setExpandedSubGroups((prev) => {
      const next = new Set(prev)
      next.has(sgKey) ? next.delete(sgKey) : next.add(sgKey)
      return next
    })

  const setKeys = (keys: Set<string>) => onSetFilterKeys(new Set(keys))

  const toggleKey = (key: string) => {
    const next = new Set(activeFilterKeys)
    next.has(key) ? next.delete(key) : next.add(key)
    onSetFilterKeys(next)
  }

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

  const toggleSubGroup = (key: string) => toggleKey(key)
  const toggleCol = (col: Column) => toggleKey(col.filterKey)

  const visibleCount = columns.filter((c) => activeFilterKeys.has(c.filterKey)).length

  if (collapsed) {
    return (
      <div className="w-7 flex-shrink-0 bg-[#252526] border-r border-[#3c3c3c] flex flex-col items-center pt-2">
        <button
          onClick={onToggleCollapse}
          title="Expand filter panel"
          className="text-gray-500 hover:text-gray-300 w-6 h-6 flex items-center justify-center rounded hover:bg-[#37373d]"
        >
          <FilterIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div className="w-56 flex-shrink-0 bg-[#252526] border-r border-[#3c3c3c] flex flex-col h-full">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 border-b border-[#3c3c3c]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
            Columns
          </span>
          <button
            onClick={onToggleCollapse}
            title="Collapse filter panel"
            className="text-gray-600 hover:text-gray-300 w-5 h-5 flex items-center justify-center rounded hover:bg-[#37373d]"
          >
            <FilterIcon className="w-3 h-3" />
          </button>
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

          const groupCols = columns.filter((c) => group.colIds.includes(c.colId))
          const groupKeys = [...new Set(groupCols.map((c) => c.filterKey))]
          const activeCount = groupKeys.filter((k) => activeFilterKeys.has(k)).length
          const groupChecked = activeCount === groupKeys.length && groupKeys.length > 0
          const groupIndet = activeCount > 0 && activeCount < groupKeys.length

          return (
            <div key={group.id}>
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

              {isUnit && isExpanded &&
                group.subGroups.map((sg) => {
                  const sgBaseKey = `${group.unitId}:${sg.id}`
                  const hasCategories = sg.categories && sg.categories.length > 0
                  const sgExpanded = expandedSubGroups.has(sgBaseKey)

                  if (hasCategories) {
                    // Quant sub-group: parent checkbox controls all 4 category filter keys
                    const catKeys = sg.categories!.map((cat) => `${sgBaseKey}:${cat.id}`)
                    const activeCatCount = catKeys.filter((k) => activeFilterKeys.has(k)).length
                    const sgCatChecked = activeCatCount === catKeys.length && catKeys.length > 0
                    const sgCatIndet = activeCatCount > 0 && activeCatCount < catKeys.length

                    const toggleSgCats = () => {
                      const next = new Set(activeFilterKeys)
                      if (sgCatChecked) {
                        catKeys.forEach((k) => next.delete(k))
                      } else {
                        catKeys.forEach((k) => next.add(k))
                      }
                      onSetFilterKeys(next)
                    }

                    return (
                      <div key={sg.id}>
                        <div className="flex items-center gap-1.5 pl-8 pr-3 py-1 hover:bg-[#2a2d2e] select-none">
                          <Tri checked={sgCatChecked} indeterminate={sgCatIndet} onChange={toggleSgCats} />
                          <button
                            onClick={() => toggleSubGroupExpand(sgBaseKey)}
                            className="text-gray-500 hover:text-gray-300 w-3 text-[10px] flex-shrink-0"
                          >
                            {sgExpanded ? '▾' : '▸'}
                          </button>
                          <span
                            className="text-[11px] text-gray-400 flex-1 truncate cursor-pointer"
                            onClick={toggleSgCats}
                          >
                            {sg.label}
                          </span>
                          <span className="text-[10px] text-gray-600 flex-shrink-0">{sg.colIds.length}</span>
                        </div>
                        {sgExpanded && sg.categories!.map((cat) => {
                          const catKey = `${sgBaseKey}:${cat.id}`
                          const catChecked = activeFilterKeys.has(catKey)
                          return (
                            <label
                              key={cat.id}
                              className="flex items-center gap-2 pl-14 pr-3 py-0.5 hover:bg-[#2a2d2e] cursor-pointer select-none"
                            >
                              <input
                                type="checkbox"
                                checked={catChecked}
                                onChange={() => toggleKey(catKey)}
                                className="accent-[#007acc] w-3 h-3 flex-shrink-0"
                              />
                              <span className="text-[10px] text-gray-500 flex-1 truncate">{cat.label}</span>
                              <span className="text-[10px] text-gray-600 flex-shrink-0">{cat.colIds.length}</span>
                            </label>
                          )
                        })}
                      </div>
                    )
                  }

                  // Non-Quant sub-group: single checkbox (Impression, Rank, Summary, etc.)
                  const sgChecked = activeFilterKeys.has(sgBaseKey)
                  return (
                    <label
                      key={sg.id}
                      className="flex items-center gap-2 pl-8 pr-3 py-1 hover:bg-[#2a2d2e] cursor-pointer select-none"
                    >
                      <input
                        type="checkbox"
                        checked={sgChecked}
                        onChange={() => toggleSubGroup(sgBaseKey)}
                        className="accent-[#007acc] w-3 h-3 flex-shrink-0"
                      />
                      <span className="text-[11px] text-gray-400 flex-1 truncate">{sg.label}</span>
                      <span className="text-[10px] text-gray-600 flex-shrink-0">{sg.colIds.length}</span>
                    </label>
                  )
                })}

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
                      <span className="text-[11px] text-gray-400 flex-1 truncate">{col.displayLabel}</span>
                    </label>
                  )
                })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
