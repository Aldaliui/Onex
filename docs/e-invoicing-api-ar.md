# API الفوترة الإلكترونية في ONEX

أضيفت وحدة `eInvoices` إلى `AppRouter` لتغليف الربط مع مزود الفوترة الإلكترونية دون ربط نواة ERP بمزود واحد. تحفظ الوحدة كل محاولة إرسال في جدول `e_invoice_submissions`، وتستخدم مفتاحًا idempotent لمنع تكرار الإرسال.

## المسارات

| المسار | النوع | الوظيفة |
|---|---|---|
| `eInvoices.provider` | Query عام | يوضح هل تم ضبط مزود HTTP خارجي |
| `eInvoices.submit` | Mutation محمي | يرسل فاتورة مبيعات مرحّلة |
| `eInvoices.status` | Query | يعرض محاولات الإرسال وحالاتها |

يجب أن تكون الفاتورة في حالة `POSTED` قبل إرسالها. يمر الطلب عبر `server/eInvoicing.ts`، حيث يتم بناء Payload موحد، ثم إرساله إلى المزود، ثم حفظ النتيجة والتدقيق في قاعدة البيانات.

## الحالات

```text
QUEUED → SUBMITTED → ACCEPTED
                    └→ REJECTED
                    └→ FAILED
```

## الإعداد

عند ترك `EINVOICE_PROVIDER_URL` فارغًا يستخدم المشروع مزودًا محليًا تجريبيًا يعيد حالة `ACCEPTED`، وهذا مناسب للتطوير والاختبارات فقط.

للربط بمزود خارجي، اضبط القيم التالية على الخادم فقط:

```env
EINVOICE_PROVIDER_NAME=GENERIC_HTTP
EINVOICE_PROVIDER_URL=https://provider.example/api/invoices
EINVOICE_PROVIDER_TOKEN=server-secret
EINVOICE_WEBHOOK_SECRET=callback-signing-secret
EINVOICE_SELLER_NAME=اسم المنشأة
EINVOICE_SELLER_TAX_NUMBER=الرقم_الضريبي
```

يرسل العميل HTTP الخارجي:

- `Authorization: Bearer ...` عند ضبط الرمز.
- `Idempotency-Key` لمنع التكرار.
- JSON موحد يحتوي رقم المستند والتاريخ والعملة والبائع والمشتري والإجماليات والبنود.

هذه الطبقة **Adapter عامة** وليست شهادة امتثال لمزود أو دولة بعينها. يجب إضافة محول خاص بمتطلبات الجهة الرسمية، مثل XML أو التوقيع الرقمي أو نقاط المصادقة الخاصة بها، قبل الاستخدام الإنتاجي الرسمي.
