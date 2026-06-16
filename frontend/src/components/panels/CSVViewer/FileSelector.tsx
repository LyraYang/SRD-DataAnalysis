interface FileSelectorProps {
  files: string[]
  selectedFile: string | null
  onSelect: (file: string) => void
}

export function FileSelector({ files, selectedFile, onSelect }: FileSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-400">File:</span>
      <select
        value={selectedFile ?? ''}
        onChange={(e) => e.target.value && onSelect(e.target.value)}
        className="bg-[#3c3c3c] text-gray-200 text-xs px-2 py-1 rounded border border-[#555] focus:outline-none focus:border-[#007acc] min-w-[200px] max-w-[400px]"
      >
        <option value="">— select a CSV file —</option>
        {files.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>
      {files.length === 0 && (
        <span className="text-xs text-yellow-500">
          No CSV files found in /data
        </span>
      )}
    </div>
  )
}
