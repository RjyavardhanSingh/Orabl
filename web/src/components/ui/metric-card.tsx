/** Solid maroon metric card shared by the dashboard and the results page. Place it inside a <dl>. */
export function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-[#451017] rounded-sm p-6 shadow-sm">
      <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[#EBE5D9]/70">{label}</dt>
      <dd className="tabular mt-3 truncate font-serif text-3xl leading-none sm:text-4xl text-[#EBE5D9]">{value}</dd>
      {hint ? <p className="mt-1.5 truncate text-sm text-[#EBE5D9]/60">{hint}</p> : null}
    </div>
  )
}
