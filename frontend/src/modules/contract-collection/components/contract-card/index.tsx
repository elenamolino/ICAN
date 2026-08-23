import { motion } from 'framer-motion';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { useRouter } from '../../../core/hooks/useRouter';
import OrgAvatar from '../../../core/components/org-avatar';
import { Contract } from '../../api/contractCollectionsApi';

interface Props {
  data: Contract;
}

export default function ContractCard({ data }: Props) {
  const router = useRouter();

  const handleNavigate = () => {
    if (!data.organization) return;
    router.push(
      data.collection
        ? `/collections/${data.organization.id}/${data.collection.slug}/${data.slug}`
        : `/contracts/${data.organization.id}/${data.slug}`
    );
  };

  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.15 }}
      onClick={handleNavigate}
      className="group cursor-pointer rounded-xl border border-tp-hairline bg-tp-canvas p-4 transition-colors hover:border-tp-hairline-strong hover:shadow-elevation-2"
    >
      <div className="mb-3 min-w-0">
        {data.organization && (
          <div className="mb-1 flex items-center gap-2">
            <OrgAvatar
              name={data.organization.displayName || data.organization.name}
              avatar={data.organization.avatar}
              size={20}
              square
            />
            <span className="truncate text-[11px] text-tp-steel">
              {data.organization.displayName || data.organization.name}
            </span>
            {data.collection?.name && (
              <>
                <span className="text-tp-hairline">/</span>
                <span className="truncate text-[11px] text-tp-steel">{data.collection.name}</span>
              </>
            )}
          </div>
        )}
        <h3 className="truncate text-sm font-medium text-tp-ink group-hover:text-tp-primary">
          {data.name}
        </h3>
      </div>

      <div className="flex items-center gap-3 text-[11px] text-tp-steel">
        {data.version && (
          <span className="inline-flex items-center gap-1 rounded bg-tp-surface px-1.5 py-0.5">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Synced
          </span>
        )}
        {data.createdAt && (
          <span className="text-tp-muted">{formatDistanceToNow(parseISO(data.createdAt), { addSuffix: true })}</span>
        )}
      </div>
    </motion.div>
  );
}
