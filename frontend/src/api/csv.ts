import type { CSVData } from '../types'

export async function fetchFiles(): Promise<string[]> {
  const res = await fetch('/api/files')
  if (!res.ok) throw new Error('Failed to fetch file list')
  const data = await res.json()
  return data.files as string[]
}

export async function uploadCSV(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file, file.name)
  const res = await fetch('/api/upload', {
    method: 'POST',
    body: form,
    // No Content-Type header — browser sets it with the correct multipart boundary
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error((err as { detail?: string }).detail ?? 'Upload failed')
  }
  const data = await res.json() as { filename: string }
  return data.filename
}

export async function deleteFile(filename: string): Promise<void> {
  const res = await fetch(`/api/files/${encodeURIComponent(filename)}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete file')
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
