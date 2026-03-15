import { AlertTriangle } from "lucide-react";
import type * as ReactTypes from "react";
import React from "react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	OVERRIDE_PLATFORMS,
	PLATFORM_SHORT_LABELS,
	type Platform,
} from "@/domain/types/platform.types";
import { cn } from "@/lib/utils";

interface PlatformSelectorProps {
	value: Platform | undefined;
	onChange: (value: Platform | undefined) => void;
	detectedSystem?: string;
	isDisabled?: boolean;
	showMixed?: boolean;
	className?: string;
	onClick?: (e: ReactTypes.MouseEvent) => void;
}

function PlatformSelectorComponent({
	value,
	onChange,
	detectedSystem,
	isDisabled = false,
	showMixed = false,
	className,
	onClick,
}: PlatformSelectorProps) {
	const isUnknown = detectedSystem === "Unknown";
	const isUnknownBlocked = isUnknown && !value;

	const displayValue = value || detectedSystem?.toLowerCase() || "";
	const triggerWidth = isUnknownBlocked
		? "w-[180px] sm:w-[250px]"
		: "w-[100px] sm:w-[140px]";

	const showDetected =
		detectedSystem &&
		!OVERRIDE_PLATFORMS.includes(detectedSystem.toLowerCase() as Platform) &&
		detectedSystem !== "Unknown";

	// Memoize the value change handler to prevent creating new functions on every render
	const handleValueChange = React.useCallback(
		(val: string) => {
			if (val) onChange(val as Platform);
		},
		[onChange],
	);

	// Memoize the click handler to prevent creating new functions on every render
	const handleTriggerClick = React.useCallback(
		(e: ReactTypes.MouseEvent) => {
			e.stopPropagation();
			onClick?.(e);
		},
		[onClick],
	);

	return (
		<Select
			value={isUnknownBlocked ? "" : displayValue}
			onValueChange={handleValueChange}
			disabled={isDisabled}
		>
			<SelectTrigger
				className={cn(
					"h-7 text-xs",
					triggerWidth,
					isDisabled && "opacity-50",
					isUnknownBlocked && "border-warning/50 text-warning",
					className,
				)}
				onClick={handleTriggerClick}
			>
				{isUnknownBlocked ? (
					<span className="flex items-center gap-1">
						<AlertTriangle className="h-3 w-3" />
						Platform Unknown. Please select:
					</span>
				) : (
					<SelectValue />
				)}
			</SelectTrigger>
			<SelectContent>
				{showMixed && <SelectItem value="auto">Mixed</SelectItem>}
				{showDetected && (
					<SelectItem value={detectedSystem.toLowerCase()}>
						{detectedSystem}
					</SelectItem>
				)}
				{OVERRIDE_PLATFORMS.map((platform) => (
					<SelectItem key={platform} value={platform}>
						{PLATFORM_SHORT_LABELS[platform]}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

const PlatformSelector = React.memo(PlatformSelectorComponent);

export { PlatformSelector, type PlatformSelectorProps };
