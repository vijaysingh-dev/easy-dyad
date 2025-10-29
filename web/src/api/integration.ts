import Api from "./api";
import { AxiosRequestConfig } from "axios";
import {
  DeepLinkData,
  GitHubDeviceFlowUpdateData,
  GitHubDeviceFlowSuccessData,
  GitHubDeviceFlowErrorData,
  RenameBranchParams,
  GetNeonProjectParams,
  CreateNeonProjectParams,
  SaveVercelAccessTokenParams,
  ConnectToExistingVercelProjectParams,
  IsVercelProjectAvailableParams,
  CreateVercelProjectParams,
  GetVercelDeploymentsParams,
  DisconnectVercelProjectParams,
} from "@shared/eeziTypes";
import eeziClient from "./client";
import { showError } from "@/components/Toast";

class IntegrationApiService {
  private deepLinkHandler: ((data: DeepLinkData) => void) | null = null;
  // Listen for deep link events
  public onDeepLinkReceived(callback: (data: DeepLinkData) => void) {
    this.deepLinkHandler = callback;
  }

  public async fakeHandleNeonConnect() {
    Api.get(`/integration/fake-connect/neon`)
      .then((res) => {
        if (res.status == 200) this.deepLinkHandler?.(res.data as DeepLinkData);
      })
      .catch((error) => {
        showError(`Error in fakeHandleNeonConnect: ${error}`);
      });
  }

  public async fakeHandleSupabaseConnect(params: {
    appId: number;
    fakeProjectId: string;
  }) {
    Api.post("/integration/supabase/fake-connect-and-set-project", params)
      .then((res) => {
        if (res.status == 200) this.deepLinkHandler?.(res.data as DeepLinkData);
      })
      .catch((error) => {
        showError(`Error in fakeHandleSupabaseConnect: ${error}`);
      });
  }

  // --- Neon Management ---
  public async getNeonProject(params: GetNeonProjectParams) {
    const config: AxiosRequestConfig = { params };
    const { data } = await Api.get("/integration/neon/get-project", { config });
    return data;
  }

  public async createNeonProject(params: CreateNeonProjectParams) {
    const { data } = await Api.post("/integration/neon/create-project", params);
    return data;
  }
  // --- End Neon Management ---

  // --- Supabase Management ---
  public async listSupabaseProjects() {
    const { data } = await Api.get(`/integration/supabase/list-projects`);
    return data;
  }

  public async setSupabaseAppProject(project: string, app: number) {
    const { data } = await Api.post("/integration/supabase/set-app-project", {
      project,
      app,
    });
    return data;
  }

  public async unsetSupabaseAppProject(app: number) {
    const { data } = await Api.post("/integration/supabase/unset-app-project", {
      app,
    });
    return data;
  }
  // --- End Supabase Management ---

  // --- GitHub Repo Management ---
  public async listGithubRepos() {
    const { data } = await Api.get(`/integration/github/list-repos`);
    return data;
  }

  public async getGithubRepoBranches(
    owner: string,
    repo: string
  ): Promise<{ name: string; commit: { sha: string } }[]> {
    const { data } = await Api.get(
      `/integration/github/get-repo-branches/${owner}/${repo}`
    );
    return data;
  }

  public async renameBranch(params: RenameBranchParams) {
    const { data } = await Api.post("/integration/github/rename-branch", params);
    return data;
  }

  public async connectToExistingGithubRepo(
    owner: string,
    repo: string,
    branch: string,
    appId: number
  ) {
    const { data } = await Api.post(`/integration/github/connect-existing-repo`, {
      owner,
      repo,
      branch,
      appId,
    });
    return data;
  }

  public async checkGithubRepoAvailable(org: string, repo: string) {
    const config: AxiosRequestConfig = { params: { org, repo } };
    const { data } = await Api.get(`/integration/github/is-repo-available`, {
      config,
    });
    return data;
  }

  public async createGithubRepo(
    org: string,
    repo: string,
    appId: number,
    branch?: string
  ) {
    const { data } = await Api.post("/integration/github/create-repo", {
      org,
      repo,
      appId,
      branch,
    });
    return data;
  }

  // Sync (push) local repo to GitHub
  public async syncGithubRepo(appId: number, force?: boolean) {
    const { data } = await Api.post("/integration/github/push", {
      appId,
      force,
    });
    return data;
  }

  public async disconnectGithubRepo(appId: number) {
    const { data } = await Api.post("/integration/github/disconnect", { appId });
    return data;
  }

  public startGithubDeviceFlow(
    appId: number,
    options: {
      onGithubDeviceFlowUpdate: (data: GitHubDeviceFlowUpdateData) => void;
      onGithubDeviceFlowSuccess: (data: GitHubDeviceFlowSuccessData) => void;
      onGithubDeviceFlowError: (data: GitHubDeviceFlowErrorData) => void;
    }
  ): void {
    const {
      onGithubDeviceFlowUpdate,
      onGithubDeviceFlowSuccess,
      onGithubDeviceFlowError,
    } = options;

    eeziClient.githubStreams.set(appId, {
      onGithubDeviceFlowUpdate,
      onGithubDeviceFlowSuccess,
      onGithubDeviceFlowError,
    });
    eeziClient.eventSources["github"]?.close();

    const url = eeziClient.baseURL + `/integration/github/${appId}/start-flow`;
    eeziClient.initGithubStreamSSE(url);
  }
  // --- End GitHub Repo Management ---

  // --- Vercel Token Management ---
  public async saveVercelAccessToken(params: SaveVercelAccessTokenParams) {
    const { data } = await Api.post("/integration/vercel/save-token", params);
    return data;
  }
  // --- End Vercel Token Management ---

  // --- Vercel Project Management ---
  public async listVercelProjects() {
    const { data } = await Api.get("/integration/vercel/list-projects");
    return data;
  }

  public async connectToExistingVercelProject(
    params: ConnectToExistingVercelProjectParams
  ) {
    const { data } = await Api.post(
      "/integration/vercel/connect-existing-project",
      params
    );
    return data;
  }

  public async isVercelProjectAvailable(params: IsVercelProjectAvailableParams) {
    const config: AxiosRequestConfig = { params };
    const { data } = await Api.get("/integration/vercel/is-project-available", {
      config,
    });
    return data;
  }

  public async createVercelProject(params: CreateVercelProjectParams) {
    const { data } = await Api.post("/integration/vercel/create-project", params);
    return data;
  }

  // Get Vercel Deployments
  public async getVercelDeployments(params: GetVercelDeploymentsParams) {
    const config: AxiosRequestConfig = { params };
    const { data } = await Api.get("/integration/vercel/get-deployments", { config });
    return data;
  }

  public async disconnectVercelProject(params: DisconnectVercelProjectParams) {
    const { data } = await Api.post("/integration/vercel/disconnect", params);
    return data;
  }
  // --- End Vercel Project Management ---
}

const integrationApi = new IntegrationApiService();
export default integrationApi;
