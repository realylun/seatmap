import Link from "next/link";
import { linkCls } from "./_components/ui";

export default function AdminNotFound() {
  return (
    <div>
      <h1 className="mb-2 text-xl font-semibold">Not found</h1>
      <p className="mb-4 text-sm">That record does not exist.</p>
      <Link href="/admin" className={linkCls}>
        Back to admin
      </Link>
    </div>
  );
}
