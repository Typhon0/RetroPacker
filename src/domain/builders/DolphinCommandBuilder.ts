import type { JobState } from "../entities/JobState";
import type { IFileSystemRepository } from "../repositories/IFileSystemRepository";
import type { WorkflowType } from "../types/workflow.types";
import type { ProcessJobSettings } from "../usecases/ProcessJobUseCase";

export function getCompressionLevel(preset: string): number {
	switch (preset) {
		case "max":
			return 9;
		case "fast":
			return 1;
		case "balanced":
			return 5;
		default:
			return 5;
	}
}

export class DolphinCommandBuilder {
	static async buildArgs(
		job: JobState,
		outputDir: string,
		workflow: WorkflowType,
		settings: ProcessJobSettings,
		fileSystem: IFileSystemRepository,
		outputBaseName: string,
		userDirPath: string,
	): Promise<string[]> {
		const { preset, dolphin } = settings;
		const level = getCompressionLevel(preset);

		// User dir for temp files — provided by ProcessJobUseCase (OS temp dir).
		const userDir = userDirPath;
		await fileSystem.createDirectory(userDir);
		const baseArgs = (cmd: string) => [cmd, "-u", userDir];

		let args: string[] = [];

		if (workflow === "compress") {
			const ext = dolphin.format;
			const outputPath = await fileSystem.joinPath(
				outputDir,
				`${outputBaseName}.${ext}`,
			);

			args = [
				...baseArgs("convert"),
				"-i",
				job.path,
				"-o",
				outputPath,
				"-f",
				dolphin.format,
				"-b",
				dolphin.blockSize.toString(),
			];

			if (dolphin.scrub) {
				args.push("-s");
			}

			if (
				dolphin.format !== "iso" &&
				dolphin.format !== "wbfs" &&
				dolphin.compressionAlgorithm !== "none"
			) {
				args.push("-c", dolphin.compressionAlgorithm, "-l", level.toString());
			}
		} else if (workflow === "extract") {
			const outputPath = await fileSystem.joinPath(
				outputDir,
				`${outputBaseName}.iso`,
			);
			args = [
				...baseArgs("convert"),
				"-i",
				job.path,
				"-o",
				outputPath,
				"-f",
				"iso",
			];
		} else if (workflow === "verify") {
			args = [
				...baseArgs("verify"),
				"-i",
				job.path,
				"-a",
				dolphin.verifyAlgorithm,
			];
		} else if (workflow === "info") {
			args = [...baseArgs("header"), "-i", job.path];
		}

		return args;
	}
}
