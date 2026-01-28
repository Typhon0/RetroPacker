/**
 * Mock Notification Service
 * Mock implementation of INotificationService for testing/development.
 *
 * @module data/repositories/MockNotificationService
 */

import {
	INotificationService,
	NotificationOptions,
} from "../../domain/repositories/INotificationService";

/**
 * Mock implementation of notification service.
 * Logs notifications to console instead of displaying them.
 */
export class MockNotificationService implements INotificationService {
	/**
	 * Always return true for mock.
	 */
	async isPermissionGranted(): Promise<boolean> {
		return true;
	}

	/**
	 * Always return true for mock.
	 */
	async requestPermission(): Promise<boolean> {
		return true;
	}

	/**
	 * Log notification to console.
	 */
	async sendNotification(options: NotificationOptions): Promise<void> {
		console.log(`[MOCK NOTIFICATION] ${options.title}: ${options.body}`);
	}

	/**
	 * Log success notification.
	 */
	async notifySuccess(title: string, body: string): Promise<void> {
		console.log(`[MOCK NOTIFICATION] ✓ ${title}: ${body}`);
	}

	/**
	 * Log failure notification.
	 */
	async notifyFailure(title: string, body: string): Promise<void> {
		console.log(`[MOCK NOTIFICATION] ✗ ${title}: ${body}`);
	}
}
