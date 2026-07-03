'use client';

import Link from 'next/link';
/* eslint-disable @next/next/no-img-element */
import { usePathname, useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { useState, useRef, useEffect } from 'react';
import { Kanban, CheckSquare, LogOut, Briefcase, UserSearch, Building2, Package, Shield, User, BarChart3, Plus, Search, Phone, Settings } from 'lucide-react';
import { useCategory } from '@/lib/category-context';
import GlobalSearch from '@/components/GlobalSearch';
import type { LucideIcon } from 'lucide-react';

type NavItem = { href: string; label: string; icon: LucideIcon; vertriebOnly?: boolean; recruitingOnly?: boolean };

const NAV_ITEMS: NavItem[] = [
  { href: '/pipeline',   label: 'Pipeline',  icon: Kanban },
  { href: '/tasks',      label: 'Aufgaben',  icon: CheckSquare },
  { href: '/companies',  label: 'Firmen',    icon: Building2,   vertriebOnly: true },
  { href: '/templates',  label: 'Stellen',   icon: Package,     recruitingOnly: true },
];

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();
  const { category, setCategory } = useCategory();
  const [createOpen, setCreateOpen] = useState(false);
  const createRef = useRef<HTMLDivElement>(null);
  const [missedCount, setMissedCount] = useState(0);

  // Fetch unseen missed call count
  useEffect(() => {
    if (status !== 'authenticated') return;
    function fetchCount() {
      fetch('/api/calls/unseen').then(r => r.json()).then(d => setMissedCount(d.count)).catch(() => {});
    }
    fetchCount();
    const iv = setInterval(fetchCount, 60_000);
    // Listen for calls-seen event from calls page
    function onSeen() { setMissedCount(0); }
    window.addEventListener('calls-seen', onSeen);
    return () => { clearInterval(iv); window.removeEventListener('calls-seen', onSeen); };
  }, [status]);

  useEffect(() => {
    if (!createOpen) return;
    function handleClick(e: MouseEvent) {
      if (createRef.current && !createRef.current.contains(e.target as Node)) setCreateOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [createOpen]);

  return (
    <header className="bg-tc-dark sticky top-0 z-30 pt-[env(safe-area-inset-top)] max-w-[100vw]">
      {/* Mobile (<md): zwei Zeilen — 1. Logo + Aktionen, 2. Toggle + Nav. Ab md: eine Zeile. */}
      <div className="max-w-7xl mx-auto px-2 sm:px-4 flex flex-wrap items-center md:h-14 gap-x-2 sm:gap-x-4 gap-y-1.5 py-2 md:py-0">
        {/* Logo */}
        <Link href="/" className="shrink-0 order-1">
          <img src="/logo-crm.svg" alt="Tönjes CRM" className="h-9 sm:h-10 w-auto" />
        </Link>

        {/* Category Toggle */}
        <div className="flex items-center bg-white/10 rounded-lg p-0.5 shrink-0 order-5 md:order-2">
          <button
            onClick={() => setCategory('VERTRIEB')}
            className={`flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap
              ${category === 'VERTRIEB'
                ? 'bg-tc-blue text-tc-dark shadow-sm'
                : 'text-white/60 hover:text-white/90'
              }`}
          >
            <Briefcase size={13} />
            <span>Vertrieb</span>
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
            <span>Recruiting</span>
          </button>
        </div>

        {/* Nav Tabs */}
        <nav className="flex items-center gap-1 shrink-0 order-6 md:order-3">
          {NAV_ITEMS
            .filter(item => (!item.vertriebOnly || category === 'VERTRIEB') && (!item.recruitingOnly || category === 'RECRUITING'))
            .map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href === '/pipeline' && pathname === '/');
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap
                  ${active
                    ? 'bg-tc-blue/20 text-tc-blue'
                    : 'text-white/60 hover:bg-white/10 hover:text-white/90'
                  }`}
              >
                <Icon size={15} />
                <span className="hidden lg:inline">{label}</span>
              </Link>
            );
          })}

          <span className="w-px h-4 bg-white/20 mx-1" />

          <Link
            href="/reports"
            className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap
              ${pathname === '/reports'
                ? 'bg-tc-blue/20 text-tc-blue'
                : 'text-white/60 hover:bg-white/10 hover:text-white/90'
              }`}
          >
            <BarChart3 size={15} />
            <span className="hidden lg:inline">Reports</span>
          </Link>
        </nav>

        {/* Spacer */}
        <div className="flex-1 order-2 md:order-4" />

        {/* Right section: Create + Search + User + Admin + Logout */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0 order-3 md:order-5">
          {/* Create Dropdown */}
          <div ref={createRef} className="relative">
            <button
              onClick={() => setCreateOpen(!createOpen)}
              className="flex items-center gap-1 px-2 py-1.5 rounded-md text-white/50 hover:bg-white/10 hover:text-white/90 transition-colors text-sm"
              title="Neu anlegen"
            >
              <Plus size={15} />
              <span className="hidden sm:inline font-medium">Neu</span>
            </button>
            {createOpen && (
              <div className="absolute top-full right-0 mt-1 bg-white rounded-xl shadow-2xl border border-gray-200 py-1.5 min-w-[200px] z-[100]">
                <button
                  onClick={() => { setCreateOpen(false); router.push('/leads?create=true'); }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
                >
                  <User size={14} className="text-gray-400" />
                  {category === 'RECRUITING' ? 'Neuer Kandidat' : 'Neuer Kontakt'}
                </button>
                {category === 'VERTRIEB' && (
                  <button
                    onClick={() => { setCreateOpen(false); router.push('/companies?create=true'); }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
                  >
                    <Building2 size={14} className="text-gray-400" />
                    Neue Firma
                  </button>
                )}
                <button
                  onClick={() => { setCreateOpen(false); router.push('/pipeline?create=true'); }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
                >
                  <Kanban size={14} className="text-gray-400" />
                  {category === 'RECRUITING' ? 'Neue Bewerbung' : 'Neue Anfrage'}
                </button>
                <button
                  onClick={() => { setCreateOpen(false); router.push('/tasks?create=true'); }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
                >
                  <CheckSquare size={14} className="text-gray-400" />
                  Neue Aufgabe
                </button>
              </div>
            )}
          </div>

          {/* Search */}
          <GlobalSearch
            onOpenLead={(id) => router.push(`${pathname}?openLead=${id}`)}
            onOpenCompany={(id) => router.push(`/companies?open=${id}`)}
            onOpenTemplate={(id) => router.push(`/templates?open=${id}`)}
            onOpenOpportunity={(id) => router.push(`/pipeline?open=${id}`)}
          />

          <span className="w-px h-4 bg-white/15 mx-0.5 hidden sm:block" />

          {/* Calls */}
          <Link
            href="/calls"
            className={`relative flex items-center p-1.5 rounded-md transition-colors
              ${pathname === '/calls'
                ? 'bg-tc-blue/20 text-tc-blue'
                : 'text-white/50 hover:bg-white/10 hover:text-white/90'
              }`}
            title="Anrufe"
          >
            <Phone size={15} />
            {missedCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1 py-0.5 rounded-full min-w-[16px] text-center leading-none">
                {missedCount > 9 ? '9+' : missedCount}
              </span>
            )}
          </Link>

          {/* Settings */}
          <Link
            href="/settings"
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm font-medium transition-colors
              ${pathname === '/settings'
                ? 'bg-tc-blue/20 text-tc-blue'
                : 'text-white/50 hover:bg-white/10 hover:text-white/90'
              }`}
          >
            <Settings size={15} />
            <span className="hidden sm:block">{session?.user.name}</span>
          </Link>
          {session?.user.role === 'ADMIN' && (
            <Link
              href="/admin"
              className={`flex items-center p-1.5 rounded-md transition-colors
                ${pathname.startsWith('/admin')
                  ? 'bg-tc-blue/20 text-tc-blue'
                  : 'text-white/50 hover:bg-white/10 hover:text-white/90'
                }`}
              title="Admin"
            >
              <Shield size={15} />
            </Link>
          )}
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="flex items-center text-sm text-white/50 hover:text-red-400 transition-colors p-1.5"
          >
            <LogOut size={15} />
          </button>
        </div>

        {/* Umbruch: erzwingt auf Mobile die zweite Zeile */}
        <div className="basis-full h-0 order-4 md:hidden" />
      </div>
    </header>
  );
}
