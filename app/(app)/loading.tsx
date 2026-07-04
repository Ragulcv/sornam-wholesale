export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <div className="h-7 w-40 rounded-lg bg-line2" />
          <div className="mt-2 h-4 w-56 rounded bg-line2" />
        </div>
        <div className="h-10 w-32 rounded-xl bg-line2" />
      </div>
      <div className="mb-4 grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 rounded-2xl border border-line bg-line2/60" />
        ))}
      </div>
      <div className="rounded-2xl border border-line bg-pearl">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 border-b border-line2 px-4 py-4 last:border-0">
            <div className="h-4 flex-1 rounded bg-line2" />
            <div className="h-4 w-20 rounded bg-line2" />
            <div className="h-4 w-24 rounded bg-line2" />
          </div>
        ))}
      </div>
    </div>
  );
}
