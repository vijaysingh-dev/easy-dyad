import { toast } from "sonner";
import { PostHog } from "posthog-js";
import { CustomErrorToast } from "./CustomErrorToast";
import { InputRequestToast } from "./InputRequestToast";
import { McpConsentToast } from "./McpConsentToast";
import i18n from "@/lib/i18n";

const t = i18n.t.bind(i18n);
const dir = i18n.language === "ar" ? "rtl" : "ltr";

/**
 * Toast utility functions for consistent notifications across the app
 */

/**
 * Show a success toast
 * @param message The message to displa
 */
export const showSuccess = (message: string) => {
  const t = i18n.t.bind(i18n);
  toast.success(<span dir={dir}>{t(message)}</span>);
};

/**
 * Show an error toast
 * @param message The error message to display
 */
export const showError = (message: any) => {
  const errorMessage = message.toString();
  console.error(message);

  const onCopy = (toastId: string | number) => {
    navigator.clipboard.writeText(errorMessage);

    // Update the toast to show the 'copied' state
    toast.custom(
      (toastInst) => (
        <CustomErrorToast
          message={t(errorMessage)}
          toastId={toastInst}
          copied={true}
          onCopy={() => onCopy(toastInst)}
        />
      ),
      { id: toastId, duration: Infinity }
    );

    // After 2 seconds, revert the toast back to the original state
    setTimeout(() => {
      toast.custom(
        (toastInst) => (
          <CustomErrorToast
            message={t(errorMessage)}
            toastId={toastInst}
            copied={false}
            onCopy={() => onCopy(toastInst)}
          />
        ),
        { id: toastId, duration: Infinity }
      );
    }, 2000);
  };

  // Use custom error toast with enhanced features
  const toastId = toast.custom(
    (toastInst) => (
      <CustomErrorToast
        message={t(errorMessage)}
        toastId={toastInst}
        onCopy={() => onCopy(toastInst)}
      />
    ),
    { duration: 8_000 }
  );

  return toastId;
};

/**
 * Show a warning toast
 * @param message The warning message to display
 */
export const showWarning = (message: string) => {
  toast.warning(<span dir={dir}>{t(message)}</span>);
  console.warn(message);
};

/**
 * Show an info toast
 * @param message The info message to display
 */
export const showInfo = (message: string) => {
  toast.info(<span dir={dir}>{t(message)}</span>);
};

/**
 * Show an input request toast for interactive prompts (y/n)
 * @param message The prompt message to display
 * @param onResponse Callback function called when user responds
 */
export const showInputRequest = (
  message: string,
  onResponse: (response: "y" | "n") => void
) => {
  const toastId = toast.custom(
    (toastInst) => (
      <InputRequestToast
        message={t(message)}
        toastId={toastInst}
        onResponse={onResponse}
      />
    ),
    { duration: Infinity } // Don't auto-close
  );

  return toastId;
};

export function showMcpConsentToast(args: {
  serverName: string;
  toolName: string;
  toolDescription?: string | null;
  inputPreview?: string | null;
  onDecision: (d: "accept-once" | "accept-always" | "decline") => void;
}) {
  const toastId = toast.custom(
    (toastInst) => (
      <McpConsentToast
        toastId={toastInst}
        serverName={args.serverName}
        toolName={args.toolName}
        toolDescription={args.toolDescription}
        inputPreview={args.inputPreview}
        onDecision={args.onDecision}
      />
    ),
    { duration: Infinity }
  );
  return toastId;
}

export const showExtraFilesToast = ({
  files,
  error,
  posthog,
}: {
  files: string[];
  error?: string;
  posthog: PostHog;
}) => {
  if (error) {
    showError(
      t("Error committing files: files changed outside of Eezi", {
        files: files.join(", "),
        error,
      })
    );
    posthog.capture("extra-files:error", {
      files: files,
      error,
    });
  } else {
    showWarning(
      t("Files changed outside of Eezi have automatically been committed: files", {
        files: files.join("\n"),
      })
    );
    posthog.capture("extra-files:warning", {
      files: files,
    });
  }
};

// Re-export for direct use
export { toast };
