"use client";
import {
  EntityContainer,
  EntityHeader,
  EntityPagination,
  EntitySearch,
} from "@/components/entity-components";
import {
  useCreateWorkflow,
  useSuspenseWorkflows,
} from "../hooks/use-workflows";
import { useRouter } from "next/navigation";
import { useUpgradeModal } from "../hooks/use-upgrade-modal";
import { useWorkflowsParams } from "../hooks/use-workflows-params";
import { useEntitySearch } from "@/hooks/use-entity-search";

export const WorkflowsSearch = () => {
  const [params, setParams] = useWorkflowsParams();
  const { searchValue, onSearchChange } = useEntitySearch({
    params,
    setParams,
  });

  return (
    <EntitySearch
      value={searchValue}
      onChange={onSearchChange}
      placeholder="Search workflows"
    />
  );
};

type WorkflowsData = ReturnType<typeof useSuspenseWorkflows>["data"];

export const WorkflowsList = ({ items }: { items: WorkflowsData["items"] }) => {
  return <div>{JSON.stringify(items, null, 2)}</div>;
};

export const WorkflowsHeader = ({ disabled }: { disabled?: boolean }) => {
  const router = useRouter();
  const createWorkflow = useCreateWorkflow();
  const { handleError, open, setOpen, UpgradeModal } = useUpgradeModal();

  const handleCreate = () => {
    createWorkflow.mutate(undefined, {
      onSuccess: (data) => {
        router.push(`/workflows/${data.id}`);
      },
      onError: (error) => {
        handleError(error);
      },
    });
  };
  return (
    <>
      <UpgradeModal open={open} onOpenChange={setOpen} />
      <EntityHeader
        title="Workflows"
        description="Create and manage your workflows"
        onNew={handleCreate}
        newButtonLabel="New workflow"
        disabled={disabled}
        isCreating={createWorkflow.isPending}
      />
    </>
  );
};

export const WorkflowsPagination = ({
  page,
  totalPages,
  isFetching,
}: {
  page: number;
  totalPages: number;
  isFetching: boolean;
}) => {
  const [params, setParams] = useWorkflowsParams();

  return (
    <EntityPagination
      disabled={isFetching}
      totalPages={totalPages}
      page={page}
      onPageChange={(page) => setParams({ ...params, page })}
    />
  );
};

export const WorkflowsContainer = () => {
  const { data: workflows, isFetching } = useSuspenseWorkflows();

  return (
    <EntityContainer
      header={<WorkflowsHeader />}
      search={<WorkflowsSearch />}
      pagination={
        <WorkflowsPagination
          page={workflows.page}
          totalPages={workflows.totalPages}
          isFetching={isFetching}
        />
      }
    >
      <WorkflowsList items={workflows.items} />
    </EntityContainer>
  );
};
