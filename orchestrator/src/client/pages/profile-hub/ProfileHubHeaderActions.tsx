import { Download, Import, RefreshCcw, Save } from "lucide-react";
import type React from "react";
import { Button } from "@/components/ui/button";

type Props = {
  isSaving: boolean;
  onImportFile: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onDownloadJson: () => void;
  onRefreshProfile: () => void;
  onSave: () => void;
};

export const ProfileHubHeaderActions: React.FC<Props> = ({
  isSaving,
  onImportFile,
  onDownloadJson,
  onRefreshProfile,
  onSave,
}) => {
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" asChild>
        <label className="cursor-pointer">
          <Import className="mr-2 h-4 w-4" />
          Upload JSON
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => void onImportFile(event)}
          />
        </label>
      </Button>
      <Button variant="outline" size="sm" onClick={onDownloadJson}>
        <Download className="mr-2 h-4 w-4" />
        Download JSON
      </Button>
      <Button variant="outline" size="sm" onClick={onRefreshProfile}>
        <RefreshCcw className="mr-2 h-4 w-4" />
        Refresh Effective Profile
      </Button>
      <Button size="sm" onClick={onSave} disabled={isSaving}>
        <Save className="mr-2 h-4 w-4" />
        Save Profile
      </Button>
    </div>
  );
};
