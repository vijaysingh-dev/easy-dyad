import { useI18n } from "@/lib/i18n";
import type React from "react";
import type { ReactNode } from "react";
import { useState } from "react";
import { ChevronsDownUp, ChevronsUpDown, Loader, CircleX, Rabbit } from "lucide-react";
import { CodeHighlight } from "./CodeHighlight";
import { CustomTagState } from "./stateTypes";

interface EeziEditProps {
  children?: ReactNode;
  node?: any;
  path?: string;
  description?: string;
}

export const EeziEdit: React.FC<EeziEditProps> = ({
  children,
  node,
  path: pathProp,
  description: descriptionProp,
}) => {
  const { t, dir } = useI18n();
  const [isContentVisible, setIsContentVisible] = useState(false);

  // Use props directly if provided, otherwise extract from node
  const path = pathProp || node?.properties?.path || "";
  const description = descriptionProp || node?.properties?.description || "";
  const state = node?.properties?.state as CustomTagState;
  const inProgress = state === "pending";
  const aborted = state === "aborted";

  // Extract filename from path
  const fileName = path ? path.split("/").pop() : "";

  return (
    <div
      className={`bg-(--background-lightest) hover:bg-(--background-lighter) rounded-lg px-4 py-2 border my-2 cursor-pointer ${
        inProgress ? "border-amber-500" : aborted ? "border-red-500" : "border-border"
      }`}
      onClick={() => setIsContentVisible(!isContentVisible)}
      dir={dir}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center">
            <Rabbit size={16} />
            <span
              className="bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded ml-1 font-medium"
              dir={dir}
            >
              {t("Turbo Edit")}
            </span>
          </div>
          {fileName && (
            <span
              className="text-gray-700 dark:text-gray-300 font-medium text-sm"
              dir={dir}
            >
              {fileName}
            </span>
          )}
          {inProgress && (
            <div className="flex items-center text-amber-600 text-xs" dir={dir}>
              <Loader size={14} className="mr-1 animate-spin" />
              <span>{t("Editing...")}</span>
            </div>
          )}
          {aborted && (
            <div className="flex items-center text-red-600 text-xs" dir={dir}>
              <CircleX size={14} className="mr-1" />
              <span>{t("Did not finish")}</span>
            </div>
          )}
        </div>
        <div className="flex items-center">
          {isContentVisible ? (
            <ChevronsDownUp
              size={20}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            />
          ) : (
            <ChevronsUpDown
              size={20}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            />
          )}
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
      {description && (
        <div className="text-sm text-gray-600 dark:text-gray-300" dir={dir}>
          <span className="font-medium" dir={dir}>
            {t("Summary:")}&nbsp;
          </span>
          {description}
        </div>
      )}
      {isContentVisible && (
        <div
          className="text-xs cursor-text"
          onClick={(e) => e.stopPropagation()}
          dir={dir}
        >
          <CodeHighlight className="language-typescript">{children}</CodeHighlight>
        </div>
      )}
    </div>
  );
};
