import { useI18n } from "@/lib/i18n";
import type React from "react";
import type { ReactNode } from "react";
import { FileEdit } from "lucide-react";

interface EeziRenameProps {
  children?: ReactNode;
  node?: any;
  from?: string;
  to?: string;
}

export const EeziRename: React.FC<EeziRenameProps> = ({
  children,
  node,
  from: fromProp,
  to: toProp,
}) => {
  const { t, dir } = useI18n();
  // Use props directly if provided, otherwise extract from node
  const from = fromProp || node?.properties?.from || "";
  const to = toProp || node?.properties?.to || "";

  // Extract filenames from paths
  const fromFileName = from ? from.split("/").pop() : "";
  const toFileName = to ? to.split("/").pop() : "";

  return (
    <div
      className="bg-(--background-lightest) rounded-lg px-4 py-2 border border-amber-500 my-2"
      dir={dir}
    >
      <div className="flex items-center justify-between" dir={dir}>
        <div className="flex items-center gap-2" dir={dir}>
          <FileEdit size={16} className="text-amber-500" />
          {(fromFileName || toFileName) && (
            <span
              className="text-gray-700 dark:text-gray-300 font-medium text-sm"
              dir={dir}
            >
              {fromFileName && toFileName
                ? `${fromFileName} → ${toFileName}`
                : fromFileName || toFileName}
            </span>
          )}
          <div className="text-xs text-amber-500 font-medium" dir={dir}>
            {t("Rename")}
          </div>
        </div>
      </div>
      {(from || to) && (
        <div
          className="flex flex-col text-xs text-gray-500 dark:text-gray-400 font-medium mb-1"
          dir={dir}
        >
          {from && (
            <div>
              <span className="text-gray-500 dark:text-gray-400" dir={dir}>
                {t("From:")}
              </span>{" "}
              {from}
            </div>
          )}
          {to && (
            <div>
              <span className="text-gray-500 dark:text-gray-400" dir={dir}>
                {t("To:")}
              </span>{" "}
              {to}
            </div>
          )}
        </div>
      )}
      <div className="text-sm text-gray-600 dark:text-gray-300 mt-2" dir={dir}>
        {children}
      </div>
    </div>
  );
};
