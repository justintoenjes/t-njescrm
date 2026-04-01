'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight } from 'lucide-react';
/* eslint-disable @next/next/no-img-element */

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCredentials, setShowCredentials] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await signIn('credentials', { email, password, redirect: false });
    setLoading(false);

    if (result?.error) {
      setError('E-Mail oder Passwort falsch');
    } else {
      router.push('/');
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-tc-dark">
      <div className="bg-white rounded-2xl shadow-xl p-10 w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <img src="/logo.svg" alt="Tönjes Consulting" className="h-12 w-auto mb-4" />
          <p className="text-tc-gray text-sm">Bitte melde dich an</p>
        </div>

        <button
          onClick={() => signIn('azure-ad', { callbackUrl: '/' })}
          className="w-full flex items-center justify-center gap-3 bg-tc-dark hover:bg-tc-dark/90 text-white font-semibold py-3 rounded-lg transition"
        >
          <svg width="20" height="20" viewBox="0 0 21 21"><path d="M0 0h10v10H0z" fill="#f25022"/><path d="M11 0h10v10H11z" fill="#7fba00"/><path d="M0 11h10v10H0z" fill="#00a4ef"/><path d="M11 11h10v10H11z" fill="#ffb900"/></svg>
          Mit Microsoft anmelden
        </button>

        <p className="text-center text-xs text-gray-400 mt-3">
          Empfohlen — ermöglicht E-Mail-Integration
        </p>

        <div className="mt-6">
          <button
            onClick={() => setShowCredentials(!showCredentials)}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition mx-auto"
          >
            {showCredentials ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            Alternativ mit Passwort anmelden
          </button>

          {showCredentials && (
            <>
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                <input
                  type="email"
                  placeholder="E-Mail"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue"
                  autoFocus
                  required
                />
                <input
                  type="password"
                  placeholder="Passwort"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue"
                  required
                />
                {error && <p className="text-red-500 text-sm">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium py-3 rounded-lg transition disabled:opacity-50"
                >
                  {loading ? 'Anmelden...' : 'Anmelden'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
