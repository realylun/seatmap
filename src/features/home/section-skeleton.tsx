export function CardsSkeleton({ dark = false }: { dark?: boolean }) {
  const tone = dark ? "bg-white/10" : "bg-black/5";
  return (
    <div
      aria-hidden="true"
      className="grid animate-pulse grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-4"
    >
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i}>
          <div className={`aspect-5/3 rounded-xl ${tone}`} />
          <div className={`mt-3 h-4 w-3/4 rounded ${tone}`} />
          <div className={`mt-2 h-3 w-1/3 rounded ${tone}`} />
        </div>
      ))}
    </div>
  );
}
