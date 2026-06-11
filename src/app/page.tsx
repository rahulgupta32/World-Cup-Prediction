import { getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  } else {
    redirect("/dashboard");
  }
}
