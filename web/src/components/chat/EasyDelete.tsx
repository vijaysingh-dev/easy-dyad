import { useI18n } from "@/lib/i18n";
import type React from "react";
import type { ReactNode } from "react";
import { Trash2 } from "lucide-react";

interface EasyDeleteProps {
  children?: ReactNode;
  node?: any;
  path?: string;
}

export const EasyDelete: React.FC<EasyDeleteProps> = ({
  children,
  node,
  path: pathProp,
}) => {
  const { t, dir } = useI18n();
  // Use props directly if provided, otherwise extract from node
  const path = pathProp || node?.properties?.path || "";

  // Extract filename from path
  const fileName = path ? path.split("/").pop() : "";

  return (
    <div
      className="bg-(--background-lightest) rounded-lg px-4 py-2 border border-red-500 my-2"
      dir={dir}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trash2 size={16} className="text-red-500" />
          {fileName && (
            <span
              className="text-gray-700 dark:text-gray-300 font-medium text-sm"
              dir={dir}
            >
              {fileName}
            </span>
          )}
          <div className="text-xs text-red-500 font-medium" dir={dir}>
            {t("Delete")}
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
      <div className="text-sm text-gray-600 dark:text-gray-300 mt-2" dir={dir}>
        {children}
      </div>
    </div>
  );
};
