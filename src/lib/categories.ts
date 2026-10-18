/** The categories a new household starts with. All of them can be renamed or archived. */
export const DEFAULT_CATEGORIES: { name: string; kind: "EXPENSE" | "INCOME" }[] = [
  { name: "Groceries", kind: "EXPENSE" },
  { name: "Rent", kind: "EXPENSE" },
  { name: "Utilities & bills", kind: "EXPENSE" },
  { name: "EMI & loan interest", kind: "EXPENSE" },
  { name: "Fuel & transport", kind: "EXPENSE" },
  { name: "Dining & food delivery", kind: "EXPENSE" },
  { name: "Shopping", kind: "EXPENSE" },
  { name: "Medical & health", kind: "EXPENSE" },
  { name: "Education", kind: "EXPENSE" },
  { name: "Insurance", kind: "EXPENSE" },
  { name: "Subscriptions", kind: "EXPENSE" },
  { name: "Household help", kind: "EXPENSE" },
  { name: "Travel", kind: "EXPENSE" },
  { name: "Gifts & festivals", kind: "EXPENSE" },
  { name: "Other expense", kind: "EXPENSE" },
  { name: "Salary", kind: "INCOME" },
  { name: "Bonus", kind: "INCOME" },
  { name: "Interest", kind: "INCOME" },
  { name: "Dividend", kind: "INCOME" },
  { name: "Rental income", kind: "INCOME" },
  { name: "Freelance", kind: "INCOME" },
  { name: "Refund & cashback", kind: "INCOME" },
  { name: "Other income", kind: "INCOME" },
];

export function seedCategoryRows() {
  return DEFAULT_CATEGORIES.map((c, i) => ({ ...c, sort: (i + 1) * 10 }));
}
