import MobileHeader from "@/components/MobileHeader";
import { useTranslate } from "@/utils/i18n";

const PermissionDenied = () => {
  const t = useTranslate();
  return (
    <section className="@container w-full max-w-5xl min-h-svh flex flex-col justify-start items-center sm:pt-3 md:pt-6 pb-8">
      <MobileHeader />
      <div className="w-full px-4 grow flex flex-col justify-center items-center sm:px-6">
        <p className="font-medium">{t("ui.permission-denied")}</p>
        <p className="mt-4 text-[8rem] font-mono text-foreground">403</p>
      </div>
    </section>
  );
};

export default PermissionDenied;
