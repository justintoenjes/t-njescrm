'use client';

import Link from 'next/link';
/* eslint-disable @next/next/no-img-element */
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { LayoutDashboard, Kanban, CheckSquare, LogOut, Briefcase, UserSearch, Building2, Package, Shield, User } from 'lucide-react';
import { useCategory } from '@/lib/category-context';

type NavItem = { href: string; label: string | ((cat: string) => string); icon: typeof LayoutDashboard; vertriebOnly: boolean };

const NAV_ITEMS: NavItem[] = [
  { href: '/',           label: (cat) => cat === 'RECRUITING' ? 'Kandidaten' : 'Leads', icon: LayoutDashboard, vertriebOnly: false },
  { href: '/companies',  label: 'Firmen',   icon: Building2,      vertriebOnly: true },
  { href: '/pipeline',   label: 'Pipeline', icon: Kanban,         vertriebOnly: false },
  { href: '/templates',  label: (cat) => cat === 'RECRUITING' ? 'Stellen' : 'Produkte', icon: Package, vertriebOnly: false },
  { href: '/tasks',      label: 'Aufgaben', icon: CheckSquare,    vertriebOnly: false },
];

export default function Header() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { category, setCategory } = useCategory();

  return (
    <header className="bg-tc-dark sticky top-0 z-30 pt-[env(safe-area-inset-top)] max-w-[100vw]">
      <div className="max-w-7xl mx-auto px-2 sm:px-4 flex items-center h-14 gap-2 sm:gap-6 overflow-x-auto scrollbar-hide">
        <Link href="/" className="shrink-0 flex items-end gap-2">
          <img src="/logo-white.svg" alt="Tönjes Consulting" className="h-8 w-auto" />
          <span className="text-white font-light text-2xl tracking-wide font-sans leading-none hidden sm:block">CRM</span>
        </Link>

        {/* Category Toggle */}
        <div className="flex items-center bg-white/10 rounded-lg p-0.5 shrink-0">
          <button
            onClick={() => setCategory('VERTRIEB')}
            className={`flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap
              ${category === 'VERTRIEB'
                ? 'bg-tc-blue text-tc-dark shadow-sm'
                : 'text-white/60 hover:text-white/90'
              }`}
          >
            <Briefcase size={13} />
            <span className="hidden sm:inline">Vertrieb</span>
            <span className="sm:hidden">V</span>
          </button>
          <button
            onClick={() => setCategory('RECRUITING')}
            className={`flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap
              ${category === 'RECRUITING'
                ? 'bg-tc-blue text-tc-dark shadow-sm'
                : 'text-white/60 hover:text-white/90'
              }`}
          >
            <UserSearch size={13} />
            <span className="hidden sm:inline">Recruiting</span>
            <span className="sm:hidden">R</span>
          </button>
        </div>

        <nav className="flex items-center gap-1 flex-1 min-w-0">
          {NAV_ITEMS.filter(item => !item.vertriebOnly || category === 'VERTRIEB').map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            const displayLabel = typeof label === 'function' ? label(category) : label;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap shrink-0
                  ${active
                    ? 'bg-tc-blue/20 text-tc-blue'
                    : 'text-white/60 hover:bg-white/10 hover:text-white/90'
                  }`}
              >
                <Icon size={15} />
                <span className="hidden md:inline">{displayLabel}</span>
              </Link>
            );
          })}

          {session?.user.role === 'ADMIN' && (
            <Link
              href="/admin"
              className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-md text-sm font-medium transition-colors ml-auto whitespace-nowrap shrink-0
                ${pathname.startsWith('/admin')
                  ? 'bg-tc-blue/20 text-tc-blue'
                  : 'text-white/60 hover:bg-white/10 hover:text-white/90'
                }`}
            >
              <Shield size={15} />
              <span className="hidden md:inline">Admin</span>
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3 ml-auto shrink-0">
          <Link
            href="/settings"
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm font-medium transition-colors
              ${pathname === '/settings'
                ? 'bg-tc-blue/20 text-tc-blue'
                : 'text-white/50 hover:bg-white/10 hover:text-white/90'
              }`}
          >
            <User size={15} />
            <span className="hidden sm:block">{session?.user.name}</span>
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="flex items-center gap-1 text-sm text-white/50 hover:text-red-400 transition-colors"
          >
            <LogOut size={15} />
            <span className="hidden sm:block">Abmelden</span>
          </button>
        </div>
      </div>
    </header>
  );
}
