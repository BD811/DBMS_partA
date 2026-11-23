import { AuthForm } from "@/components/auth/auth-form";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return <AuthForm callbackError={searchParams.error === "callback"} mode="login" />;
}
