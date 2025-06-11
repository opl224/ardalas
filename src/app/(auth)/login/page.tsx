import { LoginForm } from "@/components/auth/LoginForm";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Login - EduCentral",
  description: "Login ke akun EduCentral Anda.",
};

export default function LoginPage() {
  return <LoginForm />;
}