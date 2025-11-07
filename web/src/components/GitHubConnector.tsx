import { useState, useEffect, useCallback, useRef } from "react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Github, Clipboard, Check, AlertTriangle, ChevronRight } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import { useLoadApp } from "@/hooks/useLoadApp";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api from "@/api";

interface GitHubConnectorProps {
  appId: number | null;
  folderName: string;
  expanded?: boolean;
}

interface GitHubRepo {
  name: string;
  full_name: string;
  private: boolean;
}

interface GitHubBranch {
  name: string;
  commit: { sha: string };
}

interface ConnectedGitHubConnectorProps {
  appId: number;
  app: any;
  refreshApp: () => void;
  triggerAutoSync?: boolean;
  onAutoSyncComplete?: () => void;
}

interface UnconnectedGitHubConnectorProps {
  appId: number | null;
  folderName: string;
  settings: any;
  refreshSettings: () => void;
  handleRepoSetupComplete: () => void;
  expanded?: boolean;
}

function ConnectedGitHubConnector({
  appId,
  app,
  refreshApp,
  triggerAutoSync,
  onAutoSyncComplete,
}: ConnectedGitHubConnectorProps) {
  const { t, dir } = useI18n();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState<boolean>(false);
  const [showForceDialog, setShowForceDialog] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);
  const autoSyncTriggeredRef = useRef(false);

  const handleDisconnectRepo = async () => {
    setIsDisconnecting(true);
    setDisconnectError(null);
    try {
      await api.integration.disconnectGithubRepo(appId);
      refreshApp();
    } catch (err: any) {
      setDisconnectError(err.message || "Failed to disconnect repository.");
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleSyncToGithub = useCallback(
    async (force: boolean = false) => {
      setIsSyncing(true);
      setSyncError(null);
      setSyncSuccess(false);
      setShowForceDialog(false);

      try {
        const result = await api.integration.syncGithubRepo(appId, force);
        if (result.success) {
          setSyncSuccess(true);
        } else {
          setSyncError(result.error || "Failed to sync to GitHub.");
          // If it's a push rejection error, show the force dialog
          if (
            result.error?.includes("rejected") ||
            result.error?.includes("non-fast-forward")
          ) {
            // Don't show force dialog immediately, let user see the error first
          }
        }
      } catch (err: any) {
        setSyncError(err.message || "Failed to sync to GitHub.");
      } finally {
        setIsSyncing(false);
      }
    },
    [appId]
  );

  // Auto-sync when triggerAutoSync prop is true
  useEffect(() => {
    if (triggerAutoSync && !autoSyncTriggeredRef.current) {
      autoSyncTriggeredRef.current = true;
      handleSyncToGithub(false).finally(() => {
        onAutoSyncComplete?.();
      });
    } else if (!triggerAutoSync) {
      // Reset the ref when triggerAutoSync becomes false
      autoSyncTriggeredRef.current = false;
    }
  }, [triggerAutoSync]); // Only depend on triggerAutoSync to avoid unnecessary re-runs

  return (
    <div className="w-full" data-testid="github-connected-repo">
      <p dir={dir}>{t("Connected to GitHub Repo:")}</p>
      <a
        dir={dir}
        onClick={(e) => {
          e.preventDefault();
          api.app.openExternalUrl(
            `https://github.com/${app.githubOrg}/${app.githubRepo}`
          );
        }}
        className="cursor-pointer text-blue-600 hover:underline dark:text-blue-400"
        target="_blank"
        rel="noopener noreferrer"
      >
        {app.githubOrg}/{app.githubRepo}
      </a>
      {app.githubBranch && (
        <p dir={dir} className="text-sm text-gray-600 dark:text-gray-300 mt-1">
          {t("Branch:")} <span className="font-mono">{app.githubBranch}</span>
        </p>
      )}
      <div className="mt-2 flex gap-2">
        <Button onClick={() => handleSyncToGithub(false)} disabled={isSyncing}>
          {isSyncing ? (
            <>
              <svg
                className="animate-spin h-5 w-5 mr-2 inline"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                style={{ display: "inline" }}
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              {t("Syncing...")}
            </>
          ) : (
            t("Sync to GitHub")
          )}
        </Button>
        <Button
          onClick={handleDisconnectRepo}
          disabled={isDisconnecting}
          variant="outline"
        >
          {isDisconnecting ? t("Disconnecting...") : t("Disconnect from repo")}
        </Button>
      </div>
      {syncError && (
        <div className="mt-2">
          <p dir={dir} className="text-red-600">
            {syncError}{" "}
            <a
              dir={dir}
              onClick={(e) => {
                e.preventDefault();
                api.app.openExternalUrl(
                  "https://www.dyad.sh/docs/integrations/github#troubleshooting"
                );
              }}
              className="cursor-pointer text-blue-600 hover:underline dark:text-blue-400"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("See troubleshooting guide")}
            </a>
          </p>
          {(syncError.includes("rejected") ||
            syncError.includes("non-fast-forward")) && (
            <Button
              onClick={() => setShowForceDialog(true)}
              variant="outline"
              size="sm"
              className="mt-2 text-orange-600 border-orange-600 hover:bg-orange-50"
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              {t("Force Push (Dangerous)")}
            </Button>
          )}
        </div>
      )}
      {syncSuccess && (
        <p dir={dir} className="text-green-600 mt-2">
          {t("Successfully pushed to GitHub!")}
        </p>
      )}
      {disconnectError && (
        <p dir={dir} className="text-red-600 mt-2">
          {disconnectError}
        </p>
      )}

      {/* Force Push Warning Dialog */}
      <Dialog open={showForceDialog} onOpenChange={setShowForceDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              {t("Force Push Warning")}
            </DialogTitle>
            <DialogDescription>
              <div className="space-y-3">
                <p dir={dir}>
                  {t("You are about to perform a force push to your GitHub repository.")}
                </p>
                <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded-md border border-orange-200 dark:border-orange-800">
                  <p dir={dir} className="text-sm text-orange-800 dark:text-orange-200">
                    <strong>
                      {t("This is dangerous and non-reversible and will:")}
                    </strong>
                  </p>
                  <ul className="text-sm text-orange-700 dark:text-orange-300 list-disc list-inside mt-2 space-y-1">
                    <li>{t("Overwrite the remote repository history")}</li>
                    <li>
                      {t(
                        "Permanently delete commits that exist on the remote but not locally"
                      )}
                    </li>
                  </ul>
                </div>
                <p dir={dir} className="text-sm">
                  {t("Only proceed if you're certain this is what you want to do.")}
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForceDialog(false)}>
              {t("Cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleSyncToGithub(true)}
              disabled={isSyncing}
            >
              {isSyncing ? t("Force Pushing...") : t("Force Push")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UnconnectedGitHubConnector({
  appId,
  folderName,
  settings,
  refreshSettings,
  handleRepoSetupComplete,
  expanded,
}: UnconnectedGitHubConnectorProps) {
  const { t, dir } = useI18n();
  // --- Collapsible State ---
  const [isExpanded, setIsExpanded] = useState(expanded || false);

  // --- GitHub Device Flow State ---
  const [githubUserCode, setGithubUserCode] = useState<string | null>(null);
  const [githubVerificationUri, setGithubVerificationUri] = useState<string | null>(
    null
  );
  const [githubError, setGithubError] = useState<string | null>(null);
  const [isConnectingToGithub, setIsConnectingToGithub] = useState(false);
  const [githubStatusMessage, setGithubStatusMessage] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);

  // --- Repo Setup State ---
  const [repoSetupMode, setRepoSetupMode] = useState<"create" | "existing">("create");
  const [availableRepos, setAvailableRepos] = useState<GitHubRepo[]>([]);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<string>("");
  const [availableBranches, setAvailableBranches] = useState<GitHubBranch[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<string>("main");
  const [branchInputMode, setBranchInputMode] = useState<"select" | "custom">("select");
  const [customBranchName, setCustomBranchName] = useState<string>("");

  // Create new repo state
  const [repoName, setRepoName] = useState(folderName);
  const [repoAvailable, setRepoAvailable] = useState<boolean | null>(null);
  const [repoCheckError, setRepoCheckError] = useState<string | null>(null);
  const [isCheckingRepo, setIsCheckingRepo] = useState(false);
  const [isCreatingRepo, setIsCreatingRepo] = useState(false);
  const [createRepoError, setCreateRepoError] = useState<string | null>(null);
  const [createRepoSuccess, setCreateRepoSuccess] = useState<boolean>(false);

  // Assume org is the authenticated user for now (could add org input later)
  const githubOrg = ""; // Use empty string for now (GitHub API will default to the authenticated user)

  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleConnectToGithub = async () => {
    if (!appId) return;
    setIsConnectingToGithub(true);
    setGithubError(null);
    setGithubUserCode(null);
    setGithubVerificationUri(null);
    setGithubStatusMessage("Requesting device code from GitHub...");

    // Send message to main process to start the flow
    api.integration.startGithubDeviceFlow(appId, {
      onGithubDeviceFlowUpdate: (data) => {
        console.log("Received github:flow-update", data);
        if (data.userCode) {
          setGithubUserCode(data.userCode);
        }
        if (data.verificationUri) {
          setGithubVerificationUri(data.verificationUri);
        }
        if (data.message) {
          setGithubStatusMessage(data.message);
        }

        setGithubError(null); // Clear previous errors on new update
        if (!data.userCode && !data.verificationUri && data.message) {
          // Likely just a status message, keep connecting state
          setIsConnectingToGithub(true);
        }
        if (data.userCode && data.verificationUri) {
          setIsConnectingToGithub(true); // Still connecting until success/error
        }
      },
      onGithubDeviceFlowSuccess: (data) => {
        console.log("Received github:flow-success", data);
        setGithubStatusMessage("Successfully connected to GitHub!");
        setGithubUserCode(null); // Clear user-facing info
        setGithubVerificationUri(null);
        setGithubError(null);
        setIsConnectingToGithub(false);
        refreshSettings();
        setIsExpanded(true);
      },
      onGithubDeviceFlowError: (data) => {
        console.log("Received github:flow-error", data);
        setGithubError(data.error || "An unknown error occurred.");
        setGithubStatusMessage(null);
        setGithubUserCode(null);
        setGithubVerificationUri(null);
        setIsConnectingToGithub(false);
      },
    });
  };

  // Load available repos when GitHub is connected
  useEffect(() => {
    if (settings?.githubAccessToken && repoSetupMode === "existing") {
      loadAvailableRepos();
    }
  }, [settings?.githubAccessToken, repoSetupMode]);

  const loadAvailableRepos = async () => {
    setIsLoadingRepos(true);
    try {
      const repos = await api.integration.listGithubRepos();
      setAvailableRepos(repos);
    } catch (error) {
      console.error("Failed to load GitHub repos:", error);
    } finally {
      setIsLoadingRepos(false);
    }
  };

  // Load branches when a repo is selected
  useEffect(() => {
    if (selectedRepo && repoSetupMode === "existing") {
      loadRepoBranches();
    }
  }, [selectedRepo, repoSetupMode]);

  const loadRepoBranches = async () => {
    if (!selectedRepo) return;

    setIsLoadingBranches(true);
    setBranchInputMode("select"); // Reset to select mode when loading new repo
    setCustomBranchName(""); // Clear custom branch name
    try {
      const [owner, repo] = selectedRepo.split("/");
      const branches = await api.integration.getGithubRepoBranches(owner, repo);
      setAvailableBranches(branches);
      // Default to main if available, otherwise first branch
      const defaultBranch =
        branches.find((b) => b.name === "main" || b.name === "master") || branches[0];
      if (defaultBranch) {
        setSelectedBranch(defaultBranch.name);
      }
    } catch (error) {
      console.error("Failed to load repo branches:", error);
    } finally {
      setIsLoadingBranches(false);
    }
  };

  const checkRepoAvailability = useCallback(
    async (name: string) => {
      setRepoCheckError(null);
      setRepoAvailable(null);
      if (!name) return;
      setIsCheckingRepo(true);
      try {
        const result = await api.integration.checkGithubRepoAvailable(githubOrg, name);
        setRepoAvailable(result.available);
        if (!result.available) {
          setRepoCheckError(result.error || "Repository name is not available.");
        }
      } catch (err: any) {
        setRepoCheckError(err.message || "Failed to check repo availability.");
      } finally {
        setIsCheckingRepo(false);
      }
    },
    [githubOrg]
  );

  const debouncedCheckRepoAvailability = useCallback(
    (name: string) => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      debounceTimeoutRef.current = setTimeout(() => {
        checkRepoAvailability(name);
      }, 500);
    },
    [checkRepoAvailability]
  );

  const handleSetupRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appId) return;

    setCreateRepoError(null);
    setIsCreatingRepo(true);
    setCreateRepoSuccess(false);

    try {
      if (repoSetupMode === "create") {
        await api.integration.createGithubRepo(
          githubOrg,
          repoName,
          appId,
          selectedBranch
        );
      } else {
        const [owner, repo] = selectedRepo.split("/");
        const branchToUse =
          branchInputMode === "custom" ? customBranchName : selectedBranch;
        await api.integration.connectToExistingGithubRepo(
          owner,
          repo,
          branchToUse,
          appId
        );
      }

      setCreateRepoSuccess(true);
      setRepoCheckError(null);
      handleRepoSetupComplete();
    } catch (err: any) {
      setCreateRepoError(
        err.message ||
          `Failed to ${repoSetupMode === "create" ? "create" : "connect to"} repository.`
      );
    } finally {
      setIsCreatingRepo(false);
    }
  };

  if (!settings?.githubAccessToken) {
    return (
      <div className="mt-1 w-full" data-testid="github-unconnected-repo">
        <Button
          dir={dir}
          onClick={handleConnectToGithub}
          className="cursor-pointer w-full py-5 flex justify-center items-center gap-2"
          size="lg"
          variant="outline"
          disabled={isConnectingToGithub || !appId} // Also disable if appId is null
        >
          {t("Connect to GitHub")}
          <Github className="h-5 w-5" />
          {isConnectingToGithub && (
            <svg
              className="animate-spin h-5 w-5 ml-2"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
          )}
        </Button>
        {/* GitHub Connection Status/Instructions */}
        {(githubUserCode || githubStatusMessage || githubError) && (
          <div className="mt-6 p-4 border rounded-md bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600">
            <h4 dir={dir} className="font-medium mb-2">
              {t("GitHub Connection")}
            </h4>
            {githubError && (
              <p dir={dir} className="text-red-600 dark:text-red-400 mb-2">
                {t("Error:")} {githubError}
              </p>
            )}
            {githubUserCode && githubVerificationUri && (
              <div className="mb-2">
                <p dir={dir}>
                  1. {t("Go to:")}
                  <a
                    href={githubVerificationUri} // Make it a direct link
                    onClick={(e) => {
                      e.preventDefault();
                      api.app.openExternalUrl(githubVerificationUri);
                    }}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-1 text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {githubVerificationUri}
                  </a>
                </p>
                <p dir={dir}>
                  2. {t("Enter code:")}
                  <strong className="ml-1 font-mono text-lg tracking-wider bg-gray-200 dark:bg-gray-600 px-2 py-0.5 rounded">
                    {githubUserCode}
                  </strong>
                  <button
                    className="ml-2 p-1 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 focus:outline-none"
                    onClick={() => {
                      if (githubUserCode) {
                        navigator.clipboard
                          .writeText(githubUserCode)
                          .then(() => {
                            setCodeCopied(true);
                            setTimeout(() => setCodeCopied(false), 2000);
                          })
                          .catch((err) => console.error("Failed to copy code:", err));
                      }
                    }}
                    title={t("Copy to clipboard")}
                  >
                    {codeCopied ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Clipboard className="h-4 w-4" />
                    )}
                  </button>
                </p>
              </div>
            )}
            {githubStatusMessage && (
              <p dir={dir} className="text-sm text-gray-600 dark:text-gray-300">
                {githubStatusMessage}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full" data-testid="github-setup-repo">
      {/* Collapsible Header */}
      <button
        type="button"
        onClick={!isExpanded ? () => setIsExpanded(true) : undefined}
        className={`w-full p-4 text-left transition-colors rounded-md flex items-center justify-between ${
          !isExpanded ? "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50" : ""
        }`}
      >
        <span dir={dir} className="font-medium">
          {t("Set up your GitHub repo")}
        </span>
        {isExpanded ? undefined : <ChevronRight className="h-4 w-4 text-gray-500" />}
      </button>

      {/* Collapsible Content */}
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          isExpanded ? "max-h-[800px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="p-4 pt-0 space-y-4">
          {/* Mode Selection */}
          <div>
            <div className="flex rounded-md border border-gray-200 dark:border-gray-700">
              <Button
                type="button"
                variant={repoSetupMode === "create" ? "default" : "ghost"}
                className={`flex-1 rounded-none rounded-l-md border-0 ${
                  repoSetupMode === "create"
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
                onClick={() => {
                  setRepoSetupMode("create");
                  setCreateRepoError(null);
                  setCreateRepoSuccess(false);
                }}
              >
                {t("Create new repo")}
              </Button>
              <Button
                type="button"
                variant={repoSetupMode === "existing" ? "default" : "ghost"}
                className={`flex-1 rounded-none rounded-r-md border-0 border-l border-gray-200 dark:border-gray-700 ${
                  repoSetupMode === "existing"
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
                onClick={() => {
                  setRepoSetupMode("existing");
                  setCreateRepoError(null);
                  setCreateRepoSuccess(false);
                }}
              >
                {t("Connect to existing repo")}
              </Button>
            </div>
          </div>

          <form className="space-y-4" onSubmit={handleSetupRepo}>
            {repoSetupMode === "create" ? (
              <>
                <div>
                  <Label dir={dir} className="block text-sm font-medium">
                    {t("Repository Name")}
                  </Label>
                  <Input
                    data-testid="github-create-repo-name-input"
                    className="w-full mt-1"
                    value={repoName}
                    onChange={(e) => {
                      const newValue = e.target.value;
                      setRepoName(newValue);
                      setRepoAvailable(null);
                      setRepoCheckError(null);
                      debouncedCheckRepoAvailability(newValue);
                    }}
                    disabled={isCreatingRepo}
                  />
                  {isCheckingRepo && (
                    <p dir={dir} className="text-xs text-gray-500 mt-1">
                      {t("Checking availability...")}
                    </p>
                  )}
                  {repoAvailable === true && (
                    <p dir={dir} className="text-xs text-green-600 mt-1">
                      {t("Repository name is available!")}
                    </p>
                  )}
                  {repoAvailable === false && (
                    <p dir={dir} className="text-xs text-red-600 mt-1">
                      {repoCheckError || t("Repository name is not available.")}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label dir={dir} className="block text-sm font-medium">
                    {t("Select Repository")}
                  </Label>
                  <Select
                    value={selectedRepo}
                    onValueChange={setSelectedRepo}
                    disabled={isLoadingRepos}
                  >
                    <SelectTrigger
                      className="w-full mt-1"
                      data-testid="github-repo-select"
                    >
                      <SelectValue
                        placeholder={
                          isLoadingRepos
                            ? t("Loading repositories...")
                            : t("Select a repository")
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {availableRepos.map((repo) => (
                        <SelectItem key={repo.full_name} value={repo.full_name}>
                          {repo.full_name} {repo.private && "(private)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {/* Branch Selection */}
            <div>
              <Label dir={dir} className="block text-sm font-medium">
                {t("Branch")}
              </Label>
              {repoSetupMode === "existing" && selectedRepo ? (
                <div className="space-y-2">
                  <Select
                    value={branchInputMode === "select" ? selectedBranch : "custom"}
                    onValueChange={(value) => {
                      if (value === "custom") {
                        setBranchInputMode("custom");
                        setCustomBranchName("");
                      } else {
                        setBranchInputMode("select");
                        setSelectedBranch(value);
                      }
                    }}
                    disabled={isLoadingBranches}
                  >
                    <SelectTrigger
                      className="w-full mt-1"
                      data-testid="github-branch-select"
                    >
                      <SelectValue
                        placeholder={
                          isLoadingBranches
                            ? t("Loading branches...")
                            : t("Select a branch")
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {availableBranches.map((branch) => (
                        <SelectItem key={branch.name} value={branch.name}>
                          {branch.name}
                        </SelectItem>
                      ))}
                      <SelectItem value="custom">
                        <span dir={dir} className="font-medium">
                          ✏️ {t("Type custom branch name")}
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {branchInputMode === "custom" && (
                    <Input
                      data-testid="github-custom-branch-input"
                      className="w-full"
                      value={customBranchName}
                      onChange={(e) => setCustomBranchName(e.target.value)}
                      placeholder={t("Enter branch name (e.g., feature/new-feature)")}
                      disabled={isCreatingRepo}
                    />
                  )}
                </div>
              ) : (
                <Input
                  className="w-full mt-1"
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  placeholder={t("main")}
                  disabled={isCreatingRepo}
                  data-testid="github-new-repo-branch-input"
                />
              )}
            </div>

            <Button
              type="submit"
              disabled={
                isCreatingRepo ||
                (repoSetupMode === "create" && (repoAvailable === false || !repoName)) ||
                (repoSetupMode === "existing" &&
                  (!selectedRepo ||
                    !selectedBranch ||
                    (branchInputMode === "custom" && !customBranchName.trim())))
              }
            >
              {isCreatingRepo
                ? repoSetupMode === "create"
                  ? t("Creating...")
                  : t("Connecting...")
                : repoSetupMode === "create"
                ? t("Create Repo")
                : t("Connect to Repo")}
            </Button>
          </form>

          {createRepoError && (
            <p dir={dir} className="text-red-600 mt-2">
              {createRepoError}
            </p>
          )}
          {createRepoSuccess && (
            <p dir={dir} className="text-green-600 mt-2">
              {repoSetupMode === "create"
                ? t("Repository created and linked!")
                : t("Connected to repository!")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function GitHubConnector({ appId, folderName, expanded }: GitHubConnectorProps) {
  const { app, refreshApp } = useLoadApp(appId);
  const { settings, refreshSettings } = useSettings();
  const [pendingAutoSync, setPendingAutoSync] = useState(false);

  const handleRepoSetupComplete = useCallback(() => {
    setPendingAutoSync(true);
    refreshApp();
  }, [refreshApp]);

  const handleAutoSyncComplete = useCallback(() => {
    setPendingAutoSync(false);
  }, []);

  if (app?.githubOrg && app?.githubRepo && appId) {
    return (
      <ConnectedGitHubConnector
        appId={appId}
        app={app}
        refreshApp={refreshApp}
        triggerAutoSync={pendingAutoSync}
        onAutoSyncComplete={handleAutoSyncComplete}
      />
    );
  } else {
    return (
      <UnconnectedGitHubConnector
        appId={appId}
        folderName={folderName}
        settings={settings}
        refreshSettings={refreshSettings}
        handleRepoSetupComplete={handleRepoSetupComplete}
        expanded={expanded}
      />
    );
  }
}
