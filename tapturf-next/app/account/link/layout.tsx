import type { Metadata } from "next";

// Where Google comes back to while a phone account adds its Google account. Private, never indexed.
export const metadata: Metadata = {
  title: "Adding Google",
  robots: { index: false, follow: false },
};

export default function AccountLinkLayout({ children }: { children: React.ReactNode }) {
  return children;
}
