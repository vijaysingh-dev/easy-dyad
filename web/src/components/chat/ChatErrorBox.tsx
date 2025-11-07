import { X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import api from "@/api";

export function ChatErrorBox({
  onDismiss,
  error,
  isEeziProEnabled,
}: {
  onDismiss: () => void;
  error: string;
  isEeziProEnabled: boolean;
}) {
  const { t, dir } = useI18n();
  if (error.includes("doesn't have a free quota tier")) {
    return (
      <ChatErrorContainer onDismiss={onDismiss}>
        {error}
        <span dir={dir} className="ml-1">
          <ExternalLink href="https://dyad.sh/pro">
            {t("Access with Eezi Pro")}
          </ExternalLink>
        </span>{" "}
        <span dir={dir}>{t("or switch to another model.")}</span>
      </ChatErrorContainer>
    );
  }

  // Important, this needs to come after the "free quota tier" check
  // because it also includes this URL in the error message
  if (
    error.includes("Resource has been exhausted") ||
    error.includes("https://ai.google.dev/gemini-api/docs/rate-limits")
  ) {
    return (
      <ChatErrorContainer onDismiss={onDismiss}>
        {error}
        <span dir={dir} className="ml-1">
          <ExternalLink href="https://dyad.sh/pro">
            {t("Upgrade to Eezi Pro")}
          </ExternalLink>
        </span>{" "}
        <span dir={dir}>{t("or read the")}</span>
        <span dir={dir} className="ml-1">
          <ExternalLink href="https://dyad.sh/docs/help/ai-rate-limit">
            {t("Rate limit troubleshooting guide.")}
          </ExternalLink>
        </span>
      </ChatErrorContainer>
    );
  }

  if (error.includes("LiteLLM Virtual Key expected")) {
    return (
      <ChatInfoContainer onDismiss={onDismiss}>
        <span dir={dir}>
          {t("Looks like you don't have a valid Eezi Pro key.")}{" "}
          <ExternalLink href="https://dyad.sh/pro">
            {t("Upgrade to Eezi Pro")}
          </ExternalLink>{" "}
          {t("today.")}
        </span>
      </ChatInfoContainer>
    );
  }
  if (isEeziProEnabled && error.includes("ExceededBudget:")) {
    return (
      <ChatInfoContainer onDismiss={onDismiss}>
        <span dir={dir}>
          {t("You have used all of your Eezi AI credits this month.")}{" "}
          <ExternalLink href="https://academy.dyad.sh/subscription">
            {t("Upgrade to Eezi Max")}
          </ExternalLink>{" "}
          {t("and get more AI credits")}
        </span>
      </ChatInfoContainer>
    );
  }
  // This is a very long list of model fallbacks that clutters the error message.
  if (error.includes("Fallbacks=")) {
    error = error.split("Fallbacks=")[0];
  }
  return <ChatErrorContainer onDismiss={onDismiss}>{error}</ChatErrorContainer>;
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  const { dir } = useI18n();
  return (
    <a
      dir={dir}
      className="underline cursor-pointer text-blue-500 hover:text-blue-700"
      onClick={() => api.app.openExternalUrl(href)}
    >
      {children}
    </a>
  );
}

function ChatErrorContainer({
  onDismiss,
  children,
}: {
  onDismiss: () => void;
  children: React.ReactNode | string;
}) {
  const { t, dir } = useI18n();
  return (
    <div
      dir={dir}
      className="relative mt-2 bg-red-50 border border-red-200 rounded-md shadow-sm p-2 mx-4"
    >
      <button
        onClick={onDismiss}
        className="absolute top-2.5 left-2 p-1 hover:bg-red-100 rounded"
        aria-label={t("Dismiss error")}
      >
        <X size={14} className="text-red-500" />
      </button>
      <div className="pl-8 py-1 text-sm">
        <div className="text-red-700 text-wrap">
          {typeof children === "string" ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ children: linkChildren, ...props }) => (
                  <a
                    {...props}
                    dir={dir}
                    onClick={(e) => {
                      e.preventDefault();
                      if (props.href) {
                        api.app.openExternalUrl(props.href);
                      }
                    }}
                    className="text-blue-500 hover:text-blue-700"
                  >
                    {linkChildren}
                  </a>
                ),
              }}
            >
              {children}
            </ReactMarkdown>
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  );
}

function ChatInfoContainer({
  onDismiss,
  children,
}: {
  onDismiss: () => void;
  children: React.ReactNode;
}) {
  const { t, dir } = useI18n();
  return (
    <div
      dir={dir}
      className="relative mt-2 bg-sky-50 border border-sky-200 rounded-md shadow-sm p-2 mx-4"
    >
      <button
        onClick={onDismiss}
        className="absolute top-2.5 left-2 p-1 hover:bg-sky-100 rounded"
        aria-label={t("Dismiss info")}
      >
        <X size={14} className="text-sky-600" />
      </button>
      <div className="pl-8 py-1 text-sm">
        <div className="text-sky-800 text-wrap">{children}</div>
      </div>
    </div>
  );
}
