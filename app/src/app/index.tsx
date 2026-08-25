// 진입점 — 로그인 여부에 따라 탭 또는 로그인 화면으로 보낸다.
import React from "react";
import { Redirect } from "expo-router";
import { useAuth } from "@/lib/auth";
import { Screen, Loading } from "@/components/ui";

export default function Index() {
  const { ready, signedIn } = useAuth();
  if (!ready) return <Screen scroll={false}><Loading text="불러오는 중" /></Screen>;
  return <Redirect href={signedIn ? "/(tabs)/home" : "/login"} />;
}
