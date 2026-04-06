'use client';

import Link from 'next/link';
/* eslint-disable @next/next/no-img-element */
import { usePathname, useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { Kanban, CheckSquare, LogOut, Briefcase, UserSearch, Building2, Package, Shield, User, BarChart3 } from 'lucide-react';
import { useCategory } from '@/lib/category-context';
import GlobalSearch from '@/components/GlobalSearch';
import type { LucideIcon } from 'lucide-react';

type NavItem = { href: string; label: string; icon: LucideIcon; vertriebOnly?: boolean; recruitingOnly?: boolean; separator?: boolean };

const NAV_ITEMS: NavItem[] = [
  { href: '/pipeline',   label: 'Pipeline',  icon: Kanban,      },
  { href: '/tasks',      label: 'Aufgaben',  icon: CheckSquare, },
  { href: '/companies',  label: 'Firmen',    icon: Building2,   vertriebOnly: true },
  { href: '/templates',  label: 'Stellen',   icon: Package,     recruitingOnly: true },
  { href: '/reports',    label: 'Reports',   icon: BarChart3,   separator: true },
];

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const { category, setCategory } = useCategory();

  return (
    <header className="bg-tc-dark sticky top-0 z-30 pt-[env(safe-area-inset-top)] max-w-[100vw]">
      <div className="max-w-7xl mx-auto px-2 sm:px-4 flex items-center h-14 gap-2 sm:gap-6 overflow-x-auto scrollbar-hide">
        <Link href="/" className="shrink-0">
          <img src="/logo-crm.svg" alt="Tönjes CRM" className="h-9 sm:h-10 w-auto" />
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

        <GlobalSearch
          onOpenLead={(id) => router.push(`/leads?open=${id}`)}
          onOpenCompany={(id) => router.push(`/companies?open=${id}`)}
          onOpenTemplate={(id) => router.push(`/templates?open=${id}`)}
          onOpenOpportunity={(id) => router.push(`/pipeline?open=${id}`)}
        />

        <nav className="flex items-center gap-1 flex-1 min-w-0">
          {NAV_ITEMS
            .filter(item => (!item.vertriebOnly || category === 'VERTRIEB') && (!item.recruitingOnly || category === 'RECRUITING'))
            .map(({ href, label, icon: Icon, separator }) => {
            const active = pathname === href || (href === '/pipeline' && pathname === '/');
            return (
              <span key={href} className="flex items-center shrink-0">
                {separator && <span className="w-px h-4 bg-white/20 mx-1" />}
                <Link
                  href={href}
                  className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap
                    ${active
                      ? 'bg-tc-blue/20 text-tc-blue'
                      : 'text-white/60 hover:bg-white/10 hover:text-white/90'
                    }`}
                >
                  <Icon size={15} />
                  <span className="hidden md:inline">{label}</span>
                </Link>
              </span>
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
