import type { CSVData } from '../types'

export async function fetchFiles(): Promise<string[]> {
  const res = await fetch('/api/files')
  if (!res.ok) throw new Error('Failed to fetch file list')
  const data = await res.json()
  return data.files as string[]
}

export async function fetchCSVData(filename: string): Promise<CSVData> {
  const res = await fetch(`/api/data/${encodeURIComponent(filename)}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? 'Failed to load CSV')
  }
  return res.json() as Promise<CSVData>
}
