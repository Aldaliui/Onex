import { useState } from "react";
import { Building2, Layers3, Link2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const emptyCompany = { id: undefined as number | undefined, code: "", name: "", baseCurrency: "SAR" };
const emptyGroup = { id: undefined as number | undefined, code: "", name: "", baseCurrency: "SAR", active: 1 };

export default function OrganizationCrudPanel() {
  const utils = trpc.useUtils();
  const snapshot = trpc.coreFoundation.snapshot.useQuery({ companyId: 1, limit: 100 });
  const [company, setCompany] = useState(emptyCompany);
  const [group, setGroup] = useState(emptyGroup);
  const [groupId, setGroupId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const saveCompany = trpc.systemAdministration.saveCompany.useMutation({ onSuccess: () => { toast.success("تم حفظ الشركة"); setCompany(emptyCompany); utils.coreFoundation.snapshot.invalidate(); }, onError: (error) => toast.error(error.message) });
  const saveGroup = trpc.systemAdministration.saveCompanyGroup.useMutation({ onSuccess: () => { toast.success("تم حفظ المجموعة"); setGroup(emptyGroup); utils.coreFoundation.snapshot.invalidate(); }, onError: (error) => toast.error(error.message) });
  const assign = trpc.systemAdministration.assignCompanyGroup.useMutation({ onSuccess: () => { toast.success("تم ربط الشركة بالمجموعة"); setGroupId(""); setCompanyId(""); }, onError: (error) => toast.error(error.message) });
  const data = snapshot.data;
  return <div className="content-grid" dir="rtl">
    <Card className="panel"><CardHeader><CardTitle><Building2 size={17} className="inline ml-2" />الشركات</CardTitle></CardHeader><CardContent className="space-y-3">
      <Input placeholder="رمز الشركة" value={company.code} onChange={(e) => setCompany({ ...company, code: e.target.value })} /><Input placeholder="اسم الشركة" value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })} /><Input placeholder="العملة الأساسية مثل SAR" value={company.baseCurrency} onChange={(e) => setCompany({ ...company, baseCurrency: e.target.value.toUpperCase() })} />
      <Button className="w-full" disabled={saveCompany.isPending || !company.code || !company.name} onClick={() => saveCompany.mutate(company)}><Plus size={15} />{company.id ? "تحديث الشركة" : "إنشاء الشركة"}</Button>
      <div className="space-y-2 border-t pt-3">{(data?.companies ?? []).map((item) => <div className="flex items-center justify-between rounded-md border p-2 text-xs" key={item.id}><span><b>{item.name}</b><small className="block text-muted-foreground">{item.code} · {item.baseCurrency}</small></span><Button variant="ghost" size="icon" onClick={() => setCompany(item)}><Pencil size={14} /></Button></div>)}</div>
    </CardContent></Card>
    <Card className="panel"><CardHeader><CardTitle><Layers3 size={17} className="inline ml-2" />مجموعات الشركات</CardTitle></CardHeader><CardContent className="space-y-3">
      <Input placeholder="رمز المجموعة" value={group.code} onChange={(e) => setGroup({ ...group, code: e.target.value })} /><Input placeholder="اسم المجموعة" value={group.name} onChange={(e) => setGroup({ ...group, name: e.target.value })} /><Input placeholder="العملة الأساسية" value={group.baseCurrency} onChange={(e) => setGroup({ ...group, baseCurrency: e.target.value.toUpperCase() })} />
      <Button className="w-full" disabled={saveGroup.isPending || !group.code || !group.name} onClick={() => saveGroup.mutate(group)}><Plus size={15} />{group.id ? "تحديث المجموعة" : "إنشاء المجموعة"}</Button>
      <div className="space-y-2 border-t pt-3">{(data?.groups ?? []).map((item) => <div className="flex items-center justify-between rounded-md border p-2 text-xs" key={item.id}><span><b>{item.name}</b><small className="block text-muted-foreground">{item.code} · {item.baseCurrency}</small></span><Button variant="ghost" size="icon" onClick={() => setGroup(item)}><Pencil size={14} /></Button></div>)}</div>
    </CardContent></Card>
    <Card className="panel"><CardHeader><CardTitle><Link2 size={17} className="inline ml-2" />ربط شركة بمجموعة</CardTitle></CardHeader><CardContent className="space-y-3"><select className="h-10 w-full rounded-md border bg-background px-3" value={groupId} onChange={(e) => setGroupId(e.target.value)}><option value="">اختر المجموعة</option>{(data?.groups ?? []).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.code}</option>)}</select><select className="h-10 w-full rounded-md border bg-background px-3" value={companyId} onChange={(e) => setCompanyId(e.target.value)}><option value="">اختر الشركة</option>{(data?.companies ?? []).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.code}</option>)}</select><Button className="w-full" disabled={assign.isPending || !groupId || !companyId} onClick={() => assign.mutate({ groupId: Number(groupId), companyId: Number(companyId) })}><Link2 size={15} />حفظ الربط</Button></CardContent></Card>
  </div>;
}
