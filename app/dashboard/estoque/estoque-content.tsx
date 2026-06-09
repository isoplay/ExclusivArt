'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { MaterialAvatar } from '@/components/material-avatar'
import { parseDecimalInput } from '@/lib/number'
import { saveOfflineSnapshot } from '@/lib/offline-cache'
import type { Material, TipoComponenteConfig, TipoMovimentacao } from '@/lib/types/database'
import { createMaterial, deleteMaterial, registrarMovimentacao, updateMaterial } from './actions'

function getEstoqueAtual(material: Material) {
  return material.quantidade_atual ?? material.quantidade ?? 0
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

function formatDecimalInput(value: number | null | undefined, maximumFractionDigits = 4) {
  const number = Number(value ?? 0)
  if (!Number.isFinite(number)) return '0'

  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits,
    useGrouping: false,
  }).format(number)
}

function normalizeKey(value: string | null | undefined) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function getPreviewImageUrl(value?: string | null) {
  const url = String(value ?? '').trim()
  if (!url || /\.svg(?:$|[?#])/i.test(url)) return null

  if (url.startsWith('/') && !url.startsWith('//')) {
    return url
  }

  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

const SERVER_ACTION_IMAGE_LIMIT = 850 * 1024
const MAX_SOURCE_IMAGE_SIZE = 12 * 1024 * 1024
const IMAGE_OUTPUT_TYPE = 'image/jpeg'
const IMAGE_DIMENSION_STEPS = [1600, 1200, 1000, 800]
const IMAGE_QUALITY_STEPS = [0.86, 0.76, 0.66, 0.56, 0.46]
const SUPPORTED_DIRECT_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}

function replaceImageExtension(fileName: string) {
  const cleanName = fileName.trim() || 'material'
  return cleanName.replace(/\.[^.]+$/, '') + '.jpg'
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality)
  })
}

function loadImageElement(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new window.Image()

    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Nao foi possivel ler a imagem'))
    }
    image.src = url
  })
}

async function prepareImageForServerAction(file: File | null) {
  if (!file || file.size === 0) return { file: null as File | null, compressed: false }

  if (!file.type.startsWith('image/')) {
    return {
      file: null,
      compressed: false,
      error: 'Selecione uma imagem valida.',
    }
  }

  if (file.size > MAX_SOURCE_IMAGE_SIZE) {
    return {
      file: null,
      compressed: false,
      error: `A imagem tem ${formatFileSize(file.size)}. Use uma foto menor ou cadastre por URL.`,
    }
  }

  if (file.size <= SERVER_ACTION_IMAGE_LIMIT && SUPPORTED_DIRECT_IMAGE_TYPES.has(file.type)) {
    return { file, compressed: false }
  }

  try {
    const image = await loadImageElement(file)
    const sourceWidth = image.naturalWidth || image.width
    const sourceHeight = image.naturalHeight || image.height

    if (!sourceWidth || !sourceHeight) {
      return {
        file: null,
        compressed: false,
        error: 'Nao foi possivel ler as dimensoes da imagem.',
      }
    }

    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) {
      return {
        file: null,
        compressed: false,
        error: 'Este navegador nao conseguiu preparar a imagem.',
      }
    }

    for (const maxDimension of IMAGE_DIMENSION_STEPS) {
      const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight))
      canvas.width = Math.max(1, Math.round(sourceWidth * scale))
      canvas.height = Math.max(1, Math.round(sourceHeight * scale))

      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)

      for (const quality of IMAGE_QUALITY_STEPS) {
        const blob = await canvasToBlob(canvas, IMAGE_OUTPUT_TYPE, quality)
        if (blob && blob.size <= SERVER_ACTION_IMAGE_LIMIT) {
          return {
            file: new File([blob], replaceImageExtension(file.name), {
              type: IMAGE_OUTPUT_TYPE,
              lastModified: Date.now(),
            }),
            compressed: true,
          }
        }
      }
    }

    return {
      file: null,
      compressed: false,
      error: 'Nao foi possivel compactar a imagem. Use uma imagem menor ou cadastre por URL.',
    }
  } catch {
    return {
      file: null,
      compressed: false,
      error: 'Nao foi possivel preparar essa imagem. Use JPG, PNG, WEBP ou uma URL.',
    }
  }
}

const unidades = [
  { value: 'un', label: 'Unidade' },
  { value: 'g', label: 'Gramas' },
  { value: 'kg', label: 'Quilogramas' },
  { value: 'm', label: 'Metros' },
  { value: 'cm', label: 'Centímetros' },
  { value: 'pct', label: 'Pacote' },
  { value: 'cx', label: 'Caixa' },
  { value: 'par', label: 'Par' },
]

export function EstoqueContent({
  materiais,
  tiposComponentes,
}: {
  materiais: Material[]
  tiposComponentes: TipoComponenteConfig[]
}) {
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState('')
  const [tipoFilter, setTipoFilter] = useState('all')
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isMovOpen, setIsMovOpen] = useState(false)
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null)
  const [previewMaterial, setPreviewMaterial] = useState<Material | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [addImagemUrl, setAddImagemUrl] = useState('')
  const [editImagemUrl, setEditImagemUrl] = useState('')
  const [addUnidade, setAddUnidade] = useState('un')
  const [editUnidade, setEditUnidade] = useState('un')
  const [addTipo, setAddTipo] = useState('')
  const [editTipo, setEditTipo] = useState('')
  const [addCor, setAddCor] = useState('#808080')
  const [editCor, setEditCor] = useState('#808080')
  const [movTipo, setMovTipo] = useState<TipoMovimentacao>('entrada')
  const [isPreparingImage, setIsPreparingImage] = useState(false)
  const [isPending, startTransition] = useTransition()
  const isSaving = isPending || isPreparingImage

  const tiposAtivos = useMemo(
    () => tiposComponentes.filter((tipo) => tipo.ativo),
    [tiposComponentes]
  )
  const tiposValidos = useMemo(
    () => new Set(tiposAtivos.map((tipo) => normalizeKey(tipo.nome))),
    [tiposAtivos]
  )

  useEffect(() => {
    if (!addTipo && tiposAtivos[0]?.nome) {
      setAddTipo(tiposAtivos[0].nome)
    }
  }, [addTipo, tiposAtivos])

  useEffect(() => {
    if (materiais.length === 0) return

    saveOfflineSnapshot({
      materiais: materiais.map((material) => ({
        id: material.id,
        nome: material.nome,
        subtitulo: material.tipo ?? 'Sem tipo',
        detalhe: `Custo ${formatCurrency(material.custo_unitario ?? 0)}`,
        estoque: `${getEstoqueAtual(material)} ${material.unidade}`,
      })),
    })
  }, [materiais])

  useEffect(() => {
    return () => {
      if (imagePreview?.startsWith('blob:')) {
        URL.revokeObjectURL(imagePreview)
      }
    }
  }, [imagePreview])

  function materialSemTipoValido(material: Material) {
    const key = normalizeKey(material.tipo)
    return !key || !tiposValidos.has(key)
  }

  function tipoOptions(selected?: string | null) {
    const options = [...tiposAtivos]
    const selectedKey = normalizeKey(selected)
    if (selected && selectedKey && !options.some((tipo) => normalizeKey(tipo.nome) === selectedKey)) {
      options.push({
        nome: selected,
        ativo: false,
        total_grupos: 0,
        categorias: [],
        materiais_vinculados: 0,
        ordem: 999,
      })
    }
    return options
  }

  const materiaisSemTipo = materiais.filter(materialSemTipoValido)
  const filteredMateriais = materiais.filter((material) => {
    const matchesSearch = material.nome.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesTipo =
      tipoFilter === 'all' ||
      (tipoFilter === '__sem_tipo' && materialSemTipoValido(material)) ||
      normalizeKey(material.tipo) === normalizeKey(tipoFilter)

    return matchesSearch && matchesTipo
  })

  async function getPreparedImage() {
    setIsPreparingImage(true)
    try {
      return await prepareImageForServerAction(imageFile)
    } finally {
      setIsPreparingImage(false)
    }
  }

  async function handleCreateSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget

    if (!addTipo) {
      toast.error('Cadastre e selecione um tipo de componente em Configurações')
      return
    }

    const imageResult = await getPreparedImage()

    if (imageResult.error) {
      toast.error(imageResult.error)
      return
    }

    if (imageResult.compressed) {
      toast.info('Foto compactada para envio seguro.')
    }

    const formData = new FormData(form)
    formData.delete('imagem')
    if (imageResult.file) {
      formData.set('imagem', imageResult.file)
    }
    formData.set('tipo', addTipo)
    formData.set('unidade', addUnidade)
    formData.set('cor', addCor)

    startTransition(async () => {
      const result = await createMaterial(formData)
      if (result.success) {
        toast.success('Material cadastrado com sucesso!')
        setIsAddOpen(false)
        setImagePreview(null)
        setImageFile(null)
        setAddImagemUrl('')
        router.refresh()
      } else {
        toast.error(result.error || 'Erro ao cadastrar material')
      }
    })
  }

  async function handleUpdateSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    if (!selectedMaterial) return

    if (!editTipo) {
      toast.error('Selecione o tipo de componente do material')
      return
    }

    const imageResult = await getPreparedImage()

    if (imageResult.error) {
      toast.error(imageResult.error)
      return
    }

    if (imageResult.compressed) {
      toast.info('Foto compactada para envio seguro.')
    }

    const formData = new FormData(form)
    formData.delete('imagem')
    if (imageResult.file) {
      formData.set('imagem', imageResult.file)
    }
    formData.set('tipo', editTipo)
    formData.set('unidade', editUnidade)
    formData.set('cor', editCor)

    startTransition(async () => {
      const result = await updateMaterial(selectedMaterial.id, formData)
      if (result.success) {
        toast.success('Material atualizado com sucesso!')
        setIsEditOpen(false)
        setSelectedMaterial(null)
        setImagePreview(null)
        setImageFile(null)
        setEditImagemUrl('')
        router.refresh()
      } else {
        toast.error(result.error || 'Erro ao atualizar material')
      }
    })
  }

  async function handleDelete(id: string) {
    if (!confirm('Tem certeza que deseja excluir este material?')) return
    startTransition(async () => {
      const result = await deleteMaterial(id)
      if (result.success) {
        toast.success('Material excluído com sucesso!')
        router.refresh()
      } else {
        toast.error(result.error || 'Erro ao excluir material')
      }
    })
  }

  function handleMovimentacaoSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!selectedMaterial) return
    const formData = new FormData(e.currentTarget)
    const quantidade = parseDecimalInput(formData.get('quantidade'))
    const motivo = formData.get('motivo') as string

    startTransition(async () => {
      const result = await registrarMovimentacao(selectedMaterial.id, movTipo, quantidade, motivo)
      if (result.success) {
        toast.success('Movimentação registrada com sucesso!')
        setIsMovOpen(false)
        setSelectedMaterial(null)
        router.refresh()
      } else {
        toast.error(result.error || 'Erro ao registrar movimentação')
      }
    })
  }

  function getStockStatus(material: Material) {
    const atual = getEstoqueAtual(material)
    const minimo = material.quantidade_minima ?? 30
    if (atual <= 0) {
      return { label: 'Sem estoque', className: 'bg-red-100 text-red-800' }
    }
    if (atual <= minimo) {
      return { label: 'Estoque baixo', className: 'bg-amber-100 text-amber-800' }
    }
    return { label: 'OK', className: 'bg-green-100 text-green-800' }
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget
    const file = input.files?.[0] ?? null

    if (!file) {
      setImageFile(null)
      setImagePreview(null)
      return
    }

    if (!file.type.startsWith('image/')) {
      toast.error('Selecione uma imagem valida.')
      input.value = ''
      setImageFile(null)
      setImagePreview(null)
      return
    }

    if (file.size > MAX_SOURCE_IMAGE_SIZE) {
      toast.error(`A imagem tem ${formatFileSize(file.size)}. Use uma foto menor ou cadastre por URL.`)
      input.value = ''
      setImageFile(null)
      setImagePreview(null)
      return
    }

    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))

    if (file.size > SERVER_ACTION_IMAGE_LIMIT || !SUPPORTED_DIRECT_IMAGE_TYPES.has(file.type)) {
      toast.info('A foto sera otimizada ao salvar.')
    }
  }

  function openEdit(material: Material) {
    setSelectedMaterial(material)
    setEditTipo(material.tipo || '')
    setEditUnidade(material.unidade)
    setEditCor(material.cor || '#808080')
    setEditImagemUrl(material.imagem_url || '')
    setImagePreview(null)
    setImageFile(null)
    setIsEditOpen(true)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Estoque de Materiais
          </h1>
          <p className="text-muted-foreground">Gerencie os materiais utilizados na produção</p>
        </div>
        <Dialog
          open={isAddOpen}
          onOpenChange={(open) => {
            setIsAddOpen(open)
            if (!open) {
              setImagePreview(null)
              setImageFile(null)
              setAddImagemUrl('')
            }
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Novo Material
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Cadastrar Material</DialogTitle>
              <DialogDescription>
                Defina o tipo de componente para o material aparecer corretamente nos pedidos.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome *</Label>
                  <Input id="nome" name="nome" required placeholder="Ex: Conta de cristal azul" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tipo">Tipo de componente *</Label>
                  <Select value={addTipo} onValueChange={setAddTipo} disabled={tiposAtivos.length === 0}>
                    <SelectTrigger id="tipo">
                      <SelectValue placeholder="Selecione o tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {tiposAtivos.map((tipo) => (
                        <SelectItem key={tipo.nome} value={tipo.nome}>
                          {tipo.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <input type="hidden" name="tipo" value={addTipo} />
                </div>
              </div>

              {tiposAtivos.length === 0 && (
                <Alert className="border-amber-200 bg-amber-50 text-amber-950">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle className="line-clamp-none">Nenhum tipo configurado</AlertTitle>
                  <AlertDescription>
                    <Button asChild variant="link" className="h-auto p-0 text-amber-950 underline">
                      <Link href="/dashboard/configuracoes">Criar tipos em Configurações</Link>
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="imagem">Foto do material</Label>
                <Input id="imagem" name="imagem" type="file" accept="image/*" onChange={handleImageChange} />
                <p className="text-xs text-muted-foreground">
                  Opcional. Use JPG, PNG ou WEBP. Fotos grandes sao otimizadas antes do envio.
                </p>
                {imagePreview && (
                  <div className="relative h-36 w-full overflow-hidden rounded-md bg-muted">
                    <img src={imagePreview} alt="Preview" className="h-full w-full object-cover" />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="imagem_url">Imagem por URL</Label>
                <Input
                  id="imagem_url"
                  name="imagem_url"
                  type="url"
                  inputMode="url"
                  value={addImagemUrl}
                  onChange={(event) => setAddImagemUrl(event.target.value)}
                  placeholder="https://exemplo.com/material.png"
                />
                <p className="text-xs text-muted-foreground">
                  Opcional. Se enviar arquivo e preencher URL, o arquivo enviado tem prioridade.
                </p>
                {!imagePreview && getPreviewImageUrl(addImagemUrl) && (
                  <div className="relative h-36 w-full overflow-hidden rounded-md border bg-muted">
                    <img
                      src={getPreviewImageUrl(addImagemUrl) || ''}
                      alt="Preview da imagem por URL"
                      className="h-full w-full object-contain"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="unidade">Unidade *</Label>
                  <Select value={addUnidade} onValueChange={setAddUnidade}>
                    <SelectTrigger id="unidade">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {unidades.map((unidade) => (
                        <SelectItem key={unidade.value} value={unidade.value}>
                          {unidade.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <input type="hidden" name="unidade" value={addUnidade} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cor">Cor do material</Label>
                  <div className="flex min-h-10 items-center gap-3">
                    <Input
                      id="cor"
                      name="cor"
                      type="color"
                      value={addCor}
                      onChange={(event) => setAddCor(event.target.value)}
                      className="h-10 w-16 cursor-pointer p-1"
                    />
                    <span className="text-sm text-muted-foreground">{addCor}</span>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="quantidade">Quantidade inicial *</Label>
                  <Input
                    id="quantidade"
                    name="quantidade"
                    type="text"
                    inputMode="decimal"
                    required
                    defaultValue="0"
                    placeholder="Ex: 50 ou 50,5"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quantidade_minima">Estoque mínimo *</Label>
                  <Input
                    id="quantidade_minima"
                    name="quantidade_minima"
                    type="text"
                    inputMode="decimal"
                    required
                    defaultValue="30"
                    placeholder="Ex: 30"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="custo_unitario">Custo unitário (R$) *</Label>
                <Input
                  id="custo_unitario"
                  name="custo_unitario"
                  type="text"
                  inputMode="decimal"
                  required
                  defaultValue="0"
                  placeholder="Ex: 0,15"
                />
              </div>

              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    Cancelar
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={isSaving || tiposAtivos.length === 0}>
                  {isSaving ? 'Salvando...' : 'Salvar'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {materiaisSemTipo.length > 0 && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-950">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle className="line-clamp-none">
            Existem materiais sem tipo de componente válido
          </AlertTitle>
          <AlertDescription className="gap-3">
            <p>
              {materiaisSemTipo.length} material(is) precisam ser revisados para aparecerem
              corretamente na criação de pedidos.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-amber-300 bg-white/70 text-amber-950 hover:bg-white"
                onClick={() => setTipoFilter('__sem_tipo')}
              >
                Ver pendentes
              </Button>
              <Button asChild variant="link" size="sm" className="text-amber-950 underline">
                <Link href="/dashboard/configuracoes">Configurar tipos</Link>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={tipoFilter} onValueChange={setTipoFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filtrar por tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                <SelectItem value="__sem_tipo">Sem tipo válido</SelectItem>
                {tiposAtivos.map((tipo) => (
                  <SelectItem key={tipo.nome} value={tipo.nome}>
                    {tipo.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Materiais ({filteredMateriais.length})
          </CardTitle>
          <CardDescription>Lista de todos os materiais cadastrados</CardDescription>
        </CardHeader>
        <CardContent>
          {filteredMateriais.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Package className="mb-4 h-12 w-12 text-muted-foreground/50" />
              <p className="text-muted-foreground">
                {searchTerm || tipoFilter !== 'all'
                  ? 'Nenhum material encontrado'
                  : 'Nenhum material cadastrado ainda'}
              </p>
              {!searchTerm && tipoFilter === 'all' && (
                <Button variant="link" onClick={() => setIsAddOpen(true)} className="mt-2">
                  Cadastrar primeiro material
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead>Tipo de componente</TableHead>
                    <TableHead className="text-right">Quantidade</TableHead>
                    <TableHead className="text-right">Custo Unit.</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMateriais.map((material) => {
                    const status = getStockStatus(material)
                    const tipoInvalido = materialSemTipoValido(material)
                    const materialImageUrl = getPreviewImageUrl(material.imagem_url)
                    return (
                      <TableRow key={material.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            {materialImageUrl ? (
                              <button
                                type="button"
                                className="rounded-md text-left outline-none ring-offset-background transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                onClick={() => setPreviewMaterial(material)}
                                title={`Ver foto de ${material.nome}`}
                              >
                                <MaterialAvatar
                                  imageUrl={materialImageUrl}
                                  color={material.cor}
                                  tipo={material.tipo}
                                  nome={material.nome}
                                />
                              </button>
                            ) : (
                              <MaterialAvatar
                                color={material.cor}
                                tipo={material.tipo}
                                nome={material.nome}
                              />
                            )}
                            <span className="font-medium">{material.nome}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {tipoInvalido ? (
                            <Badge variant="outline" className="border-amber-300 text-amber-700">
                              Sem tipo válido
                            </Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground">{material.tipo}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {getEstoqueAtual(material)} {material.unidade}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(material.custo_unitario)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={status.className}>
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-9 w-9">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedMaterial(material)
                                  setMovTipo('entrada')
                                  setIsMovOpen(true)
                                }}
                              >
                                <ArrowUp className="mr-2 h-4 w-4 text-green-600" />
                                Entrada
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedMaterial(material)
                                  setMovTipo('saida')
                                  setIsMovOpen(true)
                                }}
                              >
                                <ArrowDown className="mr-2 h-4 w-4 text-red-600" />
                                Saída
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openEdit(material)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDelete(material.id)}
                                className="text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={isEditOpen}
        onOpenChange={(open) => {
          setIsEditOpen(open)
          if (!open) {
            setSelectedMaterial(null)
            setImagePreview(null)
            setImageFile(null)
            setEditImagemUrl('')
          }
        }}
      >
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar Material</DialogTitle>
            <DialogDescription>Atualize as informações do material</DialogDescription>
          </DialogHeader>
          {selectedMaterial && (
            <form onSubmit={handleUpdateSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-nome">Nome *</Label>
                  <Input id="edit-nome" name="nome" required defaultValue={selectedMaterial.nome} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-tipo">Tipo de componente *</Label>
                  <Select value={editTipo} onValueChange={setEditTipo}>
                    <SelectTrigger id="edit-tipo">
                      <SelectValue placeholder="Selecione o tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {tipoOptions(selectedMaterial.tipo).map((tipo) => (
                        <SelectItem key={tipo.nome} value={tipo.nome}>
                          {tipo.nome}
                          {!tipo.ativo ? ' (inativo)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <input type="hidden" name="tipo" value={editTipo} />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-unidade">Unidade *</Label>
                  <Select value={editUnidade} onValueChange={setEditUnidade}>
                    <SelectTrigger id="edit-unidade">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {unidades.map((unidade) => (
                        <SelectItem key={unidade.value} value={unidade.value}>
                          {unidade.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <input type="hidden" name="unidade" value={editUnidade} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-cor">Cor do material</Label>
                  <div className="flex min-h-10 items-center gap-3">
                    <Input
                      id="edit-cor"
                      name="cor"
                      type="color"
                      value={editCor}
                      onChange={(event) => setEditCor(event.target.value)}
                      className="h-10 w-16 cursor-pointer p-1"
                    />
                    <span className="text-sm text-muted-foreground">{editCor}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-imagem">Foto do material</Label>
                <Input id="edit-imagem" name="imagem" type="file" accept="image/*" onChange={handleImageChange} />
                <p className="text-xs text-muted-foreground">
                  Opcional. Use JPG, PNG ou WEBP. Fotos grandes sao otimizadas antes do envio.
                </p>
                {(imagePreview || getPreviewImageUrl(editImagemUrl)) && (
                  <div className="relative h-36 w-full overflow-hidden rounded-md border bg-muted">
                    <img
                      src={imagePreview || getPreviewImageUrl(editImagemUrl) || ''}
                      alt="Preview"
                      className="h-full w-full object-contain"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-imagem_url">Imagem por URL</Label>
                <Input
                  id="edit-imagem_url"
                  name="imagem_url"
                  type="url"
                  inputMode="url"
                  value={editImagemUrl}
                  onChange={(event) => setEditImagemUrl(event.target.value)}
                  placeholder="https://exemplo.com/material.png"
                />
                <p className="text-xs text-muted-foreground">
                  Opcional. Limpe o campo para remover a imagem atual.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-quantidade">Quantidade</Label>
                  <Input
                    id="edit-quantidade"
                    name="quantidade"
                    type="text"
                    inputMode="decimal"
                    defaultValue={formatDecimalInput(getEstoqueAtual(selectedMaterial), 2)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-quantidade_minima">Estoque mínimo</Label>
                  <Input
                    id="edit-quantidade_minima"
                    name="quantidade_minima"
                    type="text"
                    inputMode="decimal"
                    required
                    defaultValue={formatDecimalInput(selectedMaterial.quantidade_minima ?? 30, 2)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-custo_unitario">Custo unitário (R$)</Label>
                <Input
                  id="edit-custo_unitario"
                  name="custo_unitario"
                  type="text"
                  inputMode="decimal"
                  defaultValue={formatDecimalInput(selectedMaterial.custo_unitario ?? 0, 4)}
                />
              </div>

              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    Cancelar
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? 'Salvando...' : 'Salvar'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(previewMaterial)}
        onOpenChange={(open) => {
          if (!open) setPreviewMaterial(null)
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{previewMaterial?.nome || 'Foto do material'}</DialogTitle>
            {previewMaterial?.tipo && (
              <DialogDescription>{previewMaterial.tipo}</DialogDescription>
            )}
          </DialogHeader>
          {getPreviewImageUrl(previewMaterial?.imagem_url) && (
            <div className="flex max-h-[70svh] items-center justify-center overflow-hidden rounded-lg border bg-muted">
              <img
                src={getPreviewImageUrl(previewMaterial?.imagem_url) || ''}
                alt={previewMaterial?.nome ? `Imagem de ${previewMaterial.nome}` : 'Imagem do material'}
                className="max-h-[70svh] w-full object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isMovOpen} onOpenChange={setIsMovOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Movimentar Estoque</DialogTitle>
            <DialogDescription>
              {selectedMaterial?.nome} - Atual:{' '}
              {selectedMaterial ? getEstoqueAtual(selectedMaterial) : 0} {selectedMaterial?.unidade}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleMovimentacaoSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tipo-movimentacao">Tipo de movimentação *</Label>
              <Select value={movTipo} onValueChange={(value) => setMovTipo(value as TipoMovimentacao)}>
                <SelectTrigger id="tipo-movimentacao">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrada">Entrada</SelectItem>
                  <SelectItem value="saida">Saída</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="quantidade">Quantidade *</Label>
              <Input
                id="quantidade"
                name="quantidade"
                type="text"
                inputMode="decimal"
                required
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="motivo">Motivo</Label>
              <Textarea id="motivo" name="motivo" placeholder="Ex: Compra de fornecedor, uso em produção..." />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Registrando...' : 'Registrar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
