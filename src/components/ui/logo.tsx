import Link from "next/link";

export function Logo() {
  return (
    <Link
      href="/"
      aria-label="SEATMAP home"
      className="flex flex-col font-display text-[19px] leading-[0.88] tracking-tight text-accent uppercase"
    >
      <span>Seat</span>
      <span>Map</span>
    </Link>
  );
}
