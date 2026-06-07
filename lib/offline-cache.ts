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

const SNAPSHOT_KEY = 'exclusiv-art:offline-snapshot:v1'
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
    const raw = window.localStorage.getItem(SNAPSHOT_KEY)
    if (!raw) return getEmptySnapshot()

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
    window.dispatchEvent(new CustomEvent('exclusiv-art:offline-snapshot-updated'))
  } catch {
    // Safari privado e alguns WebViews bloqueiam storage. Nesse caso o app segue online normal.
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
