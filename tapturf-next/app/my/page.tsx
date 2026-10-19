import { Suspense } from "react";
import { MyHome } from "@/components/my/MyHome";

export default function MyPage() {
  return (
    <Suspense fallback={null}>
      <MyHome />
    </Suspense>
  );
}
