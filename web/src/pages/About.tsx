import { ExternalLinkIcon } from "lucide-react";
import BirdIllustration from "@/components/Placeholder/BirdIllustration";
import { BIRD_ILLUSTRATIONS, type BirdIllustration as BirdIllustrationAsset } from "@/components/Placeholder/birdIllustrations";
import SettingGroup from "@/components/Settings/SettingGroup";
import SettingSection from "@/components/Settings/SettingSection";
import { Button } from "@/components/ui/button";

const PRODUCT_LINKS = [
  { label: "GitHub", href: "https://github.com/harrychin-cn/memoark" },
  { label: "Upstream", href: "https://github.com/usememos/memos" },
  { label: "License", href: "https://github.com/harrychin-cn/memoark/blob/main/LICENSE" },
];

const PRODUCT_POINTS = ["Draft-safe editing.", "Visible recovery.", "Portable JSON exports."];

const BirdCard = ({ illustration }: { illustration: BirdIllustrationAsset }) => {
  return (
    <figure className="flex w-auto min-w-28 flex-none flex-col items-center gap-3 rounded-xl border border-border bg-muted/20 px-4 py-4 text-center">
      <BirdIllustration illustration={illustration} size={72} testId="about-bird-illustration" />
      <figcaption className="min-w-0">
        <h3 className="font-mono text-sm text-foreground">{illustration.name}</h3>
      </figcaption>
    </figure>
  );
};

const About = () => {
  return (
    <section className="mx-auto w-full max-w-5xl min-h-full flex flex-col justify-start items-start sm:pt-3 md:pt-6 pb-8">
      <div className="w-full px-4 sm:px-6">
        <div className="w-full rounded-xl border border-border bg-background px-4 py-4 text-muted-foreground">
          <SettingSection
            title="About MemoArk"
            description="Reliable, self-hosted notes with draft safety, visible recovery, and portable data."
          >
            <SettingGroup>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <img className="size-12 shrink-0 select-none rounded-md" src="/logo.webp" alt="" draggable={false} />
                  <div className="min-w-0">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">MemoArk</h1>
                    <p className="mt-1 text-sm text-muted-foreground">Write freely. Recover safely.</p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {PRODUCT_LINKS.map((link) => (
                    <Button key={link.href} asChild variant="outline" size="lg">
                      <a href={link.href} target="_blank" rel="noreferrer">
                        {link.label}
                        <ExternalLinkIcon className="size-3.5" />
                      </a>
                    </Button>
                  ))}
                </div>
              </div>
            </SettingGroup>

            <SettingGroup
              showSeparator
              title="Product"
              description="A lightweight note timeline designed to protect unfinished work and keep data portable."
            >
              <div className="grid gap-3 sm:grid-cols-3">
                {PRODUCT_POINTS.map((item) => (
                  <div key={item} className="rounded-lg bg-muted/40 px-3 py-2 text-sm text-foreground">
                    {item}
                  </div>
                ))}
              </div>
            </SettingGroup>

            <SettingGroup showSeparator title="Upstream" description="MemoArk is an independent project based on Memos v0.29.1.">
              <p className="text-sm leading-6 text-muted-foreground">
                The original Memos copyright, MIT license, and Git history are preserved. MemoArk is not affiliated with or endorsed by the
                original Memos project.
              </p>
            </SettingGroup>

            <SettingGroup showSeparator title="Birds" description="Smooth vector companions used by empty states.">
              <section aria-label="Birds" className="flex flex-row flex-wrap gap-3">
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
