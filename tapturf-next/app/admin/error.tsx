"use client";

import { AdminError } from "@/components/admin/AdminError";

// The admin home's last guard: its sections fail soft on their own (components/admin/HomeSections.tsx).
export default function AdminHomeError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <AdminError {...props} where="The admin page" />;
}
