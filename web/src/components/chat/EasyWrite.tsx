import { useI18n } from "@/lib/i18n";
import type React from "react";
import type { ReactNode } from "react";
import { useState } from "react";
import {
  ChevronsDownUp,
  ChevronsUpDown,
  Pencil,
  Loader,
  CircleX,
  Edit,
  X,
} from "lucide-react";
import { CodeHighlight } from "./CodeHighlight";
import { CustomTagState } from "./stateTypes";
import { FileEditor } from "../preview_panel/FileEditor";
import { useAtomValue } from "jotai";
import { selectedAppIdAtom } from "@/atoms/appAtoms";

interface EasyWriteProps {
  children?: ReactNode;
  node?: any;
  path?: string;
  description?: string;
}

export const EasyWrite: React.FC<EasyWriteProps> = ({
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

  const aborted = state === "aborted";
  const appId = useAtomValue(selectedAppIdAtom);
  const [isEditing, setIsEditing] = useState(false);
  const inProgress = state === "pending";

  const handleCancel = () => {
    setIsEditing(false);
  };

  const handleEdit = () => {
    setIsEditing(true);
    setIsContentVisible(true);
  };
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
      <div className="flex items-center justify-between" dir={dir}>
        <div className="flex items-center gap-2" dir={dir}>
          <Pencil size={16} />
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
              <span dir={dir}>{t("Writing...")}</span>
            </div>
          )}
          {aborted && (
            <div className="flex items-center text-red-600 text-xs" dir={dir}>
              <CircleX size={14} className="mr-1" />
              <span dir={dir}>{t("Did not finish")}</span>
            </div>
          )}
        </div>
        <div className="flex items-center">
          {!inProgress && (
            <>
              {isEditing ? (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCancel();
                    }}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 px-2 py-1 rounded cursor-pointer"
                    dir={dir}
                  >
                    <X size={14} />
                    {t("Cancel")}
                  </button>
                </>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEdit();
                  }}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 px-2 py-1 rounded cursor-pointer"
                  dir={dir}
                >
                  <Edit size={14} />
                  {t("Edit")}
                </button>
              )}
            </>
          )}
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
            {t("Summary:")}
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
          {isEditing ? (
            <div
              className="h-96 min-h-96 border border-gray-200 dark:border-gray-700 rounded overflow-hidden"
              dir={dir}
            >
              <FileEditor appId={appId ?? null} filePath={path} />
            </div>
          ) : (
            <CodeHighlight className="language-typescript">{children}</CodeHighlight>
          )}
        </div>
      )}
    </div>
  );
};
