import { useState, useEffect, useRef } from 'react'
import { PLATFORM_COLORS } from '../../../types'

function platformOf(filename: string): 'Sona' | 'Prolific' {
  return filename.toLowerCase().includes('prolific') ? 'Prolific' : 'Sona'
}

interface FileSelectorProps {
  files: string[]
  selectedFiles: string[]
  onToggle: (filename: string) => void
  onDelete?: (filename: string) => void
  onUpload?: (file: File) => void
}

export function FileSelector({ files, selectedFiles, onToggle, onDelete, onUpload }: FileSelectorProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  // Stable unique ID so the label→input link works even with multiple FileSelector instances
  const uploadId = useRef(`csv-upload-${Math.random().toString(36).slice(2, 8)}`).current

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const label =
    selectedFiles.length === 0
      ? 'Select file(s)…'
      : selectedFiles.length === 1
      ? selectedFiles[0]
      : `${selectedFiles.length} files selected`

  return (
    <div className="flex items-center gap-1">
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 bg-[#3c3c3c] hover:bg-[#4a4a4a] border border-[#555] rounded px-3 py-1 text-xs text-gray-300 min-w-[180px] max-w-[320px]"
        >
          <span className="flex-1 truncate text-left">{label}</span>
          <span className="text-gray-500 flex-shrink-0">{open ? '▲' : '▼'}</span>
        </button>

        {open && (
          <div className="absolute top-full left-0 mt-1 z-50 bg-[#252526] border border-[#3c3c3c] rounded shadow-xl min-w-[300px] py-1">
            {files.length === 0 && (
              <div className="px-3 py-2 text-xs text-gray-500">No CSV files found in data/</div>
            )}
            {files.map((f) => {
              const platform = platformOf(f)
              const color = PLATFORM_COLORS[platform]
              return (
                <div
                  key={f}
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-[#2a2d2e] group"
                >
                  <input
                    type="checkbox"
                    checked={selectedFiles.includes(f)}
                    onChange={() => onToggle(f)}
                    className="accent-[#007acc] w-3 h-3 flex-shrink-0 cursor-pointer"
                  />
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                  <span
                    className="text-xs text-gray-300 truncate flex-1 cursor-pointer select-none"
                    onClick={() => onToggle(f)}
                  >
                    {f}
                  </span>
                  <span className="text-[10px] flex-shrink-0" style={{ color }}>{platform}</span>
                  {onDelete && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(f) }}
                      title={`Delete ${f}`}
                      className="flex-shrink-0 opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center text-[10px] text-gray-600 hover:text-[#f87171] hover:bg-[#3c3c3c] rounded transition-all"
                    >
                      ✕
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {onUpload && (
        <>
          {/* sr-only keeps the input in the DOM so the label click reliably opens the picker */}
          <input
            id={uploadId}
            type="file"
            accept=".csv"
            multiple
            className="sr-only"
            onChange={(e) => {
              Array.from(e.target.files ?? []).forEach((f) => onUpload(f))
              e.target.value = ''
            }}
          />
          <label
            htmlFor={uploadId}
            title="Add CSV file from disk"
            className="flex items-center justify-center w-6 h-6 rounded bg-[#3c3c3c] hover:bg-[#007acc] border border-[#555] hover:border-[#007acc] text-gray-400 hover:text-white transition-colors cursor-pointer text-base leading-none pb-px select-none"
          >
            +
          </label>
        </>
      )}
    </div>
  )
}
