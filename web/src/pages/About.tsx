import { ExternalLinkIcon } from "lucide-react";
import BirdIllustration from "@/components/Placeholder/BirdIllustration";
import { BIRD_ILLUSTRATIONS, type BirdIllustration as BirdIllustrationAsset } from "@/components/Placeholder/birdIllustrations";
import SettingGroup from "@/components/Settings/SettingGroup";
import SettingSection from "@/components/Settings/SettingSection";
import { Button } from "@/components/ui/button";
import type { Translations } from "@/utils/i18n";
import { useTranslate } from "@/utils/i18n";

const PRODUCT_LINKS: { label: string; labelKey?: Translations; href: string }[] = [
  { label: "GitHub", href: "https://github.com/harrychin-cn/memoark" },
  { label: "", labelKey: "ui.upstream", href: "https://github.com/usememos/memos" },
  { label: "", labelKey: "ui.license", href: "https://github.com/harrychin-cn/memoark/blob/main/LICENSE" },
];

const PRODUCT_POINTS: Translations[] = ["ui.draft-safe-editing", "ui.visible-recovery", "ui.portable-json-exports"];

const BIRD_NAME_KEYS: Record<string, Translations> = {
  OwlNote: "ui.bird-owl-note",
  EagleLetter: "ui.bird-eagle-letter",
  ToucanBookmark: "ui.bird-toucan-bookmark",
};

const BirdCard = ({ illustration }: { illustration: BirdIllustrationAsset }) => {
  const t = useTranslate();
  return (
    <figure className="flex w-auto min-w-28 flex-none flex-col items-center gap-3 rounded-xl border border-border bg-muted/20 px-4 py-4 text-center">
      <BirdIllustration illustration={illustration} size={72} testId="about-bird-illustration" />
      <figcaption className="min-w-0">
        <h3 className="text-sm text-foreground">{t(BIRD_NAME_KEYS[illustration.name])}</h3>
      </figcaption>
    </figure>
  );
};

const About = () => {
  const t = useTranslate();
  return (
    <section className="mx-auto w-full max-w-5xl min-h-full flex flex-col justify-start items-start sm:pt-3 md:pt-6 pb-8">
      <div className="w-full px-4 sm:px-6">
        <div className="w-full rounded-xl border border-border bg-background px-4 py-4 text-muted-foreground">
          <SettingSection title={t("ui.about-title")} description={t("ui.about-description")}>
            <SettingGroup>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <img className="size-12 shrink-0 select-none rounded-md" src="/logo.webp" alt="" draggable={false} />
                  <div className="min-w-0">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">MemoArk</h1>
                    <p className="mt-1 text-sm text-muted-foreground">{t("ui.about-tagline")}</p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {PRODUCT_LINKS.map((link) => (
                    <Button key={link.href} asChild variant="outline" size="lg">
                      <a href={link.href} target="_blank" rel="noreferrer">
                        {link.labelKey ? t(link.labelKey) : link.label}
                        <ExternalLinkIcon className="size-3.5" />
                      </a>
                    </Button>
                  ))}
                </div>
              </div>
            </SettingGroup>

            <SettingGroup showSeparator title={t("ui.product")} description={t("ui.product-description")}>
              <div className="grid gap-3 sm:grid-cols-3">
                {PRODUCT_POINTS.map((key) => (
                  <div key={key} className="rounded-lg bg-muted/40 px-3 py-2 text-sm text-foreground">
                    {t(key)}
                  </div>
                ))}
              </div>
            </SettingGroup>

            <SettingGroup showSeparator title={t("ui.upstream")} description={t("ui.upstream-description")}>
              <p className="text-sm leading-6 text-muted-foreground">{t("ui.upstream-license")}</p>
            </SettingGroup>

            <SettingGroup showSeparator title={t("ui.birds")} description={t("ui.birds-description")}>
              <section aria-label={t("ui.birds")} className="flex flex-row flex-wrap gap-3">
                {BIRD_ILLUSTRATIONS.map((illustration) => (
                  <BirdCard key={illustration.name} illustration={illustration} />
                ))}
              </section>
            </SettingGroup>
          </SettingSection>
        </div>
      </div>
    </section>
  );
};

export default About;
