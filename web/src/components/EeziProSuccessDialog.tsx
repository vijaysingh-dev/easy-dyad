import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n";

interface EeziProSuccessDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function EeziProSuccessDialog({ isOpen, onClose }: EeziProSuccessDialogProps) {
  const { t, dir } = useI18n();
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
              <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <span dir={dir}>{t("Eezi Pro Enabled")}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <p dir={dir} className="mb-4 text-base">
            {t("Congrats! Eezi Pro is now enabled in the app.")}
          </p>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-5 w-5 text-indigo-500" />
            <p dir={dir} className="text-sm">
              {t("You have access to leading AI models.")}
            </p>
          </div>
          <p dir={dir} className="text-sm text-muted-foreground">
            {t(
              "You can click the Pro button at the top to access the settings at any time."
            )}
          </p>
        </div>
        <DialogFooter className="flex justify-end gap-2">
          <Button onClick={onClose} variant="outline">
            <span dir={dir}>{t("OK")}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
