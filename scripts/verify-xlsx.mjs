import * as XLSX from "xlsx";
const workbook = XLSX.utils.book_new();
const sheet = XLSX.utils.aoa_to_sheet([
  ["code", "name", "currencyCode", "unitCode", "revenueAccount", "inventoryAccount", "cogsAccount"],
  ["ITEM-XLSX-001", "صنف Excel تجريبي", "SAR", "EA", "4100", "1300", "5100"],
]);
XLSX.utils.book_append_sheet(workbook, sheet, "MasterData");
const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
const readBack = XLSX.read(bytes, { type: "buffer" });
const csv = XLSX.utils.sheet_to_csv(readBack.Sheets[readBack.SheetNames[0]], { FS: ",", RS: "\n" });
if (!csv.includes("ITEM-XLSX-001") || !csv.includes("صنف Excel تجريبي")) throw new Error("XLSX round-trip failed");
console.log("xlsx_round_trip=ok");
console.log(csv);
