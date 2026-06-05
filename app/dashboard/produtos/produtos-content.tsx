'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Copy, Eye, MoreHorizontal, Package, Pencil, Plus, Search, Trash2 } from 'lucide-react'
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
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { ProdutoComMateriais } from '@/lib/types/database'
import { saveOfflineSnapshot } from '@/lib/offline-cache'
import {
  createProduto,
  deleteProduto,
  duplicateProduto,
  toggleProdutoAtivo,
  updateProduto,
} from './actions'

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

function inferProdutoTipo(nome: string) {
  const normalized = nome
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  if (normalized.includes('terco')) return 'terco'
  if (normalized.includes('pulseira')) return 'pulseira'
  if (normalized.includes('chaveiro')) return 'chaveiro'
  return 'outro'
}

export function ProdutosContent({ produtos }: { produtos: ProdutoComMateriais[] }) {
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState('')
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isViewOpen, setIsViewOpen] = useState(false)
  const [selectedProduto, setSelectedProduto] = useState<ProdutoComMateriais | null>(null)
  const [addMaodeobra, setAddMaodeobra] = useState('5')
  const [editMaodeobra, setEditMaodeobra] = useState('5')
  const [isPending, startTransition] = useTransition()

  const filteredProdutos = produtos.filter((produto) =>
    produto.nome.toLowerCase().includes(searchTerm.toLowerCase())
  )

  useEffect(() => {
    if (produtos.length === 0) return

    saveOfflineSnapshot({
      produtos: produtos.map((produto) => ({
        id: produto.id,
        nome: produto.nome,
        subtitulo: produto.tipo,
        detalhe: `Preco ${formatCurrency(produto.preco_venda ?? 0)}`,
        estoque: `Mao de obra ${formatCurrency(produto.valor_maodeobra ?? 0)}`,
      })),
    })
  }, [produtos])

  function handleCreateSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const nome = String(formData.get('nome') || '')
    formData.set('tipo', inferProdutoTipo(nome))
    formData.set('preco_venda', '0')
    formData.set('margem_lucro', '0')

    startTransition(async () => {
      const result = await createProduto(formData, [])
      if (result.success) {
        toast.success('Produto cadastrado com sucesso!')
        setIsAddOpen(false)
        setAddMaodeobra('5')
        router.refresh()
      } else {
        toast.error(result.error || 'Erro ao cadastrar produto')
      }
    })
  }

  function handleUpdateSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!selectedProduto) return

    const formData = new FormData(e.currentTarget)
    const nome = String(formData.get('nome') || '')
    formData.set('tipo', inferProdutoTipo(nome))
    formData.set('preco_venda', '0')
    formData.set('margem_lucro', '0')
    formData.set('ativo', String(selectedProduto.ativo))

    startTransition(async () => {
      const result = await updateProduto(selectedProduto.id, formData, [])
      if (result.success) {
        toast.success('Produto atualizado com sucesso!')
        setIsEditOpen(false)
        setSelectedProduto(null)
        router.refresh()
      } else {
        toast.error(result.error || 'Erro ao atualizar produto')
      }
    })
  }

  function handleDelete(id: string) {
    if (!confirm('Tem certeza que deseja excluir este produto?')) return

    startTransition(async () => {
      const result = await deleteProduto(id)
      if (result.success) {
        toast.success('Produto excluído com sucesso!')
        router.refresh()
      } else {
        toast.error(result.error || 'Erro ao excluir produto')
      }
    })
  }

  function handleToggleAtivo(id: string, ativo: boolean) {
    startTransition(async () => {
      const result = await toggleProdutoAtivo(id, ativo)
      if (result.success) {
        toast.success(ativo ? 'Produto ativado!' : 'Produto desativado!')
        router.refresh()
      } else {
        toast.error(result.error || 'Erro ao alterar status')
      }
    })
  }

  function handleDuplicate(id: string) {
    startTransition(async () => {
      const result = await duplicateProduto(id)
      if (result.success) {
        toast.success('Produto duplicado!')
        router.refresh()
      } else {
        toast.error(result.error || 'Erro ao duplicar produto')
      }
    })
  }

  function openEdit(produto: ProdutoComMateriais) {
    setSelectedProduto(produto)
    setEditMaodeobra(String(produto.valor_maodeobra ?? 5))
    setIsEditOpen(true)
  }

  function openView(produto: ProdutoComMateriais) {
    setSelectedProduto(produto)
    setIsViewOpen(true)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Produtos</h1>
          <p className="text-muted-foreground">
            Cada produto cadastrado vira uma opção na criação de pedidos.
          </p>
        </div>

        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Novo Produto
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Cadastrar Produto</DialogTitle>
              <DialogDescription>
                O nome cadastrado aparecerá como tipo de produto no pedido.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome do Produto *</Label>
                <Input id="nome" name="nome" required placeholder="Ex: Terço personalizado" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="valor_maodeobra">Valor de Mão de Obra (R$) *</Label>
                <Input
                  id="valor_maodeobra"
                  name="valor_maodeobra"
                  type="text"
                  inputMode="decimal"
                  required
                  placeholder="R$ 5,00"
                  value={addMaodeobra}
                  onChange={(event) => setAddMaodeobra(event.target.value)}
                />
              </div>

              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    Cancelar
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={isPending}>
                  {isPending ? 'Salvando...' : 'Salvar'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Produtos ({filteredProdutos.length})
          </CardTitle>
          <CardDescription>Tipos de produtos cadastrados no sistema</CardDescription>
        </CardHeader>
        <CardContent>
          {filteredProdutos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Package className="mb-4 h-12 w-12 text-muted-foreground/50" />
              <p className="text-muted-foreground">
                {searchTerm ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado ainda'}
              </p>
              {!searchTerm && (
                <Button variant="link" onClick={() => setIsAddOpen(true)} className="mt-2">
                  Cadastrar primeiro produto
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Mão de Obra</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[80px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProdutos.map((produto) => (
                    <TableRow key={produto.id} className={!produto.ativo ? 'opacity-50' : ''}>
                      <TableCell>
                        <span className="font-medium">{produto.nome}</span>
                      </TableCell>
                      <TableCell>{formatCurrency(produto.valor_maodeobra ?? 0)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={produto.ativo}
                            onCheckedChange={(checked) => handleToggleAtivo(produto.id, checked)}
                          />
                          <Badge variant={produto.ativo ? 'default' : 'secondary'}>
                            {produto.ativo ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-9 w-9">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openView(produto)}>
                              <Eye className="mr-2 h-4 w-4" />
                              Ver detalhes
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEdit(produto)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDuplicate(produto.id)}>
                              <Copy className="mr-2 h-4 w-4" />
                              Duplicar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDelete(produto.id)}
                              className="text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedProduto?.nome}</DialogTitle>
            <DialogDescription>Produto disponível para criação de pedidos</DialogDescription>
          </DialogHeader>
          {selectedProduto && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Mão de Obra</p>
                <p className="text-lg font-medium">
                  {formatCurrency(selectedProduto.valor_maodeobra ?? 0)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge variant={selectedProduto.ativo ? 'default' : 'secondary'}>
                  {selectedProduto.ativo ? 'Ativo' : 'Inativo'}
                </Badge>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Produto</DialogTitle>
            <DialogDescription>Atualize o nome e o custo de mão de obra</DialogDescription>
          </DialogHeader>
          {selectedProduto && (
            <form onSubmit={handleUpdateSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit_nome">Nome *</Label>
                <Input id="edit_nome" name="nome" required defaultValue={selectedProduto.nome} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit_valor_maodeobra">Valor de Mão de Obra (R$) *</Label>
                <Input
                  id="edit_valor_maodeobra"
                  name="valor_maodeobra"
                  type="text"
                  inputMode="decimal"
                  required
                  value={editMaodeobra}
                  onChange={(event) => setEditMaodeobra(event.target.value)}
                />
              </div>

              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    Cancelar
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={isPending}>
                  {isPending ? 'Salvando...' : 'Salvar'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
