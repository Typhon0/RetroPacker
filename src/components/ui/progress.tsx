import { Progress as ProgressPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

interface ProgressProps
	extends React.ComponentProps<typeof ProgressPrimitive.Root> {
	indeterminate?: boolean;
}

function Progress({
	className,
	value,
	indeterminate,
	...props
}: ProgressProps) {
	return (
		<ProgressPrimitive.Root
			data-slot="progress"
			className={cn(
				"relative h-2 w-full overflow-hidden rounded-full bg-primary/20",
				className,
			)}
			{...props}
		>
			{indeterminate ? (
				<ProgressPrimitive.Indicator
					data-slot="progress-indicator"
					className="h-full w-full flex-1 bg-primary animate-progress-indeterminate origin-left"
				/>
			) : (
				<ProgressPrimitive.Indicator
					data-slot="progress-indicator"
					className="h-full w-full flex-1 bg-primary transition-all"
					style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
				/>
			)}
		</ProgressPrimitive.Root>
	);
}

export { Progress };
