import type { JobState } from "../entities/JobState";

export class ProgressParser {
	static parseProgress(
		line: string,
		job: JobState,
		emitProgress: (progress: number, etaSeconds?: number) => void,
	): void {
		const ratioMatch = line.match(/final ratio\s*=\s*(\d+(?:\.\d+)?)%/i);
		if (ratioMatch) {
			const ratio = Number.parseFloat(ratioMatch[1]);
			if (Number.isFinite(ratio)) {
				job.setCompressionRatio(ratio);
			}
		}

		const match = line.match(
			/(?:Compressing|Extracting|Processing|Verifying),\s+(\d+\.?\d*)%\s+complete/,
		);
		if (match) {
			const percentage = parseFloat(match[1]);
			const startTime = job.startTime.value;

			let etaSeconds: number | undefined;
			if (startTime && percentage > 0) {
				const elapsedSeconds = (Date.now() - startTime) / 1000;
				const totalEst = (elapsedSeconds / percentage) * 100;
				etaSeconds = Math.max(0, totalEst - elapsedSeconds);
			}

			emitProgress(percentage, etaSeconds);
		}
	}

	static parseDolphinInfo(line: string, job: JobState): void {
		const lineTrimmed = line.trim();
		const updates: Partial<{
			gameId: string;
			gameTitle: string;
			region: string;
		}> = {};

		if (lineTrimmed.startsWith("Game ID:")) {
			updates.gameId = lineTrimmed.split(":")[1].trim();
		} else if (lineTrimmed.startsWith("Internal Name:")) {
			updates.gameTitle = lineTrimmed.split(":")[1].trim();
		} else if (lineTrimmed.startsWith("Region:")) {
			updates.region = lineTrimmed.split(":")[1].trim();
		}

		if (Object.keys(updates).length > 0) {
			job.applyUpdates(updates);
		}
	}

	static shouldIgnoreDolphinStderr(line: string): boolean {
		const normalized = line.trim().toLowerCase();
		return normalized.includes("no bundle id found");
	}
}
