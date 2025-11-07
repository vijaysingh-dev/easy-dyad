import React from "react";
import { useI18n } from "@/lib/i18n";

export function PriceBadge({ dollarSigns }: { dollarSigns: number | undefined }) {
  const { t, dir } = useI18n();
  if (dollarSigns === undefined || dollarSigns === null) return null;

  const label = dollarSigns === 0 ? t("Free") : "$".repeat(dollarSigns);

  const className =
    dollarSigns === 0
      ? "text-[10px] text-primary border border-primary px-1.5 py-0.5 rounded-full font-medium"
      : "text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium";

  return (
    <span dir={dir} className={className}>
      {label}
    </span>
  );
}

export default PriceBadge;
