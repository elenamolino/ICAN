import { ReactNode, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import Skeleton from 'react-loading-skeleton';
import Iconify from '../../../../core/components/iconify';
import BlockAlert from '../../../../core/components/block-alert';
import Pagination from '../../../../core/components/pagination';
import SearchInput from '../../../../core/components/search-input';
import { useDebouncedValue } from '../../../../core/hooks/useDebouncedValue';
import { transitionDefault } from '../../../../core/utils/motion-variants';

const PER_PAGE = 12;
const GRID = 'grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3';

interface Props<T> {
  /** What is listed, in the plural: "contracts", "collections". */
  noun: string;
  title: string;
  icon: string;
  loadPage: (filters: Record<string, string>, signal: AbortSignal) => Promise<{ items: T[]; total: number }>;
  renderItem: (item: T) => ReactNode;
}

/** A searchable, paged list of what an organization owns. The API leaves out what the viewer may not see. */
export default function OrgContentTab<T extends { slug: string }>({ noun, title, icon, loadPage, renderItem }: Props<T>) {
  const [items, setItems] = useState<T[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const name = useDebouncedValue(search.trim(), 300);

  // Read through a ref: the API functions change identity whenever the token renews.
  const loadPageRef = useRef(loadPage);
  loadPageRef.current = loadPage;

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setError(null);
    loadPageRef
      .current(
        { limit: String(PER_PAGE), offset: String((page - 1) * PER_PAGE), sortBy: 'name', sort: 'asc', name },
        signal
      )
      .then((result) => {
        if (signal.aborted) return;
        setItems(result.items);
        setTotal(result.total);
      })
      .catch((err: Error) => {
        if (!signal.aborted) setError(err.message);
      });
    return () => controller.abort();
  }, [page, name]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={transitionDefault}
    >
      <div className="rounded-xl border border-tp-hairline bg-tp-canvas">
        <div className="flex flex-col gap-3 border-b border-tp-hairline px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-lg text-tp-ink">{title}</h2>
            <p className="text-xs text-tp-steel">{title} owned by this organization.</p>
          </div>
          <div className="w-full sm:max-w-[20rem]">
            <SearchInput
              live
              placeholder={`Search ${noun}...`}
              onSearch={(value) => {
                setSearch(value);
                setPage(1);
              }}
            />
          </div>
        </div>

        {error ? (
          <div className="p-5">
            <BlockAlert variant="error">{error}</BlockAlert>
          </div>
        ) : !items ? (
          <div className={GRID}>
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} height={96} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-tp-ink">
            <Iconify icon={icon} width={32} />
            <p className="text-sm">{name ? `No ${noun} match "${name}".` : `No ${noun} to show.`}</p>
          </div>
        ) : (
          <div className={GRID}>
            {items.map((item) => (
              <div key={item.slug} className="min-w-0">
                {renderItem(item)}
              </div>
            ))}
          </div>
        )}

        {!error && total > PER_PAGE && (
          <div className="border-t border-tp-hairline py-3">
            <Pagination currentPage={page} totalPages={Math.ceil(total / PER_PAGE)} onPageChange={setPage} />
          </div>
        )}
      </div>
    </motion.div>
  );
}
