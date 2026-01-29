import { useMemo } from "react";

interface CoverThumbnailProps {
	system: string;
	size?: "sm" | "md";
}

/**
 * Displays a game cover thumbnail, fetching from GameTDB cache
 */
export function CoverThumbnail({ system, size = "sm" }: CoverThumbnailProps) {
	const dimensions = size === "sm" ? "w-8 h-10" : "w-12 h-16";
	const label = useMemo(() => system.substring(0, 2), [system]);

	return (
		<div
			className={`${dimensions} bg-muted/30 rounded flex items-center justify-center flex-shrink-0 text-[10px] text-muted-foreground font-medium`}
		>
			{label}
		</div>
	);
}
