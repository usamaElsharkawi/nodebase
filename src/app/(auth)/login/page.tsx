import { LoginForm } from "@/app/features/auth/components/login-form";
import { requireUnAuth } from "@/lib/auth-utils";


const Page = async () => {
  await requireUnAuth();

  return <LoginForm />;
};

export default Page;