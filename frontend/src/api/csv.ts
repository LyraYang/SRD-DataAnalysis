import type { CSVData } from '../types'

export async function fetchFiles(): Promise<string[]> {
  const res = await fetch('/api/files')
  if (!res.ok) throw new Error('Failed to fetch file list')
  const data = await res.json()
  return data.files as string[]
}

export async function uploadCSV(file: File): Promise<string> {
  const res = await fetch(`/api/upload?filename=${encodeURIComponent(file.name)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: file,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error((err as { detail?: string }).detail ?? 'Upload failed')
  }
  const data = await res.json() as { filename: string }
  return data.filename
}

export async function fetchCombinedData(filenames: string[]): Promise<CSVData> {
  const param = filenames.map(encodeURIComponent).join(',')
  const res = await fetch(`/api/data/combined?files=${param}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? 'Failed to load CSV data')
  }
  return res.json() as Promise<CSVData>
}
