import { useCallback } from "react";
import { useAtom } from "jotai";
import {
  supabaseProjectsAtom,
  supabaseLoadingAtom,
  supabaseErrorAtom,
  selectedSupabaseProjectAtom,
} from "@/atoms/supabaseAtoms";
import api from "@/api";

export function useSupabase() {
  const [projects, setProjects] = useAtom(supabaseProjectsAtom);
  const [loading, setLoading] = useAtom(supabaseLoadingAtom);
  const [error, setError] = useAtom(supabaseErrorAtom);
  const [selectedProject, setSelectedProject] = useAtom(selectedSupabaseProjectAtom);

  /**
   * Load Supabase projects from the API
   */
  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const projectList = await api.integration.listSupabaseProjects();
      setProjects(projectList);
      setError(null);
    } catch (error) {
      console.error("Error loading Supabase projects:", error);
      setError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      setLoading(false);
    }
  }, [setProjects, setError, setLoading]);

  /**
   * Associate a Supabase project with an app
   */
  const setAppProject = useCallback(
    async (projectId: string, appId: string) => {
      setLoading(true);
      try {
        await api.integration.setSupabaseAppProject(projectId, appId);
        setError(null);
      } catch (error) {
        console.error("Error setting Supabase project for app:", error);
        setError(error instanceof Error ? error : new Error(String(error)));
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [setError, setLoading],
  );

  /**
   * Remove a Supabase project association from an app
   */
  const unsetAppProject = useCallback(
    async (appId: string) => {
      setLoading(true);
      try {
        await api.integration.unsetSupabaseAppProject(appId);
        setError(null);
      } catch (error) {
        console.error("Error unsetting Supabase project for app:", error);
        setError(error instanceof Error ? error : new Error(String(error)));
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [setError, setLoading],
  );

  /**
   * Select a project for current use
   */
  const selectProject = useCallback(
    (projectId: string | null) => {
      setSelectedProject(projectId);
    },
    [setSelectedProject],
  );

  return {
    projects,
    loading,
    error,
    selectedProject,
    loadProjects,
    setAppProject,
    unsetAppProject,
    selectProject,
  };
}
