'use client';

import React from 'react';

/**
 * Rendert Notiz-Content mit einfacher Markdown-Unterstützung:
 * **fett**, *kursiv*, ### Überschriften, * Listen, - Listen
 */
export function NoteContent({ content }: { content: string }) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let listType: 'ul' | 'ol' | null = null;

  function flushList() {
    if (listItems.length > 0 && listType) {
      const Tag = listType;
      elements.push(
        <Tag key={`list-${elements.length}`} className={listType === 'ul' ? 'list-disc pl-5 my-1' : 'list-decimal pl-5 my-1'}>
          {listItems}
        </Tag>
      );
      listItems = [];
      listType = null;
    }
  }

  function renderInline(text: string): React.ReactNode[] {
    const parts: React.ReactNode[] = [];
    // Match **bold**, *italic*, but not ** inside words
    const regex = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }
      if (match[2]) {
        // **bold**
        parts.push(<strong key={match.index}>{match[2]}</strong>);
      } else if (match[3]) {
        // *italic*
        parts.push(<em key={match.index}>{match[3]}</em>);
      }
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts.length > 0 ? parts : [text];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Headings: ### / ## / #
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const className = level === 1 ? 'font-bold text-base mt-2 mb-1'
        : level === 2 ? 'font-bold text-sm mt-2 mb-0.5'
        : 'font-semibold text-sm mt-1.5 mb-0.5';
      elements.push(<div key={i} className={className}>{renderInline(text)}</div>);
      continue;
    }

    // Unordered list: * item or - item
    const ulMatch = line.match(/^[\*\-]\s+(.+)$/);
    if (ulMatch) {
      if (listType !== 'ul') flushList();
      listType = 'ul';
      listItems.push(<li key={i}>{renderInline(ulMatch[1])}</li>);
      continue;
    }

    // Ordered list: 1. item
    const olMatch = line.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      if (listType !== 'ol') flushList();
      listType = 'ol';
      listItems.push(<li key={i}>{renderInline(olMatch[1])}</li>);
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      flushList();
      elements.push(<div key={i} className="h-2" />);
      continue;
    }

    // Normal paragraph
    flushList();
    elements.push(<div key={i}>{renderInline(line)}</div>);
  }

  flushList();

  return <div className="text-sm text-gray-800 space-y-0.5">{elements}</div>;
}
