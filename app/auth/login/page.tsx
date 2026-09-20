import { LoginForm } from "@/components/login-form";
import { AuthBackground } from "@/components/auth/auth-background";

export default function Page() {
  return (
    <AuthBackground>
      <LoginForm />
    </AuthBackground>
  );
}
