import { SignUpForm } from "@/components/sign-up-form";
import { AuthBackground } from "@/components/auth/auth-background";

export default function Page() {
  return (
    <AuthBackground>
      <SignUpForm />
    </AuthBackground>
  );
}
