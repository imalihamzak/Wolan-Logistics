import {
  ExternalLinkIcon,
  HelpCircleIcon,
  MailIcon,
  MessageCircleIcon,
  PhoneCallIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { LoaderGlyph } from "./AppLoader";
import api from "../lib/api";

type SupportPanelProps = {
  compact?: boolean;
  title?: string;
};

type SupportConfig = {
  managed_by_api?: boolean;
  provider_change_mode?: string;
  temporary_testing_line?: boolean;
  channels?: {
    whatsapp?: {
      enabled?: boolean;
      display_number?: string;
      href?: string;
      provider?: string;
    };
    voice?: {
      enabled?: boolean;
      display_number?: string;
      href?: string;
      provider?: string;
    };
    email?: {
      enabled?: boolean;
      address?: string | null;
      href?: string | null;
      provider?: string | null;
    };
  };
  help_center?: {
    enabled?: boolean;
    href?: string | null;
    source?: string;
  };
};

const TEST_SUPPORT_PHONE = "+256 761 253001";

const fallbackWhatsAppHref = (phone: string) => (
  `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent("Hello Wolan Support")}`
);

const fallbackSupportConfig: SupportConfig = {
  managed_by_api: false,
  temporary_testing_line: true,
  channels: {
    whatsapp: {
      enabled: true,
      display_number: TEST_SUPPORT_PHONE,
      href: fallbackWhatsAppHref(TEST_SUPPORT_PHONE),
      provider: "testing_whatsapp_redirect",
    },
    voice: {
      enabled: true,
      display_number: TEST_SUPPORT_PHONE,
      href: `tel:${TEST_SUPPORT_PHONE.replace(/\s/g, "")}`,
      provider: "testing_voice_call",
    },
    email: {
      enabled: Boolean(import.meta.env.VITE_SUPPORT_EMAIL),
      address: import.meta.env.VITE_SUPPORT_EMAIL || null,
      href: import.meta.env.VITE_SUPPORT_EMAIL
        ? `mailto:${import.meta.env.VITE_SUPPORT_EMAIL}?subject=${encodeURIComponent("Wolan Delivery Support")}`
        : null,
      provider: null,
    },
  },
  help_center: {
    enabled: true,
    href: null,
    source: "in_app_faq",
  },
};

const faqs = [
  {
    question: "What should I do if an order is stuck?",
    answer: "Check the handover, hub scan-in, rider assignment, and latest status history before escalating to support.",
  },
  {
    question: "Why are delivery actions disabled?",
    answer: "The app blocks actions until the required security step is complete, such as KYC verification, pickup key handover, hub scan-in, or OTP confirmation.",
  },
  {
    question: "Who can unlock or override accounts?",
    answer: "Only authorized admin users can unlock accounts, reinstate riders, update operational profiles, or apply manual dispatch overrides.",
  },
];

export default function SupportPanel({ compact = false, title = "Support" }: SupportPanelProps) {
  const [supportConfig, setSupportConfig] = useState<SupportConfig>(fallbackSupportConfig);
  const [supportLoading, setSupportLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    api.get("/support/config")
      .then(({ data }) => {
        const nextConfig = data?.data?.support || data?.support;
        if (mounted && nextConfig) {
          setSupportConfig(nextConfig);
        }
      })
      .catch(() => {
        if (mounted) {
          setSupportConfig(fallbackSupportConfig);
        }
      })
      .finally(() => {
        if (mounted) {
          setSupportLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const supportLinks = useMemo(() => {
    const whatsapp = supportConfig.channels?.whatsapp || fallbackSupportConfig.channels?.whatsapp;
    const voice = supportConfig.channels?.voice || fallbackSupportConfig.channels?.voice;
    const email = supportConfig.channels?.email || fallbackSupportConfig.channels?.email;

    return [
      {
        label: "WhatsApp",
        detail: whatsapp?.display_number || TEST_SUPPORT_PHONE,
        href: whatsapp?.href || fallbackWhatsAppHref(whatsapp?.display_number || TEST_SUPPORT_PHONE),
        Icon: MessageCircleIcon,
        external: true,
        available: whatsapp?.enabled !== false,
        missingReason: "WhatsApp support is not enabled in the backend support configuration.",
      },
      {
        label: "Voice Call",
        detail: voice?.display_number || TEST_SUPPORT_PHONE,
        href: voice?.href || `tel:${(voice?.display_number || TEST_SUPPORT_PHONE).replace(/\s/g, "")}`,
        Icon: PhoneCallIcon,
        external: false,
        available: voice?.enabled !== false,
        missingReason: "Voice call support is not enabled in the backend support configuration.",
      },
      {
        label: "Email",
        detail: email?.address || "provider/config required",
        href: email?.href || "",
        Icon: MailIcon,
        external: false,
        available: Boolean(email?.enabled && email?.href),
        missingReason: "Email support requires SUPPORT_EMAIL in the backend support configuration.",
      },
    ];
  }, [supportConfig]);

  return (
    <div className={`rounded-2xl border border-border bg-card shadow-custom ${compact ? "p-4" : "p-5"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Help center</p>
          <h3 className="mt-1 text-sm font-bold text-foreground">{title}</h3>
          {supportLoading ? (
            <span className="mt-1 inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <LoaderGlyph size="xs" label="Loading support channels" />
              Loading support channels
            </span>
          ) : (
            <p className="mt-1 text-[10px] text-muted-foreground">
              {supportConfig.managed_by_api ? "API-managed support channels" : "Testing support fallback active"}
            </p>
          )}
        </div>
        <HelpCircleIcon className="h-5 w-5 shrink-0 text-primary" />
      </div>

      <div className={`mt-4 grid gap-2 ${compact ? "" : "sm:grid-cols-3"}`}>
        {supportLinks.map(({ label, detail, href, Icon, external, available, missingReason }) => {
          const content = (
            <>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 text-xs font-semibold text-foreground">
                  {label}
                  {external && available ? <ExternalLinkIcon className="h-3 w-3 text-muted-foreground group-hover:text-primary" /> : null}
                </span>
                <span className="mt-0.5 block break-words text-[10px] text-muted-foreground">{available ? detail : "Provider/config required"}</span>
              </span>
            </>
          );

          return available ? (
            <a
              key={label}
              href={href}
              target={external ? "_blank" : undefined}
              rel={external ? "noreferrer" : undefined}
              title={`Open Wolan ${label} support.`}
              className="group flex min-w-0 items-center gap-3 rounded-xl border border-border bg-background/70 px-3 py-3 text-left transition-colors hover:border-primary/30 hover:bg-primary/5"
            >
              {content}
            </a>
          ) : (
            <button
              key={label}
              type="button"
              title={missingReason}
              onClick={() => toast.error(missingReason)}
              className="group flex min-w-0 items-center gap-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-3 text-left text-warning transition-colors hover:bg-warning/15"
            >
              {content}
            </button>
          );
        })}
      </div>

      <div className="mt-4 rounded-xl border border-border bg-background/70">
        {faqs.map((item, index) => (
          <details key={item.question} className="group border-b border-border last:border-b-0">
            <summary className="cursor-pointer list-none px-3 py-3 text-xs font-semibold text-foreground">
              <span className="inline-flex w-full items-center justify-between gap-3">
                {item.question}
                <span className="text-primary transition-transform group-open:rotate-45">+</span>
              </span>
            </summary>
            <p className={`px-3 pb-3 text-xs leading-relaxed text-muted-foreground ${index === faqs.length - 1 ? "" : ""}`}>
              {item.answer}
            </p>
          </details>
        ))}
      </div>
    </div>
  );
}
