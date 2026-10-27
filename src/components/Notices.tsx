import type {SkippedEntry} from '../../shared/types.ts';

export function ErrorBanner({message, onRetry, hasData}: {message: string; onRetry: () => void; hasData: boolean}) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
      <p>
        <strong className="font-semibold">{hasData ? 'Couldn’t refresh events.' : 'Couldn’t load events.'}</strong> {message}
        {hasData && ' Showing the last loaded data.'}
      </p>
      <button type="button" className="btn-secondary" onClick={onRetry}>Try again</button>
    </div>
  );
}

export function SkippedNotice({skipped, truncated}: {skipped: SkippedEntry[]; truncated: boolean}) {
  if (!skipped.length && !truncated) return null;
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      {truncated && <p>Only the most recent 1,000 Lattice entries were loaded; older events are not shown.</p>}
      {skipped.length > 0 && (
        <details>
          <summary className="cursor-pointer font-medium">
            {skipped.length} {skipped.length === 1 ? 'entry' : 'entries'} in Lattice can’t be shown
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {skipped.map((s) => (
              <li key={s.id}>Entry #{s.id}: {s.reason}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function Overlay({children}: {children: React.ReactNode}) {
  return (
    <div className="absolute inset-0 z-10 grid place-items-center rounded-2xl bg-white/80 p-6 text-center backdrop-blur-[1px]">
      {children}
    </div>
  );
}
