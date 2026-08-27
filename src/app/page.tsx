import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { homePathForRole } from "@/domain/authz";

export default async function Home() {
  const user = await currentUser();
  redirect(user ? homePathForRole(user.role) : "/login");
}
