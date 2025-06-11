import { RegisterForm } from "@/components/auth/RegisterForm";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Register - EduCentral",
  description: "Buat akun baru di EduCentral.",
};

export default function RegisterPage() {
  return <RegisterForm />;
}