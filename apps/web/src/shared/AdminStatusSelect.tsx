type AdminStatusSelectProps<TStatus extends string> = {
  value: TStatus | string;
  statuses: readonly TStatus[];
  onChange: (status: TStatus) => void;
  className?: string;
  labels?: Partial<Record<TStatus, string>>;
};

export function AdminStatusSelect<TStatus extends string>({
  value,
  statuses,
  onChange,
  className = 'admin-status-select',
  labels,
}: AdminStatusSelectProps<TStatus>) {
  return (
    <select className={className} value={value} onChange={(event) => onChange(event.target.value as TStatus)}>
      {statuses.map((status) => (
        <option key={status} value={status}>
          {labels?.[status] ?? status}
        </option>
      ))}
    </select>
  );
}
