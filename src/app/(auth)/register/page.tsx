import { RegisterForm } from "@/components/auth/RegisterForm";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Register - Ardalas",
  description: "Buat akun baru di Ardalas.",
};

export default function RegisterPage() {
  return <RegisterForm />;
}
