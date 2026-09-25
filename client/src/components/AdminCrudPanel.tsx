import { useState } from "react";
import { Building2, Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const emptyUser = { id: undefined as number | undefined, openId: "", name: "", email: "", role: "user" as "user" | "admin" };
const emptyBranch = { id: undefined as number | undefined, companyId: 1, code: "", name: "", active: 1 };

export default function AdminCrudPanel() {
  const utils = trpc.useUtils();
  const overview = trpc.systemAdministration.overview.useQuery({});
  const [user, setUser] = useState(emptyUser);
  const [branch, setBranch] = useState(emptyBranch);
  const saveUser = trpc.systemAdministration.saveUser.useMutation({ onSuccess: () => { toast.success("تم حفظ المستخدم"); setUser(emptyUser); utils.systemAdministration.overview.invalidate(); }, onError: (error) => toast.error(error.message) });
  const removeUser = trpc.systemAdministration.removeUser.useMutation({ onSuccess: () => { toast.success("تم حذف المستخدم"); utils.systemAdministration.overview.invalidate(); }, onError: (error) => toast.error(error.message) });
  const saveBranch = trpc.systemAdministration.saveBranch.useMutation({ onSuccess: () => { toast.success("تم حفظ الفرع"); setBranch(emptyBranch); utils.systemAdministration.overview.invalidate(); }, onError: (error) => toast.error(error.message) });
  const removeBranch = trpc.systemAdministration.removeBranch.useMutation({ onSuccess: () => { toast.success("تم تعطيل الفرع"); utils.systemAdministration.overview.invalidate(); }, onError: (error) => toast.error(error.message) });
  const data = overview.data;

  return <div className="content-grid" dir="rtl">
    <Card className="panel"><CardHeader><CardTitle><UserPlus size={17} className="inline ml-2" />CRUD المستخدمين</CardTitle></CardHeader><CardContent className="space-y-3">
      <Input placeholder="OpenID / معرف المستخدم" value={user.openId} onChange={(e) => setUser({ ...user, openId: e.target.value })} />
      <Input placeholder="اسم المستخدم" value={user.name} onChange={(e) => setUser({ ...user, name: e.target.value })} />
      <Input type="email" placeholder="البريد الإلكتروني" value={user.email} onChange={(e) => setUser({ ...user, email: e.target.value })} />
      <select className="h-10 w-full rounded-md border bg-background px-3" value={user.role} onChange={(e) => setUser({ ...user, role: e.target.value as "user" | "admin" })}><option value="user">مستخدم</option><option value="admin">مدير نظام</option></select>
      <div className="flex gap-2"><Button className="flex-1" onClick={() => saveUser.mutate({ ...user, loginMethod: "admin" })} disabled={saveUser.isPending || !user.openId.trim()}><Plus size={15} />{user.id ? "تحديث المستخدم" : "إنشاء مستخدم"}</Button>{user.id && <Button variant="outline" onClick={() => setUser(emptyUser)}>إلغاء</Button>}</div>
      <div className="max-h-56 space-y-2 overflow-auto border-t pt-3">{(data?.users ?? []).map((item) => <div key={item.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-xs"><span><b>{item.name || item.openId}</b><small className="block text-muted-foreground">{item.email || "بدون بريد"} · {item.role}</small></span><span className="flex gap-1"><Button variant="ghost" size="icon" onClick={() => setUser({ id: item.id, openId: item.openId, name: item.name || "", email: item.email || "", role: item.role })}><Pencil size={14} /></Button><Button variant="ghost" size="icon" onClick={() => removeUser.mutate({ id: item.id })} disabled={removeUser.isPending}><Trash2 size={14} /></Button></span></div>)}</div>
    </CardContent></Card>
    <Card className="panel"><CardHeader><CardTitle><Building2 size={17} className="inline ml-2" />CRUD الفروع</CardTitle></CardHeader><CardContent className="space-y-3">
      <Input type="number" placeholder="رقم الشركة" value={branch.companyId} onChange={(e) => setBranch({ ...branch, companyId: Number(e.target.value) || 1 })} />
      <Input placeholder="رمز الفرع" value={branch.code} onChange={(e) => setBranch({ ...branch, code: e.target.value })} />
      <Input placeholder="اسم الفرع" value={branch.name} onChange={(e) => setBranch({ ...branch, name: e.target.value })} />
      <div className="flex gap-2"><Button className="flex-1" onClick={() => saveBranch.mutate(branch)} disabled={saveBranch.isPending || !branch.code.trim() || !branch.name.trim()}><Plus size={15} />{branch.id ? "تحديث الفرع" : "إنشاء فرع"}</Button>{branch.id && <Button variant="outline" onClick={() => setBranch(emptyBranch)}>إلغاء</Button>}</div>
      <div className="max-h-56 space-y-2 overflow-auto border-t pt-3">{(data?.branches ?? []).map((item) => <div key={item.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-xs"><span><b>{item.name}</b><small className="block text-muted-foreground">{item.code} · الشركة #{item.companyId} · {item.active ? "فعال" : "موقوف"}</small></span><span className="flex gap-1"><Button variant="ghost" size="icon" onClick={() => setBranch({ id: item.id, companyId: item.companyId, code: item.code, name: item.name, active: item.active })}><Pencil size={14} /></Button><Button variant="ghost" size="icon" onClick={() => removeBranch.mutate({ id: item.id })} disabled={removeBranch.isPending || !item.active}><Trash2 size={14} /></Button></span></div>)}</div>
    </CardContent></Card>
  </div>;
}
