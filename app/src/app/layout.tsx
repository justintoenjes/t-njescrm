import type { Metadata, Viewport } from 'next';
import SessionProviderWrapper from '@/components/SessionProviderWrapper';
import { CategoryProvider } from '@/lib/category-context';
import CallPopup from '@/components/CallPopup';
import PushNotificationProvider from '@/components/PushNotificationInit';
import './globals.css';

export const viewport: Viewport = {
  themeColor: '#062727',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: 'Tönjes CRM',
  description: 'CRM – Tönjes Consulting GmbH',
  manifest: '/manifest.json',
  icons: {
    icon: '/icon-512.png',
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Tönjes CRM',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Mulish:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-tc-light text-gray-900 antialiased font-sans">
        <SessionProviderWrapper>
          <CategoryProvider>
            <PushNotificationProvider>
              {children}
              <CallPopup />
            </PushNotificationProvider>
          </CategoryProvider>
        </SessionProviderWrapper>
      </body>
    </html>
  );
}
