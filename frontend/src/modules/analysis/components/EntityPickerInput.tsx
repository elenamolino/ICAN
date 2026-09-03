import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Iconify from '../../core/components/iconify';

export interface EntityOption {
  id: string;
  name: string;
}

export type EntitySelection = { mode: 'existing'; id: string; name: string } | { mode: 'new'; name: string };

interface EntityPickerInputProps {
  items: EntityOption[];
  loading?: boolean;
  disabled?: boolean;
  selection: EntitySelection | null;
  onChange: (selection: EntitySelection | null) => void;
  placeholder?: string;
  createLabel?: (query: string) => string;
}

export default function EntityPickerInput({
  items,
  loading = false,
  disabled = false,
  selection,
  onChange,
  placeholder = 'Search or type to create...',
  createLabel = (query) => `Create "${query}"`,
}: EntityPickerInputProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);

  const updateDropdownPosition = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDropdownStyle({
        position: 'fixed',
        top: `${rect.bottom + 4}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        zIndex: 9999,
      });
    }
  }, []);

  const q = query.trim().toLowerCase();
  const results = q ? items.filter((item) => item.name.toLowerCase().includes(q)) : items;
  const hasExactMatch = q !== '' && items.some((item) => item.name.toLowerCase() === q);
  const showCreateOption = q !== '' && !hasExactMatch;
  const totalOptions = results.length + (showCreateOption ? 1 : 0);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [query, items]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen) updateDropdownPosition();
  }, [isOpen, updateDropdownPosition]);

  const selectExisting = (item: EntityOption) => {
    onChange({ mode: 'existing', id: item.id, name: item.name });
    setQuery('');
    setIsOpen(false);
  };

  const selectNew = (name: string) => {
    onChange({ mode: 'new', name });
    setQuery('');
    setIsOpen(false);
  };

  const clear = () => {
    onChange(null);
    setQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen && totalOptions > 0) setIsOpen(true);
      setHighlightedIndex((prev) => Math.min(prev + 1, totalOptions - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex < results.length) {
        if (results[highlightedIndex]) selectExisting(results[highlightedIndex]);
      } else if (showCreateOption) {
        selectNew(query.trim());
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const dropdownContent =
    isOpen && (results.length > 0 || showCreateOption) ? (
      <div
        style={dropdownStyle}
        onMouseDown={(e) => e.stopPropagation()}
        className="max-h-60 overflow-y-auto rounded-lg border border-tp-hairline bg-tp-canvas py-1 shadow-elevation-4"
      >
        {results.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => selectExisting(item)}
            onMouseEnter={() => setHighlightedIndex(index)}
            className={`flex w-full cursor-pointer items-center px-3 py-2 text-left text-sm text-tp-ink transition-colors ${
              index === highlightedIndex ? 'bg-tp-surface' : ''
            }`}
          >
            {item.name}
          </button>
        ))}
        {showCreateOption && (
          <button
            type="button"
            onClick={() => selectNew(query.trim())}
            onMouseEnter={() => setHighlightedIndex(results.length)}
            className={`flex w-full cursor-pointer items-center gap-1.5 px-3 py-2 text-left text-sm text-tp-primary transition-colors ${
              highlightedIndex === results.length ? 'bg-tp-surface' : ''
            }`}
          >
            <Iconify icon="mdi:plus" width={14} />
            {createLabel(query.trim())}
          </button>
        )}
      </div>
    ) : isOpen && q !== '' && results.length === 0 && !showCreateOption ? (
      <div
        style={dropdownStyle}
        className="w-full rounded-lg border border-tp-hairline bg-tp-canvas py-4 text-center shadow-elevation-4"
      >
        <p className="text-sm text-tp-steel">No results</p>
      </div>
    ) : null;

  if (selection) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-tp-hairline bg-tp-canvas px-3 py-2">
        <span className="flex-1 text-sm text-tp-ink">
          {selection.name}
          {selection.mode === 'new' && <span className="ml-1.5 text-xs text-tp-steel">(new)</span>}
        </span>
        {!disabled && (
          <button
            type="button"
            onClick={clear}
            className="cursor-pointer text-tp-steel hover:text-tp-ink"
          >
            <Iconify icon="mdi:close" width={14} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-tp-hairline bg-tp-canvas px-3 py-2 focus-within:border-tp-primary focus-within:ring-1 focus-within:ring-tp-primary/20">
        <input
          type="text"
          value={query}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="min-w-[120px] flex-1 bg-transparent text-sm text-tp-ink outline-none placeholder:text-tp-muted disabled:cursor-not-allowed"
        />
        {loading && (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-tp-primary border-t-transparent" />
        )}
      </div>

      {dropdownContent && createPortal(dropdownContent, document.body)}
    </div>
  );
}
