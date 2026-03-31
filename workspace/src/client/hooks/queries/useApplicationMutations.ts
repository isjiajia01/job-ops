import * as api from "@client/api";
import type { Job } from "@shared/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/client/lib/queryKeys";
import { invalidateApplicationData } from "./invalidateApplicationData";

export function useUpdateApplicationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: Partial<Job> }) =>
      api.updateApplication(id, update),
    onSuccess: async (_data, variables) => {
      await invalidateApplicationData(queryClient, variables.id);
    },
  });
}

export function useMarkApplicationAppliedMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.markAsApplied(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.applications.detail(id),
      });
      const previousApplication = queryClient.getQueryData<Job>(
        queryKeys.applications.detail(id),
      );
      queryClient.setQueryData<Job>(
        queryKeys.applications.detail(id),
        (current) => (current ? { ...current, status: "applied" } : current),
      );
      return { previousApplication, id };
    },
    onError: (_error, _id, context) => {
      if (context?.id) {
        queryClient.setQueryData(
          queryKeys.applications.detail(context.id),
          context.previousApplication,
        );
      }
    },
    onSettled: async (_data, _error, id) => {
      await invalidateApplicationData(queryClient, id);
    },
  });
}

export function useUnapplyApplicationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.unapplyJob(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.applications.detail(id),
      });
      const previousApplication = queryClient.getQueryData<Job>(
        queryKeys.applications.detail(id),
      );
      queryClient.setQueryData<Job>(
        queryKeys.applications.detail(id),
        (current) =>
          current ? { ...current, status: "ready", appliedAt: null } : current,
      );
      return { previousApplication, id };
    },
    onError: (_error, _id, context) => {
      if (context?.id) {
        queryClient.setQueryData(
          queryKeys.applications.detail(context.id),
          context.previousApplication,
        );
      }
    },
    onSettled: async (_data, _error, id) => {
      await invalidateApplicationData(queryClient, id);
    },
  });
}

export function useSkipApplicationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.skipJob(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.applications.detail(id),
      });
      const previousApplication = queryClient.getQueryData<Job>(
        queryKeys.applications.detail(id),
      );
      queryClient.setQueryData<Job>(
        queryKeys.applications.detail(id),
        (current) => (current ? { ...current, status: "skipped" } : current),
      );
      return { previousApplication, id };
    },
    onError: (_error, _id, context) => {
      if (context?.id) {
        queryClient.setQueryData(
          queryKeys.applications.detail(context.id),
          context.previousApplication,
        );
      }
    },
    onSettled: async (_data, _error, id) => {
      await invalidateApplicationData(queryClient, id);
    },
  });
}

export function useRescoreApplicationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.rescoreJob(id),
    onSuccess: async (_data, id) => {
      await invalidateApplicationData(queryClient, id);
    },
  });
}

export function useGenerateApplicationPdfMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.generateJobPdf(id),
    onSuccess: async (_data, id) => {
      await invalidateApplicationData(queryClient, id);
    },
  });
}

export function useCheckApplicationSponsorMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.checkSponsor(id),
    onSuccess: async (_data, id) => {
      await invalidateApplicationData(queryClient, id);
    },
  });
}
