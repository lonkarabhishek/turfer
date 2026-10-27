"use client";

import { AdminError } from "@/components/admin/AdminError";

// Tool users' last guard: its reads already say when they can't load.
export default function AdminToolsError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <AdminError {...props} where="Tool users" />;
}
