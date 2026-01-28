import { useI18n } from "@/lib/i18n";
import type React from "react";
import type { ReactNode } from "react";
import { Globe } from "lucide-react";

interface EasyWebSearchProps {
  children?: ReactNode;
  node?: any;
  query?: string;
}

export const EasyWebSearch: React.FC<EasyWebSearchProps> = ({
  children,
  node: _node,
  query: queryProp,
}) => {
  const { t, dir } = useI18n();
  const query = queryProp || (typeof children === "string" ? children : "");

  return (
    <div
      className="bg-(--background-lightest) rounded-lg px-4 py-2 border my-2"
      dir={dir}
    >
      <div className="flex items-center justify-between" dir={dir}>
        <div className="flex items-center gap-2" dir={dir}>
          <Globe size={16} className="text-blue-600" />
          <div className="text-xs text-blue-600 font-medium" dir={dir}>
            {t("Web Search")}
          </div>
        </div>
      </div>
      <div className="text-sm italic text-gray-600 dark:text-gray-300 mt-2" dir={dir}>
        {query || children}
      </div>
    </div>
  );
};
