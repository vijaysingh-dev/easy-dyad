import React from "react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface DeleteConfirmationDialogProps {
  itemName: string;
  itemType?: string;
  onDelete: () => void | Promise<void>;
  trigger?: React.ReactNode;
}

export function DeleteConfirmationDialog({
  itemName,
  itemType = "item",
  onDelete,
  trigger,
}: DeleteConfirmationDialogProps) {
  const { t, dir } = useI18n();

  return (
    <AlertDialog>
      {trigger ? (
        <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <AlertDialogTrigger asChild>
              <Button
                dir={dir}
                size="icon"
                variant="ghost"
                data-testid="delete-prompt-button"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p dir={dir}>{t("Delete itemType", { itemType: itemType.toLowerCase() })}</p>
          </TooltipContent>
        </Tooltip>
      )}
      <AlertDialogContent dir={dir}>
        <AlertDialogHeader>
          <AlertDialogTitle dir={dir}>
            {t("Delete itemType", { itemType })}
          </AlertDialogTitle>
          <AlertDialogDescription dir={dir}>
            {t(
              'Are you sure you want to delete "itemName"? This action cannot be undone.',
              { itemName }
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel dir={dir}>{t("Cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={onDelete} dir={dir}>
            {t("Delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
