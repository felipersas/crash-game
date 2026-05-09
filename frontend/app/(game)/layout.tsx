import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { ReactNode } from "react";

import { authOptions } from "@/infrastructure/auth/nextauth.config";
import GameLayout from "./game/components/game-layout/GameLayout";

export default async function ProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  return <GameLayout>{children}</GameLayout>;
}
