import { useState, useEffect } from "react";
import { MetadataService } from "@/services/MetadataService";

interface CoverThumbnailProps {
	filename: string;
	filePath: string;
	system: string;
	size?: "sm" | "md";
}

/**
 * Displays a game cover thumbnail, fetching from GameTDB cache
 */
export function CoverThumbnail({
	filename,
	filePath,
	system,
	size = "sm",
}: CoverThumbnailProps) {
	const [coverUrl, setCoverUrl] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(false);

	const dimensions = size === "sm" ? "w-8 h-10" : "w-12 h-16";

	useEffect(() => {
		let cancelled = false;

		const fetchCover = async () => {
			try {
				// Extract game ID using the public API
				const gameId = await MetadataService.extractGameId(filePath, system);

				if (cancelled) return;

				// Fetch cover using the new 3-argument API
				const cover = await MetadataService.fetchCover(gameId, system, filePath);
				
				if (cancelled) return;

				if (cover) {
					setCoverUrl(cover);
				} else {
					setError(true);
				}
			} catch (e) {
				if (!cancelled) setError(true);
			} finally {
				if (!cancelled) setLoading(false);
			}
		};

		fetchCover();

		return () => {
			cancelled = true;
		};
	}, [filename, filePath, system]);

	if (loading) {
		return (
			<div
				className={`${dimensions} bg-muted/50 rounded animate-pulse flex-shrink-0`}
			/>
		);
	}

	if (error || !coverUrl) {
		// Fallback: show system badge or placeholder
		return (
			<div
				className={`${dimensions} bg-muted/30 rounded flex items-center justify-center flex-shrink-0 text-[10px] text-muted-foreground font-medium`}
			>
				{system.substring(0, 2)}
			</div>
		);
	}

	return (
		<img
			src={coverUrl}
			alt={filename}
			className={`${dimensions} object-cover rounded flex-shrink-0 shadow-sm`}
			onError={() => setError(true)}
		/>
	);
}
