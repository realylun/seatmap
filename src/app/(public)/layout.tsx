import { SiteHeader } from "@/components/ui/site-header";

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <SiteHeader />
      <div className="flex-1">{children}</div>
      <footer className="border-t border-line px-4 py-8 text-center text-sm text-muted">
        SEATMAP demo. Payments are simulated.
      </footer>
    </>
  );
}
