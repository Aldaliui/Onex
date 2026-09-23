import { useState } from "react";
import { RefreshCw, ShieldCheck, UserCog, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type SecurityTab = "users" | "roles" | "permissions" | "policies";
const tabs: Array<{ id: SecurityTab; label: string }> = [
  { id: "users", label: "المستخدمون وتعيين الأدوار" },
  { id: "roles", label: "الأدوار" },
  { id: "permissions", label: "الصلاحيات" },
  { id: "policies", label: "السياسات والنطاق" },
];
const list = (value: unknown): Array<Record<string, any>> => Array.isArray(value) ? value as Array<Record<string, any>> : [];
const text = (value: unknown) => value === null || value === undefined ? "—" : String(value);

export default function RolePermissionPanel() {
  const [tab, setTab] = useState<SecurityTab>("users");
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedRole, setSelectedRole] = useState("");
  const [selectedPermission, setSelectedPermission] = useState("");
  const [branchId, setBranchId] = useState("");
  const snapshot = trpc.coreFoundation.snapshot.useQuery({ companyId: 1, limit: 200 }, { refetchOnWindowFocus: false });
  const assignUserRole = trpc.erpWorkspace.assignUserRole.useMutation();
  const assignRolePermission = trpc.erpWorkspace.assignRolePermission.useMutation();
  const data = snapshot.data as any;
  const users = list(data?.users);
  const roles = list(data?.roles);
  const permissions = list(data?.permissions);
  const userRoles = list(data?.userRoles);
  const rolePermissions = list(data?.rolePermissions);
  const saveUserRole = () => {
    if (!selectedUser || !selectedRole) return toast.error("اختر المستخدم والدور أولًا");
    assignUserRole.mutate({ userId: Number(selectedUser), roleId: Number(selectedRole), branchId: branchId ? Number(branchId) : undefined, actor: "administrator", role: "admin" }, { onSuccess: () => { toast.success("تم تعيين الدور للمستخدم"); void snapshot.refetch(); }, onError: (error) => toast.error(error.message) });
  };
  const saveRolePermission = () => {
    if (!selectedRole || !selectedPermission) return toast.error("اختر الدور والصلاحية أولًا");
    assignRolePermission.mutate({ roleId: Number(selectedRole), permissionId: Number(selectedPermission), actor: "administrator", role: "admin" }, { onSuccess: () => { toast.success("تم ربط الصلاحية بالدور"); void snapshot.refetch(); }, onError: (error) => toast.error(error.message) });
  };
  return <section className="security-window" dir="rtl">
    <header className="security-window-header"><div><span className="panel-kicker">SECURITY & ACCESS CONTROL</span><h2>إدارة المستخدمين والأدوار والصلاحيات</h2><p>كل تعيين يُسجّل في سجل التدقيق ويطبق على نطاق الشركة والفرع.</p></div><button type="button" className="overview-refresh" onClick={() => void snapshot.refetch()}><RefreshCw size={15} /> تحديث</button></header>
    <nav className="security-tabs">{tabs.map((item) => <button type="button" key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>{item.label}</button>)}</nav>
    {tab === "users" && <div className="security-layout"><article className="security-card"><header><UserCog size={18} /><h3>تعيين دور لمستخدم</h3></header><label>المستخدم<select value={selectedUser} onChange={(event) => setSelectedUser(event.target.value)}><option value="">اختر المستخدم</option>{users.map((user) => <option key={user.id} value={user.id}>{text(user.name || user.openId)}</option>)}</select></label><label>الدور<select value={selectedRole} onChange={(event) => setSelectedRole(event.target.value)}><option value="">اختر الدور</option>{roles.map((role) => <option key={role.id} value={role.id}>{text(role.name)} · {text(role.code)}</option>)}</select></label><label>الفرع <span className="optional-label">اختياري، فارغ = كل الفروع</span><input value={branchId} onChange={(event) => setBranchId(event.target.value)} inputMode="numeric" placeholder="رقم الفرع" /></label><button type="button" className="security-primary" onClick={saveUserRole} disabled={assignUserRole.isPending}><ShieldCheck size={15} /> حفظ التعيين</button></article><article className="security-card"><header><UsersRound size={18} /><h3>التعيينات الحالية</h3></header><table><thead><tr><th>المستخدم</th><th>الدور</th><th>الفرع</th></tr></thead><tbody>{userRoles.map((assignment) => { const user = users.find((row) => Number(row.id) === Number(assignment.userId)); const role = roles.find((row) => Number(row.id) === Number(assignment.roleId)); return <tr key={assignment.id}><td>{text(user?.name || assignment.userId)}</td><td>{text(role?.name || assignment.roleId)}</td><td>{text(assignment.branchId || "كل الفروع")}</td></tr>; })}</tbody></table>{!userRoles.length && <div className="security-empty">لا توجد تعيينات محفوظة أو أن النظام يعمل بوضع العرض.</div>}</article></div>}
    {tab === "roles" && <article className="security-card security-wide"><header><ShieldCheck size={18} /><h3>الأدوار المعرفة</h3></header><table><thead><tr><th>الرمز</th><th>اسم الدور</th><th>الحالة</th><th>عدد الصلاحيات</th></tr></thead><tbody>{roles.map((role) => <tr key={role.id}><td>{text(role.code)}</td><td>{text(role.name)}</td><td>{Number(role.active) ? "نشط" : "متوقف"}</td><td>{rolePermissions.filter((assignment) => Number(assignment.roleId) === Number(role.id)).length}</td></tr>)}</tbody></table></article>}
    {tab === "permissions" && <div className="security-layout"><article className="security-card"><header><ShieldCheck size={18} /><h3>ربط صلاحية بدور</h3></header><label>الدور<select value={selectedRole} onChange={(event) => setSelectedRole(event.target.value)}><option value="">اختر الدور</option>{roles.map((role) => <option key={role.id} value={role.id}>{text(role.name)}</option>)}</select></label><label>الصلاحية<select value={selectedPermission} onChange={(event) => setSelectedPermission(event.target.value)}><option value="">اختر الصلاحية</option>{permissions.map((permission) => <option key={permission.id} value={permission.id}>{text(permission.code)} · {text(permission.description || permission.actionCode)}</option>)}</select></label><button type="button" className="security-primary" onClick={saveRolePermission} disabled={assignRolePermission.isPending}><ShieldCheck size={15} /> حفظ ربط الصلاحية</button></article><article className="security-card"><header><h3>دليل الصلاحيات</h3></header><table><thead><tr><th>الكود</th><th>النافذة</th><th>العملية</th><th>الوصف</th></tr></thead><tbody>{permissions.map((permission) => <tr key={permission.id}><td>{text(permission.code)}</td><td>{text(permission.windowCode)}</td><td>{text(permission.actionCode)}</td><td>{text(permission.description)}</td></tr>)}</tbody></table></article></div>}
    {tab === "policies" && <article className="security-card security-wide"><header><ShieldCheck size={18} /><h3>سياسات النطاق</h3></header><p className="security-note">السياسة تحدد أثر الصلاحية ونطاقها. التعديل المباشر متاح للمستخدم المخول فقط، وكل تغيير يجب أن يمر عبر API المحمية وسجل التدقيق.</p><table><thead><tr><th>الدور</th><th>كود السياسة</th><th>الأثر</th><th>النطاق</th><th>الحالة</th></tr></thead><tbody>{list(data?.policies).map((policy) => { const role = roles.find((row) => Number(row.id) === Number(policy.roleId)); return <tr key={policy.id}><td>{text(role?.name || policy.roleId)}</td><td>{text(policy.policyCode)}</td><td>{text(policy.effect)}</td><td>{text(policy.scopeJson)}</td><td>{Number(policy.active) ? "نشطة" : "متوقفة"}</td></tr>; })}</tbody></table>{!list(data?.policies).length && <div className="security-empty">لا توجد سياسات مخصصة بعد؛ سياسات النظام الافتراضية ما زالت فعالة.</div>}</article>}
  </section>;
}
