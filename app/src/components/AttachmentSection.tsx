'use client';

import { useState, useRef } from 'react';
import { Paperclip, Upload, Download, Trash, FileText, Image, File } from 'lucide-react';

type Attachment = {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  createdAt: string;
  uploadedBy: { id: string; name: string } | null;
};

type Props = {
  attachments: Attachment[];
  leadId?: string;
  opportunityId?: string;
  onChange: (attachments: Attachment[]) => void;
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith('image/')) return <Image size={16} className="text-blue-400" />;
  if (mimeType === 'application/pdf') return <FileText size={16} className="text-red-400" />;
  return <File size={16} className="text-gray-400" />;
}

export default function AttachmentSection({ attachments, leadId, opportunityId, onChange }: Props) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const newAttachments = [...attachments];

    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append('file', file);
      if (leadId) formData.append('leadId', leadId);
      if (opportunityId) formData.append('opportunityId', opportunityId);

      const res = await fetch('/api/attachments', { method: 'POST', body: formData });
      if (res.ok) {
        const att = await res.json();
        newAttachments.push(att);
      }
    }

    onChange(newAttachments);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleDelete(id: string) {
    await fetch(`/api/attachments/${id}`, { method: 'DELETE' });
    onChange(attachments.filter(a => a.id !== id));
  }

  return (
    <div className="border border-gray-100 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
          <Paperclip size={13} /> Anhänge ({attachments.length})
        </p>
        <div className={`relative flex items-center gap-1.5 text-xs bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg transition cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
          <Upload size={13} />
          {uploading ? 'Lädt hoch…' : 'Hochladen'}
          <input
            ref={fileRef}
            type="file"
            multiple
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            onChange={handleUpload}
            disabled={uploading}
          />
        </div>
      </div>

      {attachments.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-2">Keine Anhänge</p>
      )}

      <div className="space-y-1">
        {attachments.map(att => (
          <div key={att.id} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-gray-50 group">
            <FileIcon mimeType={att.mimeType} />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-800 truncate">{att.fileName}</p>
              <p className="text-xs text-gray-400">
                {formatSize(att.fileSize)}
                {att.uploadedBy && <span> · {att.uploadedBy.name}</span>}
              </p>
            </div>
            <a
              href={`/api/attachments/${att.id}/download`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-300 hover:text-tc-blue transition"
              title="Öffnen"
            >
              <Download size={15} />
            </a>
            <button
              onClick={() => handleDelete(att.id)}
              className="text-gray-300 hover:text-red-500 transition"
              title="Löschen"
            >
              <Trash size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
