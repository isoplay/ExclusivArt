'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { User, History, Phone } from 'lucide-react'
import { searchClientes, type ClienteHistorico } from '@/app/dashboard/pedidos/actions'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { parseDateString } from '@/lib/utils'

type ClienteAutocompleteProps = {
  value: string
  onChange: (value: string) => void
  onSelectCliente: (cliente: ClienteHistorico) => void
  placeholder?: string
  id?: string
  name?: string
  required?: boolean
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

export function ClienteAutocomplete({
  value,
  onChange,
  onSelectCliente,
  placeholder = 'Nome do cliente',
  id,
  name,
  required,
}: ClienteAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<ClienteHistorico[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // pointerdown fecha antes do foco mudar e funciona bem em touch.
  useEffect(() => {
    function handlePointerOutside(event: PointerEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerOutside)
    return () => document.removeEventListener('pointerdown', handlePointerOutside)
  }, [])

  // Pequeno debounce para nao bater no banco a cada tecla.
  const performSearch = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setSuggestions([])
      return
    }
    
    setIsLoading(true)
    try {
      const results = await searchClientes(searchQuery)
      setSuggestions(results)
      setIsOpen(results.length > 0)
    } catch (error) {
      console.error('Search error:', error)
      setSuggestions([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch(value)
    }, 300)
    return () => clearTimeout(timer)
  }, [value, performSearch])

  function handleSelect(cliente: ClienteHistorico) {
    onChange(cliente.cliente_nome)
    onSelectCliente(cliente)
    setIsOpen(false)
    setSuggestions([])
  }

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        id={id}
        name={name}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setIsOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
      />
      
      {isOpen && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-64 overflow-y-auto">
          <div className="p-2 text-xs text-muted-foreground border-b flex items-center gap-1">
            <History className="h-3 w-3" />
            Clientes anteriores
          </div>
          {suggestions.map((cliente, index) => (
            <button
              key={`${cliente.cliente_nome}-${index}`}
              type="button"
              onClick={() => handleSelect(cliente)}
              className="w-full px-3 py-2 text-left hover:bg-accent focus:bg-accent focus:outline-none transition-colors border-b last:border-b-0"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium truncate">{cliente.cliente_nome}</span>
                  </div>
                  {cliente.cliente_contato && (
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3 shrink-0" />
                      <span>{cliente.cliente_contato}</span>
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-medium">
                    {cliente.total_pedidos} pedido{cliente.total_pedidos > 1 ? 's' : ''}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatCurrency(cliente.valor_total)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {formatDistanceToNow(parseDateString(cliente.ultimo_pedido) || new Date(cliente.ultimo_pedido), {
                      addSuffix: true,
                      locale: ptBR,
                    })}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      
      {isLoading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="h-4 w-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
}
