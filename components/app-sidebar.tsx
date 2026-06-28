'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Boxes,
  CalendarDays,
  ClipboardList,
  History,
  LayoutDashboard,
  Package,
  ReceiptText,
  Settings,
  ShoppingCart,
  Wallet,
} from 'lucide-react'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

const menuItems = [
  {
    title: 'Página inicial',
    url: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    title: 'Estoque',
    url: '/dashboard/estoque',
    icon: Boxes,
  },
  {
    title: 'Produtos',
    url: '/dashboard/produtos',
    icon: Package,
  },
  {
    title: 'Pedidos',
    url: '/dashboard/pedidos',
    icon: ShoppingCart,
  },
  {
    title: 'Orçamentos',
    url: '/dashboard/orcamentos',
    icon: ReceiptText,
  },
  {
    title: 'Operacao',
    url: '/dashboard/operacao',
    icon: ClipboardList,
  },
  {
    title: 'Calendário',
    url: '/dashboard/calendario',
    icon: CalendarDays,
  },
  {
    title: 'Financeiro',
    url: '/dashboard/financeiro',
    icon: Wallet,
  },
  {
    title: 'Histórico',
    url: '/dashboard/historico-vendas',
    icon: History,
  },
  {
    title: 'Configurações',
    url: '/dashboard/configuracoes',
    icon: Settings,
  },
]

export function AppSidebar() {
  const pathname = usePathname()
  const { state, isMobile, setOpenMobile } = useSidebar()
  const isCollapsed = state === 'collapsed'

  const handleNavClick = () => {
    if (isMobile) {
      setOpenMobile(false)
    }
  }

  return (
    <Sidebar
      collapsible="offcanvas"
      className="[&_[data-sidebar=sidebar]]:overflow-hidden [&_[data-sidebar=sidebar]]:bg-[#c8adeb]"
    >
      <SidebarHeader className="border-b border-white/15 px-4 py-5 min-[900px]:py-7">
        <Link href="/dashboard" onClick={handleNavClick} className="flex items-center justify-center">
          <div
            className={cn(
              'relative drop-shadow-[0_12px_24px_rgba(80,48,122,0.16)] transition-all duration-200',
              isCollapsed ? 'h-10 w-10' : 'h-20 w-20 min-[900px]:h-28 min-[900px]:w-28'
            )}
          >
            <div className="absolute inset-0">
              <Image
                src="/exclusiv-art-logo.png"
                alt="Exclusiv Art"
                fill
                className="object-contain"
                priority
              />
            </div>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="pt-4 [scrollbar-width:none] min-[900px]:pt-6 [&::-webkit-scrollbar]:hidden">
        <SidebarGroup className="px-3">
          <SidebarGroupContent>
            <SidebarMenu className="gap-2">
              {menuItems.map((item) => {
                const isActive =
                  pathname === item.url ||
                  (item.url !== '/dashboard' && pathname.startsWith(item.url))

                return (
                  <SidebarMenuItem key={item.title} className="px-0.5">
                    {isActive && (
                      <span className="absolute right-3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[#9c6ed0] shadow-[0_0_0_5px_rgba(156,110,208,0.12)]" />
                    )}
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.title}
                      className={cn(
                        'h-11 rounded-2xl px-3 text-[#5f5072] transition-all duration-200 ease-out hover:bg-white/40 hover:text-[#4f4261] hover:shadow-[0_10px_24px_-20px_rgba(80,48,122,0.38)] focus-visible:ring-2 focus-visible:ring-white/80 motion-reduce:transition-none',
                        isActive && 'bg-white/60 font-semibold text-[#4f4261] shadow-[0_14px_30px_-22px_rgba(80,48,122,0.46)]'
                      )}
                    >
                      <Link href={item.url} onClick={handleNavClick}>
                        <item.icon className={cn('h-5 w-5 transition-colors duration-200', isActive ? 'text-[#4f4261]' : 'text-[#5f5072]')} />
                        <span className="font-medium">{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-white/15 p-4">
        <p className="text-center text-xs font-medium text-[#5f5072]/75">
          {isCollapsed ? 'EA' : 'Exclusiv Art v1.0'}
        </p>
      </SidebarFooter>
    </Sidebar>
  )
}
