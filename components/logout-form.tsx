'use client'

import { LogOut } from 'lucide-react'
import { logout } from '@/app/login/actions'
import { Button } from '@/components/ui/button'
import { clearOfflineSnapshot } from '@/lib/offline-cache'

export function LogoutForm() {
  return (
    <form
      action={logout}
      onSubmit={() => {
        clearOfflineSnapshot()
      }}
    >
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
  )
}
