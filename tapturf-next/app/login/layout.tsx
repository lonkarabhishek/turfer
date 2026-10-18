import type { Metadata } from "next";

// /login and /login/complete are the only routes that inherit the root
// default title; they have no reason to be in the index.
export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
