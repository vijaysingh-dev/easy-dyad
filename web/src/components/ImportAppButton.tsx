import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { Upload } from "lucide-react";
import { useState } from "react";
import { ImportAppDialog } from "./ImportAppDialog";

export function ImportAppButton() {
  const { t, dir } = useI18n();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <>
      <div dir={dir} className="px-4 pb-1 flex justify-center">
        <Button
          dir={dir}
          variant="default"
          size="default"
          onClick={() => setIsDialogOpen(true)}
        >
          <Upload className="mr-2 h-4 w-4" />
          {t("Import App")}
        </Button>
      </div>
      <ImportAppDialog isOpen={isDialogOpen} onClose={() => setIsDialogOpen(false)} />
    </>
  );
}
