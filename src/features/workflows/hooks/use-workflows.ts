import { useTRPC } from "@/trpc/client";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { useWorkflowsParams } from "./use-workflows-params";

export const useSuspenseWorkflows = () => {
  const trpc = useTRPC();
  const [params] = useWorkflowsParams();

  return useSuspenseQuery(trpc.workflows.getMany.queryOptions(params));
};

export const useCreateWorkflow = () => {
  const trpc = useTRPC();
  const [params] = useWorkflowsParams();

  const queryClient = useQueryClient();
  return useMutation(
    trpc.workflows.create.mutationOptions({
      onSuccess: (data) => {
        toast.success(`workflow "${data.name}" created`);
        queryClient.invalidateQueries(
          trpc.workflows.getMany.queryOptions(params),
        );
      },
      onError: (error) => {
        toast.error(`failed to create workflow :${error.message}`);
      },
    }),
  );
};
