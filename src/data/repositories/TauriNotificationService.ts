/**
 * Tauri Notification Service
 * Implementation of INotificationService using Tauri's notification plugin.
 *
 * @module data/repositories/TauriNotificationService
 */

import {
	isPermissionGranted,
	requestPermission,
	sendNotification,
} from "@tauri-apps/plugin-notification";
import {
	INotificationService,
	NotificationOptions,
} from "../../domain/repositories/INotificationService";

/**
 * Tauri implementation of notification service.
 */
export class TauriNotificationService implements INotificationService {
	/**
	 * Check if notifications are permitted.
	 */
	async isPermissionGranted(): Promise<boolean> {
		return isPermissionGranted();
	}

	/**
	 * Request notification permission.
	 */
	async requestPermission(): Promise<boolean> {
		const permission = await requestPermission();
		return permission === "granted";
	}

	/**
	 * Send a notification.
	 */
	async sendNotification(options: NotificationOptions): Promise<void> {
		let granted = await this.isPermissionGranted();

		if (!granted) {
			granted = await this.requestPermission();
		}

		if (granted) {
			sendNotification({
				title: options.title,
				body: options.body,
				icon: options.icon,
			});
		}
	}

	/**
	 * Send a success notification.
	 */
	async notifySuccess(title: string, body: string): Promise<void> {
		await this.sendNotification({ title, body });
	}

	/**
	 * Send a failure notification.
	 */
	async notifyFailure(title: string, body: string): Promise<void> {
		await this.sendNotification({ title, body });
	}
}
