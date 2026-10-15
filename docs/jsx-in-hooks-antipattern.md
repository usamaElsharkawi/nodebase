# JSX in Hooks: Why It's an Anti-Pattern

**Date:** 2026-10-15  
**Context:** Lecture 11 - Workflows CRUD, `useUpgradeModal` hook review

---

## The Core Principle

> **Hooks = Logic Extractors**  
> **Components = UI Composers**

Hooks extract and reuse **stateful logic**. Components compose and render **UI**. Mixing them breaks React's mental model.

---

## What We Did Wrong (Initially)

```tsx
// ❌ use-upgrade-modal.tsx — WRONG
export const useUpgradeModal = () => {
  const [open, setOpen] = useState(false);

  const handleError = (error: unknown) => {
    if (error instanceof TRPCClientError && error.data?.code === "FORBIDDEN") {
      setOpen(true);
      return true;
    }
    return false;
  };

  const modal = <UpgradeModal open={open} onOpenChange={setOpen} />;  // ❌ JSX in hook

  return { handleError, modal };  // Returns rendered React element
};
```

```tsx
// Usage in component
const { handleError, modal } = useUpgradeModal();
return <>{modal}</>;  // Renders the pre-created element
```

---

## Why This Breaks React

| Problem | Explanation |
|---------|-------------|
| **Breaks Render Phase** | Elements created during hook execution (outside render), not during component render |
| **Breaks Suspense** | Element created outside `<Suspense>` tree — thrown promises not caught |
| **Breaks Error Boundaries** | Errors in pre-created element bypass `<ErrorBoundary>` |
| **Breaks DevTools** | Element invisible in component tree, shows as generic `Object` |
| **Breaks Composition** | Can't wrap, conditionally render, or pass extra props |
| **Violates React Model** | "Components are the unit of composition" — hooks are for logic, not UI |

---

## The Correct Pattern

```tsx
// ✅ use-upgrade-modal.tsx — CORRECT
export const useUpgradeModal = () => {
  const [open, setOpen] = useState(false);

  const handleError = (error: unknown): boolean => {
    if (error instanceof TRPCClientError && error.data?.code === "FORBIDDEN") {
      setOpen(true);
      return true;
    }
    return false;
  };

  return { 
    handleError,      // Behavior
    open,             // State
    setOpen,          // State setter
    UpgradeModal      // Component TYPE (not instance)
  };
};
```

```tsx
// Usage in component — full control
const { handleError, open, setOpen, UpgradeModal } = useUpgradeModal();

return (
  <>
    <EntityHeader onNew={handleCreate} />
    <UpgradeModal open={open} onOpenChange={setOpen} />  // Rendered HERE
  </>
);
```

---

## The Mental Model Shift

| Old Mental Model | New Mental Model |
|------------------|------------------|
| "Hooks are mini-components" | "Hooks are **logic extractors**" |
| "Hook returns what to render" | "Hook returns **data + actions + component type**" |
| "Hook owns the UI" | "Component owns UI, hook owns **logic**" |

**Mantra:** *"Hooks give you **what happened**; components decide **what to show**."*

---

## What You Get With the Correct Pattern

| Benefit | How |
|---------|-----|
| **Suspense works** | Element created inside `<Suspense>` tree |
| **Error Boundaries work** | Errors caught by wrapping boundary |
| **DevTools work** | Component appears in tree with correct name/props |
| **Composition works** | Wrap, conditionally render, pass extra props |
| **Testable** | Hook returns data/functions; mock `mutate`, assert calls |
| **Reusable** | Same hook → modal, button, keyboard shortcut — each decides UI |

---

## The Litmus Test

> **Can I unit-test this hook without mocking `router`, `document`, or rendering JSX?**

| Hook Pattern | Testable Without Mocks? |
|--------------|------------------------|
| Returns data + functions | ✅ Yes |
| Returns `<Component />` | ❌ No — needs renderer mock |
| Calls `router.push()` internally | ❌ No — needs router mock |
| Returns component type | ✅ Yes — just check type |

---

## The Rule

> **If you see `<Something />` inside a hook → Stop. Refactor.**

1. Extract the JSX to the caller
2. Return the component **type** + props/state
3. Let the component decide **when, where, and how** to render

---

## Applied in This Project

### `useUpgradeModal` (Fixed)

```tsx
// Hook: pure logic + component reference
export const useUpgradeModal = () => {
  const [open, setOpen] = useState(false);
  const handleError = (error) => { ... };
  return { handleError, open, setOpen, UpgradeModal };
};

// Component: owns the render
const { handleError, open, setOpen, UpgradeModal } = useUpgradeModal();

return (
  <>
    <EntityHeader onNew={handleCreate} />
    <UpgradeModal open={open} onOpenChange={setOpen} />  // ← rendered HERE
  </>
);
```

### `useCreateWorkflow` (Already Correct)

```tsx
// Hook: mutation logic + callbacks, NO navigation
export const useCreateWorkflow = () => {
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  return useMutation(
    trpc.workflows.create.mutationOptions({
      onSuccess: (data) => {
        toast.success(...);
        queryClient.invalidateQueries(trpc.workflows.getMany.queryOptions());
      },
    }),
  );
};

// Component: decides navigation
const createWorkflow = useCreateWorkflow();
const handleCreate = () => createWorkflow.mutate(undefined, {
  onSuccess: (data) => router.push(`/workflows/${data.id}`),
});
```

---

## Summary

| Principle | Application |
|-----------|-------------|
| **Hooks = Logic** | State, mutations, data fetching, error handling |
| **Components = UI** | Rendering, composition, event handlers, navigation |
| **Hook returns** | Data, functions, component types |
| **Component decides** | When, where, how to render; whether to navigate |
| **Never in hook** | `<JSX />`, `router.push()`, `document.title =`, `localStorage.setItem()` |

---

## Further Reading

- [React Docs: Extracting Logic into Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks)
- [Kent C. Dodds: Don't Return JSX from Custom Hooks](https://kentcdodds.com/blog/dont-return-jsx-from-custom-hooks)