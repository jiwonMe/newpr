let permissionRequested = false;

export function requestNotificationPermission(): void {
	if (permissionRequested || typeof Notification === "undefined") return;
	permissionRequested = true;
	if (Notification.permission === "default") {
		Notification.requestPermission();
	}
}

export function sendNotification(title: string, body?: string): void {
	if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
	if (document.hasFocus()) return;
	try {
		new Notification(title, {
			body,
			icon: "/favicon.ico",
			tag: "newpr",
		});
	} catch {}
}
