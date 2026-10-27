import type {ContentTypeOption} from '../../shared/types.ts';

interface Props {
  types: ContentTypeOption[];
  /** Slug currently shown. */
  value: string;
  onChange: (slug: string) => void;
}

/** Native <select>: keyboard and screen-reader support for free. Types that cannot be placed on a calendar are listed but disabled. */
export function TypePicker({types, value, onChange}: Props) {
  if (types.length < 2) return null; // nothing to choose between
  return (
    <label className="flex items-center gap-2 text-xs text-neutral-600">
      <span className="font-medium">Content type</span>
      <select
        className="rounded-lg border border-neutral-300 bg-white py-1.5 pl-2.5 pr-7 text-sm text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {types.map((t) => (
          <option key={t.slug} value={t.slug} disabled={!t.calendarShaped && t.slug !== value}>
            {t.name}
            {t.calendarShaped ? '' : ' (no title/start/end fields)'}
          </option>
        ))}
      </select>
    </label>
  );
}
