import { useI18n } from "@/lib/i18n";
import type React from "react";
import type { ReactNode } from "react";
import { FileText } from "lucide-react";

interface EasyReadProps {
  children?: ReactNode;
  node?: any;
  path?: string;
}

export const EasyRead: React.FC<EasyReadProps> = ({
  children,
  node,
  path: pathProp,
}) => {
  const { t, dir } = useI18n();
  const path = pathProp || node?.properties?.path || "";
  const fileName = path ? path.split("/").pop() : "";

  return (
    <div
      className="bg-(--background-lightest) rounded-lg px-4 py-2 border border-border my-2"
      dir={dir}
    >
      <div className="flex items-center justify-between" dir={dir}>
        <div className="flex items-center gap-2" dir={dir}>
          <FileText size={16} className="text-gray-600" />
          {fileName && (
            <span
              className="text-gray-700 dark:text-gray-300 font-medium text-sm"
              dir={dir}
            >
              {fileName}
            </span>
          )}
          <div className="text-xs text-gray-600 font-medium" dir={dir}>
            {t("Read")}
          </div>
        </div>
      </div>
      {path && (
        <div
          className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1"
          dir={dir}
        >
          {path}
        </div>
      )}
      {children && (
        <div className="text-sm text-gray-600 dark:text-gray-300 mt-2" dir={dir}>
          {children}
        </div>
      )}
    </div>
  );
};
