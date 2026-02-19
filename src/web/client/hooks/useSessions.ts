import { useState, useEffect, useCallback } from "react";
import type { SessionRecord } from "../../../history/types.ts";

const SESSION_POLL_MS = 90_000;

export function useSessions() {
	const [sessions, setSessions] = useState<SessionRecord[]>([]);

	const refresh = useCallback(() => {
		fetch("/api/sessions?refresh=1")
			.then((r) => r.json())
			.then((data) => setSessions(data as SessionRecord[]))
			.catch(() => {});
	}, []);

	useEffect(() => {
		refresh();
		const timer = setInterval(() => {
			refresh();
		}, SESSION_POLL_MS);
		return () => clearInterval(timer);
	}, [refresh]);

	return { sessions, refresh };
}
