import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ArrowRight, Database, KeyRound, Network, Save, Server, ShieldCheck, UserCog } from "lucide-react";
import { toast } from "sonner";
import SubledgerSetupPanel from "@/components/SubledgerSetupPanel";
import AdjustmentNotePanel from "@/components/AdjustmentNotePanel";
import InventoryCountPanel from "@/components/InventoryCountPanel";
import BackupRestorePanel from "@/components/BackupRestorePanel";

export default function SystemSetup() {
  const [, setLocation] = useLocation();
  const [engine, setEngine] = useState("mysql");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("3306");
  const [database, setDatabase] = useState("");
  const [user, setUser] = useState("");
  const [ssl, setSsl] = useState(true);
  const settings = trpc.systemSettings.get.useQuery();
  const saveSettings = trpc.systemSettings.save.useMutation();
  useEffect(() => { if (settings.data) { setEngine(settings.data.engine); setHost(settings.data.host || ""); setPort(String(settings.data.port || 3306)); setDatabase(settings.data.databaseName || ""); setSsl(Boolean(settings.data.ssl)); } }, [settings.data]);

  const saveSetup = () => {
    saveSettings.mutate({ engine, host: host || undefined, port: Number(port || 3306), databaseName: database || undefined, ssl: ssl ? 1 : 0, updatedBy: "administrator" }, { onSuccess: () => toast.success("تم حفظ إعدادات النظام في قاعدة البيانات. تبقى DATABASE_URL سرًا على الخادم."), onError: (error) => toast.error(error.message) });
  };

  return <div className="workbench-shell setup-shell" dir="rtl">
    <header className="workbench-menubar"><button className="workbench-brand" onClick={() => setLocation("/")}><span className="brand-mark">ON</span><span><b>YS ERP</b><small>Oracle Forms Workbench</small></span></button><button className="menubar-item" onClick={() => setLocation("/")}><ArrowRight size={15} /> مساحة النوافذ</button><span className="menubar-spacer" /><span className="connection-state"><i /> تهيئة آمنة</span></header>
    <main className="setup-page"><div className="setup-heading"><div><p className="panel-kicker">SYSTEM CONFIGURATION / DATABASE BRIDGE</p><h1>تهيئة النظام وربط قاعدة البيانات</h1><p>أدخل مواصفات قاعدة النظام الحقيقي. لا تُحفظ كلمات المرور في المتصفح؛ يضاف رابط الاتصال إلى أسرار الخادم فقط.</p></div><div className="setup-badge"><ShieldCheck size={18} /> اتصال محمي</div></div>
      <section className="setup-grid"><div className="setup-card"><div className="setup-card-title"><Database size={18} /><div><b>محرك قاعدة البيانات</b><small>DATABASE ENGINE</small></div></div><label>المحرك<select value={engine} onChange={(event) => setEngine(event.target.value)}><option value="mysql">MySQL / TiDB</option><option value="oracle">Oracle عبر Backend Bridge</option><option value="postgres">PostgreSQL</option></select></label><label>اسم المضيف<input value={host} onChange={(event) => setHost(event.target.value)} placeholder="db.example.local" /></label><label>المنفذ<input value={port} onChange={(event) => setPort(event.target.value)} placeholder="3306" /></label><label>اسم قاعدة البيانات<input value={database} onChange={(event) => setDatabase(event.target.value)} placeholder="onex_erp" /></label><button className="toolbar-main setup-primary" onClick={() => setLocation("/system-administration")}><UserCog size={16} />إدارة المستخدمين والصلاحيات</button></div>
        <div className="setup-card"><div className="setup-card-title"><KeyRound size={18} /><div><b>بيانات الاعتماد</b><small>SERVER SECRET HANDOFF</small></div></div><label>اسم المستخدم<input value={user} onChange={(event) => setUser(event.target.value)} placeholder="onex_app" /></label><label>كلمة المرور<input type="password" placeholder="لا تُعرض ولا تُحفظ في المتصفح" /></label><label className="setup-check"><input type="checkbox" checked={ssl} onChange={(event) => setSsl(event.target.checked)} /> تفعيل TLS/SSL للاتصال</label><div className="setup-note"><Server size={16} /><span>بعد الحفظ، يحتاج مسؤول النشر إلى ضبط <code>DATABASE_URL</code> في متغيرات البيئة. لا يمكن للواجهة الوصول إلى قاعدة البيانات مباشرة.</span></div></div>
      </section><SubledgerSetupPanel /><AdjustmentNotePanel /><InventoryCountPanel /><BackupRestorePanel /><section className="setup-steps"><div><Network size={17} /><b>مسار الربط العام</b><span>لوحة التحكم → API → Drizzle → قاعدة النظام</span></div><div><span className="step-number">1</span><span>تُحفظ المواصفات في system_settings</span></div><div><span className="step-number">2</span><span>تُنفذ migrations على الخادم</span></div><div><span className="step-number">3</span><span>تبقى DATABASE_URL وكلمة المرور في أسرار النشر</span></div></section><div className="setup-actions"><button className="toolbar-main" onClick={() => setLocation("/home")}>العودة للوحة الرئيسية</button><button className="toolbar-main setup-primary" disabled={saveSettings.isPending} onClick={saveSetup}><Save size={16} /> {saveSettings.isPending ? "جارٍ الحفظ..." : "حفظ إعداد التهيئة"}</button></div>
    </main></div>;
}
