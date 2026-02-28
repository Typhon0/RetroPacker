import * as ProgressPrimitive from "@radix-ui/react-progress";
import * as React from "react";
import { cn } from "@/lib/utils";

interface ProgressProps
	extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> {
	indeterminate?: boolean;
}

const Progress = React.forwardRef<
	React.ElementRef<typeof ProgressPrimitive.Root>,
	ProgressProps
>(({ className, value, indeterminate, ...props }, ref) => (
	<ProgressPrimitive.Root
		ref={ref}
		className={cn(
			"relative h-4 w-full overflow-hidden rounded-full bg-secondary",
			className,
		)}
		{...props}
	>
		{indeterminate ? (
			<div className="h-full w-1/3 bg-primary rounded-full animate-indeterminate" />
		) : (
			<ProgressPrimitive.Indicator
				className="h-full w-full flex-1 bg-primary"
				style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
			/>
		)}
	</ProgressPrimitive.Root>
));
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
