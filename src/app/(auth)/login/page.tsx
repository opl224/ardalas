import { LoginForm } from "@/components/auth/LoginForm";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Login - Ardalas",
  description: "Login ke akun Ardalas Anda.",
};

export default function LoginPage() {
  return <LoginForm />;
}
