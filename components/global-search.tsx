'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Boxes,
  Package,
  Search,
  User,
} from 'lucide-react'

import { searchGlobal, type SearchResult } from '@/app/dashboard/search-actions'
import { Button } from '@/components/ui/button'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'

export function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult>({
    produtos: [],
    pedidos: [],
    materiais: [],
  })
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    router.prefetch('/dashboard/produtos')
    router.prefetch('/dashboard/pedidos')
    router.prefetch('/dashboard/estoque')
  }, [router])

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((current) => !current)
      }
    }

    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  const performSearch = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setResults({ produtos: [], pedidos: [], materiais: [] })
      return
    }

    setIsLoading(true)
    try {
      const data = await searchGlobal(searchQuery)
      setResults(data)
    } catch (error) {
      console.error('Search error:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch(query)
    }, 250)

    return () => clearTimeout(timer)
  }, [query, performSearch])

  function handleSelect(type: 'produto' | 'pedido' | 'material') {
    setOpen(false)
    setQuery('')

    switch (type) {
      case 'produto':
        router.push('/dashboard/produtos')
        break
      case 'pedido':
        router.push('/dashboard/pedidos')
        break
      case 'material':
        router.push('/dashboard/estoque')
        break
    }
  }

  const totalResults = results.produtos.length + results.pedidos.length + results.materiais.length

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="relative h-11 min-w-0 flex-1 justify-start rounded-full border-[#e6ddef] bg-white px-4 text-sm text-[#706b82] shadow-[0_8px_26px_rgba(83,48,122,0.06)] hover:bg-white sm:max-w-[580px] sm:pr-16 lg:w-[580px]"
        onClick={() => setOpen(true)}
      >
        <Search className="mr-2 h-4 w-4" />
        <span className="hidden truncate sm:inline-flex">
          Buscar pedidos, materiais, clientes...
        </span>
        <span className="inline-flex sm:hidden">Buscar</span>
        <kbd className="pointer-events-none absolute right-2 top-1/2 hidden h-6 -translate-y-1/2 select-none items-center rounded-full border border-[#e6ddef] bg-[#fbf8ff] px-2 font-mono text-[10px] font-medium text-[#9c6ed0] sm:flex">
          ⌘K
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Buscar produtos, pedidos, materiais..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {isLoading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Buscando...
            </div>
          ) : query.length < 2 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Digite pelo menos 2 caracteres para buscar
            </div>
          ) : totalResults === 0 ? (
            <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
          ) : (
            <>
              {results.produtos.length > 0 && (
                <CommandGroup heading="Produtos">
                  {results.produtos.map((produto) => (
                    <CommandItem
                      key={produto.id}
                      onSelect={() => handleSelect('produto')}
                      className="cursor-pointer"
                    >
                      <Package className="mr-2 h-4 w-4" />
                      <div className="flex flex-col">
                        <span>{produto.nome}</span>
                        <span className="text-xs text-muted-foreground">
                          {produto.tipo} - R$ {produto.preco_venda.toFixed(2)}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {results.pedidos.length > 0 && (
                <CommandGroup heading="Pedidos">
                  {results.pedidos.map((pedido) => (
                    <CommandItem
                      key={pedido.id}
                      onSelect={() => handleSelect('pedido')}
                      className="cursor-pointer"
                    >
                      <User className="mr-2 h-4 w-4" />
                      <div className="flex flex-col">
                        <span>{pedido.cliente_nome}</span>
                        <span className="text-xs text-muted-foreground">
                          {pedido.status} - R$ {pedido.valor_total.toFixed(2)}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {results.materiais.length > 0 && (
                <CommandGroup heading="Materiais">
                  {results.materiais.map((material) => (
                    <CommandItem
                      key={material.id}
                      onSelect={() => handleSelect('material')}
                      className="cursor-pointer"
                    >
                      <Boxes className="mr-2 h-4 w-4" />
                      <div className="flex flex-col">
                        <span>{material.nome}</span>
                        <span className="text-xs text-muted-foreground">
                          Estoque: {material.quantidade} {material.unidade}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  )
}
