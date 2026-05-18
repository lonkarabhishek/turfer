export function Badge({
  children,
  variant = "default",
}: {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "gold";
}) {
  const variantClasses = {
    default: "bg-cream-200 text-primary-600 border border-cream-300",
    success: "bg-primary-50 text-primary-700 border border-primary-100",
    warning: "bg-amber-50 text-amber-700 border border-amber-100",
    gold: "bg-accent-50 text-accent-700 border border-accent-200",
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variantClasses[variant]}`}
    >
      {children}
    </span>
  );
}
