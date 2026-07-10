'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, Check, GripVertical, Pencil, Plus, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { TipoComponenteConfig } from '@/lib/types/database'
import {
  alternarTipoComponente,
  criarTipoComponente,
  ordenarTiposComponentes,
  renomearTipoComponente,
} from './actions'

interface ComponentesConfigProps {
  tipos: TipoComponenteConfig[]
}

export default function ComponentesConfigContent({ tipos }: ComponentesConfigProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [novoTipo, setNovoTipo] = useState('')
  const [editingTipo, setEditingTipo] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const tiposOrdenados = [...tipos].sort((a, b) => {
    if (a.ordem !== b.ordem) return a.ordem - b.ordem
    return a.nome.localeCompare(b.nome, 'pt-BR')
  })

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = await criarTipoComponente(formData)

      if (result.success) {
        toast.success('Tipo de componente criado')
        setNovoTipo('')
        router.refresh()
      } else {
        toast.error(result.error || 'Erro ao criar tipo')
      }
    })
  }

  function handleStartEdit(tipo: TipoComponenteConfig) {
    setEditingTipo(tipo.nome)
    setEditValue(tipo.nome)
  }

  function handleRename(e: React.FormEvent<HTMLFormElement>, nomeAtual: string) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = await renomearTipoComponente(nomeAtual, formData)

      if (result.success) {
        toast.success('Tipo atualizado')
        setEditingTipo(null)
        setEditValue('')
        router.refresh()
      } else {
        toast.error(result.error || 'Erro ao atualizar tipo')
      }
    })
  }

  function handleToggle(nome: string, ativo: boolean) {
    startTransition(async () => {
      const result = await alternarTipoComponente(nome, ativo)

      if (result.success) {
        toast.success(ativo ? 'Tipo ativado' : 'Tipo desativado')
        router.refresh()
      } else {
        toast.error(result.error || 'Erro ao alterar tipo')
      }
    })
  }

  function salvarOrdem(nomes: string[], successMessage: string) {
    startTransition(async () => {
      const result = await ordenarTiposComponentes(nomes)

      if (result.success) {
        toast.success(successMessage)
        router.refresh()
      } else {
        toast.error(result.error || 'Erro ao salvar ordem')
      }
    })
  }

  function moveTipo(index: number, direction: -1 | 1) {
    const next = [...tiposOrdenados]
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= next.length) return

    const [item] = next.splice(index, 1)
    next.splice(targetIndex, 0, item)
    salvarOrdem(next.map((tipo) => tipo.nome), 'Ordem dos tipos atualizada')
  }

  function restaurarOrdemAlfabetica() {
    const next = [...tiposOrdenados].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    salvarOrdem(next.map((tipo) => tipo.nome), 'Tipos ordenados alfabeticamente')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tipos de Componentes</CardTitle>
        <CardDescription>
          Controle as opções usadas no cadastro de materiais e na montagem de pedidos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="space-y-2">
            <Label htmlFor="novo-tipo-componente">Novo tipo</Label>
            <Input
              id="novo-tipo-componente"
              name="nome"
              value={novoTipo}
              onChange={(event) => setNovoTipo(event.target.value)}
              placeholder="Ex: Contas craqueladas, Contas leitosas"
              disabled={isPending}
            />
          </div>
          <Button type="submit" className="self-end" disabled={isPending || !novoTipo.trim()}>
            <Plus className="mr-2 h-4 w-4" />
            Adicionar
          </Button>
        </form>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            A ordem abaixo sera usada no filtro do estoque e na selecao de materiais nos pedidos.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={restaurarOrdemAlfabetica}
            disabled={isPending || tiposOrdenados.length < 2}
            className="w-full sm:w-auto"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Ordem alfabetica
          </Button>
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-[128px]">Ordem</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Categorias</TableHead>
                <TableHead className="text-right">Materiais</TableHead>
                <TableHead className="text-center">Ativo</TableHead>
                <TableHead className="w-[120px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tipos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    Nenhum tipo configurado ainda.
                  </TableCell>
                </TableRow>
              ) : (
                tiposOrdenados.map((tipo, index) => (
                  <TableRow key={tipo.nome}>
                    <TableCell>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <GripVertical className="h-4 w-4" />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => moveTipo(index, -1)}
                          disabled={isPending || index === 0}
                          aria-label={`Subir ${tipo.nome}`}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => moveTipo(index, 1)}
                          disabled={isPending || index === tiposOrdenados.length - 1}
                          aria-label={`Descer ${tipo.nome}`}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="min-w-[220px] font-medium">
                      {editingTipo === tipo.nome ? (
                        <form
                          id={`edit-${tipo.nome}`}
                          onSubmit={(event) => handleRename(event, tipo.nome)}
                          className="flex items-center gap-2"
                        >
                          <Input
                            name="nome"
                            value={editValue}
                            onChange={(event) => setEditValue(event.target.value)}
                            className="h-8"
                            disabled={isPending}
                            autoFocus
                          />
                        </form>
                      ) : (
                        tipo.nome
                      )}
                    </TableCell>
                    <TableCell className="min-w-[240px]">
                      <div className="flex flex-wrap gap-1">
                        {tipo.categorias.slice(0, 4).map((categoria) => (
                          <Badge key={categoria} variant="secondary">
                            {categoria}
                          </Badge>
                        ))}
                        {tipo.categorias.length > 4 && (
                          <Badge variant="outline">+{tipo.categorias.length - 4}</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{tipo.materiais_vinculados}</TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={tipo.ativo}
                        onCheckedChange={(checked) => handleToggle(tipo.nome, checked)}
                        disabled={isPending}
                        aria-label={`Ativar ${tipo.nome}`}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      {editingTipo === tipo.nome ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            type="submit"
                            form={`edit-${tipo.nome}`}
                            size="icon"
                            className="h-9 w-9"
                            disabled={isPending || !editValue.trim()}
                            aria-label="Salvar"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-9 w-9"
                            onClick={() => {
                              setEditingTipo(null)
                              setEditValue('')
                            }}
                            disabled={isPending}
                            aria-label="Cancelar"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9"
                          onClick={() => handleStartEdit(tipo)}
                          disabled={isPending}
                          aria-label={`Editar ${tipo.nome}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
