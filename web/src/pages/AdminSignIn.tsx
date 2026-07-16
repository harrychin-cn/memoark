import AuthFooter from "@/components/AuthFooter";
import PasswordSignInForm from "@/components/PasswordSignInForm";
import { useInstance } from "@/contexts/InstanceContext";
import { useTranslate } from "@/utils/i18n";

const AdminSignIn = () => {
  const t = useTranslate();
  const { generalSetting: instanceGeneralSetting } = useInstance();

  return (
    <div className="py-4 sm:py-8 w-80 max-w-full min-h-svh mx-auto flex flex-col justify-start items-center">
      <div className="w-full py-4 grow flex flex-col justify-center items-center">
        <div className="w-full flex flex-row justify-center items-center mb-6">
          <img className="h-14 w-auto rounded-full shadow" src={instanceGeneralSetting.customProfile?.logoUrl || "/logo.webp"} alt="" />
          <p className="ml-2 text-5xl text-foreground opacity-80">{instanceGeneralSetting.customProfile?.title || "MemoArk"}</p>
        </div>
        <p className="w-full text-xl font-medium text-muted-foreground">{t("ui.admin-sign-in")}</p>
        <PasswordSignInForm />
      </div>
      <AuthFooter />
    </div>
  );
};

export default AdminSignIn;
