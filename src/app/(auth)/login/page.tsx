import { LoginForm } from "@/components/auth/LoginForm";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Login - SDN",
  description: "Login ke akun SDN Anda.",
};

export default function LoginPage() {
  return <LoginForm />;
}