import { useCallback, useMemo } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { trpc } from "@/lib/trpc";

type RouterOutputs = inferRouterOutputs<AppRouter>;
export type ErpMasterData = RouterOutputs["masterData"];
export type ErpControlData = RouterOutputs["controlData"];
export type ErpFiscalPeriod =
  RouterOutputs["erpWorkspace"]["fiscalPeriods"][number];

type List = Array<Record<string, any>>;

const emptyMasterData = {
  companies: [],
  branches: [],
  warehouses: [],
  roles: [],
  fiscalPeriods: [],
  customers: [],
  suppliers: [],
  items: [],
  accounts: [],
  cashBoxes: [],
  banks: [],
  units: [],
  balances: [],
} as unknown as ErpMasterData;

const emptyControlData = {
  branches: [],
  accounts: [],
  fiscalPeriods: [],
} as unknown as ErpControlData;

function asList(value: unknown): List {
  return Array.isArray(value) ? (value as List) : [];
}

export function useErpWorkspaceData(companyId = 1) {
  const sharedQueryOptions = {
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  } as const;
  const masterQuery = trpc.masterData.useQuery(undefined, sharedQueryOptions);
  const controlQuery = trpc.controlData.useQuery(undefined, sharedQueryOptions);
  const periodsQuery = trpc.erpWorkspace.fiscalPeriods.useQuery(
    { companyId },
    sharedQueryOptions
  );

  const masterData = useMemo(() => {
    const value = (masterQuery.data ?? emptyMasterData) as Record<
      string,
      unknown
    >;
    return {
      ...emptyMasterData,
      ...value,
      companies: asList(value.companies),
      branches: asList(value.branches),
      warehouses: asList(value.warehouses),
      roles: asList(value.roles),
      fiscalPeriods: asList(value.fiscalPeriods),
      customers: asList(value.customers),
      suppliers: asList(value.suppliers),
      items: asList(value.items),
      accounts: asList(value.accounts),
      cashBoxes: asList(value.cashBoxes),
      banks: asList(value.banks),
      units: asList(value.units),
      balances: asList(value.balances),
    } as ErpMasterData;
  }, [masterQuery.data]);

  const controlData = useMemo(() => {
    const value = (controlQuery.data ?? emptyControlData) as Record<
      string,
      unknown
    >;
    return {
      ...emptyControlData,
      ...value,
      branches: asList(value.branches),
      accounts: asList(value.accounts),
      fiscalPeriods: asList(value.fiscalPeriods),
    } as ErpControlData;
  }, [controlQuery.data]);

  const fiscalPeriods = useMemo(
    () => asList(periodsQuery.data) as ErpFiscalPeriod[],
    [periodsQuery.data]
  );

  const refresh = useCallback(async () => {
    await Promise.all([
      masterQuery.refetch(),
      controlQuery.refetch(),
      periodsQuery.refetch(),
    ]);
  }, [controlQuery, masterQuery, periodsQuery]);

  return {
    masterData,
    controlData,
    accounts: controlData.accounts,
    branches: controlData.branches,
    fiscalPeriods,
    isLoading:
      masterQuery.isLoading || controlQuery.isLoading || periodsQuery.isLoading,
    isFetching:
      masterQuery.isFetching ||
      controlQuery.isFetching ||
      periodsQuery.isFetching,
    isError:
      masterQuery.isError || controlQuery.isError || periodsQuery.isError,
    error: masterQuery.error ?? controlQuery.error ?? periodsQuery.error,
    refresh,
  };
}
