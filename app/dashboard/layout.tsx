import Image from 'next/image'
import { AppSidebar } from '@/components/app-sidebar'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { PWAInstallPrompt } from '@/components/pwa-install-prompt'
import { OfflineStatusIndicator } from '@/components/offline-status-indicator'
import { GlobalSearch } from '@/components/global-search'
import { FloatingActionButton } from '@/components/floating-action-button'
import { Button } from '@/components/ui/button'
import { logout } from '@/app/login/actions'
import { LogOut } from 'lucide-react'
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
            className="sticky top-0 z-10 flex shrink-0 items-center gap-2 border-b border-[#eee6f5] bg-[#fbf8ff] px-3 md:gap-4 md:px-8"
            style={{ paddingTop: 'max(0px, env(safe-area-inset-top))', minHeight: '68px' }}
          >
            <SidebarTrigger className="-ml-1 h-10 w-10 rounded-full text-[#5f5072] hover:bg-[#f3edf8] md:hidden" />
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
              <form action={logout}>
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  className="h-10 rounded-full px-3 text-[#5f5072] hover:bg-[#f3edf8] md:px-4"
                >
                  <LogOut className="h-4 w-4 md:mr-2" />
                  <span className="hidden md:inline">Sair</span>
                </Button>
              </form>
            </div>
          </header>
          <main className="flex-1 overflow-auto bg-[#fbf8ff] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:p-8 md:pb-[max(2rem,env(safe-area-inset-bottom))]">
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
