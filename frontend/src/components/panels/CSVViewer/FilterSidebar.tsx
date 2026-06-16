import type { QuestionGroup } from '../../../types'

interface FilterSidebarProps {
  questionGroups: QuestionGroup[]
  activeGroupIds: Set<string>
  onToggleGroup: (groupId: string) => void
  onSelectAll: () => void
  onClearAll: () => void
  columnSearch: string
  onColumnSearchChange: (value: string) => void
}

export function FilterSidebar({
  questionGroups,
  activeGroupIds,
  onToggleGroup,
  onSelectAll,
  onClearAll,
  columnSearch,
  onColumnSearchChange,
}: FilterSidebarProps) {
  const totalVisible = questionGroups
    .filter((g) => activeGroupIds.has(g.id))
    .reduce((sum, g) => sum + g.colIds.length, 0)

  return (
    <div className="w-52 flex-shrink-0 bg-[#252526] border-r border-[#3c3c3c] flex flex-col h-full">
      <div className="px-3 pt-3 pb-2 border-b border-[#3c3c3c]">
        <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Column Groups
        </div>
        <input
          type="text"
          placeholder="Search columns…"
          value={columnSearch}
          onChange={(e) => onColumnSearchChange(e.target.value)}
          className="w-full bg-[#3c3c3c] text-gray-300 text-xs px-2 py-1.5 rounded border border-[#555] focus:outline-none focus:border-[#007acc] placeholder-gray-600"
        />
      </div>

      <div className="px-3 py-1.5 border-b border-[#3c3c3c] flex items-center justify-between">
        <span className="text-[10px] text-gray-500">{totalVisible} columns shown</span>
        <div className="flex gap-2">
          <button
            onClick={onSelectAll}
            className="text-[10px] text-[#007acc] hover:text-[#1b8dc4]"
          >
            All
          </button>
          <span className="text-gray-600 text-[10px]">|</span>
          <button
            onClick={onClearAll}
            className="text-[10px] text-[#007acc] hover:text-[#1b8dc4]"
          >
            None
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {questionGroups.map((group) => {
          const checked = activeGroupIds.has(group.id)
          return (
            <label
              key={group.id}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-[#2a2d2e] cursor-pointer select-none"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggleGroup(group.id)}
                className="accent-[#007acc] w-3 h-3 flex-shrink-0"
              />
              <span className="text-xs text-gray-300 flex-1 truncate">
                {group.label}
              </span>
              <span className="text-[10px] text-gray-600 flex-shrink-0">
                {group.colIds.length}
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
