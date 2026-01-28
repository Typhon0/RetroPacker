/**
 * Repository Interface - Notification Service
 * Contract for displaying system notifications.
 *
 * Follows Interface Segregation Principle - focused on notifications only.
 *
 * @module domain/repositories/INotificationService
 */

/**
 * Notification options.
 */
export interface NotificationOptions {
	/** Notification title. */
	readonly title: string;
	/** Notification body text. */
	readonly body: string;
	/** Optional icon path. */
	readonly icon?: string;
}

/**
 * Notification Service Interface
 *
 * Abstracts system notifications, allowing for:
 * - Different implementations (Tauri, Web Notifications, Mock)
 * - Easy testing with mock implementations
 * - Dependency inversion for clean architecture
 */
export interface INotificationService {
	/**
	 * Check if notifications are currently permitted.
	 *
	 * @returns True if notifications are allowed
	 */
	isPermissionGranted(): Promise<boolean>;

	/**
	 * Request notification permission from the user.
	 *
	 * @returns True if permission was granted
	 */
	requestPermission(): Promise<boolean>;

	/**
	 * Send a notification to the user.
	 *
	 * @param options - Notification options
	 */
	sendNotification(options: NotificationOptions): Promise<void>;

	/**
	 * Send a success notification.
	 *
	 * @param title - Notification title
	 * @param body - Notification body
	 */
	notifySuccess(title: string, body: string): Promise<void>;

	/**
	 * Send a failure notification.
	 *
	 * @param title - Notification title
	 * @param body - Notification body
	 */
	notifyFailure(title: string, body: string): Promise<void>;
}
