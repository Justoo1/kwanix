export type PrintFormat = "receipt_80" | "label_62";

const CONFIGS: Record<PrintFormat, { size: string; margin: string }> = {
  receipt_80: { size: "80mm auto", margin: "2mm 3mm" },
  label_62: { size: "62mm auto", margin: "0" },
};

export function triggerPrint(format: PrintFormat): Promise<void> {
  const { size, margin } = CONFIGS[format];
  const style = document.createElement("style");
  style.dataset.printOverride = "1";
  style.textContent = [
    "@media print {",
    `  @page { size: ${size}; margin: ${margin}; }`,
    "  body * { visibility: hidden !important; }",
    "  body > * { display: none !important; }",
    "  #print-root { display: block !important; }",
    "  #print-root * { visibility: visible !important; }",
    "}",
  ].join("\n");
  document.head.appendChild(style);
  return new Promise((resolve) => {
    window.addEventListener("afterprint", () => { style.remove(); resolve(); }, { once: true });
    window.print();
  });
}
