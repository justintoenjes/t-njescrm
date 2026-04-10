'use client';

import { SessionProvider, useSession, signIn } from 'next-auth/react';
import { useEffect, useRef } from 'react';

function TokenGuard({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const redirecting = useRef(false);

  useEffect(() => {
    if ((session as any)?.tokenError === 'RefreshTokenExpired' && !redirecting.current) {
      redirecting.current = true;
      // MS session is usually still active → instant redirect back
      signIn('azure-ad');
    }
  }, [session]);

  return <>{children}</>;
}

export default function SessionProviderWrapper({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <TokenGuard>{children}</TokenGuard>
    </SessionProvider>
  );
}
