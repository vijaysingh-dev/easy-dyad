import { appOutputAtom } from "@/atoms/appAtoms";
import { useAtomValue } from "jotai";
import { useI18n } from "@/lib/i18n";

// Console component
export const Console = () => {
  const appOutput = useAtomValue(appOutputAtom);
  const { t, dir } = useI18n();
  return (
    <div className="font-mono text-xs px-4 pb-2 h-full overflow-auto">
      {appOutput.length === 0 ? (
        <div dir={dir}>{t("No console output")}</div>
      ) : (
        appOutput.map((output, index) => <div key={index}>{output.message}</div>)
      )}
    </div>
  );
};
