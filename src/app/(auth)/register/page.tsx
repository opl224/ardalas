import { RegisterForm } from "@/components/auth/RegisterForm";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Register - SDN",
  description: "Buat akun baru di SDN.",
};

export default function RegisterPage() {
  return <RegisterForm />;
}