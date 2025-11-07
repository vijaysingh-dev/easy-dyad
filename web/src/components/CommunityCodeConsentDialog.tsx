import React from "react";
import { useI18n } from "@/lib/i18n";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface CommunityCodeConsentDialogProps {
  isOpen: boolean;
  onAccept: () => void;
  onCancel: () => void;
}

export const CommunityCodeConsentDialog: React.FC<CommunityCodeConsentDialogProps> = ({
  isOpen,
  onAccept,
  onCancel,
}) => {
  const { t, dir } = useI18n();
  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent dir={dir}>
        <AlertDialogHeader dir={dir}>
          <AlertDialogTitle dir={dir}>{t("Community Code Notice")}</AlertDialogTitle>
          <AlertDialogDescription className="space-y-3" dir={dir}>
            <p dir={dir}>
              {t("This code was created by a Eezi community member, not our core team.")}
            </p>
            <p dir={dir}>
              {t(
                "Community code can be very helpful, but since it's built independently, it may have bugs, security risks, or could cause issues with your system. We can't provide official support if problems occur."
              )}
            </p>
            <p dir={dir}>
              {t(
                "We recommend reviewing the code on GitHub first. Only proceed if you're comfortable with these risks."
              )}
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter dir={dir}>
          <AlertDialogCancel onClick={onCancel} dir={dir}>
            {t("Cancel")}
          </AlertDialogCancel>
          <AlertDialogAction onClick={onAccept} dir={dir}>
            {t("Accept")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
