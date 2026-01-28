/**
 * JobTreeBuilder - Pure Functions for Building Job Tree Structure
 *
 * Extracted from JobTable.tsx for Single Responsibility Principle.
 * No React dependencies - pure TypeScript functions.
 *
 * @module components/dashboard/JobTable/JobTreeBuilder
 */

import type { Job } from "@/stores/useQueueStore";

/**
 * Tree node structure for organizing jobs by folder.
 */
export interface TreeNode {
	name: string;
	path: string;
	jobs: Job[];
	children: Record<string, TreeNode>;
}

/**
 * Find the common path prefix across all jobs.
 * Used to skip redundant root folders.
 */
export function findCommonPrefix(jobs: Job[]): string[] {
	if (jobs.length === 0) return [];

	const paths = jobs.map((job) => {
		const normalized = job.path.replace(/\\/g, "/");
		const parts = normalized.split("/");
		parts.pop(); // Remove filename
		return parts.filter((p) => p);
	});

	if (paths.length === 0) return [];

	const firstPath = paths[0];
	const commonParts: string[] = [];

	for (let i = 0; i < firstPath.length; i++) {
		const part = firstPath[i];
		if (paths.every((p) => p[i] === part)) {
			commonParts.push(part);
		} else {
			break;
		}
	}

	return commonParts;
}

/**
 * Build a tree structure from a list of jobs.
 * Groups jobs by their folder hierarchy.
 */
export function buildTree(jobs: Job[]): TreeNode {
	const root: TreeNode = { name: "Root", path: "", jobs: [], children: {} };

	// Find common prefix to skip
	const commonPrefix = findCommonPrefix(jobs);
	const skipDepth = commonPrefix.length;

	for (const job of jobs) {
		// Normalize path separators
		const normalizedPath = job.path.replace(/\\/g, "/");
		const allParts = normalizedPath.split("/").filter((p) => p);
		allParts.pop(); // Remove filename

		// Skip common prefix parts
		const parts = allParts.slice(skipDepth);

		let current = root;
		let currentPath = commonPrefix.join("/");

		for (const part of parts) {
			currentPath = currentPath ? `${currentPath}/${part}` : part;

			if (!current.children[part]) {
				current.children[part] = {
					name: part,
					path: currentPath,
					jobs: [],
					children: {},
				};
			}
			current = current.children[part];
		}

		current.jobs.push(job);
	}

	// If root has only one child and no direct jobs, collapse it
	const rootChildren = Object.keys(root.children);
	if (rootChildren.length === 1 && root.jobs.length === 0) {
		return root.children[rootChildren[0]];
	}

	return root;
}

/**
 * Get all folder paths in the tree (for expand/collapse all).
 */
export function getAllPaths(node: TreeNode, paths: string[] = []): string[] {
	if (node.path) paths.push(node.path);
	for (const child of Object.values(node.children)) {
		getAllPaths(child, paths);
	}
	return paths;
}

/**
 * Count total items (jobs) in the tree recursively.
 */
export function countItems(node: TreeNode): number {
	let count = node.jobs.length;
	for (const child of Object.values(node.children)) {
		count += countItems(child);
	}
	return count;
}

/**
 * Count pending/failed items in the tree recursively.
 */
export function countPending(node: TreeNode): number {
	let count = node.jobs.filter(
		(j) => j.status === "pending" || j.status === "failed",
	).length;
	for (const child of Object.values(node.children)) {
		count += countPending(child);
	}
	return count;
}

/**
 * Find a node by path in the tree.
 */
export function findNode(node: TreeNode, targetPath: string): TreeNode | null {
	if (node.path === targetPath) return node;
	for (const child of Object.values(node.children)) {
		const found = findNode(child, targetPath);
		if (found) return found;
	}
	return null;
}
