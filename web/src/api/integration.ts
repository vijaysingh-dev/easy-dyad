import Api from "./api";
import { AxiosRequestConfig } from "axios";
import {
  DeepLinkData,
  GitHubDeviceFlowUpdateData,
  GitHubDeviceFlowSuccessData,
  GitHubDeviceFlowErrorData,
  RenameBranchParams,
} from "@shared/eeziTypes";
import eeziClient from "./client";
import { r } from "happy-dom/lib/PropertySymbol.js";

class IntegrationApiService {
  // Listen for deep link events
  public onDeepLinkReceived(callback: (data: DeepLinkData) => void) {
    eeziClient.deepLinkHandler = callback;
    const url = eeziClient.baseURL + `/integration/stream/fake-connect`;
    eeziClient.initDeepLinkSSE(url);
  }

  public async fakeHandleNeonConnect() {
    const clientId = localStorage.getItem("clientId");
    const config: AxiosRequestConfig = { params: { clientId } };
    return Api.get(`/integration/neon/fake-connect`, { config });
  }

  public async fakeHandleSupabaseConnect(params: {
    appId: number;
    fakeProjectId: string;
  }) {
    const clientId = localStorage.getItem("clientId");
    const config: AxiosRequestConfig = { params: { clientId } };
    await Api.post("/integration/supabase/fake-connect-and-set-project", params, {
      config,
    });
  }

  // --- Neon Management ---

  // public async createNeonProject(
  //   params: CreateNeonProjectParams,
  // ): Promise<NeonProject> {
  //   return this.ipcRenderer.invoke("neon:create-project", params);
  // }

  // public async getNeonProject(
  //   params: GetNeonProjectParams,
  // ): Promise<GetNeonProjectResponse> {
  //   return this.ipcRenderer.invoke("neon:get-project", params);
  // }

  // // --- End Neon Management ---

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

    const url = eeziClient.baseURL + `/integration/github/start-flow/${appId}/stream`;
    eeziClient.initGithubStreamSSE(url);
  }
  // --- End GitHub Repo Management ---
}

const integrationApi = new IntegrationApiService();
export default integrationApi;
