import type { Metadata, Viewport } from 'next'
import { Poppins } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from 'sonner'
import { ServiceWorkerRegistration } from '@/components/service-worker-registration'
import { ThemeProvider } from '@/components/theme-provider'
import { BRAND_ICON, BRAND_NAME, BRAND_SOCIAL_IMAGE } from '@/lib/brand'
import './globals.css'

const poppins = Poppins({ 
  subsets: ["latin"],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-poppins'
})

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || 'https://exclusivart-artesanato.vercel.app'
  ),
  title: `${BRAND_NAME} - Gestão de Artesanato`,
  description: 'Sistema de gestao para artesanato religioso - tercos, pulseiras e chaveiros',
  generator: 'v0.app',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: BRAND_NAME,
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    title: BRAND_NAME,
    description: 'Gestão de pedidos, estoque e produção artesanal.',
    siteName: BRAND_NAME,
    locale: 'pt_BR',
    type: 'website',
    images: [BRAND_SOCIAL_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: BRAND_NAME,
    description: 'Gestão de pedidos, estoque e produção artesanal.',
    images: [BRAND_SOCIAL_IMAGE],
  },
  icons: {
    icon: BRAND_ICON,
    apple: BRAND_ICON,
  },
}

export const viewport: Viewport = {
  themeColor: '#C8BDE9',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    // Evita falso positivo de hydration quando extensoes do navegador alteram o HTML antes do React.
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href={BRAND_ICON} />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className={`${poppins.variable} font-sans antialiased`} suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
          <Toaster position="top-right" richColors />
          <ServiceWorkerRegistration />
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  )
}
