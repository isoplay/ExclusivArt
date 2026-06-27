import Image from 'next/image'
import { AppSidebar } from '@/components/app-sidebar'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { PWAInstallPrompt } from '@/components/pwa-install-prompt'
import { OfflineStatusIndicator } from '@/components/offline-status-indicator'
import { GlobalSearch } from '@/components/global-search'
import { FloatingActionButton } from '@/components/floating-action-button'
import { LogoutForm } from '@/components/logout-form'
import { getAuthenticatedUser, getUserDisplayName } from '@/lib/auth'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getAuthenticatedUser()
  const userName = getUserDisplayName(user)

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <div className="flex h-full flex-col">
          <header
            className="dashboard-topbar sticky top-0 z-10 flex shrink-0 items-center gap-2 border-b border-[#eee6f5] px-3 md:gap-4 md:px-8"
            style={{ paddingTop: 'max(0px, env(safe-area-inset-top))', minHeight: '68px' }}
          >
            <SidebarTrigger
              aria-label="Mostrar ou esconder menu lateral"
              title="Mostrar ou esconder menu lateral"
              className="-ml-1 h-10 w-10 shrink-0 rounded-full text-[#5f5072] hover:bg-[#f3edf8]"
            />
            <div className="relative h-9 w-9 shrink-0 md:hidden">
              <Image
                src="/exclusiv-art-logo.png"
                alt="ExclusivArt"
                fill
                className="object-contain"
              />
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-4">
              <GlobalSearch />
              <div className="ml-auto hidden h-10 items-center gap-2 rounded-full bg-[#fbf8ff] px-4 text-sm text-[#706b82] lg:flex">
                <span>Olá,</span>
                <strong className="font-semibold text-[#15142a]">{userName}</strong>
              </div>
              <LogoutForm />
            </div>
          </header>
          <main className="dashboard-surface ui-enter flex-1 overflow-auto p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:p-8 md:pb-[max(2rem,env(safe-area-inset-bottom))]">
            {children}
          </main>
        </div>
      </SidebarInset>
      <FloatingActionButton />
      <PWAInstallPrompt />
      <OfflineStatusIndicator />
    </SidebarProvider>
  )
}
