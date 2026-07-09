type AdminStatusSelectProps<TStatus extends string> = {
  value: TStatus | string;
  statuses: readonly TStatus[];
  onChange: (status: TStatus) => void;
  className?: string;
};

export function AdminStatusSelect<TStatus extends string>({
  value,
  statuses,
  onChange,
  className = 'admin-status-select',
}: AdminStatusSelectProps<TStatus>) {
  return (
    <select className={className} value={value} onChange={(event) => onChange(event.target.value as TStatus)}>
      {statuses.map((status) => (
        <option key={status} value={status}>
          {status}
        </option>
      ))}
    </select>
  );
}
