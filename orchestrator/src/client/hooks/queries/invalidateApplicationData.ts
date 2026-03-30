import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/client/lib/queryKeys";

export async function invalidateApplicationData(
  queryClient: QueryClient,
  applicationId?: string | null,
): Promise<void> {
  if (!applicationId) {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.applications.all,
    });
    await queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
    return;
  }

  await queryClient.invalidateQueries({
    queryKey: [...queryKeys.applications.all, "list"] as const,
  });
  await queryClient.invalidateQueries({
    queryKey: queryKeys.applications.detail(applicationId),
  });
  await queryClient.invalidateQueries({
    queryKey: queryKeys.applications.stageEvents(applicationId),
  });
  await queryClient.invalidateQueries({
    queryKey: queryKeys.applications.tasks(applicationId),
  });
  await queryClient.invalidateQueries({
    queryKey: queryKeys.applications.ghostwriter(applicationId),
  });

  await queryClient.invalidateQueries({
    queryKey: [...queryKeys.jobs.all, "list"] as const,
  });
  await queryClient.invalidateQueries({
    queryKey: [...queryKeys.jobs.all, "revision"] as const,
  });
  await queryClient.invalidateQueries({
    queryKey: queryKeys.jobs.inProgressBoard(),
  });
  await queryClient.invalidateQueries({
    queryKey: queryKeys.jobs.detail(applicationId),
  });
  await queryClient.invalidateQueries({
    queryKey: queryKeys.jobs.stageEvents(applicationId),
  });
  await queryClient.invalidateQueries({
    queryKey: queryKeys.jobs.tasks(applicationId),
  });
}

export async function invalidateSettingsData(
  queryClient: QueryClient,
): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: queryKeys.settings.all });
  await queryClient.invalidateQueries({ queryKey: queryKeys.tracer.all });
}
