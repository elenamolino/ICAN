import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import Skeleton from 'react-loading-skeleton';
import { motion } from 'framer-motion';
import SearchInput from '../../../core/components/search-input';
import FilterBar from '../../../core/components/filter-bar';
import Pagination from '../../../core/components/pagination';
import { staggerContainer, fadeInUp, transitionDefault } from '../../../core/utils/motion-variants';
import { Contract, listContracts } from '../../api/contractCollectionsApi';
import ContractCard from '../../components/contract-card';

const PER_PAGE = 12;

export default function ContractsListPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [textFilter, setTextFilter] = useState('');
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await listContracts({
        limit: PER_PAGE,
        offset: (page - 1) * PER_PAGE,
        name: textFilter || undefined,
        collection: selectedCollections[0],
      });
      setContracts(data.contracts);
      setTotal(data.total);
    } catch {
      setContracts([]);
    } finally {
      setIsLoading(false);
    }
  }, [page, textFilter, selectedCollections]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const collectionFilters = useMemo(() => {
    const counts: Record<string, { label: string; count: number }> = {};
    contracts.forEach((c) => {
      if (!c.collection) return;
      counts[c.collection.slug] = { label: c.collection.name, count: (counts[c.collection.slug]?.count ?? 0) + 1 };
    });
    return Object.entries(counts).map(([value, { label, count }]) => ({ label, value, count }));
  }, [contracts]);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6 md:px-8">
      <Helmet>
        <title>Contracts | ICAN</title>
      </Helmet>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={transitionDefault} className="mb-6">
        <h1 className="font-display text-2xl font-normal text-tp-ink">Contracts</h1>
        <p className="mt-1 text-sm text-tp-steel">All Terms of Service and Privacy Policy contracts.</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...transitionDefault, delay: 0.05 }}
        className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="w-full sm:max-w-[20rem]">
          <SearchInput placeholder="Search contracts..." onSearch={(v) => { setTextFilter(v); setPage(1); }} />
        </div>
        <FilterBar
          label="Collection"
          options={collectionFilters}
          selected={selectedCollections}
          onChange={(c) => { setSelectedCollections(c.slice(0, 1)); setPage(1); }}
          onClear={() => { setSelectedCollections([]); setTextFilter(''); setPage(1); }}
        />
      </motion.div>

      <div className="mb-4 text-xs text-tp-steel">
        {isLoading ? 'Loading...' : `${total} ${total === 1 ? 'contract' : 'contracts'} found`}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: PER_PAGE }).map((_, i) => (
            <Skeleton key={i} height={96} />
          ))}
        </div>
      ) : contracts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-tp-hairline bg-tp-canvas py-16 text-center">
          <svg className="mb-3 h-10 w-10 text-tp-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          <p className="text-sm font-medium text-tp-ink">No contracts found</p>
          <p className="mt-1 text-xs text-tp-steel">Try adjusting your search or filters.</p>
        </div>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {contracts.map((contract) => (
            <motion.div key={contract.id ?? contract.slug} variants={fadeInUp} transition={transitionDefault}>
              <ContractCard data={contract} />
            </motion.div>
          ))}
        </motion.div>
      )}

      <div className="mt-6">
        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
      </div>
    </div>
  );
}
