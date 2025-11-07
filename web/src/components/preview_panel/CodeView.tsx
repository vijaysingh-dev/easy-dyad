import { FileEditor } from "./FileEditor";
import { FileTree } from "./FileTree";
import { RefreshCw } from "lucide-react";
import { useLoadApp } from "@/hooks/useLoadApp";
import { useAtomValue } from "jotai";
import { selectedFileAtom } from "@/atoms/viewAtoms";
import { useI18n } from "@/lib/i18n";

interface App {
  id?: number;
  files?: string[];
}

export interface CodeViewProps {
  loading: boolean;
  app: App | null;
}

// Code view component that displays app files or status messages
export const CodeView = ({ loading, app }: CodeViewProps) => {
  const selectedFile = useAtomValue(selectedFileAtom);
  const { refreshApp } = useLoadApp(app?.id ?? null);
  const { t, dir } = useI18n();

  if (loading) {
    return (
      <div dir={dir} className="text-center py-4">
        {t("Loading files...")}
      </div>
    );
  }

  if (!app) {
    return (
      <div dir={dir} className="text-center py-4 text-gray-500">
        {t("No app selected")}
      </div>
    );
  }

  if (app.files && app.files.length > 0) {
    return (
      <div dir={dir} className="flex flex-col h-full">
        {/* Toolbar */}
        <div className="flex items-center p-2 border-b space-x-2">
          <button
            onClick={() => refreshApp()}
            className="p-1 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading || !app.id}
            title={t("Refresh Files")}
          >
            <RefreshCw size={16} />
          </button>
          <div dir={dir} className="text-sm text-gray-500">
            {t("files count", { count: app.files.length })}
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          <div className="w-1/3 overflow-auto border-r">
            <FileTree files={app.files} />
          </div>
          <div className="w-2/3">
            {selectedFile ? (
              <FileEditor appId={app.id ?? null} filePath={selectedFile.path} />
            ) : (
              <div dir={dir} className="text-center py-4 text-gray-500">
                {t("Select a file to view")}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div dir={dir} className="text-center py-4 text-gray-500">
      {t("No files found")}
    </div>
  );
};
