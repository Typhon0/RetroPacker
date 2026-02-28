import type { ReadonlySignal } from "@preact/signals-core";
import { useSyncExternalStore } from "react";

type SubscribableSignal<T> = ReadonlySignal<T> & {
	subscribe: (callback: () => void) => () => void;
};

/**
 * React bridge for @preact/signals-core signals.
 */
export function useSignalValue<T>(source: ReadonlySignal<T>): T {
	const signal = source as SubscribableSignal<T>;
	return useSyncExternalStore(
		(onStoreChange) => signal.subscribe(onStoreChange),
		() => signal.value,
		() => signal.value,
	);
}
