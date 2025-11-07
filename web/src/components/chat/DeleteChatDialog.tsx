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

interface DeleteChatDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmDelete: () => void;
  chatTitle?: string;
}

export function DeleteChatDialog({
  isOpen,
  onOpenChange,
  onConfirmDelete,
  chatTitle,
}: DeleteChatDialogProps) {
  const { t, dir } = useI18n();
  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent dir={dir}>
        <AlertDialogHeader>
          <AlertDialogTitle dir={dir}>{t("Delete Chat")}</AlertDialogTitle>
          <AlertDialogDescription dir={dir}>
            {t(
              'Are you sure you want to delete "chatTitle"? This action cannot be undone and all messages in this chat will be permanently lost.',
              { chatTitle: chatTitle || t("this chat") }
            )}
            <br />
            <br />
            <strong dir={dir}>{t("Note:")}</strong>{" "}
            {t("Any code changes that have already been accepted will be kept.")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel dir={dir}>{t("Cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirmDelete}
            className="bg-red-600 text-white hover:bg-red-700 dark:bg-red-600 dark:text-white dark:hover:bg-red-700"
            dir={dir}
          >
            {t("Delete Chat")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
