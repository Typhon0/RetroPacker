import type * as React from "react";
import { cn } from "@/lib/utils";

type BadgeVariant =
	| "default"
	| "secondary"
	| "success"
	| "info"
	| "warning"
	| "destructive";

interface StatusBadgeProps extends React.ComponentProps<"span"> {
	variant?: BadgeVariant;
}

const variantStyles: Record<BadgeVariant, string> = {
	default: "border-transparent bg-primary text-primary-foreground",
	secondary: "border-transparent bg-secondary text-secondary-foreground",
	success: "border-success/20 bg-success/5 text-success",
	info: "border-info/20 bg-info/5 text-info",
	warning: "border-warning/20 bg-warning/5 text-warning",
	destructive: "border-destructive/20 bg-destructive/5 text-destructive",
};

function StatusBadge({
	className,
	variant = "default",
	...props
}: StatusBadgeProps) {
	return (
		<span
			className={cn(
				"inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold truncate max-w-full",
				variantStyles[variant],
				className,
			)}
			{...props}
		/>
	);
}

export { StatusBadge, type StatusBadgeProps, type BadgeVariant };
