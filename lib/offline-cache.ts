export type OfflineSnapshotItem = {
  id: string
  nome: string
  subtitulo?: string
  detalhe?: string
  estoque?: string
}

export type OfflineSnapshot = {
  version: 1
  updatedAt: string
  materiais: OfflineSnapshotItem[]
  produtos: OfflineSnapshotItem[]
}

const SNAPSHOT_KEY = 'exclusiva-fe:offline-snapshot:v1'
const LEGACY_SNAPSHOT_KEY = 'exclusiv-art:offline-snapshot:v1'
export const OFFLINE_SNAPSHOT_UPDATED_EVENT = 'exclusiva-fe:offline-snapshot-updated'
const MAX_ITEMS = 120

function isBrowser() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function getEmptySnapshot(): OfflineSnapshot {
  return {
    version: 1,
    updatedAt: new Date(0).toISOString(),
    materiais: [],
    produtos: [],
  }
}

export function readOfflineSnapshot(): OfflineSnapshot {
  if (!isBrowser()) return getEmptySnapshot()

  try {
    const currentRaw = window.localStorage.getItem(SNAPSHOT_KEY)
    const legacyRaw = window.localStorage.getItem(LEGACY_SNAPSHOT_KEY)
    const raw = currentRaw ?? legacyRaw
    if (!raw) return getEmptySnapshot()

    if (!currentRaw && legacyRaw) {
      window.localStorage.setItem(SNAPSHOT_KEY, legacyRaw)
    }

    const parsed = JSON.parse(raw) as Partial<OfflineSnapshot>
    return {
      version: 1,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(0).toISOString(),
      materiais: Array.isArray(parsed.materiais) ? parsed.materiais.slice(0, MAX_ITEMS) : [],
      produtos: Array.isArray(parsed.produtos) ? parsed.produtos.slice(0, MAX_ITEMS) : [],
    }
  } catch {
    return getEmptySnapshot()
  }
}

export function saveOfflineSnapshot(partial: Partial<Pick<OfflineSnapshot, 'materiais' | 'produtos'>>) {
  if (!isBrowser()) return

  try {
    // Mantem o ultimo bloco valido de cada lista. Assim Estoque e Produtos podem
    // atualizar o cache em momentos diferentes sem apagar a outra leitura.
    const current = readOfflineSnapshot()
    const next: OfflineSnapshot = {
      version: 1,
      updatedAt: new Date().toISOString(),
      materiais: partial.materiais ? partial.materiais.slice(0, MAX_ITEMS) : current.materiais,
      produtos: partial.produtos ? partial.produtos.slice(0, MAX_ITEMS) : current.produtos,
    }

    window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(next))
    window.dispatchEvent(new CustomEvent(OFFLINE_SNAPSHOT_UPDATED_EVENT))
  } catch {
    // Safari privado e alguns WebViews bloqueiam storage. Nesse caso o app segue online normal.
  }
}

export function clearOfflineSnapshot() {
  if (!isBrowser()) return

  try {
    window.localStorage.removeItem(SNAPSHOT_KEY)
    window.localStorage.removeItem(LEGACY_SNAPSHOT_KEY)
    window.dispatchEvent(new CustomEvent(OFFLINE_SNAPSHOT_UPDATED_EVENT))
  } catch {
    // O logout continua mesmo quando o navegador bloqueia o storage.
  }
}

export function formatSnapshotDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime()) || date.getFullYear() < 2020) return 'Ainda nao sincronizado'

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
