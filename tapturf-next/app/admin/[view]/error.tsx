"use client";

import { AdminError } from "@/components/admin/AdminError";

// A list view's last guard: its reads already say when they can't load.
export default function AdminViewError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <AdminError {...props} where="This list" />;
}
