export type PartyCrudKind = "customer" | "supplier";

export type WindowCrudDefinition = {
  id: string;
  kind: PartyCrudKind;
  title: string;
  codeLabel: string;
  nameLabel: string;
  accountPrefix: string;
  emptyCode: string;
};

export const windowCrudRegistry: Record<string, WindowCrudDefinition> = {
  ARST003: {
    id: "ARST003",
    kind: "customer",
    title: "تعريف العملاء",
    codeLabel: "كود العميل",
    nameLabel: "الاسم القانوني",
    accountPrefix: "1200",
    emptyCode: "CUST-NEW",
  },
  APSI002: {
    id: "APSI002",
    kind: "supplier",
    title: "تعريف الموردين",
    codeLabel: "كود المورد",
    nameLabel: "الاسم القانوني",
    accountPrefix: "2100",
    emptyCode: "SUP-NEW",
  },
};
