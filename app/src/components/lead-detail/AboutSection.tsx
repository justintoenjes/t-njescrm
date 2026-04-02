'use client';

import { Save, Phone, ChevronDown, ChevronRight } from 'lucide-react';
import CompanyPicker from '@/components/CompanyPicker';
import AttachmentSection from '@/components/AttachmentSection';
import type { LeadFull, AttachmentData, UserOption } from './types';
import type { UseLeadDetailReturn } from './useLeadDetail';

type Props = {
  lead: LeadFull;
  isAdmin: boolean;
  users: UserOption[];
  state: UseLeadDetailReturn;
  collapsed: boolean;
  onToggle: () => void;
};

export default function AboutSection({ lead, isAdmin, users, state, collapsed, onToggle }: Props) {
  const { form, setForm, saving, saveChanges, attachments, setAttachments, dialMethod } = state;

  return (
    <div className="border border-gray-100 rounded-xl">
      <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">About</span>
        {collapsed ? <ChevronRight size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>
      {!collapsed && (
        <div className="px-4 pb-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 font-medium">Vorname</label>
              <input
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">Nachname</label>
              <input
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue"
              />
            </div>
            {lead.category !== 'RECRUITING' && (
              <div>
                <label className="text-xs text-gray-500 font-medium">Firma</label>
                <div className="mt-1">
                  <CompanyPicker
                    value={form.companyId}
                    displayName={form.companyName}
                    onChange={(id, name) => setForm({ ...form, companyId: id, companyName: name })}
                  />
                </div>
              </div>
            )}
            <div>
              <label className="text-xs text-gray-500 font-medium">E-Mail</label>
              <input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">Anrede (KI)</label>
              <div className="mt-1 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, formalAddress: false })}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition ${!form.formalAddress ? 'bg-tc-blue/10 border-tc-blue/50 text-tc-dark font-medium' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                >
                  Du
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, formalAddress: true })}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition ${form.formalAddress ? 'bg-tc-blue/10 border-tc-blue/50 text-tc-dark font-medium' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                >
                  Sie
                </button>
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-gray-500 font-medium">Telefon</label>
              <div className="flex gap-1.5 mt-1">
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="min-w-0 flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue"
                />
                {form.phone && (
                  dialMethod === 'fritzbox' ? (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const res = await fetch('/callmonitor/dial', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ number: form.phone }),
                          });
                          const data = await res.json();
                          if (!res.ok) alert(data.error ?? 'Fehler');
                        } catch { alert('Callmonitor nicht erreichbar'); }
                      }}
                      className="shrink-0 px-2.5 py-2 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 rounded-lg transition"
                      title="Anrufen (Fritz!Box)"
                    >
                      <Phone size={14} />
                    </button>
                  ) : (
                    <a
                      href={`tel:${form.phone}`}
                      className="shrink-0 px-2.5 py-2 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 rounded-lg transition inline-flex items-center"
                      title="Anrufen (Telefonie-App)"
                    >
                      <Phone size={14} />
                    </a>
                  )
                )}
              </div>
            </div>
            {isAdmin && (
              <div className="sm:col-span-2">
                <label className="text-xs text-gray-500 font-medium">Zugewiesen an</label>
                <select
                  value={form.assignedToId}
                  onChange={(e) => setForm({ ...form, assignedToId: e.target.value })}
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tc-blue"
                >
                  <option value="">Nicht zugewiesen</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <AttachmentSection
            attachments={attachments}
            leadId={lead.id}
            onChange={setAttachments}
          />

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-gray-400 truncate">
              Letzter Kontakt: {lead.lastContactedAt
                ? new Date(lead.lastContactedAt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                : '–'}
            </span>
            <button
              onClick={saveChanges}
              disabled={saving}
              className="flex items-center gap-1.5 bg-tc-dark hover:bg-tc-dark/90 text-white text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-50 shrink-0"
            >
              <Save size={14} /> {saving ? 'Speichern…' : 'Speichern'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
