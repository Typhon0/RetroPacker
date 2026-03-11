import type { JobState } from "../entities/JobState";
import type { IFileSystemRepository } from "../repositories/IFileSystemRepository";
import { isDvdSystem } from "../types/platform.types";
import type { WorkflowType } from "../types/workflow.types";
import type { ProcessJobSettings } from "../usecases/ProcessJobUseCase";

export class ChdmanCommandBuilder {
	static async buildArgs(
		job: JobState,
		outputDir: string,
		workflow: WorkflowType,
		settings: ProcessJobSettings,
		fileSystem: IFileSystemRepository,
		outputBaseName: string,
		overrideInputPath?: string,
	): Promise<string[]> {
		const { preset, customCompression, chd } = settings;
		const inputPath = overrideInputPath ?? job.path;

		let args: string[] = [];
		const effectiveSystem =
			job.platformOverride.value?.toLowerCase() ??
			job.system.value.toLowerCase();

		// Determine strict CD vs DVD strategy based on effective system
		const usesDvdStrategy = isDvdSystem(effectiveSystem);
		const compressCmd = usesDvdStrategy ? "createdvd" : "createcd";
		const extractCmd = usesDvdStrategy ? "extractdvd" : "extractcd";

		if (workflow === "compress") {
			const outputPath = await fileSystem.joinPath(
				outputDir,
				`${outputBaseName}.chd`,
			);
			args = [compressCmd, "-i", inputPath, "-o", outputPath];

			// Compression args
			const compressionArgs = ChdmanCommandBuilder.getCompressionArgs(
				preset,
				customCompression,
			);
			args.push(...compressionArgs);

			// Hunk size
			if (chd.hunkSize) {
				args.push("-hs", chd.hunkSize.toString());
			} else if (usesDvdStrategy) {
				args.push("-hs", "2048"); // Strict 2048 for DVD systems
			}

			args.push("-f"); // Force overwrite
		} else if (workflow === "extract") {
			if (extractCmd === "extractdvd") {
				const outputPath = await fileSystem.joinPath(
					outputDir,
					`${outputBaseName}.iso`,
				);
				args = [extractCmd, "-i", job.path, "-o", outputPath, "-f"];
			} else {
				const outputCue = await fileSystem.joinPath(
					outputDir,
					`${outputBaseName}.cue`,
				);
				const outputBin = await fileSystem.joinPath(
					outputDir,
					`${outputBaseName}.bin`,
				);
				args = [
					"extractcd",
					"-i",
					job.path,
					"-o",
					outputCue,
					"-ob",
					outputBin,
					"-f",
				];
			}
		} else if (workflow === "verify") {
			args = ["verify", "-i", job.path];
		} else if (workflow === "info") {
			args = ["info", "-i", job.path];
		}

		return args;
	}

	private static getCompressionArgs(
		preset: string,
		customCompression: string,
	): string[] {
		switch (preset) {
			case "balanced":
				return ["-c", "lzma,zlib,huff"];
			case "max":
				return ["-c", "lzma"];
			case "fast":
				return ["-c", "zstd"];
			case "raw":
				return ["-c", "none"];
			case "custom":
				return ["-c", customCompression || "lzma,zlib,huff"];
			default:
				return ["-c", "lzma,zlib,huff"];
		}
	}
}
